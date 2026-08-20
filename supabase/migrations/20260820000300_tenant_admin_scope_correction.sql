-- Foundation correction: tenant administration grants technical permissions only.
-- It never substitutes an explicit authorization scope or functional role.

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

create or replace function public.validate_membership_scope_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role public.functional_role;
  target_is_tenant_admin boolean;
begin
  select functional_role, is_tenant_admin
  into target_role, target_is_tenant_admin
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
  if target_role in ('administrative', 'operator')
     and not (target_is_tenant_admin and new.scope = 'institution') then
    raise exception 'self-scoped roles cannot receive delegated scope grants';
  end if;
  return new;
end;
$$;

comment on function public.has_scope(uuid, public.authorization_scope, uuid, uuid) is
  'Scope is granted explicitly. is_tenant_admin supplies technical permissions, never implicit scope.';
