-- TEST ISOLATION CONTRACT
begin;
select plan(14);

-- ============================================================
-- TKT-014: register_ticket_attachment SECURITY DEFINER
-- ============================================================

-- Fixtures
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('aa000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'tkt14-agt@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('aa000000-0000-0000-0000-00000000a002', 'authenticated', 'authenticated', 'tkt14-req@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('aa000000-0000-0000-0000-00000000a003', 'authenticated', 'authenticated', 'tkt14-lead@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('aa000000-0000-0000-0000-00000000a001', 'TKT-014 Agent'),
  ('aa000000-0000-0000-0000-00000000a002', 'TKT-014 Requester'),
  ('aa000000-0000-0000-0000-00000000a003', 'TKT-014 Lead');

insert into public.tenants (id, slug, name) values
  ('aa000000-0000-0000-0000-000000000001', 'tkt14-tenant-a', 'TKT-014 Tenant A');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('aa000000-0000-0000-0000-00000000d001', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000a001', 'operator', false, 'active'),
  ('aa000000-0000-0000-0000-00000000d002', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000a002', 'operator', false, 'active'),
  ('aa000000-0000-0000-0000-00000000d003', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000a003', 'technical_lead', false, 'active');

insert into public.membership_scope_grants (
  tenant_id, membership_id, scope, granted_by_membership_id
) values
  ('aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000d003', 'institution', 'aa000000-0000-0000-0000-00000000d003');

insert into public.ticket_categories (id, tenant_id, slug, label) values
  ('aa000000-0000-0000-0000-00000000c001', 'aa000000-0000-0000-0000-000000000001', 'computador', 'Computador');

insert into public.tickets (id, tenant_id, requester_id, category_id, title, description, assigned_to) values
  ('aa000000-0000-0000-0000-00000000e001', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000a002', 'aa000000-0000-0000-0000-00000000c001', 'TKT-014 ticket', 'Descripcion valida con suficiente longitud.', 'aa000000-0000-0000-0000-00000000a001');

-- ============================================================
-- TKT-014-AC-01: la función existe
-- ============================================================
select ok(
  (select count(*) from pg_proc
    where proname = 'register_ticket_attachment'
      and pronamespace = 'public'::regnamespace) = 1,
  'TKT-014-AC-01: public.register_ticket_attachment() existe'
);

-- ============================================================
-- TKT-014-AC-02: PUBLIC sin EXECUTE
-- ============================================================
select ok(
  not has_function_privilege(
    'public', 'public.register_ticket_attachment(uuid, text, text, bigint, text, text)', 'EXECUTE'
  ),
  'TKT-014-AC-02: PUBLIC no tiene EXECUTE'
);

-- ============================================================
-- TKT-014-AC-03: authenticated SÍ tiene EXECUTE
-- ============================================================
select ok(
  has_function_privilege(
    'authenticated', 'public.register_ticket_attachment(uuid, text, text, bigint, text, text)', 'EXECUTE'
  ),
  'TKT-014-AC-03: authenticated tiene EXECUTE'
);

-- ============================================================
-- TKT-014-ERR-01: ticket_id inexistente -> P0002
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-00000000a001', true);

select throws_ok(
  $$ select public.register_ticket_attachment(
       '99999999-9999-9999-9999-999999999999'::uuid,
       'foto.png', 'image/png', 1024,
       'ticket-attachments/aa000000-0000-0000-0000-000000000001/99999999-9999-9999-9999-999999999999/foto.png',
       null
     ) $$,
  'P0002',
  null,
  'TKT-014-ERR-01: ticket_id inexistente -> P0002'
);

-- ============================================================
-- TKT-014-ERR-02: storage_path con prefijo incorrecto -> P0001
-- (no respeta la convención ticket-attachments/{tenant_id}/{ticket_id}/)
-- ============================================================
select throws_ok(
  $$ select public.register_ticket_attachment(
       'aa000000-0000-0000-0000-00000000e001'::uuid,
       'foto.png', 'image/png', 1024,
       'evil-path/foto.png',
       null
     ) $$,
  'P0001',
  null,
  'TKT-014-ERR-02: storage_path con prefijo incorrecto -> P0001 (defense in depth contra path traversal)'
);

-- ============================================================
-- TKT-014-ERR-03: storage_path de OTRO ticket (path traversal) -> P0001
-- ============================================================
select throws_ok(
  $$ select public.register_ticket_attachment(
       'aa000000-0000-0000-0000-00000000e001'::uuid,
       'foto.png', 'image/png', 1024,
       'ticket-attachments/aa000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000099/foto.png',
       null
     ) $$,
  'P0001',
  null,
  'TKT-014-ERR-03: storage_path con ticket_id distinto -> P0001'
);

-- ============================================================
-- TKT-014-ERR-04: original_name fuera de rango -> P0001
-- ============================================================
select throws_ok(
  $$ select public.register_ticket_attachment(
       'aa000000-0000-0000-0000-00000000e001'::uuid,
       repeat('x', 256), 'image/png', 1024,
       'ticket-attachments/aa000000-0000-0000-0000-000000000001/aa000000-0000-0000-0000-00000000e001/xxx.png',
       null
     ) $$,
  'P0001',
  null,
  'TKT-014-ERR-04: original_name > 255 -> P0001'
);

-- ============================================================
-- TKT-014-ERR-05: size_bytes > 25 MB -> P0001
-- ============================================================
select throws_ok(
  $$ select public.register_ticket_attachment(
       'aa000000-0000-0000-0000-00000000e001'::uuid,
       'big.bin', 'application/octet-stream', 26214401,
       'ticket-attachments/aa000000-0000-0000-0000-000000000001/aa000000-0000-0000-0000-00000000e001/big.bin',
       null
     ) $$,
  'P0001',
  null,
  'TKT-014-ERR-05: size_bytes > 26214400 -> P0001'
);

-- ============================================================
-- TKT-014-OK-01: happy path — agente asignado registra metadata
-- ============================================================
select lives_ok(
  $$ select public.register_ticket_attachment(
       'aa000000-0000-0000-0000-00000000e001'::uuid,
       'captura.png', 'image/png', 102400,
       'ticket-attachments/aa000000-0000-0000-0000-000000000001/aa000000-0000-0000-0000-00000000e001/captura.png',
       'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
     ) $$,
  'TKT-014-OK-01: agente registra metadata de captura.png (happy path)'
);

select is(
  (select count(*) from public.ticket_attachments
     where ticket_id = 'aa000000-0000-0000-0000-00000000e001'),
  1::bigint,
  'TKT-014-OK-01: 1 attachment persistido'
);

select is(
  (select storage_path from public.ticket_attachments
     where ticket_id = 'aa000000-0000-0000-0000-00000000e001'
     limit 1),
  'ticket-attachments/aa000000-0000-0000-0000-000000000001/aa000000-0000-0000-0000-00000000e001/captura.png'::text,
  'TKT-014-OK-01: storage_path se guardó tal cual'
);

-- ============================================================
-- TKT-014-OK-02: sha256 NULL permitido
-- ============================================================
select lives_ok(
  $$ select public.register_ticket_attachment(
       'aa000000-0000-0000-0000-00000000e001'::uuid,
       'sin-hash.log', 'text/plain', 512,
       'ticket-attachments/aa000000-0000-0000-0000-000000000001/aa000000-0000-0000-0000-00000000e001/sin-hash.log',
       null
     ) $$,
  'TKT-014-OK-02: sha256 NULL permitido (TKT-014 v2 lo hará NOT NULL)'
);

select is(
  (select count(*) from public.ticket_attachments
     where ticket_id = 'aa000000-0000-0000-0000-00000000e001'
       and sha256 is null),
  1::bigint,
  'TKT-014-OK-02: 1 attachment con sha256 NULL'
);

-- ============================================================
-- TKT-014-OK-03: 2 ticket_events 'attachment_added' registrados
-- ============================================================
select is(
  (select count(*) from public.ticket_events
     where ticket_id = 'aa000000-0000-0000-0000-00000000e001'
       and event_type = 'attachment_added'),
  2::bigint,
  'TKT-014-OK-03: 2 ticket_events de tipo attachment_added'
);

reset role;
select * from finish();
rollback;
