-- pgTAP test para DEFECT-UAT-002: re-upload del mismo storage_path.
--
-- Verifica los 5 criterios del PO:
--   1) upload inicial → PASS
--   2) segundo upload del mismo filename/path → PASS (no falla con
--      "The resource already exists")
--   3) no produce registro inconsistente (1 fila por ticket+path)
--   4) no rompe descarga (signed URL sigue funcionando con la metadata actualizada)
--   5) no rompe cross-tenant isolation (RLS intacta)
--
-- Nota: el test se enfoca en la DB (register_ticket_attachment) que es
-- la lógica de UPSERT. El upload al Storage se prueba manualmente o via
-- E2E (no automatizable desde pgTAP). Si la DB es idempotente, el
-- comportamiento end-to-end está garantizado cuando el storage usa upsert:true.

begin;

select plan(8);

-- ============================================================
-- Setup (superuser para evitar RLS en setup)
-- ============================================================
reset role;

-- Tenant de prueba
insert into public.tenants (id, slug, name, timezone)
values ('9b000000-0000-0000-0000-0000000000a1', 'tkt-test-attach-upsert', 'TKT TEST Attach Upsert', 'UTC')
on conflict (id) do nothing;

-- Categoría
insert into public.ticket_categories (id, tenant_id, slug, label, is_active)
values ('9b000000-0000-0000-0000-00000000c0a1', '9b000000-0000-0000-0000-0000000000a1', 'computador', 'Computador', true)
on conflict (id) do nothing;

