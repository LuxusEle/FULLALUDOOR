-- =============================================================================
-- FullAluDoor — Cross-device approval fallback (browser-token enrollment when
-- no Windows Device Agent is available)
-- -----------------------------------------------------------------------------
-- Policy after this migration (per-account, DB enforced):
--
--   ADMIN (active)          -> password-only, no device required (unchanged)
--   Windows + agent present -> existing hybrid_windows flow: approved
--                              windows_agent row + fresh Ed25519 attestation
--                              (UNCHANGED, still the strongest path)
--   No agent (Android, iOS, any browser, Windows without the agent)
--                          -> browser-token enrollment. The browser registers
--                              a PENDING 'browser' device; an admin approves it
--                              in /admin; once approved the browser is granted
--                              access under the browser_legacy verdict path.
--
-- Security invariants preserved:
--   * get_device_access still never auto-approves: new devices are PENDING.
--   * Windows devices keep the fresh-proof (last_attested_at TTL) requirement.
--   * assert_device_approved still requires an approved row for non-admins;
--     approved 'browser' rows are now honoured even when the deployment mode
--     is hybrid_windows (this is the phone/iOS/Android fallback).
--   * RLS, grants, user_devices, audit log untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_device_access — login-time verdict
--   hybrid_windows + agent id -> windows_agent enrollment (unchanged)
--   no agent id / browser_legacy -> browser-token enrollment (fallback)
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
  -- Hybrid Windows mode, ONLY when the agent presented a windows device id.
  -- (No agent id on phones/iOS/Android, or on Windows without the agent, falls
  -- through to the browser-token enrollment below.)
  -- ---------------------------------------------------------------------------
  if v_mode = 'hybrid_windows' and v_device_id is not null then
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
  -- Browser-token enrollment (fallback for devices without a Windows agent,
  -- and the explicit browser_legacy mode). Always returns the browser_legacy
  -- verdict so the client never demands an agent/attestation for these devices.
  -- ---------------------------------------------------------------------------
  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_device_token', 'binding_mode', 'browser_legacy');
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
          when d.device_name is null or d.device_name = '' or d.device_name = 'Unknown device'
            then coalesce(nullif(p_device_name, ''), d.device_name)
          else d.device_name
        end
    where d.id = v_device.id;

    return jsonb_build_object(
      'ok', true,
      'status', v_device.status,
      'device_id', v_device.device_id,
      'device_name', v_device.device_name,
      'registered_at', v_device.registered_at,
      'device_kind', 'browser',
      'role', v_profile.role,
      'binding_mode', 'browser_legacy'
    );
  end if;

  insert into public.user_devices (
    user_id, device_id, token_hash, device_name, user_agent, browser,
    operating_system, status, device_kind, last_seen_at, detected_browsers
  )
  values (
    v_uid,
    gen_random_uuid()::text,
    v_token_hash,
    coalesce(nullif(btrim(coalesce(p_device_name, '')), ''), 'Browser device'),
    nullif(p_user_agent, ''), nullif(p_browser, ''), nullif(p_operating_system, ''),
    'pending', 'browser', now(), public.device_track_browser('[]'::jsonb, p_browser)
  )
  on conflict (user_id, device_id) do update
    set token_hash = excluded.token_hash, last_seen_at = now()
  returning * into v_device;

  insert into public.device_audit_log
    (device_id, user_id, action, previous_status, new_status, details)
  values
    (v_device.id, v_uid, 'DEVICE_ENROLLMENT_STARTED', null, 'pending',
     jsonb_build_object('device_kind', 'browser'));

  return jsonb_build_object(
    'ok', true,
    'status', v_device.status,
    'device_id', v_device.device_id,
    'device_name', v_device.device_name,
    'registered_at', v_device.registered_at,
    'device_kind', 'browser',
    'role', v_profile.role,
    'binding_mode', 'browser_legacy'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- assert_device_approved — choke point for protected data/admin RPCs.
--   active admin            -> true (unchanged)
--   hybrid_windows, windows row approved + fresh proof -> true (unchanged)
--   approved 'browser' row  -> true (NEW fallback, honoured in every mode)
-- Everything else is rejected. Browser rows do NOT require attestation; they
-- were already approved by an administrator and are bound to the stored token.
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
  v_win_ok boolean;
  v_win_stale boolean := false;
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

  -- Active administrators authenticate with email + password only.
  if public.is_admin() then
    return true;
  end if;

  -- hybrid_windows: an approved windows_agent row with a fresh proof wins.
  if v_mode = 'hybrid_windows' then
    select exists (
      select 1 from public.user_devices d
      where d.user_id = v_uid
        and d.device_id = v_device_id
        and d.device_kind = 'windows_agent'
        and d.status = 'approved'
    ) into v_win_ok;

    if v_win_ok then
      select exists (
        select 1 from public.user_devices d
        where d.user_id = v_uid
          and d.device_id = v_device_id
          and d.device_kind = 'windows_agent'
          and d.status = 'approved'
          and d.last_attested_at is not null
          and d.last_attested_at > now() - make_interval(secs => v_ttl)
      ) into v_ok;

      if v_ok then
        update public.user_devices d
        set last_seen_at = now()
        where d.user_id = v_uid and d.device_id = v_device_id
          and d.device_kind = 'windows_agent' and d.status = 'approved';
        return true;
      end if;

      -- Approved Windows device but its proof expired: remembered so the
      -- browser-token fallback below can NOT mask it with a weaker verdict.
      v_win_stale := true;
    end if;
  end if;

  -- Browser-token fallback (approved 'browser' row) — honoured in every mode.
  v_token_hash := public.device_token_hash(p_credential);
  select exists (
    select 1 from public.user_devices d
    where d.user_id = v_uid
      and d.token_hash = v_token_hash
      and d.device_kind = 'browser'
      and d.status = 'approved'
  ) into v_ok;

  if v_ok then
    update public.user_devices d
    set last_seen_at = now()
    where d.user_id = v_uid and d.token_hash = v_token_hash
      and d.device_kind = 'browser' and d.status = 'approved';
    return true;
  end if;

  if v_win_stale then
    raise exception 'DEVICE_PROOF_STALE';
  end if;

  raise exception 'DEVICE_NOT_APPROVED';
end;
$$;
