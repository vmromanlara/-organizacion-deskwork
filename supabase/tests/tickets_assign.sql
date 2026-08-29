-- TEST ISOLATION CONTRACT
begin;
select plan(14);

-- ============================================================
-- TKT-012: assign_ticket SECURITY DEFINER
-- ============================================================

-- Fixtures
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('9a000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'tkt12-lead@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('9a000000-0000-0000-0000-00000000a002', 'authenticated', 'authenticated', 'tkt12-agt1@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('9a000000-0000-0000-0000-00000000a003', 'authenticated', 'authenticated', 'tkt12-agt2@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('9a000000-0000-0000-0000-00000000a004', 'authenticated', 'authenticated', 'tkt12-requester@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('9a000000-0000-0000-0000-00000000a005', 'authenticated', 'authenticated', 'tkt12-other@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('9a000000-0000-0000-0000-00000000a001', 'TKT-012 Lead'),
  ('9a000000-0000-0000-0000-00000000a002', 'TKT-012 Agent 1'),
  ('9a000000-0000-0000-0000-00000000a003', 'TKT-012 Agent 2'),
  ('9a000000-0000-0000-0000-00000000a004', 'TKT-012 Requester'),
  ('9a000000-0000-0000-0000-00000000a005', 'TKT-012 Other Tenant User');

insert into public.tenants (id, slug, name) values
  ('9a000000-0000-0000-0000-000000000001', 'tkt12-tenant-a', 'TKT-012 Tenant A'),
  ('9b000000-0000-0000-0000-000000000001', 'tkt12-tenant-b', 'TKT-012 Tenant B');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('9a000000-0000-0000-0000-00000000d001', '9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000a001', 'technical_lead', false, 'active'),
  ('9a000000-0000-0000-0000-00000000d002', '9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000a002', 'operator', false, 'active'),
  ('9a000000-0000-0000-0000-00000000d003', '9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000a003', 'operator', false, 'active'),
  ('9a000000-0000-0000-0000-00000000d004', '9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000a004', 'operator', false, 'active'),
  ('9b000000-0000-0000-0000-00000000d001', '9b000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000a005', 'operator', false, 'active');

insert into public.membership_scope_grants (
  tenant_id, membership_id, scope, granted_by_membership_id
) values
  ('9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000d001', 'institution', '9a000000-0000-0000-0000-00000000d001');

insert into public.ticket_categories (id, tenant_id, slug, label) values
  ('9a000000-0000-0000-0000-00000000c001', '9a000000-0000-0000-0000-000000000001', 'computador', 'Computador');

insert into public.tickets (id, tenant_id, requester_id, category_id, title, description) values
  ('9a000000-0000-0000-0000-00000000e001', '9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000a004', '9a000000-0000-0000-0000-00000000c001', 'TKT-012 ticket sin asignar', 'Descripcion valida con suficiente longitud.');

-- ============================================================
-- TKT-012-AC-01: la función existe
-- ============================================================
select ok(
  (select count(*) from pg_proc
    where proname = 'assign_ticket'
      and pronamespace = 'public'::regnamespace) = 1,
  'TKT-012-AC-01: public.assign_ticket() existe'
);

-- ============================================================
-- TKT-012-AC-02: PUBLIC sin EXECUTE
-- ============================================================
select ok(
  not has_function_privilege(
    'public', 'public.assign_ticket(uuid, uuid)', 'EXECUTE'
  ),
  'TKT-012-AC-02: PUBLIC no tiene EXECUTE sobre assign_ticket'
);

-- ============================================================
-- TKT-012-AC-03: authenticated SÍ tiene EXECUTE
-- ============================================================
select ok(
  has_function_privilege(
    'authenticated', 'public.assign_ticket(uuid, uuid)', 'EXECUTE'
  ),
  'TKT-012-AC-03: authenticated tiene EXECUTE sobre assign_ticket'
);

-- ============================================================
-- TKT-012-ERR-01: ticket_id inexistente -> P0002
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-00000000a001', true);

select throws_ok(
  $$ select public.assign_ticket(
       '99999999-9999-9999-9999-999999999999'::uuid,
       '9a000000-0000-0000-0000-00000000a002'::uuid
     ) $$,
  'P0002',
  null,
  'TKT-012-ERR-01: ticket_id inexistente -> P0002'
);

-- ============================================================
-- TKT-012-ERR-02: actor no es lead (no tiene scope institución)
-- El requester (operator) NO tiene ticket.assignment.execute.
-- can_assign_ticket retorna false -> 42501.
-- ============================================================
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-00000000a004', true);
select throws_ok(
  $$ select public.assign_ticket(
       '9a000000-0000-0000-0000-00000000e001'::uuid,
       '9a000000-0000-0000-0000-00000000a002'::uuid
     ) $$,
  '42501',
  null,
  'TKT-012-ERR-02: actor no autorizado (requester) -> 42501'
);

-- ============================================================
-- TKT-012-ERR-03: actor de OTRO tenant -> 42501
-- ============================================================
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-00000000a005', true);
select throws_ok(
  $$ select public.assign_ticket(
       '9a000000-0000-0000-0000-00000000e001'::uuid,
       '9a000000-0000-0000-0000-00000000a002'::uuid
     ) $$,
  '42501',
  null,
  'TKT-012-ERR-03: actor de OTRO tenant -> 42501'
);

-- ============================================================
-- TKT-012-ERR-04: assignee no es miembro del tenant -> P0001
-- ============================================================
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-00000000a001', true);
select throws_ok(
  $$ select public.assign_ticket(
       '9a000000-0000-0000-0000-00000000e001'::uuid,
       '9a000000-0000-0000-0000-00000000a005'::uuid
     ) $$,
  'P0001',
  null,
  'TKT-012-ERR-04: assignee no es miembro del tenant -> P0001'
);

-- ============================================================
-- TKT-012-OK-01: happy path — lead asigna ticket a agente
-- ============================================================
select lives_ok(
  $$ select public.assign_ticket(
       '9a000000-0000-0000-0000-00000000e001'::uuid,
       '9a000000-0000-0000-0000-00000000a002'::uuid
     ) $$,
  'TKT-012-OK-01: lead asigna ticket a agente 1 (happy path)'
);

select is(
  (select assigned_to from public.tickets
     where id = '9a000000-0000-0000-0000-00000000e001'),
  '9a000000-0000-0000-0000-00000000a002'::uuid,
  'TKT-012-OK-01: tickets.assigned_to actualizado'
);

select is(
  (select count(*) from public.ticket_assignments
     where ticket_id = '9a000000-0000-0000-0000-00000000e001'
       and unassigned_at is null),
  1::bigint,
  'TKT-012-OK-01: 1 asignación activa para el ticket'
);

-- ============================================================
-- TKT-012-OK-02: reasignar cierra la asignación activa previa
-- ============================================================
select lives_ok(
  $$ select public.assign_ticket(
       '9a000000-0000-0000-0000-00000000e001'::uuid,
       '9a000000-0000-0000-0000-00000000a003'::uuid
     ) $$,
  'TKT-012-OK-02: lead reasigna ticket a agente 2'
);

select is(
  (select count(*) from public.ticket_assignments
     where ticket_id = '9a000000-0000-0000-0000-00000000e001'
       and unassigned_at is null),
  1::bigint,
  'TKT-012-OK-02: sigue habiendo exactamente 1 asignación activa'
);

select is(
  (select assignee_id from public.ticket_assignments
     where ticket_id = '9a000000-0000-0000-0000-00000000e001'
       and unassigned_at is null
     limit 1),
  '9a000000-0000-0000-0000-00000000a003'::uuid,
  'TKT-012-OK-02: la asignación activa es al agente 2'
);

-- ============================================================
-- TKT-012-OK-03: ticket_events 'assigned' registrado
-- ============================================================
select is(
  (select count(*) from public.ticket_events
     where ticket_id = '9a000000-0000-0000-0000-00000000e001'
       and event_type = 'assigned'),
  2::bigint,
  'TKT-012-OK-03: 2 ticket_events de tipo assigned (uno por asignación)'
);

reset role;
select * from finish();
rollback;
