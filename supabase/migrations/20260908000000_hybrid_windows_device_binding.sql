-- =============================================================================
-- FullAluDoor — Hybrid Windows Device-Bound Authentication
-- -----------------------------------------------------------------------------
-- Extends the admin-approved device binding layer (20260907000000) with a
-- Windows-native attestation model.
--
-- What changes:
--   * user_devices gains a device_kind column:
--       - 'browser'       -> legacy per-browser token device (unchanged behaviour)
--       - 'windows_agent' -> a Windows computer attested by the native agent
--     Existing rows are explicitly migrated to 'browser' and are NEVER treated
--     as Windows devices. They do not authorise access in hybrid_windows mode.
--   * user_devices gains Windows attestation columns (public key, algorithm,
--     agent version, platform, os version, attestation status, last attested,
--     detected browsers).
--   * device_attestation_challenges table: random, expiring, single-use,
--     user+device bound nonces for challenge/response proof.
--   * New SECURITY DEFINER RPCs:
--       - device_issue_challenge          (server issued random challenge)
--       - device_ed25519_verify           (Ed25519 signature verification)
--       - verify_device_attestation       (full proof verification + verdict)
--       - admin_set_device_binding_mode   (explicit mode policy)
--   * get_device_access / assert_device_approved / admin_* are upgraded to be
--     mode aware. Mode is read from app_settings.device_binding_mode:
--       'hybrid_windows' (default production) or 'browser_legacy'.
--   * Audit events for enrollment/attestation lifecycle.
--
-- Data safety: no existing row is deleted or silently upgraded. Legacy
-- browser devices keep their status and remain usable only when the operator
-- explicitly sets device_binding_mode = 'browser_legacy'.
--
-- Idempotent; safe to run with `supabase db push` or in the SQL editor.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- app_settings — explicit binding policy
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value)
values
  ('device_binding_mode', 'hybrid_windows'),
  ('device_agent_min_version', '1.0.0'),
  ('device_agent_origin', 'http://127.0.0.1:8750'),
  ('device_challenge_ttl_seconds', '60')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- user_devices — attestation columns (idempotent ALTERs)
-- -----------------------------------------------------------------------------
alter table public.user_devices
  add column if not exists device_kind text not null default 'browser'
  check (device_kind in ('browser', 'windows_agent'));

alter table public.user_devices
  add column if not exists device_public_key text;

alter table public.user_devices
  add column if not exists device_key_algorithm text;

alter table public.user_devices
  add column if not exists device_agent_version text;

alter table public.user_devices
  add column if not exists platform text;

alter table public.user_devices
  add column if not exists os_version text;

alter table public.user_devices
  add column if not exists device_attestation_status text not null default 'none'
  check (device_attestation_status in ('none', 'enrolled', 'attested', 'failed', 're_enrollment_required'));

alter table public.user_devices
  add column if not exists last_attested_at timestamptz;

alter table public.user_devices
  add column if not exists detected_browsers jsonb not null default '[]'::jsonb;

-- Legacy browser registrations never carry a Windows public key. Mark them
-- explicitly (no automatic promotion to a Windows device).
update public.user_devices
   set device_kind = 'browser',
       device_public_key = null,
       device_key_algorithm = null,
       device_agent_version = null,
       device_attestation_status = 'none',
       last_attested_at = null
 where device_kind = 'browser';

create index if not exists user_devices_kind_status_idx
  on public.user_devices (device_kind, status);

-- Browser token hashes no longer exist for Windows-agent rows.
alter table public.user_devices alter column token_hash drop not null;

-- -----------------------------------------------------------------------------
-- device_attestation_challenges — single-use, expiring, user+device bound
-- -----------------------------------------------------------------------------
create table if not exists public.device_attestation_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  nonce text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists device_challenge_user_idx on public.device_attestation_challenges(user_id);
create index if not exists device_challenge_device_idx on public.device_attestation_challenges(device_id);
create index if not exists device_challenge_expiry_idx on public.device_attestation_challenges(expires_at);

alter table public.device_attestation_challenges enable row level security;

drop policy if exists "challenges select own" on public.device_attestation_challenges;
create policy "challenges select own"
on public.device_attestation_challenges
for select
using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Small shared helpers
-- -----------------------------------------------------------------------------

-- Current binding mode. The default (and only safe production value) is
-- hybrid_windows. 'browser_legacy' is an explicit, operator-chosen fallback.
create or replace function public.device_binding_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_settings where key = 'device_binding_mode'),
    'hybrid_windows'
  );
$$;

-- Challenge/attestation time-to-live in seconds (bounded 10..600).
create or replace function public.device_challenge_ttl_seconds()
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value text;
  v_parsed int;
begin
  select value into v_value from public.app_settings where key = 'device_challenge_ttl_seconds';
  v_value := coalesce(nullif(btrim(coalesce(v_value, '')), ''), '60');
  begin
    v_parsed := v_value::int;
  exception when others then
    v_parsed := 60;
  end;
  return greatest(10, least(600, v_parsed));
