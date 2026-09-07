-- =============================================================================
-- FullAluDoor — Admin-Approved Device-Bound Authentication
-- -----------------------------------------------------------------------------
-- Applies the database layer for server-enforced, admin-approved device
-- binding. Safe to run once in the Supabase SQL editor or with
-- `supabase db push`. Statements are idempotent.
--
-- What it adds:
--   * profiles             -> application role (user/admin) + account status
--   * user_devices         -> per-user device registrations (admin approved)
--   * device_audit_log     -> append-only audit of admin device/user actions
--   * app_settings         -> key/value configuration (e.g. max approved devices)
--   * SECURITY DEFINER RPCs (the only way device/account state can change)
--   * Row Level Security
--
-- The authorization decision is made in PostgreSQL (the server), never by the
-- client. Users cannot approve their own device, change device status, change
-- their own role or bypass device approval by editing client state.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- organizations / door_projects (existing application tables, re-declared for
-- self-contained migration on fresh databases)
-- -----------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.door_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  configuration jsonb not null,
  status text not null default 'draft',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.door_projects enable row level security;

-- Direct table access is intentionally removed (see end of file). All project
-- data access flows through SECURITY DEFINER RPCs that first require an
-- approved device for the authenticated user.
drop policy if exists "owners manage organizations" on public.organizations;
drop policy if exists "owners manage projects" on public.door_projects;

-- -----------------------------------------------------------------------------
-- profiles — source of truth for application role and account status
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_status_idx on public.profiles(status);

-- -----------------------------------------------------------------------------
-- user_devices — admin-approved device registrations
-- -----------------------------------------------------------------------------
create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  token_hash text not null,
  device_name text not null default 'Unknown device',
  user_agent text,
  browser text,
  operating_system text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  rejected_at timestamptz,
  revoked_at timestamptz,
  constraint user_devices_user_device_unique unique (user_id, device_id)
);

create index if not exists user_devices_user_idx on public.user_devices(user_id);
create index if not exists user_devices_status_idx on public.user_devices(status);
create index if not exists user_devices_token_hash_idx on public.user_devices(token_hash);

