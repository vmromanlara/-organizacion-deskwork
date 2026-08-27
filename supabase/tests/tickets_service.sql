-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(10);

-- ============================================================
-- TKT-011 — Categories seed: idempotencia de bootstrap_tenant
-- ============================================================

-- Insumos mínimos para invocar bootstrap_tenant en el test.
-- Se crea un auth.users + profile + tenant para que el seed se pueda ejecutar.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('5a000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'tkt-svc-a@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('5a000000-0000-0000-0000-00000000a001', 'TKT Service Tenant A');

-- Seed manual: simulamos el resultado de bootstrap_tenant creando un tenant y
-- sus 9 categorías base (esto es lo que la función hace internamente).
insert into public.tenants (id, slug, name) values
  ('5a000000-0000-0000-0000-000000000001', 'tkt-svc-tenant-a', 'TKT Service Tenant A');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('5a000000-0000-0000-0000-00000000d001', '5a000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-00000000a001', 'technical_lead', false, 'active');

-- Siembra: 9 categorías base.
insert into public.ticket_categories (tenant_id, slug, label, display_order) values
  ('5a000000-0000-0000-0000-000000000001', 'computador', 'Computador', 10),
  ('5a000000-0000-0000-0000-000000000001', 'correo', 'Correo', 20),
  ('5a000000-0000-0000-0000-000000000001', 'internet', 'Internet / Conectividad', 30),
  ('5a000000-0000-0000-0000-000000000001', 'impresora', 'Impresora', 40),
  ('5a000000-0000-0000-0000-000000000001', 'telefonia', 'Telefonía', 50),
  ('5a000000-0000-0000-0000-000000000001', 'accesos', 'Accesos / Permisos', 60),
  ('5a000000-0000-0000-0000-000000000001', 'software', 'Software / Aplicaciones', 70),
  ('5a000000-0000-0000-0000-000000000001', 'cuenta', 'Cuenta / Usuario', 80),
  ('5a000000-0000-0000-0000-000000000001', 'otro', 'Otro', 90);

-- TEST-SVC-01: 9 categorías insertadas con los slugs canónicos.
select is(
  (select count(*) from public.ticket_categories
     where tenant_id = '5a000000-0000-0000-0000-000000000001'),
  9::bigint,
  'TEST-SVC-01: 9 categorías base sembradas para Tenant A'
);

-- TEST-SVC-02: idempotencia: reintentar el seed con ON CONFLICT no crea duplicados.
insert into public.ticket_categories (tenant_id, slug, label, display_order) values
  ('5a000000-0000-0000-0000-000000000001', 'computador', 'Computador', 10),
  ('5a000000-0000-0000-0000-000000000001', 'correo', 'Correo', 20)
on conflict (tenant_id, slug) do nothing;

select is(
  (select count(*) from public.ticket_categories
     where tenant_id = '5a000000-0000-0000-0000-000000000001'),
  9::bigint,
  'TEST-SVC-02: re-seed no crea duplicados (idempotente vía UNIQUE)'
);

-- TEST-SVC-03: slugs canónicos del PROMPT están todos presentes.
select is(
  (select count(*) from public.ticket_categories
     where tenant_id = '5a000000-0000-0000-0000-000000000001'
       and slug in ('computador','correo','internet','impresora','telefonia',
                    'accesos','software','cuenta','otro')),
  9::bigint,
  'TEST-SVC-03: los 9 slugs canónicos del PROMPT maestro están presentes'
);

-- ============================================================
-- TKT-001 / TKT-002 — Tickets: defaults y CHECKs
-- ============================================================

-- TEST-SVC-04: estado default y sla_status default al insertar.
insert into public.tickets (tenant_id, requester_id, category_id, title, description)
values (
  '5a000000-0000-0000-0000-000000000001',
  '5a000000-0000-0000-0000-00000000a001',
  (select id from public.ticket_categories
    where tenant_id = '5a000000-0000-0000-0000-000000000001' and slug = 'computador' limit 1),
  'Ticket mínimo para tests de servicio',
  'Descripción suficientemente larga para pasar el CHECK de longitud.'
);

select is(
  (select state from public.tickets
     where tenant_id = '5a000000-0000-0000-0000-000000000001'
       and title = 'Ticket mínimo para tests de servicio'),
  'ABIERTO'::public.ticket_state,
  'TEST-SVC-04: state default = ABIERTO'
);

select is(
  (select sla_status from public.tickets
     where tenant_id = '5a000000-0000-0000-0000-000000000001'
       and title = 'Ticket mínimo para tests de servicio'),
  'on_track',
  'TEST-SVC-05: sla_status default = on_track (stub hasta TKT-008)'
);

-- TEST-SVC-06: priority default = P3.
select is(
  (select priority from public.tickets
     where tenant_id = '5a000000-0000-0000-0000-000000000001'
       and title = 'Ticket mínimo para tests de servicio'),
  'P3'::public.ticket_priority,
  'TEST-SVC-06: priority default = P3 (placeholder hasta TKT-007)'
);

-- TEST-SVC-07: UNIQUE (tenant_id, slug) en ticket_categories evita colisiones por tenant.
select throws_ok(
  $$ insert into public.ticket_categories (tenant_id, slug, label)
     values ('5a000000-0000-0000-0000-000000000001', 'computador', 'Duplicado') $$,
  '23505',
  null,
  'TEST-SVC-07: UNIQUE (tenant_id, slug) rechaza duplicados'
);

-- ============================================================
-- TKT-011 / F-12 (PO 2026-08-27) — bootstrap_tenant REAL: smoke test
-- del seed de las 9 categorías dentro de la función pública
-- public.bootstrap_tenant(). El test invoca la FUNCIÓN REAL, no su
-- lógica replicada. Esto valida que el bloque TKT-011 dentro de
-- bootstrap_tenant (migration 20260827000710) crea efectivamente las
-- 9 categorías base para cada tenant recién aprovisionado.
--
-- Estrategia: usar SQL directo (no DO blocks) para que los asserts
-- pgTAP se cuenten correctamente. La sesión se cambia a authenticated
-- + JWT simulado para invocar bootstrap_tenant, luego se regresa al
-- rol por defecto para los SELECT de verificación. Para referenciar
-- el tenant recién creado usamos su slug (único por tenant) vía CTE.
-- ============================================================

-- Preparación común: provisionar dos usuarios, dos profiles, dos tokens
-- (uno por tenant). Esto se hace como superuser (rol por defecto) porque
-- requiere INSERT en auth.users y public.provisioning_tokens, tablas
-- con grants restrictivos.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('5b000000-0000-0000-0000-00000000b001', 'authenticated', 'authenticated', 'tkt-svc-bt-a@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('5b000000-0000-0000-0000-00000000c001', 'authenticated', 'authenticated', 'tkt-svc-bt-b@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('5b000000-0000-0000-0000-00000000b001', 'Bootstrap Tenant Test A'),
  ('5b000000-0000-0000-0000-00000000c001', 'Bootstrap Tenant Test B')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.provisioning_tokens (
  id, token_hash, initial_tenant_name, initial_tenant_slug, initial_timezone,
  initial_functional_role, initial_is_tenant_admin, expires_at
) values
  ('5b000000-0000-0000-0000-00000000b010',
   encode(extensions.digest('svc-bootstrap-token-aaa-real-2026', 'sha256'), 'hex'),
   'Bootstrap Test Tenant A', 'bootstrap-test-tenant-a', 'America/Santiago',
   'technical_lead', false, now() + interval '1 hour'),
  ('5b000000-0000-0000-0000-00000000c010',
   encode(extensions.digest('svc-bootstrap-token-bbb-real-2026', 'sha256'), 'hex'),
   'Bootstrap Test Tenant B', 'bootstrap-test-tenant-b', 'America/Santiago',
   'operator', false, now() + interval '1 hour')
on conflict (id) do nothing;

-- ============================================================
-- TEST-SVC-08: bootstrap_tenant() REAL siembra 9 categorías base
-- para el primer tenant recién creado.
-- ============================================================
-- Cambiar a authenticated con JWT simulado (auth.uid() lo necesita).
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub',   '5b000000-0000-0000-0000-00000000b001', true);

-- Invocar la función REAL. La fila resultante se descarta (sólo queremos
-- que el side-effect del seed se ejecute).
select * from public.bootstrap_tenant(
  'svc-bootstrap-token-aaa-real-2026', 'Bootstrap Tenant A'
);

-- Volver a superuser para contar categorías sin filtros RLS.
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Verificar 9 categorías activas para el tenant recién creado.
select is(
  (with t as (select id from public.tenants where slug = 'bootstrap-test-tenant-a')
   select count(*) from public.ticket_categories
    where tenant_id = (select id from t) and is_active = true),
  9::bigint,
  'TEST-SVC-08 (F-12 / TKT-011): bootstrap_tenant() REAL siembra 9 categorías activas para el tenant recién creado'
);

-- ============================================================
-- TEST-SVC-09: SEGUNDA invocación de bootstrap_tenant() crea
-- OTRO tenant con sus 9 categorías independientes. Esto valida
-- que el seed corre en cada bootstrap sin asumir estado global.
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub',   '5b000000-0000-0000-0000-00000000c001', true);

select * from public.bootstrap_tenant(
  'svc-bootstrap-token-bbb-real-2026', 'Bootstrap Tenant B'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

select is(
  (with t as (select id from public.tenants where slug = 'bootstrap-test-tenant-b')
   select count(*) from public.ticket_categories
    where tenant_id = (select id from t) and is_active = true),
  9::bigint,
  'TEST-SVC-09 (F-12 / TKT-011): SEGUNDA invocación de bootstrap_tenant() crea 9 categorías activas para el NUEVO tenant'
);

-- Verificar que los dos tenants creados por bootstrap_tenant() son distintos
-- y tienen seeds completamente independientes.
select is(
  (select count(*) from public.tenants
     where slug in ('bootstrap-test-tenant-a', 'bootstrap-test-tenant-b')),
  2::bigint,
  'TEST-SVC-09: dos invocaciones de bootstrap_tenant() crean dos tenants distintos'
);

select * from finish();
rollback;
