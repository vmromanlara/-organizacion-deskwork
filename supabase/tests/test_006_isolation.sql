-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(2);

-- The existing tenants table is used only for this deterministic, local fixture.
-- The savepoint rollback proves that the fixture does not survive its transaction.
savepoint test_006_fixture;
insert into public.tenants (id, slug, name)
values (
  'f0060000-0000-0000-0000-000000000001',
  'test-006-isolation-smoke',
  'TEST-006 isolation smoke fixture'
);

select is(
  (select count(*) from public.tenants where id = 'f0060000-0000-0000-0000-000000000001'),
  1::bigint,
  'deterministic fixture exists inside the transaction'
);

rollback to savepoint test_006_fixture;

select is(
  (select count(*) from public.tenants where id = 'f0060000-0000-0000-0000-000000000001'),
  0::bigint,
  'fixture is absent after rollback to the savepoint'
);

select * from finish();
rollback;
