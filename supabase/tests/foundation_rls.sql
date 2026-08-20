begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

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
select * from finish();
rollback;
