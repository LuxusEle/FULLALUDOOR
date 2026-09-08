-- One-time initial deployment approval.
--
-- Promotes the named account to administrator and approves its pending
-- Windows-agent device so the owner can open /admin. This is a recovery/data
-- migration for the very first admin of a new deployment. Subsequent device
-- approvals are handled in /admin (admin_device_action RPC) — no more manual
-- SQL is needed afterwards.

do $$
declare
  v_email text := 'vihangakaveeshavg@gmail.com';
  v_device_id text := 'f308c34e-bf40-45e4-ac2d-063c079b98fa';
  v_uid uuid;
  v_device uuid;
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

  update public.user_devices d
  set status = 'approved',
      approved_at = now(),
      approved_by = v_uid,
      rejected_at = null,
      revoked_at = null,
      last_seen_at = now()
  where d.user_id = v_uid
    and d.device_id = v_device_id
    and d.device_kind = 'windows_agent'
  returning d.id into v_device;

  if v_device is null then
    select d.id into v_device
    from public.user_devices d
    where d.user_id = v_uid
      and d.device_kind = 'windows_agent'
      and d.status = 'pending'
    order by d.registered_at desc
    limit 1;

    if v_device is null then
      raise exception 'No pending windows device found for %', v_email;
    end if;

    update public.user_devices
    set status = 'approved',
        approved_at = now(),
        approved_by = v_uid,
        rejected_at = null,
        revoked_at = null
    where id = v_device;
  end if;

  insert into public.device_audit_log
    (device_id, user_id, admin_id, action, previous_status, new_status, details)
  values
    (v_device, v_uid, v_uid, 'ADMIN_BOOTSTRAP', 'pending', 'approved',
     jsonb_build_object('note', 'Initial deployment approval (one-time recovery migration)'));
end $$;
