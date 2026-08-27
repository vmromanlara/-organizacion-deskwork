-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.
begin;
create extension if not exists pgtap with schema extensions;

create function pg_temp.normalize_policy_expression(expression text)
returns text
language plpgsql
immutable
strict
as $$
declare
  normalized text := regexp_replace(btrim(expression), '\s+', '', 'g');
  depth integer := 0;
  position integer;
begin
  if left(normalized, 1) <> '(' or right(normalized, 1) <> ')' then
    return normalized;
  end if;

  for position in 1..length(normalized) loop
    if substr(normalized, position, 1) = '(' then
      depth := depth + 1;
    elsif substr(normalized, position, 1) = ')' then
      depth := depth - 1;
    end if;

    if depth = 0 and position < length(normalized) then
      return normalized;
    end if;
  end loop;

  return substr(normalized, 2, length(normalized) - 2);
end;
$$;

create function pg_temp.policy_expression(
  policy_schema text,
  policy_table text,
  policy_name text,
  use_with_check boolean
)
returns text
language sql
stable
as $$
  select case
    when use_with_check then pg_get_expr(p.polwithcheck, p.polrelid)
    else pg_get_expr(p.polqual, p.polrelid)
  end
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = policy_schema
    and c.relname = policy_table
    and p.polname = policy_name;
$$;

create function pg_temp.policy_exists(
  policy_schema text,
  policy_table text,
  policy_name text
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = policy_schema
      and c.relname = policy_table
      and p.polname = policy_name
  );
$$;

create function pg_temp.policy_qual_is(
  policy_schema text,
  policy_table text,
  policy_name text,
  expected_qual text
)
returns text
language plpgsql
as $$
declare
  actual_qual text;
begin
  if not pg_temp.policy_exists(policy_schema, policy_table, policy_name) then
    return ok(false, format('policy %I.%I %L does not exist', policy_schema, policy_table, policy_name));
  end if;

  actual_qual := pg_temp.policy_expression(policy_schema, policy_table, policy_name, false);
  if actual_qual is null then
    return ok(false, format('policy %I.%I %L has no USING expression', policy_schema, policy_table, policy_name));
  end if;

  return is(
    pg_temp.normalize_policy_expression(actual_qual),
    pg_temp.normalize_policy_expression(expected_qual),
    format('policy %I.%I %L has the expected USING expression', policy_schema, policy_table, policy_name)
  );
end;
$$;

create function pg_temp.policy_with_check_is(
  policy_schema text,
  policy_table text,
  policy_name text,
  expected_with_check text
)
returns text
language plpgsql
as $$
declare
  actual_with_check text;
begin
  if not pg_temp.policy_exists(policy_schema, policy_table, policy_name) then
    return ok(false, format('policy %I.%I %L does not exist', policy_schema, policy_table, policy_name));
  end if;

  actual_with_check := pg_temp.policy_expression(policy_schema, policy_table, policy_name, true);
  if actual_with_check is null and expected_with_check is null then
    return ok(true, format('policy %I.%I %L has no WITH CHECK expression', policy_schema, policy_table, policy_name));
  elsif actual_with_check is null then
    return ok(false, format('policy %I.%I %L has no WITH CHECK expression', policy_schema, policy_table, policy_name));
  elsif expected_with_check is null then
    return ok(false, format('policy %I.%I %L has an unexpected WITH CHECK expression', policy_schema, policy_table, policy_name));
  end if;

  return is(
    pg_temp.normalize_policy_expression(actual_with_check),
    pg_temp.normalize_policy_expression(expected_with_check),
    format('policy %I.%I %L has the expected WITH CHECK expression', policy_schema, policy_table, policy_name)
  );
end;
$$;

do $$
begin
  if pg_temp.normalize_policy_expression(' is_active_member( id ) ') <> 'is_active_member(id)' then
    raise exception 'TEST-002 policy expression whitespace normalization failed';
  end if;

  if pg_temp.policy_exists('public', 'tenants', 'missing TEST-002 policy') then
    raise exception 'TEST-002 missing policy lookup must return false';
  end if;

  if pg_temp.policy_expression('public', 'tenants', 'members read their tenant', true) is not null then
    raise exception 'TEST-002 WITH CHECK NULL must remain distinct from an expression';
  end if;
end;
$$;

select plan(20);

select has_table('public', 'tenants', 'tenants table exists');
select has_table('public', 'memberships', 'memberships table exists');
select has_table('public', 'audit_logs', 'audit table exists');
select policies_are('public', 'tenants', array['members read their tenant'], 'tenant policy is constrained');
select policies_are('public', 'audit_logs', array['members read permitted audit logs'], 'audit policy is constrained');
select col_is_pk('public', 'tenants', 'id', 'tenant primary key exists');
select col_is_pk('public', 'memberships', 'id', 'membership primary key exists');
select has_index('public', 'memberships', 'memberships_user_tenant_active_idx', 'active membership lookup index exists');
select has_index('public', 'audit_logs', 'audit_logs_tenant_created_idx', 'audit tenant index exists');
select has_function('public', 'has_permission', array['uuid', 'text'], 'database permission function exists');
select * from pg_temp.policy_qual_is('public', 'tenants', 'members read their tenant', 'is_active_member( id )');
select * from pg_temp.policy_qual_is('public', 'profiles', 'members read permitted profiles', 'can_read_profile(id)');
select * from pg_temp.policy_qual_is('public', 'profiles', 'members update own profile', 'id = auth.uid()');
select * from pg_temp.policy_with_check_is('public', 'profiles', 'members update own profile', 'id = auth.uid()');
select * from pg_temp.policy_qual_is('public', 'areas', 'members read permitted areas', 'can_read_area(tenant_id, id)');
select * from pg_temp.policy_qual_is('public', 'memberships', 'members read permitted memberships', 'can_read_membership(tenant_id, id)');
select * from pg_temp.policy_qual_is('public', 'teams', 'members read permitted teams', 'can_read_team(tenant_id, id)');
select * from pg_temp.policy_qual_is('public', 'team_memberships', 'members read permitted team memberships', 'can_read_team_membership(tenant_id, team_id, membership_id)');
select * from pg_temp.policy_qual_is('public', 'membership_scope_grants', 'members read permitted scope grants', 'can_read_membership(tenant_id, membership_id)');
select * from pg_temp.policy_qual_is('public', 'audit_logs', 'members read permitted audit logs', 'can_read_audit(tenant_id, actor_user_id)');
select * from finish();
rollback;
