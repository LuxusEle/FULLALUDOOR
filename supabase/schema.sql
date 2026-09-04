create extension if not exists "pgcrypto";
create table organizations (id uuid primary key default gen_random_uuid(),name text not null,owner_id uuid not null references auth.users(id),created_at timestamptz not null default now());
create table door_projects (id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations(id) on delete cascade,name text not null,configuration jsonb not null,status text not null default 'draft',created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table organizations enable row level security;
alter table door_projects enable row level security;
create policy "owners manage organizations" on organizations using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "owners manage projects" on door_projects using (exists(select 1 from organizations o where o.id=organization_id and o.owner_id=auth.uid())) with check (exists(select 1 from organizations o where o.id=organization_id and o.owner_id=auth.uid()));
