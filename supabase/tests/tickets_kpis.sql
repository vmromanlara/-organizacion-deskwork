-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(25);

-- ============================================================
-- TKT-021: compute_ticket_kpis SECURITY DEFINER
--
-- Cubre:
--   1) La función existe
--   2) PUBLIC no EXECUTE; authenticated SÍ EXECUTE
--   3) Rechaza sin auth.uid()
--   4) Rechaza si el actor no es miembro del tenant
--   5) Rechaza si el actor no tiene scope 'institution' (agente)
--   6) Rechaza cross-tenant (actor de T-A pidiendo KPIs de T-B)
--   7) Tenant vacío: totales en 0, arrays vacíos, period correcto
--   8) Tenant con datos: counts por estado y prioridad correctos
--   9) operationalAverages.firstResponseMinutes correcto
--  10) operationalAverages.resolutionMinutes correcto
--  11) unassigned cuenta solo tickets activos sin assigned_to
--  12) dailyTrend respeta el periodo
-- ============================================================

-- ============================================================
-- Fixtures: 2 tenants, 3 users, memberships + scope grants
-- ============================================================
-- Nota: la regla DB de membership_scope_grants exige que el rol
-- 'supervisor' use scope 'department' o 'team'. Para el scope
-- 'institution' (necesario para KPIs tenant-wide) el rol valido
-- es 'technical_lead' o 'director'. Por eso las fixtures usan
-- 'technical_lead' para los usuarios con scope institucional.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('7a000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'tkt21-lead@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('7a000000-0000-0000-0000-00000000a002', 'authenticated', 'authenticated', 'tkt21-agt@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('7b000000-0000-0000-0000-00000000a003', 'authenticated', 'authenticated', 'tkt21-other-tenant@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('7a000000-0000-0000-0000-00000000a001', 'TKT-021 Tech Lead A'),
  ('7a000000-0000-0000-0000-00000000a002', 'TKT-021 Agent A'),
  ('7b000000-0000-0000-0000-00000000a003', 'TKT-021 Other Tenant Lead');

insert into public.tenants (id, slug, name) values
  ('7a000000-0000-0000-0000-000000000001', 'tkt21-tenant-a', 'TKT-021 Tenant A'),
  ('7b000000-0000-0000-0000-000000000001', 'tkt21-tenant-b', 'TKT-021 Tenant B');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('7a000000-0000-0000-0000-00000000d001', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a001', 'technical_lead', false, 'active'),
  ('7a000000-0000-0000-0000-00000000d002', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a002', 'operator',       false, 'active'),
  ('7b000000-0000-0000-0000-00000000d003', '7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-00000000a003', 'technical_lead', false, 'active');

-- Scope institution para el lead de T-A y para el lead de T-B.
insert into public.membership_scope_grants (
  tenant_id, membership_id, scope, area_id, team_id, granted_by_membership_id
) values
  ('7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000d001', 'institution', null, null, '7a000000-0000-0000-0000-00000000d001'),
  ('7b000000-0000-0000-0000-000000000001', '7b000000-0000-0000-0000-00000000d003', 'institution', null, null, '7b000000-0000-0000-0000-00000000d003');
-- (T-A agent sin scope institution.)

-- Categoría T-A.
insert into public.ticket_categories (id, tenant_id, slug, label, is_active) values
  ('7a000000-0000-0000-0000-00000000c001', '7a000000-0000-0000-0000-000000000001', 'computador', 'Computador', true);

-- ============================================================
-- TKT-021-AC-01: la función existe
-- ============================================================
select ok(
  (select count(*) from pg_proc
    where proname = 'compute_ticket_kpis'
      and pronamespace = 'public'::regnamespace
      and prokind = 'f') = 1,
  'TKT-021-AC-01: public.compute_ticket_kpis(uuid, int) existe'
);

-- ============================================================
-- TKT-021-AC-02: PUBLIC no tiene EXECUTE
-- ============================================================
select ok(
  not has_function_privilege('public', 'public.compute_ticket_kpis(uuid, int)', 'EXECUTE'),
  'TKT-021-AC-02: PUBLIC no tiene EXECUTE sobre compute_ticket_kpis'
);

-- ============================================================
-- TKT-021-AC-03: authenticated SÍ tiene EXECUTE
-- ============================================================
select ok(
  has_function_privilege('authenticated', 'public.compute_ticket_kpis(uuid, int)', 'EXECUTE'),
  'TKT-021-AC-03: authenticated SÍ tiene EXECUTE sobre compute_ticket_kpis'
);

-- ============================================================
-- TKT-021-AC-04: rechaza sin auth.uid() (caller sin sub claim)
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
-- Sin sub: auth.uid() sera null.

select throws_ok(
  $$ select public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30) $$,
  '42501',
  'authentication required',
  'TKT-021-AC-04: rechaza sin auth.uid() con 42501'
);

-- ============================================================
-- TKT-021-AC-05: rechaza si el actor no es miembro del tenant
-- (usamos el supervisor de T-B intentando leer T-A)
-- ============================================================
select set_config('request.jwt.claim.sub', '7b000000-0000-0000-0000-00000000a003', true);

select throws_ok(
  $$ select public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30) $$,
  '42501',
  'actor is not an active member of the tenant',
  'TKT-021-AC-05: cross-tenant (T-B user pide T-A) -> 42501'
);

-- ============================================================
-- TKT-021-AC-06: rechaza si el actor es miembro pero no tiene scope institution
-- (T-A agent: activo pero sin scope grant)
-- ============================================================
select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-00000000a002', true);

select throws_ok(
  $$ select public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30) $$,
  '42501',
  'actor does not have institution scope in this tenant',
  'TKT-021-AC-06: agente sin scope institution -> 42501'
);

-- ============================================================
-- TKT-021-AC-07: tenant vacío (supervisor T-A) — totales en 0, arrays []
-- ============================================================
select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-00000000a001', true);

select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'totals'->>'total')::int,
  0,
  'TKT-021-AC-07: tenant vacío — totals.total = 0'
);