end;
$$;

-- URL-safe base64 (no padding) encode/decode used for nonces, public keys and
-- signatures. pgcrypto may live in public or extensions.
create or replace function public.device_b64url_encode(p_data bytea)
returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select rtrim(replace(replace(encode(p_data, 'base64'), '+', '-'), '/', '_'), '=');
$$;

create or replace function public.device_b64url_decode(p_value text)
returns bytea
language plpgsql
immutable
security definer
set search_path = public, extensions
as $$
declare
  v_s text;
  v_padding int;
begin
  if p_value is null then
    return null;
  end if;
  v_s := replace(replace(btrim(p_value), '-', '+'), '_', '/');
  v_padding := (4 - length(v_s) % 4) % 4;
  if v_padding > 0 then
    v_s := v_s || repeat('=', v_padding);
  end if;
  begin
    return decode(v_s, 'base64');
  exception when others then
    return null;
  end;
end;
$$;

-- Adds a browser label to the detected_browsers jsonb array when new.
create or replace function public.device_track_browser(p_current jsonb, p_browser text)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when p_browser is null or p_browser = '' then coalesce(p_current, '[]'::jsonb)
    when exists (
      select 1 from jsonb_array_elements_text(coalesce(p_current, '[]'::jsonb)) e
      where e = p_browser
    ) then coalesce(p_current, '[]'::jsonb)
    else coalesce(p_current, '[]'::jsonb) || to_jsonb(p_browser)
  end;
$$;

-- -----------------------------------------------------------------------------
-- Ed25519 verification.
--
-- Signature + public key are transmitted as URL-safe base64 and verified with
-- libsodium through the pgsodium extension (bundled with Supabase by
-- default). This keeps asymmetric proof verifiable inside PostgreSQL without
-- ever exposing a private key to the database.
-- -----------------------------------------------------------------------------
create or replace function public.device_ed25519_verify(
  p_signature_b64url text,
  p_message text,
  p_public_key_b64url text
)
returns boolean
language plpgsql
security definer
set search_path = public, pgsodium
as $$
declare
  v_sig bytea;
  v_msg bytea;
  v_pk bytea;
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgsodium' and p.proname = 'crypto_sign_verify_detached'
  ) then
    raise exception 'DEVICE_VERIFIER_UNAVAILABLE'
      using detail = 'The pgsodium extension (Ed25519 verifier) is required for hybrid Windows device attestation.';
  end if;

  v_sig := public.device_b64url_decode(p_signature_b64url);
  v_pk := public.device_b64url_decode(p_public_key_b64url);
  v_msg := convert_to(coalesce(p_message, ''), 'UTF8');

  if v_sig is null or v_pk is null or octet_length(v_sig) <> 64 or octet_length(v_pk) <> 32 then
    return false;
  end if;

  begin
    return pgsodium.crypto_sign_verify_detached(v_sig, v_msg, v_pk);
  exception when others then
    return false;
  end;
end;
$$;

-- Canonical signed message so a signature is cryptographically bound to the
-- intended Windows device, challenge row and nonce.
create or replace function public.device_attestation_message(
  p_device_id text,
  p_challenge_id uuid,
  p_nonce text
)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select p_device_id || '.' || p_challenge_id::text || '.' || p_nonce;
$$;

-- -----------------------------------------------------------------------------
-- get_device_access — mode-aware login-time device resolution.
--
-- hybrid_windows: resolves/creates a PENDING windows_agent registration for
--   the authenticated user. Approval only ever happens through the admin RPC.
-- browser_legacy: previous token-hash behaviour is preserved unchanged.
-- -----------------------------------------------------------------------------
drop function if exists public.get_device_access(text, text, text, text, text, text);