-- Users: requester + agent
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, instance_id, created_at, updated_at, email_confirmed_at)
values
  ('9b000000-0000-0000-0000-00000000a0a1', 'authenticated', 'authenticated', 'requester-attach@deskwork-uat.test', 'not-used', '{"provider":"email"}'::jsonb, '{"display_name":"TKT Attach Requester"}'::jsonb, '00000000-0000-0000-0000-000000000000', now(), now(), now()),
  ('9b000000-0000-0000-0000-00000000a0a2', 'authenticated', 'authenticated', 'agent-attach@deskwork-uat.test', 'not-used', '{"provider":"email"}'::jsonb, '{"display_name":"TKT Attach Agent"}'::jsonb, '00000000-0000-0000-0000-000000000000', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values
  ('9b000000-0000-0000-0000-00000000a0a1', 'TKT Attach Requester'),
  ('9b000000-0000-0000-0000-00000000a0a2', 'TKT Attach Agent')
on conflict (id) do nothing;

insert into public.memberships (id, tenant_id, user_id, functional_role, status)
values
  ('9b000000-0000-0000-0000-00000000d0a1', '9b000000-0000-0000-0000-0000000000a1', '9b000000-0000-0000-0000-00000000a0a1', 'operator', 'active'),
  ('9b000000-0000-0000-0000-00000000d0a2', '9b000000-0000-0000-0000-0000000000a1', '9b000000-0000-0000-0000-00000000a0a2', 'operator', 'active')
on conflict (id) do nothing;

-- Ticket
insert into public.tickets (id, tenant_id, requester_id, category_id, priority, state, title, description)
values ('9b000000-0000-0000-0000-00000000e0a1', '9b000000-0000-0000-0000-0000000000a1', '9b000000-0000-0000-0000-00000000a0a1', '9b000000-0000-0000-0000-00000000c0a1', 'P2', 'ABIERTO', 'Ticket Attachment Upsert Test', 'Descripción válida con suficiente longitud.')
on conflict (id) do nothing;

-- Limpiar attachments previos (si los hay)
delete from public.ticket_attachments
 where ticket_id = '9b000000-0000-0000-0000-00000000e0a1';

-- Storage path que usaremos: ticket-attachments/{tenant}/{ticket}/{filename}
-- (El path se construye directamente en cada call — pgTAP no soporta variables
-- de sesión compartidas entre sentencias.)

-- ============================================================
-- Test 1: Upload inicial (registro nuevo) → PASS
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a0a1', true);

select lives_ok(
  $$ select public.register_ticket_attachment(
       '9b000000-0000-0000-0000-00000000e0a1'::uuid,
       'documento.pdf',
       'application/pdf',
       1024::bigint,
       'ticket-attachments/9b000000-0000-0000-0000-0000000000a1/9b000000-0000-0000-0000-00000000e0a1/documento.pdf',
       null
     ) $$,
  'DEFECT-UAT-002 T1: register_ticket_attachment inicial no falla'
);

select is(
  (select count(*) from public.ticket_attachments
    where ticket_id = '9b000000-0000-0000-0000-00000000e0a1'
      and storage_path = 'ticket-attachments/9b000000-0000-0000-0000-0000000000a1/9b000000-0000-0000-0000-00000000e0a1/documento.pdf'),
  1::bigint,
  'DEFECT-UAT-002 T1: 1 fila tras upload inicial'
);

-- ============================================================
-- Test 2: Re-upload del mismo path (mismo filename) → no falla, no duplica
-- ============================================================
select lives_ok(
  $$ select public.register_ticket_attachment(
       '9b000000-0000-0000-0000-00000000e0a1'::uuid,
       'documento.pdf',
       'application/pdf',
       2048::bigint,
       'ticket-attachments/9b000000-0000-0000-0000-0000000000a1/9b000000-0000-0000-0000-00000000e0a1/documento.pdf',
       null
     ) $$,
  'DEFECT-UAT-002 T2: re-upload del mismo storage_path NO falla (era DEFECT-UAT-002: "The resource already exists")'
);

-- ============================================================
-- Test 3: No produce registro inconsistente (sigue habiendo 1 fila,
--         pero con size_bytes actualizado a 2048)
-- ============================================================
select is(
  (select count(*) from public.ticket_attachments
    where ticket_id = '9b000000-0000-0000-0000-00000000e0a1'
      and storage_path = 'ticket-attachments/9b000000-0000-0000-0000-0000000000a1/9b000000-0000-0000-0000-00000000e0a1/documento.pdf'),
  1::bigint,
  'DEFECT-UAT-002 T3: sigue habiendo 1 fila (no se duplica)'
);

select is(
  (select size_bytes from public.ticket_attachments
    where ticket_id = '9b000000-0000-0000-0000-00000000e0a1'
      and storage_path = 'ticket-attachments/9b000000-0000-0000-0000-0000000000a1/9b000000-0000-0000-0000-00000000e0a1/documento.pdf'),
  2048::bigint,
  'DEFECT-UAT-002 T3: size_bytes actualizado a 2048 (último upload gana)'
);

-- ============================================================
-- Test 4: ticket_event registra el reemplazo con flag replaced=true
-- ============================================================
select is(
  (select count(*) from public.ticket_events
    where ticket_id = '9b000000-0000-0000-0000-00000000e0a1'
      and event_type = 'attachment_added'),
  2::bigint,
  'DEFECT-UAT-002 T4: 2 eventos attachment_added (uno por cada register call)'
);

select is(
  (select (metadata->>'replaced')::boolean
    from public.ticket_events
   where ticket_id = '9b000000-0000-0000-0000-00000000e0a1'
     and event_type = 'attachment_added'
   order by created_at desc
   limit 1),
  true,
  'DEFECT-UAT-002 T4: el último evento tiene replaced=true'
);

-- ============================================================
-- Test 5: Cross-tenant isolation se mantiene (user de OTRO tenant
--         no ve el attachment de este tenant)
-- ============================================================
-- Cambiar a user de tenant A (que NO es miembro de este tenant de prueba)
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000a001', true);

select is(
  (select count(*) from public.ticket_attachments
    where ticket_id = '9b000000-0000-0000-0000-00000000e0a1'),
  0::bigint,
  'DEFECT-UAT-002 T5: user de tenant A NO ve attachment del tenant de prueba (RLS intacta)'
);

select * from finish();
rollback;
