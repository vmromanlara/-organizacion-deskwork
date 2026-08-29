-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(13);

-- ============================================================
-- TKT-013: create_ticket_comment SECURITY DEFINER
-- ============================================================

-- Fixtures
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('8a000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'tkt13-agt@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('8a000000-0000-0000-0000-00000000a002', 'authenticated', 'authenticated', 'tkt13-req@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('8a000000-0000-0000-0000-00000000a003', 'authenticated', 'authenticated', 'tkt13-lead@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('8a000000-0000-0000-0000-00000000a004', 'authenticated', 'authenticated', 'tkt13-other@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('8a000000-0000-0000-0000-00000000a001', 'TKT-013 Agent'),
  ('8a000000-0000-0000-0000-00000000a002', 'TKT-013 Requester'),
  ('8a000000-0000-0000-0000-00000000a003', 'TKT-013 Lead'),
  ('8a000000-0000-0000-0000-00000000a004', 'TKT-013 Other Tenant User');

insert into public.tenants (id, slug, name) values
  ('8a000000-0000-0000-0000-000000000001', 'tkt13-tenant-a', 'TKT-013 Tenant A'),
  ('8b000000-0000-0000-0000-000000000001', 'tkt13-tenant-b', 'TKT-013 Tenant B');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('8a000000-0000-0000-0000-00000000d001', '8a000000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000a001', 'operator', false, 'active'),
  ('8a000000-0000-0000-0000-00000000d002', '8a000000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000a002', 'operator', false, 'active'),
  ('8a000000-0000-0000-0000-00000000d003', '8a000000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000a003', 'technical_lead', false, 'active'),
  ('8b000000-0000-0000-0000-00000000d001', '8b000000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000a004', 'operator', false, 'active');

insert into public.membership_scope_grants (
  tenant_id, membership_id, scope, granted_by_membership_id
) values
  ('8a000000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000d003', 'institution', '8a000000-0000-0000-0000-00000000d003');

insert into public.ticket_categories (id, tenant_id, slug, label) values
  ('8a000000-0000-0000-0000-00000000c001', '8a000000-0000-0000-0000-000000000001', 'computador', 'Computador');

insert into public.tickets (id, tenant_id, requester_id, category_id, title, description, assigned_to) values
  ('8a000000-0000-0000-0000-00000000e001', '8a000000-0000-0000-0000-000000000001', '8a000000-0000-0000-0000-00000000a002', '8a000000-0000-0000-0000-00000000c001', 'TKT-013 ticket asignado', 'Descripcion valida con suficiente longitud.', '8a000000-0000-0000-0000-00000000a001');

-- ============================================================
-- TKT-013-AC-01: la función existe
-- ============================================================
select ok(
  (select count(*) from pg_proc
    where proname = 'create_ticket_comment'
      and pronamespace = 'public'::regnamespace) = 1,
  'TKT-013-AC-01: public.create_ticket_comment() existe'
);

-- ============================================================
-- TKT-013-AC-02: PUBLIC no tiene EXECUTE
-- ============================================================
select ok(
  not has_function_privilege(
    'public', 'public.create_ticket_comment(uuid, text, boolean)', 'EXECUTE'
  ),
  'TKT-013-AC-02: PUBLIC no tiene EXECUTE sobre create_ticket_comment'
);

-- ============================================================
-- TKT-013-AC-03: authenticated SÍ tiene EXECUTE
-- ============================================================
select ok(
  has_function_privilege(
    'authenticated', 'public.create_ticket_comment(uuid, text, boolean)', 'EXECUTE'
  ),
  'TKT-013-AC-03: authenticated tiene EXECUTE sobre create_ticket_comment'
);

-- ============================================================
-- TKT-013-ERR-01: ticket_id inexistente -> P0002
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '8a000000-0000-0000-0000-00000000a001', true);

select throws_ok(
  $$ select public.create_ticket_comment(
       '99999999-9999-9999-9999-999999999999'::uuid,
       'test',
       false
     ) $$,
  'P0002',
  null,
  'TKT-013-ERR-01: ticket_id inexistente -> P0002'
);

-- ============================================================
-- TKT-013-ERR-02: body vacío -> P0001 (validation)
-- ============================================================
select throws_ok(
  $$ select public.create_ticket_comment(
       '8a000000-0000-0000-0000-00000000e001'::uuid,
       '',
       false
     ) $$,
  'P0001',
  null,
  'TKT-013-ERR-02: body vacío -> P0001 (validation)'
);

-- ============================================================
-- TKT-013-ERR-03: body > 10000 -> P0001 (validation)
-- ============================================================
select throws_ok(
  $$ select public.create_ticket_comment(
       '8a000000-0000-0000-0000-00000000e001'::uuid,
       repeat('x', 10001),
       false
     ) $$,
  'P0001',
  null,
  'TKT-013-ERR-03: body > 10000 caracteres -> P0001 (validation)'
);

-- ============================================================
-- TKT-013-ERR-04: actor sin membership en el tenant del ticket
-- El usuario a004 pertenece al tenant B; el ticket está en tenant A.
-- can_comment_ticket requiere is_active_member -> false -> 42501.
-- ============================================================
select set_config('request.jwt.claim.sub', '8a000000-0000-0000-0000-00000000a004', true);
select throws_ok(
  $$ select public.create_ticket_comment(
       '8a000000-0000-0000-0000-00000000e001'::uuid,
       'cross-tenant attempt',
       false
     ) $$,
  '42501',
  null,
  'TKT-013-ERR-04: actor de OTRO tenant no puede comentar (42501)'
);

-- ============================================================
-- TKT-013-OK-01: happy path público — agente asignado comenta
-- ============================================================
select set_config('request.jwt.claim.sub', '8a000000-0000-0000-0000-00000000a001', true);
select lives_ok(
  $$ select public.create_ticket_comment(
       '8a000000-0000-0000-0000-00000000e001'::uuid,
       'Avanzando con la revisión del equipo.',
       false
     ) $$,
  'TKT-013-OK-01: agente asignado crea comentario público (happy path)'
);

select is(
  (select count(*) from public.ticket_comments
     where ticket_id = '8a000000-0000-0000-0000-00000000e001'
       and is_internal = false),
  1::bigint,
  'TKT-013-OK-01: comentario público persistido'
);

-- ============================================================
-- TKT-013-OK-02: happy path interno — lead (scope institución)
-- crea un comentario is_internal=true
-- ============================================================
select set_config('request.jwt.claim.sub', '8a000000-0000-0000-0000-00000000a003', true);
select lives_ok(
  $$ select public.create_ticket_comment(
       '8a000000-0000-0000-0000-00000000e001'::uuid,
       'Nota interna: revisar BIOS antes de cambiar RAM.',
       true
     ) $$,
  'TKT-013-OK-02: lead crea comentario interno (happy path)'
);

select is(
  (select count(*) from public.ticket_comments
     where ticket_id = '8a000000-0000-0000-0000-00000000e001'
       and is_internal = true),
  1::bigint,
  'TKT-013-OK-02: comentario interno persistido'
);

-- ============================================================
-- TKT-013-OK-03: cada comentario genera un ticket_event 'commented'
-- ============================================================
select is(
  (select count(*) from public.ticket_events
     where ticket_id = '8a000000-0000-0000-0000-00000000e001'
       and event_type = 'commented'),
  2::bigint,
  'TKT-013-OK-03: 2 ticket_events de tipo commented registrados'
);

-- ============================================================
-- TKT-013-OK-04: integridad — comentario correctamente asociado
-- tenant_id = ticket.tenant_id, ticket_id, author_id = auth.uid()
-- ============================================================
select is(
  (select tenant_id from public.ticket_comments
     where ticket_id = '8a000000-0000-0000-0000-00000000e001'
       and is_internal = false
     limit 1),
  '8a000000-0000-0000-0000-000000000001'::uuid,
  'TKT-013-OK-04: tenant_id del comentario coincide con el del ticket'
);

reset role;
select * from finish();
rollback;