-- -----------------------------------------------------------------------------
-- device_audit_log — append-only audit of admin actions
-- -----------------------------------------------------------------------------
create table if not exists public.device_audit_log (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.user_devices(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references auth.users(id),
  action text not null,
  previous_status text,
  new_status text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists device_audit_device_idx on public.device_audit_log(device_id);
create index if not exists device_audit_user_idx on public.device_audit_log(user_id);

-- -----------------------------------------------------------------------------
-- app_settings — configurable behaviour
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

insert into public.app_settings (key, value)
values ('max_approved_devices', '0')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Seed profiles for every existing auth user (trigger keeps it current after)
-- -----------------------------------------------------------------------------
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.handle_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email, updated_at = now() where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email on auth.users
for each row execute function public.handle_user_update();

-- -----------------------------------------------------------------------------
-- Shared security helpers
-- -----------------------------------------------------------------------------

-- True when the current JWT subject is an active administrator. Read inside
-- SECURITY DEFINER functions AND inside RLS policies without recursion because
-- it bypasses RLS itself.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

-- sha-256 of the device token. pgcrypto may live in either the public or the
-- Supabase 'extensions' schema, so both are on the search path.
create or replace function public.device_token_hash(p_token text)
returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_devices enable row level security;
alter table public.device_audit_log enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "profiles select own or admin" on public.profiles;
create policy "profiles select own or admin"
on public.profiles
for select
using (id = auth.uid() or public.is_admin());

drop policy if exists "user_devices select own or admin" on public.user_devices;
create policy "user_devices select own or admin"
on public.user_devices
for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "device_audit_log select admin" on public.device_audit_log;
create policy "device_audit_log select admin"
on public.device_audit_log
for select
using (public.is_admin());

drop policy if exists "app_settings select admin" on public.app_settings;
create policy "app_settings select admin"
on public.app_settings
for select
using (public.is_admin());

-- No INSERT/UPDATE/DELETE policies exist for profiles, user_devices or
-- device_audit_log. All mutation happens inside SECURITY DEFINER RPCs below,
-- which re-validate the caller before doing anything. Users therefore cannot
-- approve their own device, change their own status/role, or mutate others.

-- -----------------------------------------------------------------------------
-- get_device_access — login-time device check + (pending) registration
-- -----------------------------------------------------------------------------
create or replace function public.get_device_access(
  p_token text,
  p_device_id text default null,
  p_device_name text default null,
  p_user_agent text default null,
  p_browser text default null,
  p_operating_system text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token_hash text := public.device_token_hash(p_token);
  v_profile public.profiles%rowtype;
  v_device public.user_devices%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_device_token');
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
      'account_status', 'disabled'
    );
  end if;

  select * into v_device
  from public.user_devices d
  where d.user_id = v_uid and d.token_hash = v_token_hash
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
      'role', v_profile.role
    );
  end if;

  -- Unknown device for this user -> create a PENDING registration. Never
  -- auto-approve. Status can only move to 'approved' through the admin RPC.
  insert into public.user_devices (
    user_id, device_id, token_hash, device_name, user_agent, browser,
    operating_system, status, last_seen_at
  )
  values (
    v_uid,
    coalesce(nullif(btrim(coalesce(p_device_id, '')), ''), gen_random_uuid()::text),
    v_token_hash,
    coalesce(nullif(btrim(coalesce(p_device_name, '')), ''), 'Unknown device'),
    nullif(p_user_agent, ''),
    nullif(p_browser, ''),
    nullif(p_operating_system, ''),
    'pending',
    now()
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
    'role', v_profile.role
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- assert_device_approved — server-side guard used by every protected data RPC
-- -----------------------------------------------------------------------------
create or replace function public.assert_device_approved(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token_hash text := public.device_token_hash(p_token);
  v_profile public.profiles%rowtype;
  v_approved boolean;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'DEVICE_TOKEN_REQUIRED';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.status = 'disabled' then
    raise exception 'ACCOUNT_DISABLED';
  end if;

  select exists (
    select 1 from public.user_devices d
    where d.user_id = v_uid
      and d.token_hash = v_token_hash
      and d.status = 'approved'
  ) into v_approved;

  if not v_approved then
    raise exception 'DEVICE_NOT_APPROVED';
  end if;

  update public.user_devices d
  set last_seen_at = now()
  where d.user_id = v_uid and d.token_hash = v_token_hash and d.status = 'approved';

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Project data RPCs (replaces direct client table access)
-- -----------------------------------------------------------------------------
create or replace function public.app_ensure_organization(v_uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_name text;
begin
  select id into v_org
  from public.organizations
  where owner_id = v_uid
  order by created_at asc
  limit 1;

  if v_org is null then
    select coalesce(nullif(p.email, ''), 'User ' || left(v_uid::text, 8)) into v_name
    from public.profiles p where p.id = v_uid;
    insert into public.organizations (name, owner_id)
    values (v_name || '''s Workshop', v_uid)
    returning id into v_org;
  end if;

  return v_org;
end;
$$;

create or replace function public.app_list_projects(p_token text)
returns table (id uuid, name text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  perform public.assert_device_approved(p_token);
  v_org := public.app_ensure_organization(auth.uid());
  return query
    select d.id, d.name, d.updated_at
    from public.door_projects d
    where d.organization_id = v_org
    order by d.updated_at desc;
end;
$$;

create or replace function public.app_load_project(p_token text, p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_configuration text;
begin
  perform public.assert_device_approved(p_token);
  v_org := public.app_ensure_organization(auth.uid());

  select case
           when jsonb_typeof(d.configuration) = 'object' then d.configuration::text
           else d.configuration #>> '{}'
         end
  into v_configuration
  from public.door_projects d
  where d.id = p_project_id and d.organization_id = v_org;

  if not found then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  return v_configuration;
end;
$$;

create or replace function public.app_save_project(
  p_token text,
  p_name text,
  p_configuration text,
  p_status text default 'draft',
  p_row_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_id uuid;
  v_updated timestamptz;
begin
  perform public.assert_device_approved(p_token);
  v_org := public.app_ensure_organization(auth.uid());

  if p_row_id is not null then
    update public.door_projects d
    set name = p_name,
        configuration = to_jsonb(p_configuration),
        status = coalesce(p_status, 'draft'),
        updated_at = now()
    where d.id = p_row_id and d.organization_id = v_org
    returning d.id, d.updated_at into v_id, v_updated;

    if not found then
      raise exception 'PROJECT_NOT_FOUND';
    end if;
  else
    insert into public.door_projects (organization_id, name, configuration, created_by, status)
    values (v_org, p_name, to_jsonb(p_configuration), auth.uid(), coalesce(p_status, 'draft'))
    returning id, updated_at into v_id, v_updated;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'updated_at', v_updated);
end;
$$;

create or replace function public.app_delete_project(p_token text, p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  perform public.assert_device_approved(p_token);
  v_org := public.app_ensure_organization(auth.uid());

  delete from public.door_projects d
  where d.id = p_project_id and d.organization_id = v_org;

  if not found then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin RPCs — every one re-checks public.is_admin() inside the database
-- -----------------------------------------------------------------------------
create or replace function public.system_admin_exists()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where role = 'admin'
  );
$$;

create or replace function public.admin_list_devices(p_token text)
returns table (
  id uuid,
  user_id uuid,
  email text,
  role text,
  user_status text,
  device_id text,
  device_name text,
  browser text,
  operating_system text,
  user_agent text,
  status text,
  registered_at timestamptz,
  last_seen_at timestamptz,
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
      d.browser,
      d.operating_system,
      d.user_agent,
      d.status,
      d.registered_at,
      d.last_seen_at,
      d.approved_at,
      (select a.email from public.profiles a where a.id = d.approved_by),
      d.rejected_at,
      d.revoked_at
    from public.user_devices d
    join public.profiles p on p.id = d.user_id
    order by (d.status = 'pending') desc, d.registered_at desc;
end;
$$;

create or replace function public.admin_list_users(p_token text)
returns table (
  id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  total_devices bigint,
  approved_devices bigint,
  pending_devices bigint
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
      p.id,
      p.email,
      p.role,
      p.status,
      p.created_at,
      count(d.id)::bigint,
      count(d.id) filter (where d.status = 'approved')::bigint,
      count(d.id) filter (where d.status = 'pending')::bigint
    from public.profiles p
    left join public.user_devices d on d.user_id = p.id
    group by p.id, p.email, p.role, p.status, p.created_at
    order by p.created_at desc;
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

  -- Transitions are executed as conditional UPDATEs so two admins acting
  -- concurrently cannot race (e.g. a reject can never override an approval).
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
        where user_id = v_device.user_id and status = 'approved';
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
      v_action_code := 'DEVICE_REACTIVATED';

    else
      raise exception 'UNKNOWN_ACTION';
  end case;

  insert into public.device_audit_log
    (device_id, user_id, admin_id, action, previous_status, new_status)
  values
    (p_device_id, v_device.user_id, auth.uid(), v_action_code, v_prev_status, v_new_status);

  return jsonb_build_object(
    'ok', true,
    'id', p_device_id,
    'action', v_action_code,
    'previous_status', v_prev_status,
    'status', v_new_status
  );
end;
$$;

create or replace function public.admin_set_user_status(p_token text, p_user_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_status text := lower(btrim(p_status));
  v_action_code text;
begin
  perform public.assert_device_approved(p_token);
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if v_status not in ('active', 'disabled') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_profile.role = 'admin' and v_status = 'disabled' and p_user_id <> auth.uid() then
    -- Keep at least the acting admin able to restore access; disallow disabling
    -- the last active administrator to avoid a permanent lock-out.
    if not exists (
      select 1 from public.profiles
      where role = 'admin' and status = 'active' and id <> p_user_id
    ) then
      raise exception 'LAST_ADMIN_CANNOT_BE_DISABLED';
    end if;
  end if;

  update public.profiles
  set status = v_status, updated_at = now()
  where id = p_user_id;

  v_action_code := case when v_status = 'disabled' then 'USER_DISABLED' else 'USER_ENABLED' end;

  insert into public.device_audit_log
    (device_id, user_id, admin_id, action, previous_status, new_status, details)
  values
    (null, p_user_id, auth.uid(), v_action_code, v_profile.status, v_status,
     jsonb_build_object('target_role', v_profile.role));

  return jsonb_build_object('ok', true, 'id', p_user_id, 'status', v_status);
end;
$$;

create or replace function public.admin_counts(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending bigint; v_approved bigint; v_rejected bigint; v_revoked bigint;
  v_users bigint; v_disabled bigint;
begin
  perform public.assert_device_approved(p_token);
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'approved'),
         count(*) filter (where status = 'rejected'),
         count(*) filter (where status = 'revoked')
  into v_pending, v_approved, v_rejected, v_revoked
  from public.user_devices;

  select count(*), count(*) filter (where status = 'disabled')
  into v_users, v_disabled
  from public.profiles;

  return jsonb_build_object(
    'pending', v_pending,
    'approved', v_approved,
    'rejected', v_rejected,
    'revoked', v_revoked,
    'users', v_users,
    'disabled_users', v_disabled
  );
end;
$$;

create or replace function public.admin_get_settings(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
begin
  perform public.assert_device_approved(p_token);
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select jsonb_object_agg(key, value) into v_result from public.app_settings;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_max_devices(p_token text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text := btrim(coalesce(p_value, ''));
begin
  perform public.assert_device_approved(p_token);
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if v_number !~ '^[0-9]+$' then
    raise exception 'INVALID_VALUE';
  end if;

  insert into public.app_settings (key, value)
  values ('max_approved_devices', v_number)
  on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('ok', true, 'key', 'max_approved_devices', 'value', v_number);
end;
$$;

-- Bootstrap for the very first administrator on a fresh deployment. Only works
-- while the database has no admin yet. Approves the caller's own device so the
-- initial administrator can immediately administer approvals.
create or replace function public.become_first_admin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token_hash text := public.device_token_hash(p_token);
  v_device public.user_devices%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'ADMIN_ALREADY_EXISTS';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'DEVICE_TOKEN_REQUIRED';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    insert into public.profiles (id, email)
    values (v_uid, nullif(auth.jwt() ->> 'email', ''))
    on conflict (id) do nothing;
    select * into v_profile from public.profiles where id = v_uid;
  end if;

  -- Register/refresh the pending device row for this token.
  select * into v_device
  from public.user_devices
  where user_id = v_uid and token_hash = v_token_hash
  order by registered_at desc
  limit 1;

  if not found then
    insert into public.user_devices
      (user_id, device_id, token_hash, device_name, status, last_seen_at)
    values
      (v_uid, gen_random_uuid()::text, v_token_hash,
       coalesce(nullif(btrim(coalesce(v_profile.email, '')), ''), 'Unknown device') || ' administrator device',
       'pending', now())
    on conflict (user_id, device_id) do nothing
    returning * into v_device;
  end if;

  update public.profiles set role = 'admin', status = 'active', updated_at = now() where id = v_uid;

  update public.user_devices
  set status = 'approved', approved_at = now(), approved_by = v_uid, revoked_at = null, rejected_at = null
  where user_id = v_uid and token_hash = v_token_hash;

  insert into public.device_audit_log
    (device_id, user_id, admin_id, action, previous_status, new_status, details)
  values
    (v_device.id, v_uid, v_uid, 'ADMIN_BOOTSTRAP', null, 'admin',
     jsonb_build_object('device_status', 'approved'));

  return jsonb_build_object('ok', true, 'role', 'admin', 'status', 'approved');
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges: only authenticated users may execute the RPC surface.
-- -----------------------------------------------------------------------------
revoke all on function public.is_admin() from public;
revoke all on function public.get_device_access(text, text, text, text, text, text) from public;
revoke all on function public.assert_device_approved(text) from public;
revoke all on function public.app_ensure_organization(uuid) from public;
revoke all on function public.app_list_projects(text) from public;
revoke all on function public.app_load_project(text, uuid) from public;
revoke all on function public.app_save_project(text, text, text, text, uuid) from public;
revoke all on function public.app_delete_project(text, uuid) from public;
revoke all on function public.system_admin_exists() from public;
revoke all on function public.admin_list_devices(text) from public;
revoke all on function public.admin_list_users(text) from public;
revoke all on function public.admin_device_action(text, uuid, text) from public;
revoke all on function public.admin_set_user_status(text, uuid, text) from public;
revoke all on function public.admin_counts(text) from public;
revoke all on function public.admin_get_settings(text) from public;
revoke all on function public.admin_set_max_devices(text, text) from public;
revoke all on function public.become_first_admin(text) from public;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.get_device_access(text, text, text, text, text, text) to authenticated;
grant execute on function public.assert_device_approved(text) to authenticated;
grant execute on function public.app_ensure_organization(uuid) to authenticated;
grant execute on function public.app_list_projects(text) to authenticated;
grant execute on function public.app_load_project(text, uuid) to authenticated;
grant execute on function public.app_save_project(text, text, text, text, uuid) to authenticated;
grant execute on function public.app_delete_project(text, uuid) to authenticated;
grant execute on function public.system_admin_exists() to authenticated;
grant execute on function public.admin_list_devices(text) to authenticated;
grant execute on function public.admin_list_users(text) to authenticated;
grant execute on function public.admin_device_action(text, uuid, text) to authenticated;
grant execute on function public.admin_set_user_status(text, uuid, text) to authenticated;
grant execute on function public.admin_counts(text) to authenticated;
grant execute on function public.admin_get_settings(text) to authenticated;
grant execute on function public.admin_set_max_devices(text, text) to authenticated;
grant execute on function public.become_first_admin(text) to authenticated;
