-- DeskWork Phase 3A IAM/RBAC/RLS correction.
-- This migration is intentionally limited to Foundation; it creates no ticket domain.

create type public.functional_role as enum (
  'technical_lead',
  'director',
  'supervisor',
  'administrative',
  'operator'
);

create type public.authorization_scope as enum ('institution', 'department', 'team', 'self');

alter table public.memberships
  add column functional_role public.functional_role not null default 'operator',
  add column is_tenant_admin boolean not null default false;

comment on column public.memberships.role is
  'Legacy Phase 3A role. It is retained for migration safety and must not be used for authorization.';
comment on column public.memberships.functional_role is
  'Explicit DeskWork functional role. Authorization uses this column and scoped grants.';
comment on column public.memberships.is_tenant_admin is
  'Explicit tenant administration capability, independent of functional_role.';

-- Existing legacy values are deliberately not inferred as functional or administrative privileges.
-- A trusted control-plane operator must remediate existing memberships explicitly.

alter table public.audit_logs
  add column actor_membership_id uuid,
  add column result text not null default 'success' check (result in ('success', 'denied', 'failure')),
  add column origin text not null default 'database' check (char_length(origin) between 2 and 80),
  add column correlation_id uuid,
  add column reason text;

alter table public.audit_logs
  add constraint audit_logs_actor_membership_fk
  foreign key (tenant_id, actor_membership_id)
  references public.memberships(tenant_id, id)
  on delete restrict;

create table public.authorization_permissions (
  code text primary key check (code ~ '^[a-z_]+(?:\.[a-z_]+){2,3}$'),
  description text not null check (char_length(description) between 3 and 240),
  created_at timestamptz not null default now()
);

create table public.functional_role_permissions (
  functional_role public.functional_role not null,
  permission_code text not null references public.authorization_permissions(code) on delete cascade,
  primary key (functional_role, permission_code)
);

create table public.tenant_admin_permissions (
  permission_code text primary key references public.authorization_permissions(code) on delete cascade
);

create table public.membership_scope_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  scope public.authorization_scope not null,
  area_id uuid,
  team_id uuid,
  granted_by_membership_id uuid,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, membership_id)
    references public.memberships(tenant_id, id) on delete cascade,
  foreign key (tenant_id, area_id)
    references public.areas(tenant_id, id) on delete cascade,
  foreign key (tenant_id, team_id)
    references public.teams(tenant_id, id) on delete cascade,
  foreign key (tenant_id, granted_by_membership_id)
    references public.memberships(tenant_id, id) on delete restrict,
  check (
    (scope = 'institution' and area_id is null and team_id is null)
    or (scope = 'department' and area_id is not null and team_id is null)
    or (scope = 'team' and team_id is not null and area_id is null)
  )
);

create unique index membership_scope_institution_once_idx
  on public.membership_scope_grants (membership_id)
  where scope = 'institution';
create unique index membership_scope_department_once_idx
  on public.membership_scope_grants (membership_id, area_id)
  where scope = 'department';
create unique index membership_scope_team_once_idx
  on public.membership_scope_grants (membership_id, team_id)
  where scope = 'team';

create index membership_scope_tenant_membership_idx
  on public.membership_scope_grants (tenant_id, membership_id);

