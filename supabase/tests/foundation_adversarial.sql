-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(11);

-- Fixture setup is privileged. Assertions execute as Tenant A's normal
-- authenticated operator, so row-level security is evaluated by PostgreSQL.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'test-003-a@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'test-003-b@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('30000000-0000-0000-0000-000000000001', 'TEST-003 Tenant A operator'),
  ('30000000-0000-0000-0000-000000000002', 'TEST-003 Tenant B operator');

insert into public.tenants (id, slug, name) values
  ('31000000-0000-0000-0000-000000000001', 'test-003-tenant-a', 'TEST-003 Tenant A'),
  ('32000000-0000-0000-0000-000000000001', 'test-003-tenant-b', 'TEST-003 Tenant B');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('33000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'operator', false, 'active'),
  ('34000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'operator', true, 'active');

insert into public.membership_scope_grants (
  tenant_id, membership_id, scope, area_id, team_id, granted_by_membership_id
) values
  ('32000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'institution', null, null, '34000000-0000-0000-0000-000000000001');

insert into public.audit_logs (
  id, tenant_id, actor_user_id, actor_membership_id, action, resource_type
) values
  ('35000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000001', 'test.audit.event', 'test');

-- Defense in depth: these grants intentionally simulate an accidental future
-- privilege expansion. They are local to this transaction and RLS must still
-- deny all cross-tenant and cross-user operations below.
grant insert on table public.memberships to authenticated;
grant update on table public.audit_logs to authenticated;

select ok(
  has_table_privilege('authenticated', 'public.memberships', 'insert'),
  'TEST-003 setup grants authenticated INSERT on memberships temporarily'
);
select ok(
  has_table_privilege('authenticated', 'public.audit_logs', 'update'),
  'TEST-003 setup grants authenticated UPDATE on audit_logs temporarily'
);
select ok(
  has_table_privilege('authenticated', 'public.tenants', 'select'),
  'authenticated retains normal SELECT on tenants'
);
select ok(
  has_table_privilege('authenticated', 'public.profiles', 'update'),
  'authenticated retains normal UPDATE on profiles'
);
select ok(
  has_table_privilege('authenticated', 'public.membership_scope_grants', 'select'),
  'authenticated retains normal SELECT on membership_scope_grants'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

-- TEST-003-01: an INSERT privilege does not allow Tenant A to create a
-- Tenant A membership for Tenant B's user because no applicable RLS policy
-- permits that write.
select throws_ok(
  $$ insert into public.memberships (id, tenant_id, user_id, functional_role, is_tenant_admin, status)
     values ('33000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'operator', false, 'active') $$,
  '42501',
  null,
  'TEST-003-01: accidental INSERT privilege cannot create a membership for another user'
);

-- TEST-003-02: Tenant A cannot enumerate Tenant B even though authenticated
-- retains the normal SELECT table privilege.
select is(
  (select count(*) from public.tenants where id = '32000000-0000-0000-0000-000000000001'),
  0::bigint,
  'TEST-003-02: Tenant A SELECT on Tenant B returns zero rows'
);

-- TEST-003-03: an UPDATE privilege does not expose or modify Tenant B audit
-- history without an UPDATE policy and a matching RLS-visible row.
select is_empty(
  $$ update public.audit_logs
     set reason = 'cross-tenant-write-attempt'
     where id = '35000000-0000-0000-0000-000000000001'
     returning id $$,
  'TEST-003-03: accidental UPDATE privilege cannot modify Tenant B audit logs'
);

-- TEST-003-04: USING blocks cross-user targeting, while WITH CHECK blocks an
-- otherwise permitted own-row update that would change ownership to user B.
select is_empty(
  $$ update public.profiles
     set display_name = 'cross-user-write-attempt'
     where id = '30000000-0000-0000-0000-000000000002'
     returning id $$,
  'TEST-003-04a: profiles USING prevents Tenant A from modifying user B'
);
select throws_ok(
  $$ update public.profiles
     set id = '30000000-0000-0000-0000-000000000002'
     where id = '30000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'TEST-003-04b: profiles WITH CHECK prevents changing own profile ownership'
);

-- TEST-003-05: Tenant A cannot read Tenant B's scope grant even though
-- authenticated has normal SELECT access to the table.
select is(
  (select count(*) from public.membership_scope_grants where tenant_id = '32000000-0000-0000-0000-000000000001'),
  0::bigint,
  'TEST-003-05: Tenant A SELECT on Tenant B scope grants returns zero rows'
);

reset role;
select * from finish();
rollback;
