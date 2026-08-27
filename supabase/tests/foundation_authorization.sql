-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- SQL grants are enforced before RLS. In particular, TRUNCATE bypasses RLS,
-- so neither browser role may retain it on any application table.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and (has_table_privilege('anon', c.oid, 'truncate') or has_table_privilege('authenticated', c.oid, 'truncate'))),
  0::bigint,
  'anon and authenticated have no TRUNCATE privilege on public tables'
);
select ok(has_table_privilege('authenticated', 'public.profiles', 'update'), 'authenticated retains only the intended profile update path');
select ok(not has_table_privilege('authenticated', 'public.memberships', 'insert'), 'authenticated cannot insert memberships directly');
select ok(not has_table_privilege('authenticated', 'public.memberships', 'update'), 'authenticated cannot update memberships directly');

-- Fixture setup is privileged. Every assertion below executes as authenticated
-- with a distinct Supabase JWT subject, so RLS is exercised rather than bypassed.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin-a@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'supervisor-a@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'member-a@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'member-a-other@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'member-b@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'provision-valid@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'provision-invalid@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'provision-expired@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'provision-reused@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000001', 'Tenant A administrator'),
  ('00000000-0000-0000-0000-000000000002', 'Tenant A supervisor'),
  ('00000000-0000-0000-0000-000000000003', 'Tenant A member'),
  ('00000000-0000-0000-0000-000000000004', 'Tenant A other member'),
  ('00000000-0000-0000-0000-000000000005', 'Tenant B member');

insert into public.tenants (id, slug, name) values
  ('10000000-0000-0000-0000-000000000001', 'tenant-a-authz-test', 'Tenant A authorization test'),
  ('20000000-0000-0000-0000-000000000001', 'tenant-b-authz-test', 'Tenant B authorization test');

insert into public.areas (id, tenant_id, name) values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Department A'),
  ('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Department B'),
  ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Department B');

insert into public.teams (id, tenant_id, name) values
  ('12000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Team A');

insert into public.memberships (id, tenant_id, user_id, functional_role, is_tenant_admin, status, area_id) values
  ('13000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'operator', true, 'active', '11000000-0000-0000-0000-000000000001'),
  ('13000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'supervisor', false, 'active', '11000000-0000-0000-0000-000000000001'),
  ('13000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'operator', false, 'active', '11000000-0000-0000-0000-000000000001'),
  ('13000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'operator', false, 'active', '11000000-0000-0000-0000-000000000002'),
  ('23000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'operator', true, 'active', '21000000-0000-0000-0000-000000000001');

insert into public.team_memberships (tenant_id, team_id, membership_id) values
  ('10000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000004');

insert into public.membership_scope_grants (tenant_id, membership_id, scope, area_id, team_id, granted_by_membership_id) values
  ('10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'institution', null, null, '13000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'department', '11000000-0000-0000-0000-000000000001', null, '13000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'team', null, '12000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000005', 'institution', null, null, '23000000-0000-0000-0000-000000000005');

insert into public.provisioning_tokens (
  token_hash, initial_tenant_name, initial_tenant_slug, initial_functional_role, initial_is_tenant_admin, expires_at, created_at
) values
  (encode(digest('valid-provisioning-token', 'sha256'), 'hex'), 'Provisioned Tenant', 'provisioned-tenant-authz-test', 'technical_lead', false, now() + interval '1 hour', now()),
  (encode(digest('expired-provisioning-token', 'sha256'), 'hex'), 'Expired Tenant', 'expired-tenant-authz-test', 'operator', false, now() - interval '1 hour', now() - interval '2 hours');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- SELF and Tenant A/B isolation as a normal operator.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.tenants where id = '10000000-0000-0000-0000-000000000001'), 1::bigint, 'Tenant A operator reads Tenant A');
select is((select count(*) from public.tenants where id = '20000000-0000-0000-0000-000000000001'), 0::bigint, 'Tenant A operator cannot read Tenant B');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000003'), 1::bigint, 'operator reads own profile');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000004'), 0::bigint, 'operator cannot read peer profile');
select lives_ok($$ update public.profiles set display_name = 'Own profile changed' where id = '00000000-0000-0000-0000-000000000003' $$, 'operator updates own profile');
select is_empty($$ update public.profiles set display_name = 'Unauthorized change' where id = '00000000-0000-0000-0000-000000000004' returning id $$, 'operator cannot update peer profile');
select throws_ok($$ update public.memberships set is_tenant_admin = true where id = '13000000-0000-0000-0000-000000000003' $$, '42501', null, 'operator cannot self-elevate through direct membership update');
select throws_ok($$ select public.grant_membership_scope('10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000003', 'institution', null, null, 'self elevation') $$, '42501', null, 'operator cannot grant own scope');
select throws_ok($$ select public.create_organization_area('20000000-0000-0000-0000-000000000001', 'Cross tenant area', 'attack') $$, '42501', null, 'operator cannot mutate Tenant B through RPC');
select throws_ok($$ delete from public.tenants where id = '20000000-0000-0000-0000-000000000001' $$, '42501', null, 'operator cannot delete Tenant B');

-- Supervisor: department and team grants permit only the declared scope.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.memberships where id = '13000000-0000-0000-0000-000000000003'), 1::bigint, 'supervisor reads member in granted department');
select is((select count(*) from public.memberships where id = '13000000-0000-0000-0000-000000000004'), 1::bigint, 'supervisor reads member in granted team');
select is((select count(*) from public.memberships where id = '23000000-0000-0000-0000-000000000005'), 0::bigint, 'supervisor cannot read other tenant');
select throws_ok($$ update public.memberships set functional_role = 'director' where id = '13000000-0000-0000-0000-000000000003' $$, '42501', null, 'supervisor cannot directly modify member role');

