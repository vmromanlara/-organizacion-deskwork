-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(10);

-- ============================================================
-- TKT-006: apply_ticket_transition SECURITY DEFINER
-- Validar:
--  1) La función existe
--  2) No es accesible a PUBLIC
--  3) Sí es accesible a authenticated
--  4) Rechaza sin auth.uid() (caller anon)
--  5) Transición inválida es rechazada
--  6) Estado terminal es rechazado
--  7) Happy path: agente asignado ejecuta EN_PROCESO
-- ============================================================

-- ============================================================
-- Fixtures mínimos
-- ============================================================
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('7a000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'tkt6-agt@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('7a000000-0000-0000-0000-00000000a002', 'authenticated', 'authenticated', 'tkt6-req@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('7a000000-0000-0000-0000-00000000a003', 'authenticated', 'authenticated', 'tkt6-lead@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('7a000000-0000-0000-0000-00000000a001', 'TKT-006 Agent'),
  ('7a000000-0000-0000-0000-00000000a002', 'TKT-006 Requester'),
  ('7a000000-0000-0000-0000-00000000a003', 'TKT-006 Lead');

insert into public.tenants (id, slug, name) values
  ('7a000000-0000-0000-0000-000000000001', 'tkt6-tenant-a', 'TKT-006 Tenant A');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('7a000000-0000-0000-0000-00000000d001', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a001', 'operator', false, 'active'),
  ('7a000000-0000-0000-0000-00000000d002', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a002', 'operator', false, 'active'),
  ('7a000000-0000-0000-0000-00000000d003', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a003', 'technical_lead', false, 'active');

-- Grant institución para el lead.
insert into public.membership_scope_grants (
  tenant_id, membership_id, scope, granted_by_membership_id
) values
  ('7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000d003', 'institution', '7a000000-0000-0000-0000-00000000d003');

insert into public.ticket_categories (id, tenant_id, slug, label) values
  ('7a000000-0000-0000-0000-00000000c001', '7a000000-0000-0000-0000-000000000001', 'computador', 'Computador');

-- Tres tickets:
--   t1: agente asignado, en ABIERTO (debe poder transicionar a EN_PROCESO)
--   t2: requester, en ABIERTO (no asignado, transición a RESUELTO es FSM inválida)
--   t3: en CERRADO (terminal)
insert into public.tickets (id, tenant_id, requester_id, category_id, title, description, assigned_to, state) values
  ('7a000000-0000-0000-0000-00000000e001', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a002', '7a000000-0000-0000-0000-00000000c001', 'TKT-006 ticket asignado', 'Descripcion valida con suficiente longitud.', '7a000000-0000-0000-0000-00000000a001', 'ABIERTO'),
  ('7a000000-0000-0000-0000-00000000e002', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a002', '7a000000-0000-0000-0000-00000000c001', 'TKT-006 ticket sin asignar', 'Descripcion valida con suficiente longitud.', null, 'ABIERTO'),
  ('7a000000-0000-0000-0000-00000000e003', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a002', '7a000000-0000-0000-0000-00000000c001', 'TKT-006 ticket cerrado', 'Descripcion valida con suficiente longitud.', '7a000000-0000-0000-0000-00000000a001', 'CERRADO');

-- ============================================================
-- TKT-006-AC-01: la función existe
-- ============================================================
select ok(
  (select count(*) from pg_proc
    where proname = 'apply_ticket_transition'
      and pronamespace = 'public'::regnamespace) = 1,
  'TKT-006-AC-01: public.apply_ticket_transition() existe'
);

-- ============================================================
-- TKT-006-AC-02: PUBLIC no tiene EXECUTE
-- ============================================================
select ok(
  not has_function_privilege(
    'public', 'public.apply_ticket_transition(uuid, public.ticket_state, text)', 'EXECUTE'
  ),
  'TKT-006-AC-02: PUBLIC no tiene EXECUTE sobre apply_ticket_transition'
);

-- ============================================================
-- TKT-006-AC-03: authenticated SÍ tiene EXECUTE
-- ============================================================
select ok(
  has_function_privilege(
    'authenticated', 'public.apply_ticket_transition(uuid, public.ticket_state, text)', 'EXECUTE'
  ),
  'TKT-006-AC-03: authenticated tiene EXECUTE sobre apply_ticket_transition'
);

-- ============================================================
-- TKT-006-ERR-01: ticket_id inexistente -> not found
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-00000000a001', true);

select throws_ok(
  $$ select public.apply_ticket_transition(
       '99999999-9999-9999-9999-999999999999'::uuid,
       'EN_PROCESO'::public.ticket_state,
       'test'
     ) $$,
  'P0002',
  null,
  'TKT-006-ERR-01: ticket_id inexistente -> P0002 (ticket not found)'
);

-- ============================================================
-- TKT-006-ERR-02: estado terminal (CERRADO) -> conflict
-- ============================================================
select throws_ok(
  $$ select public.apply_ticket_transition(
       '7a000000-0000-0000-0000-00000000e003'::uuid,
       'EN_PROCESO'::public.ticket_state,
       'test'
     ) $$,
  'P0001',
  null,
  'TKT-006-ERR-02: ticket CERRADO -> P0001 (estado terminal)'
);

-- ============================================================
-- TKT-006-ERR-03: ticket sin asignar (request no es asignado) -> forbidden
-- El actor es el agente (membership) pero no es el assigned_to, y no
-- tiene scope institución. FSM permite EN_PROCESO solo si assigned o
-- scope institución, así que la SECURITY DEFINER rechaza.
-- ============================================================
select throws_ok(
  $$ select public.apply_ticket_transition(
       '7a000000-0000-0000-0000-00000000e002'::uuid,
       'EN_PROCESO'::public.ticket_state,
       'test'
     ) $$,
  '42501',
  null,
  'TKT-006-ERR-03: agente no asignado sin scope institución -> 42501 (forbidden)'
);

-- ============================================================
-- TKT-006-OK-01: happy path — agente asignado ejecuta EN_PROCESO
--   - el ticket t1 está asignado al agente
--   - agente invoca la función
--   - estado cambia a EN_PROCESO
--   - first_response_at queda seteado
--   - se inserta un ticket_event
-- ============================================================
select lives_ok(
  $$ select public.apply_ticket_transition(
       '7a000000-0000-0000-0000-00000000e001'::uuid,
       'EN_PROCESO'::public.ticket_state,
       'smoke test'
     ) $$,
  'TKT-006-OK-01: agente asignado ejecuta EN_PROCESO (happy path)'
);

select is(
  (select state from public.tickets
     where id = '7a000000-0000-0000-0000-00000000e001'),
  'EN_PROCESO'::public.ticket_state,
  'TKT-006-OK-01: estado del ticket cambió a EN_PROCESO'
);

select ok(
  (select first_response_at is not null from public.tickets
     where id = '7a000000-0000-0000-0000-00000000e001'),
  'TKT-006-OK-01: first_response_at fue seteado al transicionar'
);

select ok(
  (select count(*) from public.ticket_events
     where ticket_id = '7a000000-0000-0000-0000-00000000e001'
       and event_type = 'state_changed'
       and from_state = 'ABIERTO'
       and to_state = 'EN_PROCESO') = 1,
  'TKT-006-OK-01: se insertó exactamente 1 ticket_event state_changed'
);

reset role;
select * from finish();
rollback;
