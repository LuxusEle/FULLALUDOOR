-- =============================================================================
-- FullAluDoor — Per-user onboarding state
-- -----------------------------------------------------------------------------
-- Adds user-level onboarding flags to public.profiles (the existing per-user
-- record) plus two SECURITY DEFINER RPCs so the browser can read/write only the
-- caller's own onboarding state — with the same device-approved authorization
-- used by every other application RPC. Onboarding belongs to the USER, never to
-- a project document, and never touches RLS or device-binding tables.
--
--   app_get_onboarding(p_token)      -> { onboarding_completed, onboarding_version,
--                                        onboarding_skipped, onboarding_completed_at }
--   app_set_onboarding(p_token,
--        p_completed, p_version, p_skipped, p_completed_at)  -> same shape
-- =============================================================================

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_version integer not null default 0,
  add column if not exists onboarding_skipped boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz;

create or replace function public.app_get_onboarding(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  perform public.assert_device_approved(p_token);

  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    return jsonb_build_object(
      'onboarding_completed', false,
      'onboarding_version', 0,
      'onboarding_skipped', false,
      'onboarding_completed_at', null
    );
  end if;

  return jsonb_build_object(
    'onboarding_completed', v_profile.onboarding_completed,
    'onboarding_version', v_profile.onboarding_version,
    'onboarding_skipped', v_profile.onboarding_skipped,
    'onboarding_completed_at',
      case when v_profile.onboarding_completed_at is null then null
           else to_char(v_profile.onboarding_completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      end
  );
end;
$$;

revoke all on function public.app_get_onboarding(text) from public;
grant execute on function public.app_get_onboarding(text) to authenticated;

create or replace function public.app_set_onboarding(
  p_token text,
  p_completed boolean default false,
  p_version integer default 0,
  p_skipped boolean default false,
  p_completed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles%rowtype;
begin
  perform public.assert_device_approved(p_token);

  insert into public.profiles (id, email, role, status)
  values (auth.uid(), null, 'user', 'active')
  on conflict (id) do nothing;

  update public.profiles
     set onboarding_completed = p_completed,
         onboarding_version = p_version,
         onboarding_skipped = p_skipped,
         onboarding_completed_at =
           case when p_completed then coalesce(p_completed_at, now())
                else onboarding_completed_at end,
         updated_at = now()
   where id = auth.uid();

  select * into v_row from public.profiles where id = auth.uid();

  return jsonb_build_object(
    'onboarding_completed', v_row.onboarding_completed,
    'onboarding_version', v_row.onboarding_version,
    'onboarding_skipped', v_row.onboarding_skipped,
    'onboarding_completed_at',
      case when v_row.onboarding_completed_at is null then null
           else to_char(v_row.onboarding_completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      end
  );
end;
$$;

revoke all on function public.app_set_onboarding(text, boolean, integer, boolean, timestamptz) from public;
grant execute on function public.app_set_onboarding(text, boolean, integer, boolean, timestamptz) to authenticated;