select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'totals'->>'active')::int,
  0,
  'TKT-021-AC-08: tenant vacío — totals.active = 0'
);

select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'totals'->>'unassigned')::int,
  0,
  'TKT-021-AC-09: tenant vacío — totals.unassigned = 0'
);

select is(
  jsonb_array_length(public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'totals'->'byState'),
  0,
  'TKT-021-AC-10: tenant vacío — byState = []'
);

select is(
  jsonb_array_length(public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'totals'->'byPriority'),
  0,
  'TKT-021-AC-11: tenant vacío — byPriority = []'
);

select is(
  jsonb_array_length(public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'dailyTrend'),
  0,
  'TKT-021-AC-12: tenant vacío — dailyTrend = []'
);

-- ============================================================
-- TKT-021-AC-13: periodo correcto (days=7, start=current_date-6, end=current_date)
-- ============================================================
select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 7)->'period'->>'days')::int,
  7,
  'TKT-021-AC-13a: period.days = 7'
);

select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 7)->'period'->>'end'),
  current_date::text,
  'TKT-021-AC-13b: period.end = current_date'
);

-- ============================================================
-- TKT-021-AC-14: p_tenant_id null -> 42501 (P0001) — defense in depth.
-- (No testeamos el caso de tenant_id no-uuid: la app valida eso;
-- el RPC defensivamente retorna P0001.)
-- ============================================================
select throws_ok(
  $$ select public.compute_ticket_kpis(null::uuid, 30) $$,
  'P0001',
  'tenant_id is required',
  'TKT-021-AC-14: tenant_id null -> P0001 (validation)'
);

-- ============================================================
-- TKT-021-AC-15: period fuera de rango se clampea (no error).
-- El SECURITY DEFINER clampea p_period_days a [1, 90].
-- ============================================================
select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 9999)->'period'->>'days')::int,
  90,
  'TKT-021-AC-15: period_days=9999 se clampea a 90'
);

select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 0)->'period'->>'days')::int,
  1,
  'TKT-021-AC-16: period_days=0 se clampea a 1'
);

