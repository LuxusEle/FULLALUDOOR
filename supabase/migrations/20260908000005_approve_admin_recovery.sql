-- Recovery: re-approve the deployment administrator's Windows device after a
-- revocation locked the sole admin out of /admin.
--
-- Mirrors 20260908000001_approve_initial_admin.sql but is applied when the
-- first admin already exists and only needs their windows_agent device row
-- moved back to 'approved'. Idempotent-ish; safe to run once.

do $$
declare
  v_email text := 'vihangakaveeshavg@gmail.com';
  v_device_id text := 'f308c34e-bf40-45e4-ac2d-063c079b98fa';
  v_public_key text := 'fI3Dq9TElzmu5ht5xUI9_bc0b2X5hbL202T_q7uOMNU';
  v_uid uuid;
  v_device uuid;
  v_prev text;
begin
  select id into v_uid
  from auth.users
  where lower(email) = lower(v_email)
  limit 1;

  if v_uid is null then
    raise exception 'No auth user found for %', v_email;
  end if;

  insert into public.profiles (id, email, role, status)
  values (v_uid, v_email, 'admin', 'active')
  on conflict (id) do update
    set email = excluded.email,
        role = 'admin',
        status = 'active',
        updated_at = now();

  select d.status into v_prev
  from public.user_devices d
  where d.user_id = v_uid
    and d.device_id = v_device_id
    and d.device_kind = 'windows_agent'
  limit 1;

  update public.user_devices d
  set status = 'approved',
      approved_at = now(),
      approved_by = v_uid,
      rejected_at = null,
      revoked_at = null,
      last_seen_at = now(),
      device_public_key = coalesce(d.device_public_key, v_public_key),
      device_key_algorithm = coalesce(d.device_key_algorithm, 'Ed25519'),
      device_attestation_status = case
        when d.device_attestation_status = 're_enrollment_required' then 'enrolled'
        else d.device_attestation_status
      end
  where d.user_id = v_uid
    and d.device_id = v_device_id
    and d.device_kind = 'windows_agent'
  returning d.id into v_device;

  if v_device is null then
    select d.id into v_device
    from public.user_devices d
    where d.user_id = v_uid
      and d.device_kind = 'windows_agent'
    order by d.registered_at desc
    limit 1;

    if v_device is null then
      raise exception 'No windows_agent device found for %', v_email;
    end if;

    select status into v_prev from public.user_devices where id = v_device;

    update public.user_devices
    set status = 'approved',
        approved_at = now(),
        approved_by = v_uid,
        rejected_at = null,
        revoked_at = null,
        last_seen_at = now(),
        device_public_key = coalesce(device_public_key, v_public_key),
        device_key_algorithm = coalesce(device_key_algorithm, 'Ed25519'),
        device_attestation_status = case
          when device_attestation_status = 're_enrollment_required' then 'enrolled'
          else device_attestation_status
        end
    where id = v_device;
  end if;

  insert into public.device_audit_log
    (device_id, user_id, admin_id, action, previous_status, new_status, details)
  values
    (v_device, v_uid, v_uid, 'ADMIN_RECOVERY_APPROVAL', coalesce(v_prev, 'revoked'), 'approved',
     jsonb_build_object('note', 'Recovery re-approval for the deployment administrator'));

  raise notice 'Re-approved windows_agent device % for %', v_device_id, v_email;
end $$;
