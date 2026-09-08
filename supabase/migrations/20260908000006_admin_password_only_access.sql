-- =============================================================================
-- FullAluDoor — Admin password-only access (active admins bypass device binding)
-- -----------------------------------------------------------------------------
-- Authorization change: an authenticated, ACTIVE administrator
-- (profiles.role = 'admin' AND profiles.status = 'active') is granted access
-- using email + password only. No Windows Device Agent, enrollment, approval or
-- attestation is required for an admin.
--
-- Normal users are NOT changed: hybrid_windows device binding + attestation
-- remains enforced for every non-admin account.
--
-- Security invariants preserved:
--   * The database stays the authorization boundary (SECURITY DEFINER RPCs).
--   * RLS policies are untouched. No protected table becomes directly writable.
--   * Role is read from profiles via auth.uid() — never from the client.
--   * is_admin() (used inside every admin RPC) still requires an ACTIVE admin.
--   * No normal-user device check is relaxed.
--
-- Functions recreated (CREATE OR REPLACE, same signatures as
-- 20260908000000_hybrid_windows_device_binding.sql):
--   * get_device_access       -> active admin short-circuits to 'approved'
--                                with admin_access=true BEFORE any device logic.
--   * assert_device_approved  -> active admin returns true (choke point for all
--                                protected data + admin RPCs).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_device_access — login-time verdict
-- -----------------------------------------------------------------------------
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
  -- Active administrators: password-only access on any device/browser.
  -- The role/status come from the profiles table (auth.uid()), never from the
  -- client. admin_access=true is a SERVER verdict so the client can skip the
  -- Windows agent flow without ever being able to fabricate it.
  -- ---------------------------------------------------------------------------
  if v_profile.role = 'admin' and v_profile.status = 'active' then
    return jsonb_build_object(
      'ok', true,
      'status', 'approved',
      'role', 'admin',
      'account_status', 'active',
      'binding_mode', v_mode,
      'admin_access', true
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- Hybrid Windows mode (non-admin users only from here on)
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
  -- Legacy browser-token mode (non-admin users only from here on)
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
-- assert_device_approved — choke point for every protected data/admin RPC.
-- Active admins pass without device proof; everyone else keeps the existing
-- hybrid_windows (or browser_legacy) checks unchanged.
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

  -- Active administrators authenticate with email + password only. is_admin()
  -- reads profiles via auth.uid() and requires role='admin' AND status='active'.
  if public.is_admin() then
    return true;
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