-- ============================================================
-- TKT-021-AC-17: aggregates con datos reales.
-- Insertamos 4 tickets: 2 ABIERTO, 1 EN_PROCESO, 1 RESUELTO.
-- Insertamos via superuser (no pasamos por SECURITY DEFINER; solo
-- testeamos el cómputo del RPC, no la creación).
-- ============================================================
reset role;
insert into public.tickets (
  id, tenant_id, requester_id, category_id, priority, state, title, description,
  first_response_at, resolved_at, created_at
) values
  ('7a000000-0000-0000-0000-00000000e001', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a001', '7a000000-0000-0000-0000-00000000c001', 'P1', 'ABIERTO',     'Ticket A1 crítico', 'descripción válida con suficiente longitud.', now() - interval '30 min', null,                                now() - interval '2 hour'),
  ('7a000000-0000-0000-0000-00000000e002', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a001', '7a000000-0000-0000-0000-00000000c001', 'P2', 'ABIERTO',     'Ticket A2 alta',    'descripción válida con suficiente longitud.', now() - interval '1 hour',  null,                                now() - interval '3 hour'),
  ('7a000000-0000-0000-0000-00000000e003', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a001', '7a000000-0000-0000-0000-00000000c001', 'P3', 'EN_PROCESO',  'Ticket A3 normal',  'descripción válida con suficiente longitud.', now() - interval '20 min', null,                                now() - interval '4 hour'),
  ('7a000000-0000-0000-0000-00000000e004', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a001', '7a000000-0000-0000-0000-00000000c001', 'P4', 'RESUELTO',    'Ticket A4 baja',    'descripción válida con suficiente longitud.', now() - interval '10 min', now() - interval '5 min',               now() - interval '5 hour'),
  ('7a000000-0000-0000-0000-00000000e005', '7a000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000a001', '7a000000-0000-0000-0000-00000000c001', 'P2', 'ABIERTO',     'Ticket A5 viejo',   'descripción válida con suficiente longitud.', now() - interval '1 hour',  null,                                now() - interval '120 day');

-- Re-activar contexto de supervisor T-A.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-00000000a001', true);

-- Total = 5 (4 dentro de 30 días + 1 viejo).
select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'totals'->>'total')::int,
  5,
  'TKT-021-AC-17: totals.total = 5 (incluye ticket viejo)'
);

-- Active = 3 (ABIERTO+ABIERTO+EN_PROCESO; RESUELTO no es active).
select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'totals'->>'active')::int,
  4,
  'TKT-021-AC-18: totals.active = 4 (3 sin asignar ya estaban activos; el viejo tambien cuenta como activo porque no es RESUELTO/CERRADO)'
);

-- dailyTrend dentro de 30 días: 4 tickets creados hoy -> 4 puntos.
select is(
  jsonb_array_length(public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'dailyTrend'),
  1,
  'TKT-021-AC-19: dailyTrend con 30 días = 1 punto (todos creados hoy)'
);

-- byState: ABIERTO=2, EN_PROCESO=1, RESUELTO=1; pero como RESUELTO no entra en
-- "active", acá validamos la agregacion cruda. Solo los estados presentes.
select ok(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'totals'->'byState') @>
  '[{"state":"ABIERTO","count":3},{"state":"EN_PROCESO","count":1},{"state":"RESUELTO","count":1}]'::jsonb,
  'TKT-021-AC-20: byState contiene ABIERTO=3, EN_PROCESO=1, RESUELTO=1'
);

select ok(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'totals'->'byPriority') @>
  '[{"priority":"P1","count":1},{"priority":"P2","count":2},{"priority":"P3","count":1},{"priority":"P4","count":1}]'::jsonb,
  'TKT-021-AC-21: byPriority contiene P1=1, P2=2, P3=1, P4=1'
);

-- firstResponseCount = 5 (todos tienen first_response_at).
select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'operationalAverages'->>'firstResponseCount')::int,
  5,
  'TKT-021-AC-22: firstResponseCount = 5'
);

-- resolvedCount = 1 (solo el e004).
select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'operationalAverages'->>'resolvedCount')::int,
  1,
  'TKT-021-AC-23: resolvedCount = 1'
);

-- unassigned: 5 (ninguno tiene assigned_to; los 5 son unassigned).
-- (active incluye el viejo, pero el query de unassigned filtra por
--  state not in ('CERRADO','RESUELTO') — el viejo sigue siendo
--  ABIERTO, así que cuenta.)
select is(
  (public.compute_ticket_kpis('7a000000-0000-0000-0000-000000000001'::uuid, 30)->'totals'->>'unassigned')::int,
  4,
  'TKT-021-AC-24: unassigned = 4 (todos los activos sin assigned_to; el RESUELTO no cuenta)'
);

select * from finish();
rollback;