create table public.provisioning_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  initial_tenant_name text not null check (char_length(initial_tenant_name) between 2 and 120),
  initial_tenant_slug text not null unique check (initial_tenant_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  initial_timezone text not null default 'America/Santiago',
  initial_functional_role public.functional_role not null default 'operator',
  initial_is_tenant_admin boolean not null default false,
  issued_by_user_id uuid references auth.users(id) on delete set null,
  issued_reason text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create index provisioning_tokens_pending_expiry_idx
  on public.provisioning_tokens (expires_at)
  where consumed_at is null;

insert into public.authorization_permissions (code, description) values
  ('directory.read.self', 'Read the current member minimal directory data.'),
  ('directory.read.scope', 'Read minimal directory data within an assigned scope.'),
  ('directory.read.institution', 'Read minimal directory data across the institution.'),
  ('membership.create.request', 'Request creation of a membership.'),
  ('membership.deactivate.request', 'Request deactivation of a membership.'),
  ('membership.manage.execute', 'Create, update and deactivate memberships.'),
  ('scope.manage.execute', 'Assign or revoke department and team scopes.'),
  ('tenant.manage.execute', 'Manage tenant technical configuration.'),
  ('team.manage.execute', 'Manage teams and team membership.'),
  ('organization.manage.execute', 'Manage organizational areas.'),
  ('tenant_admin.grant.execute', 'Grant or revoke the tenant administrator capability.'),
  ('audit.read.institution', 'Read institutional audit history.'),
  ('report.request.self', 'Request a personal report.'),
  ('report.request.scope', 'Request a scoped report.'),
  ('report.request.institution', 'Request an institutional report.'),
  ('project.create.self', 'Create a personal project request.'),
  ('project.create.scope', 'Create a project within an assigned scope.'),
  ('project.create.institution', 'Create an institutional project.'),
  ('ticket.create.self', 'Create a personal ticket.'),
  ('ticket.create.scope', 'Create a ticket for an assigned scope.'),
  ('ticket.create.institution', 'Create a ticket for the institution.'),
  ('ticket.read.self', 'Read personal tickets.'),
  ('ticket.read.scope', 'Read scoped tickets.'),
  ('ticket.read.institution', 'Read institutional tickets.'),
  ('ticket.status.request', 'Request a ticket status change.'),
  ('ticket.status.execute', 'Execute an authorized ticket status change.')
on conflict (code) do nothing;

insert into public.functional_role_permissions (functional_role, permission_code) values
  ('technical_lead', 'directory.read.institution'),
  ('technical_lead', 'membership.manage.execute'),
  ('technical_lead', 'scope.manage.execute'),
  ('technical_lead', 'team.manage.execute'),
  ('technical_lead', 'organization.manage.execute'),
  ('technical_lead', 'audit.read.institution'),
  ('technical_lead', 'report.request.institution'),
  ('technical_lead', 'project.create.institution'),
  ('technical_lead', 'ticket.create.institution'),
  ('technical_lead', 'ticket.read.institution'),
  ('technical_lead', 'ticket.status.execute'),
  ('director', 'directory.read.institution'),
  ('director', 'membership.create.request'),
  ('director', 'membership.deactivate.request'),
  ('director', 'audit.read.institution'),
  ('director', 'report.request.institution'),
  ('director', 'project.create.institution'),
  ('director', 'ticket.create.institution'),
  ('director', 'ticket.read.institution'),
  ('director', 'ticket.status.execute'),
  ('supervisor', 'directory.read.scope'),
  ('supervisor', 'membership.create.request'),
  ('supervisor', 'membership.deactivate.request'),
  ('supervisor', 'report.request.scope'),
  ('supervisor', 'project.create.scope'),
  ('supervisor', 'ticket.create.scope'),
  ('supervisor', 'ticket.read.scope'),
  ('supervisor', 'ticket.status.request'),
  ('administrative', 'directory.read.self'),
  ('administrative', 'report.request.self'),
  ('administrative', 'project.create.self'),
  ('administrative', 'ticket.create.self'),
  ('administrative', 'ticket.read.self'),
  ('operator', 'directory.read.self'),
  ('operator', 'report.request.self'),
  ('operator', 'project.create.self'),
  ('operator', 'ticket.create.self'),
  ('operator', 'ticket.read.self')
on conflict do nothing;

insert into public.tenant_admin_permissions (permission_code) values
  ('directory.read.institution'),
  ('membership.manage.execute'),
  ('scope.manage.execute'),
  ('tenant.manage.execute'),
  ('team.manage.execute'),
  ('organization.manage.execute'),
  ('tenant_admin.grant.execute'),
  ('audit.read.institution')
on conflict do nothing;

create or replace function public.is_active_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_tenant_admin_capacity(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.is_tenant_admin
  );
$$;

create or replace function public.has_permission(target_tenant_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    left join public.functional_role_permissions frp
      on frp.functional_role = m.functional_role
      and frp.permission_code = required_permission
    left join public.tenant_admin_permissions tap
      on tap.permission_code = required_permission
      and m.is_tenant_admin
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (frp.permission_code is not null or tap.permission_code is not null)
  );
$$;

create or replace function public.has_scope(
  target_tenant_id uuid,
  requested_scope public.authorization_scope,
  requested_area_id uuid default null,
  requested_team_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when requested_scope = 'self' then public.is_active_member(target_tenant_id)
    when public.has_tenant_admin_capacity(target_tenant_id) then true
    when requested_scope = 'institution' then exists (
      select 1
      from public.memberships m
      join public.membership_scope_grants g
        on g.tenant_id = m.tenant_id and g.membership_id = m.id
      where m.tenant_id = target_tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and g.scope = 'institution'
    )
    when requested_scope = 'department' and requested_area_id is not null then exists (
      select 1
      from public.memberships m
      join public.membership_scope_grants g
        on g.tenant_id = m.tenant_id and g.membership_id = m.id
      where m.tenant_id = target_tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and g.scope = 'department'
        and g.area_id = requested_area_id
    )
    when requested_scope = 'team' and requested_team_id is not null then exists (
      select 1
      from public.memberships m
      join public.membership_scope_grants g
        on g.tenant_id = m.tenant_id and g.membership_id = m.id
      where m.tenant_id = target_tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and g.scope = 'team'
        and g.team_id = requested_team_id
    )
    else false
  end;
$$;

create or replace function public.can_read_membership(target_tenant_id uuid, target_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships target
    where target.tenant_id = target_tenant_id
      and target.id = target_membership_id
      and (
        target.user_id = auth.uid()
        or (
          public.has_permission(target_tenant_id, 'directory.read.institution')
          and public.has_scope(target_tenant_id, 'institution')
        )
        or (
          public.has_permission(target_tenant_id, 'directory.read.scope')
          and (
            (target.area_id is not null and public.has_scope(target_tenant_id, 'department', target.area_id))
            or exists (
              select 1
              from public.team_memberships tm
              where tm.tenant_id = target_tenant_id
                and tm.membership_id = target.id
                and public.has_scope(target_tenant_id, 'team', null, tm.team_id)
            )
          )
        )
      )
  );
$$;

create or replace function public.can_read_area(target_tenant_id uuid, target_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_active_member(target_tenant_id) and (
    exists (
      select 1 from public.memberships m
      where m.tenant_id = target_tenant_id and m.user_id = auth.uid() and m.area_id = target_area_id
    )
    or (public.has_permission(target_tenant_id, 'directory.read.institution') and public.has_scope(target_tenant_id, 'institution'))
    or (public.has_permission(target_tenant_id, 'directory.read.scope') and public.has_scope(target_tenant_id, 'department', target_area_id))
  );
$$;

create or replace function public.can_read_team(target_tenant_id uuid, target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_active_member(target_tenant_id) and (
    exists (
      select 1
      from public.memberships m
      join public.team_memberships tm on tm.tenant_id = m.tenant_id and tm.membership_id = m.id
      where m.tenant_id = target_tenant_id and m.user_id = auth.uid() and tm.team_id = target_team_id
    )
    or (public.has_permission(target_tenant_id, 'directory.read.institution') and public.has_scope(target_tenant_id, 'institution'))
    or (public.has_permission(target_tenant_id, 'directory.read.scope') and public.has_scope(target_tenant_id, 'team', null, target_team_id))
  );
$$;

create or replace function public.can_read_team_membership(
  target_tenant_id uuid,
  target_team_id uuid,
  target_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.can_read_team(target_tenant_id, target_team_id)
    and public.can_read_membership(target_tenant_id, target_membership_id);
$$;

create or replace function public.can_read_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_profile_id = auth.uid() or exists (
    select 1
    from public.memberships target
    where target.user_id = target_profile_id
      and public.can_read_membership(target.tenant_id, target.id)
  );
$$;

create or replace function public.can_read_audit(target_tenant_id uuid, target_actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_actor_user_id = auth.uid()
    or (
      public.has_permission(target_tenant_id, 'audit.read.institution')
      and public.has_scope(target_tenant_id, 'institution')
    );
$$;

create or replace function public.validate_membership_scope_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role public.functional_role;
begin
  select functional_role into target_role
  from public.memberships
  where tenant_id = new.tenant_id and id = new.membership_id;

  if target_role is null then
    raise exception 'scope target membership does not exist in tenant';
  end if;

  if target_role in ('technical_lead', 'director') and new.scope <> 'institution' then
    raise exception 'institutional role requires institution scope';
  end if;
  if target_role = 'supervisor' and new.scope not in ('department', 'team') then
    raise exception 'supervisor scope must be department or team';
  end if;
  if target_role in ('administrative', 'operator') then
    raise exception 'self-scoped roles cannot receive delegated scope grants';
  end if;
  return new;
end;
$$;

create trigger membership_scope_grants_validate
before insert or update on public.membership_scope_grants
for each row execute function public.validate_membership_scope_grant();

create or replace function public.write_audit_log(
  target_tenant_id uuid,
  event_action text,
  event_resource_type text,
  event_resource_id uuid default null,
  event_before_data jsonb default null,
  event_after_data jsonb default null,
  event_result text default 'success',
  event_origin text default 'database',
  event_correlation_id uuid default null,
  event_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_membership_id uuid;
begin
  select id into current_membership_id
  from public.memberships
  where tenant_id = target_tenant_id and user_id = auth.uid() and status = 'active';

  insert into public.audit_logs (
    tenant_id, actor_user_id, actor_membership_id, action, resource_type, resource_id,
    before_data, after_data, result, origin, correlation_id, reason
  ) values (
    target_tenant_id, auth.uid(), current_membership_id, event_action, event_resource_type, event_resource_id,
    event_before_data, event_after_data, event_result, event_origin, event_correlation_id, event_reason
  );
end;
$$;

create or replace function public.require_institution_permission(target_tenant_id uuid, required_permission text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(target_tenant_id, required_permission)
     or not public.has_scope(target_tenant_id, 'institution') then
    raise exception 'authorization denied for %', required_permission using errcode = '42501';
  end if;
end;
$$;

create or replace function public.create_organization_area(
  target_tenant_id uuid,
  area_name text,
  audit_reason text default null
)
returns public.areas
language plpgsql
security definer
set search_path = public, auth
as $$
declare created_area public.areas;
begin
  perform public.require_institution_permission(target_tenant_id, 'organization.manage.execute');
  insert into public.areas (tenant_id, name) values (target_tenant_id, area_name)
  returning * into created_area;
  perform public.write_audit_log(target_tenant_id, 'organization.area.created', 'area', created_area.id,
    null, to_jsonb(created_area), 'success', 'rpc', null, audit_reason);
  return created_area;
end;
$$;

create or replace function public.create_tenant_team(
  target_tenant_id uuid,
  team_name text,
  default_team boolean default false,
  audit_reason text default null
)
returns public.teams
language plpgsql
security definer
set search_path = public, auth
as $$
declare created_team public.teams;
begin
  perform public.require_institution_permission(target_tenant_id, 'team.manage.execute');
  insert into public.teams (tenant_id, name, is_default) values (target_tenant_id, team_name, default_team)
  returning * into created_team;
  perform public.write_audit_log(target_tenant_id, 'organization.team.created', 'team', created_team.id,
    null, to_jsonb(created_team), 'success', 'rpc', null, audit_reason);
  return created_team;
end;
$$;

create or replace function public.create_member_membership(
  target_tenant_id uuid,
  target_user_id uuid,
  target_display_name text,
  target_functional_role public.functional_role default 'operator',
  target_area_id uuid default null,
  audit_reason text default null
)
returns public.memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare created_membership public.memberships;
begin
  perform public.require_institution_permission(target_tenant_id, 'membership.manage.execute');
  if target_user_id = auth.uid() then
    raise exception 'self-membership creation is not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'target auth user does not exist';
  end if;
  insert into public.profiles (id, display_name) values (target_user_id, target_display_name)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
  insert into public.memberships (tenant_id, user_id, functional_role, status, area_id)
  values (target_tenant_id, target_user_id, target_functional_role, 'active', target_area_id)
  returning * into created_membership;
  if target_functional_role in ('technical_lead', 'director') then
    insert into public.membership_scope_grants (tenant_id, membership_id, scope, granted_by_membership_id)
    values (target_tenant_id, created_membership.id, 'institution', (
      select id from public.memberships where tenant_id = target_tenant_id and user_id = auth.uid()
    ));
  end if;
  perform public.write_audit_log(target_tenant_id, 'membership.created', 'membership', created_membership.id,
    null, to_jsonb(created_membership), 'success', 'rpc', null, audit_reason);
  return created_membership;
end;
$$;

create or replace function public.set_membership_functional_role(
  target_tenant_id uuid,
  target_membership_id uuid,
  target_functional_role public.functional_role,
  audit_reason text default null
)
returns public.memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare before_membership public.memberships;
declare updated_membership public.memberships;
declare actor_membership_id uuid;
begin
  perform public.require_institution_permission(target_tenant_id, 'membership.manage.execute');
  select * into before_membership from public.memberships where tenant_id = target_tenant_id and id = target_membership_id for update;
  if not found then raise exception 'target membership does not exist'; end if;
  select id into actor_membership_id from public.memberships where tenant_id = target_tenant_id and user_id = auth.uid();
  if target_membership_id = actor_membership_id then
    raise exception 'self-role change is not allowed' using errcode = '42501';
  end if;
  delete from public.membership_scope_grants where tenant_id = target_tenant_id and membership_id = target_membership_id;
  update public.memberships set functional_role = target_functional_role, updated_at = now()
  where tenant_id = target_tenant_id and id = target_membership_id returning * into updated_membership;
  if target_functional_role in ('technical_lead', 'director') then
    insert into public.membership_scope_grants (tenant_id, membership_id, scope, granted_by_membership_id)
    values (target_tenant_id, target_membership_id, 'institution', actor_membership_id);
  end if;
  perform public.write_audit_log(target_tenant_id, 'membership.functional_role.changed', 'membership', target_membership_id,
    to_jsonb(before_membership), to_jsonb(updated_membership), 'success', 'rpc', null, audit_reason);
  return updated_membership;
end;
$$;

create or replace function public.grant_membership_scope(
  target_tenant_id uuid,
  target_membership_id uuid,
  granted_scope public.authorization_scope,
  granted_area_id uuid default null,
  granted_team_id uuid default null,
  audit_reason text default null
)
returns public.membership_scope_grants
language plpgsql
security definer
set search_path = public, auth
as $$
declare created_grant public.membership_scope_grants;
declare actor_membership_id uuid;
begin
  perform public.require_institution_permission(target_tenant_id, 'scope.manage.execute');
  select id into actor_membership_id from public.memberships where tenant_id = target_tenant_id and user_id = auth.uid();
  if target_membership_id = actor_membership_id then
    raise exception 'self-scope change is not allowed' using errcode = '42501';
  end if;
  if granted_scope = 'self' then
    raise exception 'self scope is structural and cannot be granted';
  end if;
  insert into public.membership_scope_grants (
    tenant_id, membership_id, scope, area_id, team_id, granted_by_membership_id
  ) values (
    target_tenant_id, target_membership_id, granted_scope, granted_area_id, granted_team_id, actor_membership_id
  ) returning * into created_grant;
  perform public.write_audit_log(target_tenant_id, 'membership.scope.granted', 'membership_scope_grant', created_grant.id,
    null, to_jsonb(created_grant), 'success', 'rpc', null, audit_reason);
  return created_grant;
end;
$$;

create or replace function public.set_membership_tenant_admin_capacity(
  target_tenant_id uuid,
  target_membership_id uuid,
  enabled boolean,
  audit_reason text default null
)
returns public.memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare before_membership public.memberships;
declare updated_membership public.memberships;
declare actor_membership_id uuid;
begin
  perform public.require_institution_permission(target_tenant_id, 'tenant_admin.grant.execute');
  select * into before_membership from public.memberships where tenant_id = target_tenant_id and id = target_membership_id for update;
  if not found then raise exception 'target membership does not exist'; end if;
  select id into actor_membership_id from public.memberships where tenant_id = target_tenant_id and user_id = auth.uid();
  if target_membership_id = actor_membership_id then
    raise exception 'self-tenant-admin change is not allowed' using errcode = '42501';
  end if;
  update public.memberships set is_tenant_admin = enabled, updated_at = now()
  where tenant_id = target_tenant_id and id = target_membership_id returning * into updated_membership;
  perform public.write_audit_log(target_tenant_id, 'membership.tenant_admin.changed', 'membership', target_membership_id,
    to_jsonb(before_membership), to_jsonb(updated_membership), 'success', 'rpc', null, audit_reason);
  return updated_membership;
end;
$$;

create or replace function public.deactivate_member_membership(
  target_tenant_id uuid,
  target_membership_id uuid,
  audit_reason text default null
)
returns public.memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare before_membership public.memberships;
declare updated_membership public.memberships;
declare actor_membership_id uuid;
begin
  perform public.require_institution_permission(target_tenant_id, 'membership.manage.execute');
  select * into before_membership from public.memberships where tenant_id = target_tenant_id and id = target_membership_id for update;
  if not found then raise exception 'target membership does not exist'; end if;
  select id into actor_membership_id from public.memberships where tenant_id = target_tenant_id and user_id = auth.uid();
  if target_membership_id = actor_membership_id then
    raise exception 'self-deactivation is not allowed' using errcode = '42501';
  end if;
  update public.memberships set status = 'suspended', updated_at = now()
  where tenant_id = target_tenant_id and id = target_membership_id returning * into updated_membership;
  perform public.write_audit_log(target_tenant_id, 'membership.deactivated', 'membership', target_membership_id,
    to_jsonb(before_membership), to_jsonb(updated_membership), 'success', 'rpc', null, audit_reason);
  return updated_membership;
end;
$$;

create or replace function public.assign_member_to_team(
  target_tenant_id uuid,
  target_team_id uuid,
  target_membership_id uuid,
  audit_reason text default null
)
returns public.team_memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare created_team_membership public.team_memberships;
begin
  perform public.require_institution_permission(target_tenant_id, 'team.manage.execute');
  insert into public.team_memberships (tenant_id, team_id, membership_id)
  values (target_tenant_id, target_team_id, target_membership_id)
  returning * into created_team_membership;
  perform public.write_audit_log(target_tenant_id, 'team.membership.assigned', 'team_membership', target_team_id,
    null, to_jsonb(created_team_membership), 'success', 'rpc', null, audit_reason);
  return created_team_membership;
end;
$$;

-- The issuer runs only in a server/control-plane context. The raw token is returned once;
-- only a SHA-256 digest is persisted.
create or replace function public.issue_provisioning_token(
  requested_tenant_name text,
  requested_tenant_slug text,
  requested_timezone text,
  requested_functional_role public.functional_role default 'operator',
  requested_tenant_admin boolean default false,
  requested_expires_at timestamptz default (now() + interval '24 hours'),
  issuer_user_id uuid default null,
  issuer_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare raw_token text;
begin
  if requested_expires_at <= now() then
    raise exception 'provisioning token expiry must be in the future';
  end if;
  raw_token := encode(gen_random_bytes(32), 'hex');
  insert into public.provisioning_tokens (
    token_hash, initial_tenant_name, initial_tenant_slug, initial_timezone,
    initial_functional_role, initial_is_tenant_admin, expires_at, issued_by_user_id, issued_reason
  ) values (
    encode(digest(raw_token, 'sha256'), 'hex'), requested_tenant_name, requested_tenant_slug, requested_timezone,
    requested_functional_role, requested_tenant_admin, requested_expires_at, issuer_user_id, issuer_reason
  );
  return raw_token;
end;
$$;

drop function if exists public.bootstrap_tenant(text, text, text);

create or replace function public.bootstrap_tenant(provisioning_token text, initial_display_name text)
returns public.tenants
language plpgsql
security definer
set search_path = public, auth
as $$
declare provision public.provisioning_tokens;
declare created_tenant public.tenants;
declare created_membership public.memberships;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'user already belongs to a tenant' using errcode = '42501';
  end if;
  select * into provision
  from public.provisioning_tokens
  where token_hash = encode(digest(provisioning_token, 'sha256'), 'hex')
  for update;
  if not found then
    raise exception 'invalid provisioning token' using errcode = '42501';
  end if;
  if provision.consumed_at is not null then
    raise exception 'provisioning token already consumed' using errcode = '42501';
  end if;
  if provision.expires_at <= now() then
    raise exception 'provisioning token expired' using errcode = '42501';
  end if;

  insert into public.profiles (id, display_name) values (auth.uid(), initial_display_name)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
  insert into public.tenants (name, slug, timezone)
  values (provision.initial_tenant_name, provision.initial_tenant_slug, provision.initial_timezone)
  returning * into created_tenant;
  insert into public.memberships (tenant_id, user_id, functional_role, is_tenant_admin, status)
  values (created_tenant.id, auth.uid(), provision.initial_functional_role, provision.initial_is_tenant_admin, 'active')
  returning * into created_membership;
  if provision.initial_functional_role in ('technical_lead', 'director') then
    insert into public.membership_scope_grants (tenant_id, membership_id, scope, granted_by_membership_id)
    values (created_tenant.id, created_membership.id, 'institution', created_membership.id);
  end if;
  insert into public.teams (tenant_id, name, is_default) values (created_tenant.id, 'Soporte TI', true);
  update public.provisioning_tokens
  set consumed_at = now(), consumed_by_user_id = auth.uid()
  where id = provision.id;
  perform public.write_audit_log(created_tenant.id, 'tenant.provisioned', 'tenant', created_tenant.id,
    null,
    jsonb_build_object(
      'provisioning_token_id', provision.id,
      'functional_role', provision.initial_functional_role,
      'tenant_admin_granted', provision.initial_is_tenant_admin
    ),
    'success', 'provisioning_token', provision.id, provision.issued_reason);
  return created_tenant;
end;
$$;

-- Replace broad legacy policies with minimal read policies. Sensitive writes are RPC-only.
drop policy if exists "members can read their tenant" on public.tenants;
drop policy if exists "members can read their own profile" on public.profiles;
drop policy if exists "members can update their own profile" on public.profiles;
drop policy if exists "members can read tenant areas" on public.areas;
drop policy if exists "admins manage tenant areas" on public.areas;
drop policy if exists "members read scoped memberships" on public.memberships;
drop policy if exists "admins manage memberships" on public.memberships;
drop policy if exists "members read tenant teams" on public.teams;
drop policy if exists "admins manage teams" on public.teams;
drop policy if exists "members read team memberships" on public.team_memberships;
drop policy if exists "admins manage team memberships" on public.team_memberships;
drop policy if exists "admins read tenant audit logs" on public.audit_logs;

alter table public.authorization_permissions enable row level security;
alter table public.functional_role_permissions enable row level security;
alter table public.tenant_admin_permissions enable row level security;
alter table public.membership_scope_grants enable row level security;
alter table public.provisioning_tokens enable row level security;

create policy "members read their tenant" on public.tenants
  for select to authenticated using (public.is_active_member(id));
create policy "members read permitted profiles" on public.profiles
  for select to authenticated using (public.can_read_profile(id));
create policy "members update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "members read permitted areas" on public.areas
  for select to authenticated using (public.can_read_area(tenant_id, id));
create policy "members read permitted memberships" on public.memberships
  for select to authenticated using (public.can_read_membership(tenant_id, id));
create policy "members read permitted teams" on public.teams
  for select to authenticated using (public.can_read_team(tenant_id, id));
create policy "members read permitted team memberships" on public.team_memberships
  for select to authenticated using (public.can_read_team_membership(tenant_id, team_id, membership_id));
create policy "members read permitted scope grants" on public.membership_scope_grants
  for select to authenticated using (public.can_read_membership(tenant_id, membership_id));
create policy "members read permitted audit logs" on public.audit_logs
  for select to authenticated using (public.can_read_audit(tenant_id, actor_user_id));

-- Catalogues and provisioning records are not client-readable; database functions are the authority.

revoke all on function public.has_tenant_role(uuid, public.mvp_role[]) from public;
revoke all on function public.can_supervisor_read_membership(uuid, uuid) from public;
revoke all on function public.is_active_member(uuid) from public;
revoke all on function public.has_tenant_admin_capacity(uuid) from public;
revoke all on function public.has_permission(uuid, text) from public;
revoke all on function public.has_scope(uuid, public.authorization_scope, uuid, uuid) from public;
revoke all on function public.can_read_membership(uuid, uuid) from public;
revoke all on function public.can_read_area(uuid, uuid) from public;
revoke all on function public.can_read_team(uuid, uuid) from public;
revoke all on function public.can_read_team_membership(uuid, uuid, uuid) from public;
revoke all on function public.can_read_profile(uuid) from public;
revoke all on function public.can_read_audit(uuid, uuid) from public;
revoke all on function public.validate_membership_scope_grant() from public;
revoke all on function public.write_audit_log(uuid, text, text, uuid, jsonb, jsonb, text, text, uuid, text) from public;
revoke all on function public.require_institution_permission(uuid, text) from public;
revoke all on function public.create_organization_area(uuid, text, text) from public;
revoke all on function public.create_tenant_team(uuid, text, boolean, text) from public;
revoke all on function public.create_member_membership(uuid, uuid, text, public.functional_role, uuid, text) from public;
revoke all on function public.set_membership_functional_role(uuid, uuid, public.functional_role, text) from public;
revoke all on function public.grant_membership_scope(uuid, uuid, public.authorization_scope, uuid, uuid, text) from public;
revoke all on function public.set_membership_tenant_admin_capacity(uuid, uuid, boolean, text) from public;
revoke all on function public.deactivate_member_membership(uuid, uuid, text) from public;
revoke all on function public.assign_member_to_team(uuid, uuid, uuid, text) from public;
revoke all on function public.bootstrap_tenant(text, text) from public;
revoke all on function public.issue_provisioning_token(text, text, text, public.functional_role, boolean, timestamptz, uuid, text) from public, anon, authenticated;

grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.has_tenant_admin_capacity(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.has_scope(uuid, public.authorization_scope, uuid, uuid) to authenticated;
grant execute on function public.can_read_membership(uuid, uuid) to authenticated;
grant execute on function public.can_read_area(uuid, uuid) to authenticated;
grant execute on function public.can_read_team(uuid, uuid) to authenticated;
grant execute on function public.can_read_team_membership(uuid, uuid, uuid) to authenticated;
grant execute on function public.can_read_profile(uuid) to authenticated;
grant execute on function public.can_read_audit(uuid, uuid) to authenticated;
grant execute on function public.create_organization_area(uuid, text, text) to authenticated;
grant execute on function public.create_tenant_team(uuid, text, boolean, text) to authenticated;
grant execute on function public.create_member_membership(uuid, uuid, text, public.functional_role, uuid, text) to authenticated;
grant execute on function public.set_membership_functional_role(uuid, uuid, public.functional_role, text) to authenticated;
grant execute on function public.grant_membership_scope(uuid, uuid, public.authorization_scope, uuid, uuid, text) to authenticated;
grant execute on function public.set_membership_tenant_admin_capacity(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.deactivate_member_membership(uuid, uuid, text) to authenticated;
grant execute on function public.assign_member_to_team(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.bootstrap_tenant(text, text) to authenticated;
grant execute on function public.issue_provisioning_token(text, text, text, public.functional_role, boolean, timestamptz, uuid, text) to service_role;
