-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(17);

-- ============================================================
-- TKT-009: create_ticket SECURITY DEFINER
-- Validar:
--  1) La función existe
--  2) No es accesible a PUBLIC
--  3) Sí es accesible a authenticated
--  4) Rechaza sin auth.uid() (caller anon)
--  5) Rechaza título < 5 chars
--  6) Rechaza descripción < 10 chars
--  7) Rechaza categoría inexistente en el tenant
--  8) Rechaza categoría inactiva
--  9) Happy path: operador con ticket.create.self crea ticket
-- 10) requester_id es auth.uid() (no impersonation)
-- 11) Priority: TKT-007 stub mappea slug -> priority (computador -> P2)
-- 12) state inicial = ABIERTO
-- 13) ticket_events inserta un row type='created'
-- 14) ticket_events.metadata tiene category_slug + priority_source
-- 15) audit_logs tiene el evento ticket.created
-- ============================================================

-- ============================================================
-- Fixtures mínimos
-- ============================================================
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('9a000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'tkt9-agt@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('9a000000-0000-0000-0000-00000000a002', 'authenticated', 'authenticated', 'tkt9-other@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('9a000000-0000-0000-0000-00000000a001', 'TKT-009 Agent'),
  ('9a000000-0000-0000-0000-00000000a002', 'TKT-009 Other Tenant User');

insert into public.tenants (id, slug, name) values
  ('9a000000-0000-0000-0000-000000000001', 'tkt9-tenant-a', 'TKT-009 Tenant A'),
  ('9b000000-0000-0000-0000-000000000001', 'tkt9-tenant-b', 'TKT-009 Tenant B');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('9a000000-0000-0000-0000-00000000d001', '9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000a001', 'operator', false, 'active'),
  ('9b000000-0000-0000-0000-00000000d001', '9b000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000a002', 'operator', false, 'active');

-- Categorías: una activa y otra inactiva
insert into public.ticket_categories (id, tenant_id, slug, label, is_active) values
  ('9a000000-0000-0000-0000-00000000c001', '9a000000-0000-0000-0000-000000000001', 'computador', 'Computador', true),
  ('9a000000-0000-0000-0000-00000000c002', '9a000000-0000-0000-0000-000000000001', 'correo', 'Correo', false);

-- ============================================================
-- TKT-009-AC-01: la función existe
-- ============================================================
select ok(
  (select count(*) from pg_proc
    where proname = 'create_ticket'
      and pronamespace = 'public'::regnamespace) = 1,
  'TKT-009-AC-01: public.create_ticket() existe'
);

-- ============================================================
-- TKT-009-AC-02: PUBLIC no tiene EXECUTE
-- ============================================================
select ok(
  not has_function_privilege(
    'public', 'public.create_ticket(uuid, uuid, text, text, uuid, uuid)', 'EXECUTE'
  ),
  'TKT-009-AC-02: PUBLIC no tiene EXECUTE sobre create_ticket'
);

-- ============================================================
-- TKT-009-AC-03: authenticated SÍ tiene EXECUTE
-- ============================================================
select ok(
  has_function_privilege(
    'authenticated', 'public.create_ticket(uuid, uuid, text, text, uuid, uuid)', 'EXECUTE'
  ),
  'TKT-009-AC-03: authenticated tiene EXECUTE sobre create_ticket'
);

-- ============================================================
-- TKT-009-ERR-01: caller sin auth.uid() -> 42501
-- ============================================================
-- Estamos como superuser (postgres) sin set local role authenticated,
-- por lo que auth.uid() es NULL. La función debe rechazar.
select throws_ok(
  $$ select public.create_ticket(
       '9a000000-0000-0000-0000-000000000001'::uuid,
       '9a000000-0000-0000-0000-00000000c001'::uuid,
       'Titulo valido para test',
       'Descripcion valida con suficiente longitud.',
       null,
       null
     ) $$,
  '42501',
  null,
  'TKT-009-ERR-01: caller sin auth.uid() -> 42501 (authentication required)'
);

-- ============================================================
-- TKT-009-ERR-02: title < 5 chars -> P0001
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-00000000a001', true);

select throws_ok(
  $$ select public.create_ticket(
       '9a000000-0000-0000-0000-000000000001'::uuid,
       '9a000000-0000-0000-0000-00000000c001'::uuid,
       'cuer',
       'Descripcion valida con suficiente longitud.',
       null,
       null
     ) $$,
  'P0001',
  null,
  'TKT-009-ERR-02: title < 5 chars -> P0001'
);

-- ============================================================
-- TKT-009-ERR-03: description < 10 chars -> P0001
-- ============================================================
select throws_ok(
  $$ select public.create_ticket(
       '9a000000-0000-0000-0000-000000000001'::uuid,
       '9a000000-0000-0000-0000-00000000c001'::uuid,
       'Titulo valido para test',
       'corto',
       null,
       null
     ) $$,
  'P0001',
  null,
  'TKT-009-ERR-03: description < 10 chars -> P0001'
);

-- ============================================================
-- TKT-009-ERR-04: categoría no existe en el tenant -> P0001
-- ============================================================
select throws_ok(
  $$ select public.create_ticket(
       '9a000000-0000-0000-0000-000000000001'::uuid,
       '99999999-9999-9999-9999-999999999999'::uuid,
       'Titulo valido para test',
       'Descripcion valida con suficiente longitud.',
       null,
       null
     ) $$,
  'P0001',
  null,
  'TKT-009-ERR-04: category_id inexistente en el tenant -> P0001'
);

-- ============================================================
-- TKT-009-ERR-05: categoría inactiva -> P0001
-- ============================================================
select throws_ok(
  $$ select public.create_ticket(
       '9a000000-0000-0000-0000-000000000001'::uuid,
       '9a000000-0000-0000-0000-00000000c002'::uuid,
       'Titulo valido para test',
       'Descripcion valida con suficiente longitud.',
       null,
       null
     ) $$,
  'P0001',
  null,
  'TKT-009-ERR-05: category is_active=false -> P0001'
);

-- ============================================================
-- TKT-009-ERR-06: actor de OTRO tenant -> 42501
-- ============================================================
-- El actor (9a...a002) tiene membresía sólo en tenant B.
-- Si intenta crear en tenant A, is_active_member falla.
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-00000000a002', true);
select throws_ok(
  $$ select public.create_ticket(
       '9a000000-0000-0000-0000-000000000001'::uuid,
       '9a000000-0000-0000-0000-00000000c001'::uuid,
       'Titulo valido para test',
       'Descripcion valida con suficiente longitud.',
       null,
       null
     ) $$,
  '42501',
  null,
  'TKT-009-ERR-06: actor de otro tenant -> 42501 (not an active member)'
);

-- ============================================================
-- TKT-009-OK-01: happy path — operador con ticket.create.self crea ticket
-- Volvemos al actor del tenant A (operator)
-- ============================================================
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-00000000a001', true);

select lives_ok(
  $$ select public.create_ticket(
       '9a000000-0000-0000-0000-000000000001'::uuid,
       '9a000000-0000-0000-0000-00000000c001'::uuid,
       'No puedo acceder a la carpeta compartida',
       'El acceso fue solicitado para el cierre mensual y aparece denegado.',
       null,
       null
     ) $$,
  'TKT-009-OK-01: operador con ticket.create.self crea ticket (happy path)'
);

-- ============================================================
-- TKT-009-OK-02: requester_id = auth.uid() (no impersonation)
-- ============================================================
select is(
  (select requester_id from public.tickets
     where title = 'No puedo acceder a la carpeta compartida'
       and tenant_id = '9a000000-0000-0000-0000-000000000001'),
  '9a000000-0000-0000-0000-00000000a001'::uuid,
  'TKT-009-OK-02: requester_id = auth.uid() (no impersonation)'
);

-- ============================================================
-- TKT-009-OK-03: priority = TKT-007 stub (computador -> P2)
-- ============================================================
select is(
  (select priority from public.tickets
     where title = 'No puedo acceder a la carpeta compartida'
       and tenant_id = '9a000000-0000-0000-0000-000000000001'),
  'P2'::public.ticket_priority,
  'TKT-009-OK-03: priority stub mappea computador -> P2'
);

-- ============================================================
-- TKT-009-OK-04: state inicial = ABIERTO
-- ============================================================
select is(
  (select state from public.tickets
     where title = 'No puedo acceder a la carpeta compartida'
       and tenant_id = '9a000000-0000-0000-0000-000000000001'),
  'ABIERTO'::public.ticket_state,
  'TKT-009-OK-04: state inicial = ABIERTO'
);

-- ============================================================
-- TKT-009-OK-05: ticket_events inserta un row con type='created'
-- ============================================================
select ok(
  (select count(*) = 1 from public.ticket_events te
     join public.tickets t on t.id = te.ticket_id
    where t.title = 'No puedo acceder a la carpeta compartida'
      and t.tenant_id = '9a000000-0000-0000-0000-000000000001'
      and te.event_type = 'created') is true,
  'TKT-009-OK-05: ticket_events tiene exactamente 1 row con event_type=created'
);

-- ============================================================
-- TKT-009-OK-06: ticket_events.metadata tiene category_slug + priority_source
-- ============================================================
select ok(
  (select te.metadata->>'category_slug' = 'computador'
     from public.ticket_events te
     join public.tickets t on t.id = te.ticket_id
    where t.title = 'No puedo acceder a la carpeta compartida'
      and t.tenant_id = '9a000000-0000-0000-0000-000000000001'
      and te.event_type = 'created'
    limit 1) is true,
  'TKT-009-OK-06a: metadata.category_slug = computador'
);

select ok(
  (select te.metadata->>'priority_source' = 'tkt007_stub'
     from public.ticket_events te
     join public.tickets t on t.id = te.ticket_id
    where t.title = 'No puedo acceder a la carpeta compartida'
      and t.tenant_id = '9a000000-0000-0000-0000-000000000001'
      and te.event_type = 'created'
    limit 1) is true,
  'TKT-009-OK-06b: metadata.priority_source = tkt007_stub (marcado para reemplazo)'
);

-- ============================================================
-- TKT-009-OK-07: audit_logs tiene el evento ticket.created
-- ============================================================
select ok(
  (select count(*) >= 1 from public.audit_logs
    where resource_type = 'ticket'
      and action = 'ticket.created'
      and tenant_id = '9a000000-0000-0000-0000-000000000001') is true,
  'TKT-009-OK-07: audit_logs tiene el evento ticket.created'
);

reset role;
select * from finish();
rollback;
