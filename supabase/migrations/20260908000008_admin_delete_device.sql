-- =============================================================================
-- FullAluDoor — Admin: permanently delete a device enrollment
-- -----------------------------------------------------------------------------
-- Adds admin_delete_device(p_token, p_device_id). Deletes the user_devices row
-- so the device is removed from the approval pool; the user must register
-- (and be approved) again on their next login. Audited before deletion.
--
-- Authorization: same as every admin RPC — assert_device_approved(p_token) for
-- the caller AND is_admin(). RLS is untouched; deletion only happens inside
-- this SECURITY DEFINER function.
-- =============================================================================

create or replace function public.admin_delete_device(p_token text, p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.user_devices%rowtype;
begin
  perform public.assert_device_approved(p_token);
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into v_device from public.user_devices where id = p_device_id;
  if not found then
    return jsonb_build_object('status', 'not_found', 'action', 'delete');
  end if;

  insert into public.device_audit_log
    (device_id, user_id, admin_id, action, previous_status, new_status, details)
  values
    (v_device.id, v_device.user_id, auth.uid(), 'ADMIN_DELETE_DEVICE', v_device.status, 'deleted',
     jsonb_build_object(
       'device_kind', v_device.device_kind,
       'device_name', v_device.device_name,
       'device_id', v_device.device_id
     ));

  delete from public.user_devices where id = v_device.id;

  return jsonb_build_object('status', 'deleted', 'action', 'delete');
end;
$$;

revoke all on function public.admin_delete_device(text, uuid) from public;
grant execute on function public.admin_delete_device(text, uuid) to authenticated;
