-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(7);

-- ============================================================
-- Fixtures: dos tenants + un ticket en Tenant A
-- ============================================================

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('6a000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'mt-a@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('6b000000-0000-0000-0000-00000000b001', 'authenticated', 'authenticated', 'mt-b@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('6a000000-0000-0000-0000-00000000a001', 'MT Tenant A user'),
  ('6b000000-0000-0000-0000-00000000b001', 'MT Tenant B user');

insert into public.tenants (id, slug, name) values
  ('6a000000-0000-0000-0000-000000000001', 'mt-tenant-a', 'MT Tenant A'),
  ('6b000000-0000-0000-0000-000000000001', 'mt-tenant-b', 'MT Tenant B');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('6a000000-0000-0000-0000-00000000d001', '6a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-00000000a001', 'operator', false, 'active'),
  ('6b000000-0000-0000-0000-00000000d001', '6b000000-0000-0000-0000-000000000001', '6b000000-0000-0000-0000-00000000b001', 'operator', false, 'active');

insert into public.ticket_categories (id, tenant_id, slug, label) values
  ('6a000000-0000-0000-0000-00000000c001', '6a000000-0000-0000-0000-000000000001', 'computador', 'Computador A'),
  ('6b000000-0000-0000-0000-00000000c001', '6b000000-0000-0000-0000-000000000001', 'computador', 'Computador B');

-- Ticket en Tenant A
insert into public.tickets (id, tenant_id, requester_id, category_id, title, description) values
  ('6a000000-0000-0000-0000-00000000e001', '6a000000-0000-0000-0000-000000000001', '6a000000-0000-0000-0000-00000000a001', '6a000000-0000-0000-0000-00000000c001', 'Ticket Tenant A', 'Descripcion valida con suficiente longitud.');

-- ============================================================
-- TEST-MT-01: ticket_comments con tenant_id cross-tenant es RECHAZADO
-- por la FK compuesta (tenant_id, ticket_id) → tickets(tenant_id, id).
-- ============================================================
select throws_ok(
  $$ insert into public.ticket_comments
       (tenant_id, ticket_id, author_id, body)
     values ('6b000000-0000-0000-0000-000000000001',
             '6a000000-0000-0000-0000-00000000e001',
             '6a000000-0000-0000-0000-00000000a001',
             'cross-tenant comment') $$,
  '23503', -- foreign_key_violation (o 23514 si check)
  null,
  'TEST-MT-01: ticket_comments cross-tenant es RECHAZADO por FK compuesta'
);

-- ============================================================
-- TEST-MT-02: ticket_attachments con tenant_id cross-tenant es RECHAZADO.
-- ============================================================
select throws_ok(
  $$ insert into public.ticket_attachments
       (tenant_id, ticket_id, uploaded_by, original_name, mime_type, size_bytes)
     values ('6b000000-0000-0000-0000-000000000001',
             '6a000000-0000-0000-0000-00000000e001',
             '6a000000-0000-0000-0000-00000000a001',
             'foto.png', 'image/png', 1024) $$,
  '23503',
  null,
  'TEST-MT-02: ticket_attachments cross-tenant es RECHAZADO por FK compuesta'
);

-- ============================================================
-- TEST-MT-03: ticket_events con tenant_id cross-tenant es RECHAZADO.
-- ============================================================
select throws_ok(
  $$ insert into public.ticket_events
       (tenant_id, ticket_id, event_type)
     values ('6b000000-0000-0000-0000-000000000001',
             '6a000000-0000-0000-0000-00000000e001',
             'state_changed') $$,
  '23503',
  null,
  'TEST-MT-03: ticket_events cross-tenant es RECHAZADO por FK compuesta'
);

-- ============================================================
-- TEST-MT-04: ticket_assignments con tenant_id cross-tenant es RECHAZADO.
-- ============================================================
select throws_ok(
  $$ insert into public.ticket_assignments
       (tenant_id, ticket_id, assignee_id, assigned_by)
     values ('6b000000-0000-0000-0000-000000000001',
             '6a000000-0000-0000-0000-00000000e001',
             '6a000000-0000-0000-0000-00000000a001',
             '6a000000-0000-0000-0000-00000000a001') $$,
  '23503',
  null,
  'TEST-MT-04: ticket_assignments cross-tenant es RECHAZADO por FK compuesta'
);

-- ============================================================
-- TEST-MT-05: ticket_assignments: unassigned_at < assigned_at es RECHAZADO
-- por el CHECK constraint.
-- ============================================================
select throws_ok(
  $$ insert into public.ticket_assignments
       (tenant_id, ticket_id, assignee_id, assigned_by, assigned_at, unassigned_at)
     values ('6a000000-0000-0000-0000-000000000001',
             '6a000000-0000-0000-0000-00000000e001',
             '6a000000-0000-0000-0000-00000000a001',
             '6a000000-0000-0000-0000-00000000a001',
             '2026-08-27T12:00:00Z'::timestamptz,
             '2026-08-27T11:00:00Z'::timestamptz) $$,
  '23514',
  null,
  'TEST-MT-05: ticket_assignments unassigned_at < assigned_at es RECHAZADO por CHECK'
);

-- ============================================================
-- TEST-MT-06: ticket con category de OTRO tenant es RECHAZADO por la FK
-- compuesta (tenant_id, category_id) → ticket_categories(tenant_id, id).
-- ============================================================
select throws_ok(
  $$ insert into public.tickets (id, tenant_id, requester_id, category_id, title, description)
     values ('6a000000-0000-0000-0000-00000000e099',
             '6a000000-0000-0000-0000-000000000001',
             '6a000000-0000-0000-0000-00000000a001',
             '6b000000-0000-0000-0000-00000000c001',
             'cross tenant', 'descripcion valida con suficiente longitud.') $$,
  '23503',
  null,
  'TEST-MT-06: tickets con category_id de otro tenant es RECHAZADO por FK compuesta'
);

-- ============================================================
-- TEST-MT-07: asignación activa única por ticket es enforced por índice
-- parcial UNIQUE. Una segunda asignación activa sobre el mismo ticket falla.
-- ============================================================
insert into public.ticket_assignments
  (tenant_id, ticket_id, assignee_id, assigned_by)
values
  ('6a000000-0000-0000-0000-000000000001',
   '6a000000-0000-0000-0000-00000000e001',
   '6a000000-0000-0000-0000-00000000a001',
   '6a000000-0000-0000-0000-00000000a001');

select throws_ok(
  $$ insert into public.ticket_assignments
       (tenant_id, ticket_id, assignee_id, assigned_by)
     values ('6a000000-0000-0000-0000-000000000001',
             '6a000000-0000-0000-0000-00000000e001',
             '6a000000-0000-0000-0000-00000000a001',
             '6a000000-0000-0000-0000-00000000a001') $$,
  '23505',
  null,
  'TEST-MT-07: dos asignaciones activas simultáneas sobre el mismo ticket es RECHAZADO por UNIQUE parcial'
);

select * from finish();
rollback;
