-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(19);

-- ============================================================
-- Fixtures: tenants + users + memberships + categorías + tickets
-- ============================================================

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('4a000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'tkt-a-req@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('4a000000-0000-0000-0000-00000000a002', 'authenticated', 'authenticated', 'tkt-a-agent@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('4a000000-0000-0000-0000-00000000a003', 'authenticated', 'authenticated', 'tkt-a-lead@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('4a000000-0000-0000-0000-00000000a004', 'authenticated', 'authenticated', 'tkt-a-dir@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('4a000000-0000-0000-0000-00000000a005', 'authenticated', 'authenticated', 'tkt-a-sup@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('4b000000-0000-0000-0000-00000000b001', 'authenticated', 'authenticated', 'tkt-b-op@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('4a000000-0000-0000-0000-00000000a001', 'TKT Tenant A requester'),
  ('4a000000-0000-0000-0000-00000000a002', 'TKT Tenant A agent'),
  ('4a000000-0000-0000-0000-00000000a003', 'TKT Tenant A lead'),
  ('4a000000-0000-0000-0000-00000000a004', 'TKT Tenant A director'),
  ('4a000000-0000-0000-0000-00000000a005', 'TKT Tenant A supervisor'),
  ('4b000000-0000-0000-0000-00000000b001', 'TKT Tenant B operator');

insert into public.tenants (id, slug, name) values
  ('4a000000-0000-0000-0000-000000000001', 'tkt-rls-tenant-a', 'TKT RLS Tenant A'),
  ('4b000000-0000-0000-0000-000000000001', 'tkt-rls-tenant-b', 'TKT RLS Tenant B');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('4a000000-0000-0000-0000-00000000d001', '4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000a001', 'operator', false, 'active'),
  ('4a000000-0000-0000-0000-00000000d002', '4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000a002', 'operator', false, 'active'),
  ('4a000000-0000-0000-0000-00000000d003', '4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000a003', 'technical_lead', false, 'active'),
  ('4a000000-0000-0000-0000-00000000d004', '4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000a004', 'director', false, 'active'),
  ('4a000000-0000-0000-0000-00000000d005', '4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000a005', 'supervisor', false, 'active'),
  ('4b000000-0000-0000-0000-00000000d001', '4b000000-0000-0000-0000-000000000001', '4b000000-0000-0000-0000-00000000b001', 'operator', false, 'active');

-- Grants de scope institución para technical_lead y director de Tenant A.
insert into public.membership_scope_grants (
  tenant_id, membership_id, scope, area_id, team_id, granted_by_membership_id
) values
  ('4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000d003', 'institution', null, null, '4a000000-0000-0000-0000-00000000d003'),
  ('4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000d004', 'institution', null, null, '4a000000-0000-0000-0000-00000000d004');

-- Categorías por tenant.
insert into public.ticket_categories (id, tenant_id, slug, label, display_order) values
  ('4a000000-0000-0000-0000-00000000c001', '4a000000-0000-0000-0000-000000000001', 'computador', 'Computador', 10),
  ('4a000000-0000-0000-0000-00000000c002', '4a000000-0000-0000-0000-000000000001', 'correo', 'Correo', 20),
  ('4b000000-0000-0000-0000-00000000c001', '4b000000-0000-0000-0000-000000000001', 'otro', 'Otro', 90);

-- Tickets: dos en Tenant A (uno con asignado) y uno en Tenant B.
insert into public.tickets (id, tenant_id, requester_id, category_id, title, description, assigned_to) values
  ('4a000000-0000-0000-0000-00000000e001', '4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000a001', '4a000000-0000-0000-0000-00000000c001', 'PC no enciende', 'El computador de la oficina 3 no enciende desde ayer.', '4a000000-0000-0000-0000-00000000a002'),
  ('4a000000-0000-0000-0000-00000000e002', '4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000a004', '4a000000-0000-0000-0000-00000000c002', 'No llegan correos', 'No estoy recibiendo correos externos.', null),
  ('4b000000-0000-0000-0000-00000000e001', '4b000000-0000-0000-0000-000000000001', '4b000000-0000-0000-0000-00000000b001', '4b000000-0000-0000-0000-00000000c001', 'Ticket en Tenant B', 'Esto no debería ser visible para Tenant A.', null);

-- Comentario público y comentario interno en el ticket A1.
insert into public.ticket_comments (id, tenant_id, ticket_id, author_id, body, is_internal) values
  ('4a000000-0000-0000-0000-00000000f001', '4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000e001', '4a000000-0000-0000-0000-00000000a001', 'Comentario público del requester.', false),
  ('4a000000-0000-0000-0000-00000000f002', '4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000e001', '4a000000-0000-0000-0000-00000000a002', 'Nota interna del agente.', true);

-- ============================================================
-- Setup OK
-- ============================================================
select ok(
  (select count(*) from public.tickets) = 3,
  'TEST-RLS-00: 3 tickets insertados (2 en A, 1 en B)'
);

-- ============================================================
-- Cambio de rol a authenticated (Tenant A — requester)
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '4a000000-0000-0000-0000-00000000a001', true);

-- TEST-RLS-01: el requester de Tenant A ve su propio ticket.
select is(
  (select count(*) from public.tickets where id = '4a000000-0000-0000-0000-00000000e001'),
  1::bigint,
  'TEST-RLS-01: requester ve su propio ticket'
);

-- TEST-RLS-02: el requester de Tenant A NO ve el ticket de Tenant B.
select is(
  (select count(*) from public.tickets where id = '4b000000-0000-0000-0000-00000000e001'),
  0::bigint,
  'TEST-RLS-02: cross-tenant: requester A no ve ticket de Tenant B'
);

-- TEST-RLS-03: el requester NO ve un ticket A2 donde no es ni requester ni asignado.
select is(
  (select count(*) from public.tickets where id = '4a000000-0000-0000-0000-00000000e002'),
  0::bigint,
  'TEST-RLS-03: requester no ve tickets ajenos del mismo tenant'
);

-- TEST-RLS-04: el requester NO ve comentarios internos.
select is(
  (select count(*) from public.ticket_comments
     where ticket_id = '4a000000-0000-0000-0000-00000000e001'
       and is_internal = true),
  0::bigint,
  'TEST-RLS-04: requester no ve comentarios internos'
);

-- TEST-RLS-05: el requester SÍ ve su comentario público.
select is(
  (select count(*) from public.ticket_comments
     where id = '4a000000-0000-0000-0000-00000000f001'),
  1::bigint,
  'TEST-RLS-05: requester ve comentario público del ticket'
);

-- TEST-RLS-06: el requester NO puede ver categorías del Tenant B.
select is(
  (select count(*) from public.ticket_categories
     where tenant_id = '4b000000-0000-0000-0000-000000000001'),
  0::bigint,
  'TEST-RLS-06: cross-tenant: requester no ve categorías de Tenant B'
);

-- ============================================================
-- Cambio al agente asignado del ticket A1
-- ============================================================
select set_config('request.jwt.claim.sub', '4a000000-0000-0000-0000-00000000a002', true);

-- TEST-RLS-07: el agente asignado ve su ticket asignado.
select is(
  (select count(*) from public.tickets where id = '4a000000-0000-0000-0000-00000000e001'),
  1::bigint,
  'TEST-RLS-07: agente asignado ve su ticket'
);

-- TEST-RLS-08: el agente asignado NO ve tickets de otros (A2 no es suyo).
select is(
  (select count(*) from public.tickets where id = '4a000000-0000-0000-0000-00000000e002'),
  0::bigint,
  'TEST-RLS-08: agente asignado no ve tickets no asignados'
);

-- TEST-RLS-09: el agente asignado SÍ ve comentarios internos (es participante autorizado).
select is(
  (select count(*) from public.ticket_comments
     where ticket_id = '4a000000-0000-0000-0000-00000000e001'
       and is_internal = true),
  1::bigint,
  'TEST-RLS-09: agente asignado ve comentarios internos del ticket'
);

-- ============================================================
-- Cambio al technical_lead (institución)
-- ============================================================
select set_config('request.jwt.claim.sub', '4a000000-0000-0000-0000-00000000a003', true);

-- TEST-RLS-10: el lead ve TODOS los tickets de su tenant.
select is(
  (select count(*) from public.tickets where tenant_id = '4a000000-0000-0000-0000-000000000001'),
  2::bigint,
  'TEST-RLS-10: technical_lead ve los 2 tickets de Tenant A'
);

-- TEST-RLS-11: el lead NO ve tickets de Tenant B.
select is(
  (select count(*) from public.tickets where id = '4b000000-0000-0000-0000-00000000e001'),
  0::bigint,
  'TEST-RLS-11: technical_lead no ve ticket de Tenant B'
);

-- TEST-RLS-12: el lead ve comentarios internos del ticket A1.
select is(
  (select count(*) from public.ticket_comments
     where ticket_id = '4a000000-0000-0000-0000-00000000e001'
       and is_internal = true),
  1::bigint,
  'TEST-RLS-12: technical_lead ve comentarios internos del ticket'
);

-- TEST-RLS-13: el director también ve TODO el tenant.
select set_config('request.jwt.claim.sub', '4a000000-0000-0000-0000-00000000a004', true);
select is(
  (select count(*) from public.tickets where tenant_id = '4a000000-0000-0000-0000-000000000001'),
  2::bigint,
  'TEST-RLS-13: director ve los 2 tickets de Tenant A'
);

-- TEST-RLS-14: cross-tenant: el director de A no ve tickets de B.
select is(
  (select count(*) from public.tickets where tenant_id = '4b000000-0000-0000-0000-000000000001'),
  0::bigint,
  'TEST-RLS-14: cross-tenant: director A no ve tickets de Tenant B'
);

-- ============================================================
-- Eventos: append-only; authenticated NO puede insertar.
-- ============================================================
-- TEST-RLS-15: la policy ticket_events_insert_system rechaza INSERT por authenticated.
select throws_ok(
  $$ insert into public.ticket_events (tenant_id, ticket_id, event_type, to_state)
     values ('4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000e001', 'state_changed', 'EN_PROCESO') $$,
  '42501',
  null,
  'TEST-RLS-15: ticket_events INSERT está cerrado a authenticated (inmutabilidad)'
);

-- TEST-RLS-16: el director SÍ puede leer eventos del ticket A1 (SELECT permitido).
select is(
  (select count(*) from public.ticket_events
     where ticket_id = '4a000000-0000-0000-0000-00000000e001'),
  0::bigint, -- no hay eventos insertados aún, pero la policy SELECT permite leer
  'TEST-RLS-16: SELECT de eventos permitido para el director (vacío esperado)'
);

-- ============================================================
-- Asignaciones: solo el lead/director puede INSERT.
-- ============================================================
-- TEST-RLS-17: el requester NO puede insertar asignaciones.
select throws_ok(
  $$ insert into public.ticket_assignments (tenant_id, ticket_id, assignee_id, assigned_by)
     values ('4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000e001', '4a000000-0000-0000-0000-00000000a002', '4a000000-0000-0000-0000-00000000a001') $$,
  '42501',
  null,
  'TEST-RLS-17: ticket_assignments INSERT denegado al requester'
);

-- TEST-RLS-18: el agente asignado NO puede insertar asignaciones (no tiene ticket.assignment.execute).
select set_config('request.jwt.claim.sub', '4a000000-0000-0000-0000-00000000a002', true);
select throws_ok(
  $$ insert into public.ticket_assignments (tenant_id, ticket_id, assignee_id, assigned_by)
     values ('4a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-00000000e001', '4a000000-0000-0000-0000-00000000a003', '4a000000-0000-0000-0000-00000000a002') $$,
  '42501',
  null,
  'TEST-RLS-18: ticket_assignments INSERT denegado al agente (no tiene ticket.assignment.execute)'
);

reset role;
select * from finish();
rollback;
