-- DeskWork Phase 3A foundation. No ticket domain is created in this migration.
create extension if not exists pgcrypto;

create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.mvp_role as enum ('requester', 'agent', 'supervisor', 'tenant_admin');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 120),
  timezone text not null default 'America/Santiago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name),
  unique (tenant_id, id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.mvp_role not null default 'requester',
  status public.membership_status not null default 'invited',
  area_id uuid,
  manager_membership_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, id),
  foreign key (tenant_id, area_id) references public.areas(tenant_id, id),
  foreign key (tenant_id, manager_membership_id) references public.memberships(tenant_id, id),
  check (manager_membership_id is null or manager_membership_id <> id)
);

create index memberships_user_tenant_active_idx on public.memberships (user_id, tenant_id) where status = 'active';
create index memberships_tenant_area_idx on public.memberships (tenant_id, area_id) where status = 'active';
create index memberships_manager_idx on public.memberships (tenant_id, manager_membership_id) where status = 'active';

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name),
  unique (tenant_id, id)
);

create unique index teams_one_default_per_tenant_idx on public.teams (tenant_id) where is_default;

create table public.team_memberships (
  tenant_id uuid not null,
  team_id uuid not null,
  membership_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (team_id, membership_id),
  foreign key (tenant_id, team_id) references public.teams(tenant_id, id) on delete cascade,
  foreign key (tenant_id, membership_id) references public.memberships(tenant_id, id) on delete cascade
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 3 and 120),
  resource_type text not null check (char_length(resource_type) between 3 and 80),
  resource_id uuid,
  request_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_resource_idx on public.audit_logs (tenant_id, resource_type, resource_id, created_at desc);

create or replace function public.is_active_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_tenant_role(target_tenant_id uuid, allowed_roles public.mvp_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.can_supervisor_read_membership(target_tenant_id uuid, target_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with supervisor as (
    select id, area_id from public.memberships
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('supervisor', 'tenant_admin')
  ), target as (
    select id, area_id, manager_membership_id from public.memberships
    where tenant_id = target_tenant_id and id = target_membership_id and status = 'active'
  )
  select exists (
    select 1 from supervisor s cross join target t
    where s.id = t.id
       or s.id = t.manager_membership_id
       or (s.area_id is not null and s.area_id = t.area_id)
       or public.has_tenant_role(target_tenant_id, array['tenant_admin']::public.mvp_role[])
  );
$$;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.areas enable row level security;
alter table public.memberships enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.audit_logs enable row level security;

create policy "members can read their tenant" on public.tenants for select to authenticated using (public.is_active_member(id));
create policy "members can read their own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "members can update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "members can read tenant areas" on public.areas for select to authenticated using (public.is_active_member(tenant_id));
create policy "admins manage tenant areas" on public.areas for all to authenticated using (public.has_tenant_role(tenant_id, array['tenant_admin']::public.mvp_role[])) with check (public.has_tenant_role(tenant_id, array['tenant_admin']::public.mvp_role[]));
create policy "members read scoped memberships" on public.memberships for select to authenticated using (
  user_id = auth.uid() or public.has_tenant_role(tenant_id, array['agent','tenant_admin']::public.mvp_role[]) or public.can_supervisor_read_membership(tenant_id, id)
);
create policy "admins manage memberships" on public.memberships for all to authenticated using (public.has_tenant_role(tenant_id, array['tenant_admin']::public.mvp_role[])) with check (public.has_tenant_role(tenant_id, array['tenant_admin']::public.mvp_role[]));
create policy "members read tenant teams" on public.teams for select to authenticated using (public.is_active_member(tenant_id));
create policy "admins manage teams" on public.teams for all to authenticated using (public.has_tenant_role(tenant_id, array['tenant_admin']::public.mvp_role[])) with check (public.has_tenant_role(tenant_id, array['tenant_admin']::public.mvp_role[]));
create policy "members read team memberships" on public.team_memberships for select to authenticated using (public.is_active_member(tenant_id));
create policy "admins manage team memberships" on public.team_memberships for all to authenticated using (public.has_tenant_role(tenant_id, array['tenant_admin']::public.mvp_role[])) with check (public.has_tenant_role(tenant_id, array['tenant_admin']::public.mvp_role[]));
create policy "admins read tenant audit logs" on public.audit_logs for select to authenticated using (public.has_tenant_role(tenant_id, array['tenant_admin']::public.mvp_role[]));

-- Bootstrap is deliberately a separate, restricted operation. It creates a single active admin membership for its caller.
create or replace function public.bootstrap_tenant(initial_tenant_name text, initial_tenant_slug text, initial_display_name text)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  created_tenant public.tenants;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'user already belongs to a tenant';
  end if;
  insert into public.profiles (id, display_name) values (auth.uid(), initial_display_name)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
  insert into public.tenants (name, slug) values (initial_tenant_name, initial_tenant_slug) returning * into created_tenant;
  insert into public.memberships (tenant_id, user_id, role, status) values (created_tenant.id, auth.uid(), 'tenant_admin', 'active');
  insert into public.teams (tenant_id, name, is_default) values (created_tenant.id, 'Soporte TI', true);
  insert into public.audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, after_data)
  values (created_tenant.id, auth.uid(), 'tenant.bootstrapped', 'tenant', created_tenant.id, jsonb_build_object('slug', created_tenant.slug));
  return created_tenant;
end;
$$;

revoke all on function public.bootstrap_tenant(text, text, text) from public;
grant execute on function public.bootstrap_tenant(text, text, text) to authenticated;