create or replace function public.get_device_access(
  p_token text,
  p_device_id text default null,
  p_device_name text default null,
  p_user_agent text default null,
  p_browser text default null,
  p_operating_system text default null,
  p_public_key text default null,
  p_key_algorithm text default null,
  p_agent_version text default null,
  p_platform text default null,
  p_os_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token_hash text := null;
  v_profile public.profiles%rowtype;
  v_device public.user_devices%rowtype;
  v_mode text := public.device_binding_mode();
  v_device_id text := coalesce(nullif(btrim(coalesce(p_device_id, '')), ''), null);
  v_public_key text := coalesce(nullif(btrim(coalesce(p_public_key, '')), ''), null);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    insert into public.profiles (id, email)
    values (v_uid, nullif(auth.jwt() ->> 'email', ''))
    on conflict (id) do nothing;
    select * into v_profile from public.profiles where id = v_uid;
  end if;

  if v_profile.status = 'disabled' then
    return jsonb_build_object(
      'ok', true,
      'status', 'account_disabled',
      'role', v_profile.role,
      'account_status', 'disabled',
      'binding_mode', v_mode
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- Hybrid Windows mode
  -- ---------------------------------------------------------------------------
  if v_mode = 'hybrid_windows' then
    if v_device_id is null then
      return jsonb_build_object(
        'ok', true,
        'status', 'agent_required',
        'role', v_profile.role,
        'binding_mode', v_mode
      );
    end if;

    select * into v_device
    from public.user_devices d
    where d.user_id = v_uid and d.device_id = v_device_id and d.device_kind = 'windows_agent'
    order by d.registered_at desc
    limit 1;

    if found then
      update public.user_devices d
      set last_seen_at = now(),
          user_agent = coalesce(nullif(p_user_agent, ''), d.user_agent),
          browser = coalesce(nullif(p_browser, ''), d.browser),
          operating_system = coalesce(nullif(p_operating_system, ''), d.operating_system),
          platform = coalesce(nullif(p_platform, ''), d.platform),
          os_version = coalesce(nullif(p_os_version, ''), d.os_version),
          device_agent_version = coalesce(nullif(p_agent_version, ''), d.device_agent_version),
          detected_browsers = public.device_track_browser(d.detected_browsers, p_browser),
          device_name = case
            when d.device_name is null or d.device_name = '' or d.device_name = 'Unknown device'
              then coalesce(nullif(btrim(coalesce(p_device_name, '')), ''), d.device_name)
            else d.device_name
          end
      where d.id = v_device.id;

      return jsonb_build_object(
        'ok', true,
        'status', v_device.status,
        'device_id', v_device.device_id,
        'device_name', v_device.device_name,
        'registered_at', v_device.registered_at,
        'device_kind', v_device.device_kind,
        'device_attestation_status', v_device.device_attestation_status,
        'role', v_profile.role,
        'binding_mode', v_mode
      );
    end if;

    -- Unknown Windows device for this user -> create a PENDING enrollment.
    -- Requires the agent to present a real public key. Never auto-approve.
    if v_public_key is null then
      return jsonb_build_object(
        'ok', true,
        'status', 'agent_required',
        'role', v_profile.role,
        'binding_mode', v_mode
      );
    end if;

    insert into public.user_devices (
      user_id, device_id, token_hash, device_name, user_agent, browser,
      operating_system, status, device_kind, device_public_key,
      device_key_algorithm, device_agent_version, platform, os_version,
      device_attestation_status, last_seen_at, detected_browsers
    )
    values (
      v_uid, v_device_id, null,
      coalesce(nullif(btrim(coalesce(p_device_name, '')), ''), 'Windows device'),
      nullif(p_user_agent, ''), nullif(p_browser, ''), nullif(p_operating_system, ''),
      'pending', 'windows_agent', v_public_key,
      coalesce(nullif(btrim(coalesce(p_key_algorithm, '')), ''), 'Ed25519'),
      nullif(p_agent_version, ''), nullif(p_platform, ''), nullif(p_os_version, ''),
      'enrolled', now(), public.device_track_browser('[]'::jsonb, p_browser)
    )
    on conflict (user_id, device_id) do update
      set device_public_key = excluded.device_public_key,
          device_key_algorithm = excluded.device_key_algorithm,
          device_agent_version = coalesce(excluded.device_agent_version, user_devices.device_agent_version),
          last_seen_at = now()
    returning * into v_device;

    insert into public.device_audit_log
      (device_id, user_id, action, previous_status, new_status, details)
    values
      (v_device.id, v_uid, 'DEVICE_ENROLLMENT_STARTED', null, 'pending',
       jsonb_build_object('device_kind', 'windows_agent', 'algorithm', v_device.device_key_algorithm));

    return jsonb_build_object(
      'ok', true,
      'status', v_device.status,
      'device_id', v_device.device_id,
      'device_name', v_device.device_name,
      'registered_at', v_device.registered_at,
      'device_kind', v_device.device_kind,
      'device_attestation_status', v_device.device_attestation_status,
      'role', v_profile.role,
      'binding_mode', v_mode
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- Legacy browser-token mode (explicit operator choice)
  -- ---------------------------------------------------------------------------
  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_device_token', 'binding_mode', v_mode);
  end if;
  v_token_hash := public.device_token_hash(p_token);

  select * into v_device
  from public.user_devices d
  where d.user_id = v_uid and d.token_hash = v_token_hash and d.device_kind = 'browser'
  order by d.registered_at desc
  limit 1;

  if found then
    update public.user_devices d
    set last_seen_at = now(),
        user_agent = coalesce(nullif(p_user_agent, ''), d.user_agent),
        browser = coalesce(nullif(p_browser, ''), d.browser),
        operating_system = coalesce(nullif(p_operating_system, ''), d.operating_system),
        device_name = case
          when d.device_name = 'Unknown device' then coalesce(nullif(p_device_name, ''), d.device_name)
          else d.device_name
        end
    where d.id = v_device.id;

    return jsonb_build_object(
      'ok', true,
      'status', v_device.status,
      'device_id', v_device.device_id,
      'device_name', v_device.device_name,
      'registered_at', v_device.registered_at,
      'device_kind', v_device.device_kind,
      'role', v_profile.role,
      'binding_mode', v_mode
    );
  end if;

  insert into public.user_devices (
    user_id, device_id, token_hash, device_name, user_agent, browser,
    operating_system, status, device_kind, last_seen_at
  )
  values (
    v_uid,
    coalesce(v_device_id, gen_random_uuid()::text),
    v_token_hash,
    coalesce(nullif(btrim(coalesce(p_device_name, '')), ''), 'Unknown device'),
    nullif(p_user_agent, ''), nullif(p_browser, ''), nullif(p_operating_system, ''),
    'pending', 'browser', now()
  )
  on conflict (user_id, device_id) do update
    set token_hash = excluded.token_hash, last_seen_at = now()
  returning * into v_device;

  return jsonb_build_object(
    'ok', true,
    'status', 'pending',
    'device_id', v_device.device_id,
    'device_name', v_device.device_name,
    'registered_at', v_device.registered_at,
    'device_kind', v_device.device_kind,
    'role', v_profile.role,
    'binding_mode', v_mode
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- device_issue_challenge — unpredictable, expiring, single-use, user+device
-- bound nonce. The browser forwards the returned challenge text to the Windows
-- agent which signs it with the private key held in Windows-protected storage.
-- -----------------------------------------------------------------------------
create or replace function public.device_issue_challenge(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_ttl int := public.device_challenge_ttl_seconds();
  v_nonce text;
  v_id uuid;
  v_device_id text := coalesce(nullif(btrim(coalesce(p_device_id, '')), ''), null);
  v_open bigint;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if public.device_binding_mode() <> 'hybrid_windows' then
    raise exception 'DEVICE_BINDING_MODE_NOT_HYBRID';
  end if;
  if v_device_id is null or length(v_device_id) > 128 then
    raise exception 'DEVICE_ID_REQUIRED';
  end if;

  -- Basic rate limit: a user may hold at most 25 open (unconsumed) challenges.
  select count(*) into v_open
  from public.device_attestation_challenges
  where user_id = v_uid and consumed_at is null and expires_at > now();

  if v_open >= 25 then
    delete from public.device_attestation_challenges
    where user_id = v_uid and consumed_at is null and expires_at <= now() - interval '1 hour';
    raise exception 'CHALLENGE_RATE_LIMITED';
  end if;

  v_nonce := public.device_b64url_encode(gen_random_bytes(32));

  insert into public.device_attestation_challenges (user_id, device_id, nonce, expires_at)
  values (v_uid, v_device_id, v_nonce, now() + make_interval(secs => v_ttl))
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', v_id,
    'nonce', v_nonce,
    'message', public.device_attestation_message(v_device_id, v_id, v_nonce),
    'ttl_seconds', v_ttl,
    'expires_at', to_char(now() + make_interval(secs => v_ttl), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- verify_device_attestation — full proof verification. This is the single RPC
-- that turns "I know a device_id" into "I possess the matching private key".
-- -----------------------------------------------------------------------------
create or replace function public.verify_device_attestation(
  p_challenge_id uuid,
  p_device_id text,
  p_signature text,
  p_browser text default null,
  p_user_agent text default null,
  p_os_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_device public.user_devices%rowtype;
  v_challenge public.device_attestation_challenges%rowtype;
  v_message text;
  v_ok boolean;
  v_device_id text := coalesce(nullif(btrim(coalesce(p_device_id, '')), ''), null);
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if public.device_binding_mode() <> 'hybrid_windows' then
    return jsonb_build_object('ok', false, 'status', 'mode_not_hybrid');
  end if;
  if v_device_id is null or p_signature is null or btrim(p_signature) = '' then
    return jsonb_build_object('ok', false, 'status', 'invalid_proof');
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.status = 'disabled' then
    return jsonb_build_object('ok', true, 'status', 'account_disabled', 'role', v_profile.role);
  end if;

  -- Locate the challenge, validate ownership + single-use + expiry.
  select * into v_challenge
  from public.device_attestation_challenges
  where id = p_challenge_id and user_id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'invalid_proof');
  end if;

  if v_challenge.consumed_at is not null then
    insert into public.device_audit_log (device_id, user_id, action, new_status, details)
    values (null, v_uid, 'DEVICE_REPLAY_BLOCKED', null,
            jsonb_build_object('challenge_id', p_challenge_id));
    return jsonb_build_object('ok', false, 'status', 'invalid_proof');
  end if;

  if v_challenge.expires_at < now() then
    insert into public.device_audit_log (device_id, user_id, action, new_status, details)
    values (null, v_uid, 'DEVICE_CHALLENGE_EXPIRED', null,
            jsonb_build_object('challenge_id', p_challenge_id));
    return jsonb_build_object('ok', false, 'status', 'invalid_proof');
  end if;

  -- The challenge must be bound to the presented device.
  if v_challenge.device_id <> v_device_id then
    return jsonb_build_object('ok', false, 'status', 'invalid_proof');
  end if;

  -- Locate the device record.
  select * into v_device
  from public.user_devices
  where user_id = v_uid and device_id = v_device_id and device_kind = 'windows_agent'
  order by registered_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'status', 'not_registered', 'role', v_profile.role);
  end if;

  case v_device.status
    when 'approved' then
      null; -- continue to signature verification below
    when 'pending' then
      return jsonb_build_object('ok', true, 'status', 'pending', 'role', v_profile.role);
    when 'rejected' then
      return jsonb_build_object('ok', true, 'status', 'rejected', 'role', v_profile.role);
    when 'revoked' then
      return jsonb_build_object('ok', true, 'status', 'revoked', 'role', v_profile.role);
    else
      return jsonb_build_object('ok', false, 'status', 'invalid_proof');
  end case;

  if v_device.device_public_key is null or v_device.device_attestation_status = 're_enrollment_required' then
    return jsonb_build_object('ok', true, 'status', 're_enrollment_required', 'role', v_profile.role);
  end if;

  if coalesce(v_device.device_key_algorithm, 'Ed25519') <> 'Ed25519' then
    return jsonb_build_object('ok', false, 'status', 'invalid_proof');
  end if;

  -- Verify the signature over the canonical message.
  v_message := public.device_attestation_message(v_device_id, p_challenge_id, v_challenge.nonce);
  begin
    v_ok := public.device_ed25519_verify(p_signature, v_message, v_device.device_public_key);
  exception when others then
    v_ok := false;
  end;

  if not v_ok then
    update public.user_devices
    set device_attestation_status = 'failed'
    where id = v_device.id;
    insert into public.device_audit_log (device_id, user_id, action, new_status, details)
    values (v_device.id, v_uid, 'DEVICE_ATTESTATION_FAILED', 'failed',
            jsonb_build_object('reason', 'invalid_signature'));
    return jsonb_build_object('ok', false, 'status', 'invalid_proof');
  end if;

  -- Success: mark challenge consumed (single-use) and refresh attestation.
  update public.device_attestation_challenges
  set consumed_at = now()
  where id = p_challenge_id;

  update public.user_devices
  set device_attestation_status = 'attested',
      last_attested_at = now(),
      last_seen_at = now(),
      browser = coalesce(nullif(p_browser, ''), browser),
      user_agent = coalesce(nullif(p_user_agent, ''), user_agent),
      os_version = coalesce(nullif(p_os_version, ''), os_version),
      detected_browsers = public.device_track_browser(detected_browsers, p_browser)
  where id = v_device.id;

  insert into public.device_audit_log (device_id, user_id, action, new_status, details)
  values (v_device.id, v_uid, 'DEVICE_ATTESTED', 'attested',
          jsonb_build_object('browser', p_browser));

  return jsonb_build_object(
    'ok', true,
    'status', 'approved',
    'device_id', v_device.device_id,
    'device_name', v_device.device_name,
    'role', v_profile.role,
    'device_attestation_status', 'attested',
    'last_attested_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'binding_mode', 'hybrid_windows'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- assert_device_approved — server-side guard for every protected data RPC.
--
-- hybrid_windows : p_credential is the Windows agent device_id. An approved
--                  windows_agent row must exist AND have proven key possession
--                  (last_attested_at) inside the challenge TTL window.
-- browser_legacy : p_credential is the legacy browser token (token hash).
--
-- Dropped first because CREATE OR REPLACE cannot rename the base migration's
-- input parameter (p_token -> p_credential).
-- -----------------------------------------------------------------------------
drop function if exists public.assert_device_approved(text);
create or replace function public.assert_device_approved(p_credential text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token_hash text;
  v_profile public.profiles%rowtype;
  v_mode text := public.device_binding_mode();
  v_ttl int := public.device_challenge_ttl_seconds();
  v_device_id text := coalesce(nullif(btrim(coalesce(p_credential, '')), ''), null);
  v_ok boolean;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if v_device_id is null then
    raise exception 'DEVICE_CREDENTIAL_REQUIRED';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.status = 'disabled' then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  if v_mode = 'hybrid_windows' then
    select exists (
      select 1
      from public.user_devices d
      where d.user_id = v_uid
        and d.device_id = v_device_id
        and d.device_kind = 'windows_agent'
        and d.status = 'approved'
    ) into v_ok;
    if not v_ok then
      raise exception 'DEVICE_NOT_APPROVED';
    end if;

    -- A valid Windows-device proof must have been produced recently. The
    -- browser re-attests on a cadence below the TTL and before protected RPCs.
    select exists (
      select 1
      from public.user_devices d
      where d.user_id = v_uid
        and d.device_id = v_device_id
        and d.device_kind = 'windows_agent'
        and d.status = 'approved'
        and d.last_attested_at is not null
        and d.last_attested_at > now() - make_interval(secs => v_ttl)
    ) into v_ok;
    if not v_ok then
      raise exception 'DEVICE_PROOF_STALE';
    end if;

    update public.user_devices d
    set last_seen_at = now()
    where d.user_id = v_uid and d.device_id = v_device_id
      and d.device_kind = 'windows_agent' and d.status = 'approved';
    return true;
  end if;

  -- browser_legacy path (unchanged behaviour).
  v_token_hash := public.device_token_hash(p_credential);
  select exists (
    select 1 from public.user_devices d
    where d.user_id = v_uid
      and d.token_hash = v_token_hash
      and d.device_kind = 'browser'
      and d.status = 'approved'
  ) into v_ok;
  if not v_ok then
    raise exception 'DEVICE_NOT_APPROVED';
  end if;

  update public.user_devices d
  set last_seen_at = now()
  where d.user_id = v_uid and d.token_hash = v_token_hash
    and d.device_kind = 'browser' and d.status = 'approved';
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin RPCs (mode aware). Drop the old return shapes before recreating them.
-- -----------------------------------------------------------------------------
drop function if exists public.admin_list_devices(text);

create or replace function public.admin_list_devices(p_token text)
returns table (
  id uuid,
  user_id uuid,
  email text,
  role text,
  user_status text,
  device_id text,
  device_name text,
  device_kind text,
  browser text,
  operating_system text,
  user_agent text,
  platform text,
  os_version text,
  agent_version text,
  device_key_algorithm text,
  device_public_key text,
  device_attestation_status text,
  detected_browsers jsonb,
  status text,
  registered_at timestamptz,
  last_seen_at timestamptz,
  last_attested_at timestamptz,
  approved_at timestamptz,
  approved_by_email text,
  rejected_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_device_approved(p_token);
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
    select
      d.id,
      d.user_id,
      p.email,
      p.role,
      p.status,
      d.device_id,
      d.device_name,
      d.device_kind,
      d.browser,
      d.operating_system,
      d.user_agent,
      d.platform,
      d.os_version,
      d.device_agent_version,
      d.device_key_algorithm,
      d.device_public_key,
      d.device_attestation_status,
      d.detected_browsers,
      d.status,
      d.registered_at,
      d.last_seen_at,
      d.last_attested_at,
      d.approved_at,
      (select a.email from public.profiles a where a.id = d.approved_by),
      d.rejected_at,
      d.revoked_at
    from public.user_devices d
    join public.profiles p on p.id = d.user_id
    order by (d.status = 'pending') desc, (d.device_kind = 'windows_agent') desc, d.registered_at desc;
end;
$$;

create or replace function public.admin_device_action(p_token text, p_device_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.user_devices%rowtype;
  v_new_status text;
  v_prev_status text;
  v_action_code text;
  v_max text;
  v_approved_count bigint;
  v_mode text := public.device_binding_mode();
  v_kind text;
begin
  perform public.assert_device_approved(p_token);
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into v_device from public.user_devices where id = p_device_id;
  if not found then
    raise exception 'DEVICE_NOT_FOUND';
  end if;

  v_prev_status := v_device.status;
  v_kind := v_device.device_kind;

  case p_action
    when 'approve' then
      if v_device.status not in ('pending', 'rejected', 'revoked') then
        raise exception 'INVALID_TRANSITION';
      end if;
      select value into v_max from public.app_settings where key = 'max_approved_devices';
      v_max := coalesce(nullif(btrim(coalesce(v_max, '')), ''), '0');
      if v_max <> '0' then
        select count(*) into v_approved_count
        from public.user_devices
        where user_id = v_device.user_id
          and status = 'approved'
          and device_kind = case when v_mode = 'hybrid_windows' then 'windows_agent' else 'browser' end;
        if v_approved_count >= v_max::bigint then
          raise exception 'MAX_APPROVED_DEVICES_REACHED';
        end if;
      end if;
      update public.user_devices
      set status = 'approved',
          approved_at = now(),
          approved_by = auth.uid(),
          rejected_at = null,
          revoked_at = null
      where id = p_device_id and status in ('pending', 'rejected', 'revoked')
      returning status into v_new_status;
      if not found then
        raise exception 'INVALID_TRANSITION';
      end if;
      v_action_code := 'DEVICE_APPROVED';

    when 'reject' then
      update public.user_devices
      set status = 'rejected', rejected_at = now()
      where id = p_device_id and status = 'pending'
      returning status into v_new_status;
      if not found then
        raise exception 'INVALID_TRANSITION';
      end if;
      v_action_code := 'DEVICE_REJECTED';

    when 'revoke' then
      update public.user_devices
      set status = 'revoked', revoked_at = now()
      where id = p_device_id and status = 'approved'
      returning status into v_new_status;
      if not found then
        raise exception 'INVALID_TRANSITION';
      end if;
      v_action_code := 'DEVICE_REVOKED';

    when 'pending' then
      update public.user_devices
      set status = 'pending',
          rejected_at = null,
          revoked_at = null
      where id = p_device_id and status in ('rejected', 'revoked')
      returning status into v_new_status;
      if not found then
        raise exception 'INVALID_TRANSITION';
      end if;
      v_action_code := 'DEVICE_REOPENED';

    when 'reenroll' then
      -- Force re-enrollment for a Windows device: drop the stored public key,
      -- invalidate attestation and revoke until the agent generates a brand new
      -- identity/key pair (a new device_id -> a new pending enrollment).
      if v_device.device_kind <> 'windows_agent' then
        raise exception 'INVALID_TRANSITION';
      end if;
      update public.user_devices
      set status = 'revoked',
          revoked_at = now(),
          device_public_key = null,
          device_key_algorithm = null,
          device_attestation_status = 're_enrollment_required',
          last_attested_at = null
      where id = p_device_id
      returning status into v_new_status;
      if not found then
        raise exception 'INVALID_TRANSITION';
      end if;
      v_action_code := 'DEVICE_REENROLLMENT_REQUIRED';

    else
      raise exception 'UNKNOWN_ACTION';
  end case;

  insert into public.device_audit_log
    (device_id, user_id, admin_id, action, previous_status, new_status, details)
  values
    (p_device_id, v_device.user_id, auth.uid(), v_action_code, v_prev_status, v_new_status,
     jsonb_build_object('device_kind', v_kind));

  return jsonb_build_object(
    'ok', true,
    'id', p_device_id,
    'action', v_action_code,
    'previous_status', v_prev_status,
    'status', v_new_status
  );
end;
$$;

-- Generalized admin setting update for the explicit binding policy keys.
create or replace function public.admin_update_setting(p_token text, p_key text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(btrim(coalesce(p_key, '')));
  v_value text := btrim(coalesce(p_value, ''));
begin
  perform public.assert_device_approved(p_token);
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if v_key = 'max_approved_devices' then
    if v_value !~ '^[0-9]+$' then
      raise exception 'INVALID_VALUE';
    end if;
  elsif v_key = 'device_binding_mode' then
    if v_value not in ('hybrid_windows', 'browser_legacy') then
      raise exception 'INVALID_VALUE';
    end if;
  elsif v_key = 'device_challenge_ttl_seconds' then
    if v_value !~ '^[0-9]+$' or v_value::int < 10 or v_value::int > 600 then
      raise exception 'INVALID_VALUE';
    end if;
  elsif v_key = 'device_agent_min_version' then
    if v_value !~ '^[0-9]+(\.[0-9]+)*$' then
      raise exception 'INVALID_VALUE';
    end if;
  else
    raise exception 'INVALID_KEY';
  end if;

  insert into public.app_settings (key, value)
  values (v_key, v_value)
  on conflict (key) do update set value = excluded.value;

  insert into public.device_audit_log
    (device_id, user_id, admin_id, action, new_status, details)
  values
    (null, auth.uid(), auth.uid(), 'SETTING_UPDATED', null,
     jsonb_build_object('key', v_key, 'value', v_value));

  return jsonb_build_object('ok', true, 'key', v_key, 'value', v_value);
end;
$$;

drop function if exists public.become_first_admin(text);

-- First-administrator bootstrap. In hybrid_windows the initial administrator
-- must present a real Windows agent enrollment (device_id + public key); that
-- enrollment is approved automatically so the deployment owner can open /admin.
-- In browser_legacy the previous token-based behaviour is preserved.
create or replace function public.become_first_admin(
  p_token text,
  p_device_id text default null,
  p_public_key text default null,
  p_key_algorithm text default null,
  p_device_name text default null,
  p_platform text default null,
  p_os_version text default null,
  p_agent_version text default null,
  p_browser text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token_hash text := null;
  v_device public.user_devices%rowtype;
  v_profile public.profiles%rowtype;
  v_mode text := public.device_binding_mode();
  v_device_id text := coalesce(nullif(btrim(coalesce(p_device_id, '')), ''), null);
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'ADMIN_ALREADY_EXISTS';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    insert into public.profiles (id, email)
    values (v_uid, nullif(auth.jwt() ->> 'email', ''))
    on conflict (id) do nothing;
    select * into v_profile from public.profiles where id = v_uid;
  end if;

  if v_mode = 'hybrid_windows' then
    if v_device_id is null or coalesce(nullif(btrim(coalesce(p_public_key, '')), ''), null) is null then
      raise exception 'DEVICE_AGENT_REQUIRED';
    end if;

    select * into v_device
    from public.user_devices
    where user_id = v_uid and device_id = v_device_id and device_kind = 'windows_agent'
    order by registered_at desc
    limit 1;

    if not found then
      insert into public.user_devices (
        user_id, device_id, token_hash, device_name, device_kind, device_public_key,
        device_key_algorithm, device_agent_version, platform, os_version,
        device_attestation_status, status, browser, user_agent, last_seen_at
      )
      values (
        v_uid, v_device_id, null,
        coalesce(nullif(btrim(coalesce(p_device_name, '')), ''), coalesce(nullif(p_profile.email, ''), 'Admin') || ' Windows device'),
        'windows_agent',
        btrim(p_public_key),
        coalesce(nullif(btrim(coalesce(p_key_algorithm, '')), ''), 'Ed25519'),
        nullif(p_agent_version, ''), nullif(p_platform, ''), nullif(p_os_version, ''),
        'enrolled', 'pending', nullif(p_browser, ''), nullif(p_user_agent, ''), now()
      )
      on conflict (user_id, device_id) do update
        set device_public_key = excluded.device_public_key, last_seen_at = now()
      returning * into v_device;
    end if;

    update public.user_devices
    set status = 'approved',
        approved_at = now(),
        approved_by = v_uid,
        revoked_at = null,
        rejected_at = null,
        device_attestation_status = 'enrolled'
    where id = v_device.id
    returning * into v_device;

    update public.profiles set role = 'admin', status = 'active', updated_at = now() where id = v_uid;

    insert into public.device_audit_log
      (device_id, user_id, admin_id, action, previous_status, new_status, details)
    values
      (v_device.id, v_uid, v_uid, 'ADMIN_BOOTSTRAP', null, 'approved',
       jsonb_build_object('device_kind', 'windows_agent', 'role', 'admin'));

    return jsonb_build_object('ok', true, 'role', 'admin', 'status', 'approved', 'binding_mode', v_mode);
  end if;

  -- Legacy bootstrap.
  if p_token is null or btrim(p_token) = '' then
    raise exception 'DEVICE_TOKEN_REQUIRED';
  end if;
  v_token_hash := public.device_token_hash(p_token);

  select * into v_device
  from public.user_devices
  where user_id = v_uid and token_hash = v_token_hash and device_kind = 'browser'
  order by registered_at desc
  limit 1;

  if not found then
    insert into public.user_devices
      (user_id, device_id, token_hash, device_name, device_kind, status, last_seen_at)
    values
      (v_uid, gen_random_uuid()::text, v_token_hash,
       coalesce(nullif(btrim(coalesce(p_device_name, '')), ''), coalesce(nullif(p_profile.email, ''), 'Unknown')) || ' administrator device',
       'browser', 'pending', now())
    on conflict (user_id, device_id) do nothing
    returning * into v_device;
  end if;

  update public.profiles set role = 'admin', status = 'active', updated_at = now() where id = v_uid;

  update public.user_devices
  set status = 'approved', approved_at = now(), approved_by = v_uid, revoked_at = null, rejected_at = null
  where user_id = v_uid and token_hash = v_token_hash and device_kind = 'browser';

  insert into public.device_audit_log
    (device_id, user_id, admin_id, action, previous_status, new_status, details)
  values
    (v_device.id, v_uid, v_uid, 'ADMIN_BOOTSTRAP', null, 'approved',
     jsonb_build_object('device_kind', 'browser', 'role', 'admin'));

  return jsonb_build_object('ok', true, 'role', 'admin', 'status', 'approved', 'binding_mode', v_mode);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.device_binding_mode() from public;
revoke all on function public.device_challenge_ttl_seconds() from public;
revoke all on function public.device_b64url_encode(bytea) from public;
revoke all on function public.device_b64url_decode(text) from public;
revoke all on function public.device_track_browser(jsonb, text) from public;
revoke all on function public.device_ed25519_verify(text, text, text) from public;
revoke all on function public.device_attestation_message(text, uuid, text) from public;

revoke all on function public.get_device_access(text, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.assert_device_approved(text) from public;
revoke all on function public.device_issue_challenge(text) from public;
revoke all on function public.verify_device_attestation(uuid, text, text, text, text, text) from public;
revoke all on function public.admin_list_devices(text) from public;
revoke all on function public.admin_device_action(text, uuid, text) from public;
revoke all on function public.admin_update_setting(text, text, text) from public;
revoke all on function public.become_first_admin(text, text, text, text, text, text, text, text, text, text) from public;

grant execute on function public.device_binding_mode() to authenticated;
grant execute on function public.device_challenge_ttl_seconds() to authenticated;
grant execute on function public.device_b64url_encode(bytea) to authenticated;
grant execute on function public.device_b64url_decode(text) to authenticated;
grant execute on function public.device_track_browser(jsonb, text) to authenticated;
grant execute on function public.device_ed25519_verify(text, text, text) to authenticated;
grant execute on function public.device_attestation_message(text, uuid, text) to authenticated;

grant execute on function public.get_device_access(text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.assert_device_approved(text) to authenticated;
grant execute on function public.device_issue_challenge(text) to authenticated;
grant execute on function public.verify_device_attestation(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_list_devices(text) to authenticated;
grant execute on function public.admin_device_action(text, uuid, text) to authenticated;
grant execute on function public.admin_update_setting(text, text, text) to authenticated;
grant execute on function public.become_first_admin(text, text, text, text, text, text, text, text, text, text) to authenticated;