-- Tenant admin: technical permissions plus explicit institution scope, never cross-tenant.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select ok(public.has_permission('10000000-0000-0000-0000-000000000001', 'membership.manage.execute'), 'tenant admin has technical membership permission');
select ok(public.has_scope('10000000-0000-0000-0000-000000000001', 'institution'), 'tenant admin has explicit institution scope');
select ok(not public.has_scope('20000000-0000-0000-0000-000000000001', 'institution'), 'tenant admin does not gain other tenant scope');
select lives_ok($$ select public.create_organization_area('10000000-0000-0000-0000-000000000001', 'Admin managed area', 'functional test') $$, 'tenant admin manages own tenant through RPC');
select throws_ok($$ select public.create_organization_area('20000000-0000-0000-0000-000000000001', 'Cross tenant admin area', 'attack') $$, '42501', null, 'tenant admin cannot manage Tenant B');
select is((select count(*) from public.audit_logs where tenant_id = '10000000-0000-0000-0000-000000000001' and action = 'organization.area.created'), 1::bigint, 'administrative action is audited');

-- Tenant B receives only its own tenant view.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.tenants where id = '20000000-0000-0000-0000-000000000001'), 1::bigint, 'Tenant B member reads Tenant B');
select is((select count(*) from public.tenants where id = '10000000-0000-0000-0000-000000000001'), 0::bigint, 'Tenant B member cannot read Tenant A');

-- Provisioning is one-time and never grants a token caller arbitrary privileges.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
select lives_ok($$ select public.bootstrap_tenant('valid-provisioning-token', 'Provisioned user') $$, 'valid provisioning token is accepted');
select is((select functional_role::text from public.memberships where user_id = '00000000-0000-0000-0000-000000000006'), 'technical_lead', 'provisioned role comes from token');
select is((select is_tenant_admin from public.memberships where user_id = '00000000-0000-0000-0000-000000000006'), false, 'provisioning token does not silently grant tenant admin');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', true);
select throws_ok($$ select public.bootstrap_tenant('invalid-provisioning-token', 'Invalid token user') $$, '42501', null, 'invalid provisioning token is denied');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', true);
select throws_ok($$ select public.bootstrap_tenant('expired-provisioning-token', 'Expired token user') $$, '42501', null, 'expired provisioning token is denied');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000009', true);
select throws_ok($$ select public.bootstrap_tenant('valid-provisioning-token', 'Reused token user') $$, '42501', null, 'consumed provisioning token is denied');

reset role;
select * from finish();
rollback;
