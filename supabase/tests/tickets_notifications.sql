-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(29);

-- ============================================================
-- TKT-019: notification_outbox + enqueue/claim/complete
-- Cubrir:
--  1) tabla/funciones existen
--  2) ACL correcta (PUBLIC no EXECUTE, authenticated SÍ)
--  3) RLS: tenant isolation en SELECT; authenticated NO tiene INSERT
--  4) trigger on ticket_events dispara enqueue
--  5) enqueue genera 'ticket.assigned' al nuevo assignee
--  6) enqueue genera 'ticket.state_changed_to_resolved' al requester
--  7) enqueue NO genera fila para 'state_changed' a otros estados
--  8) enqueue NO genera fila para 'created' (sin policy)
--  9) idempotencia: enqueue dos veces el mismo evento => 1 fila
-- 10) claim_pending_notifications devuelve la fila pending y la marca processing
-- 11) complete_notification con status='sent' cierra la fila
-- 12) complete_notification con status='failed' incrementa attempt_count
-- 13) complete_notification rechaza con claim_id incorrecto
-- 14) complete_notification rechaza status inválido
-- ============================================================

-- ============================================================
-- Fixtures
-- ============================================================
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  ('aa000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'tkt19-req@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('aa000000-0000-0000-0000-00000000a002', 'authenticated', 'authenticated', 'tkt19-agt@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('aa000000-0000-0000-0000-00000000a003', 'authenticated', 'authenticated', 'tkt19-lead@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb),
  ('aa000000-0000-0000-0000-00000000a004', 'authenticated', 'authenticated', 'tkt19-other@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, display_name) values
  ('aa000000-0000-0000-0000-00000000a001', 'TKT-019 Requester'),
  ('aa000000-0000-0000-0000-00000000a002', 'TKT-019 Agent'),
  ('aa000000-0000-0000-0000-00000000a003', 'TKT-019 Lead'),
  ('aa000000-0000-0000-0000-00000000a004', 'TKT-019 Other Tenant User');

insert into public.tenants (id, slug, name) values
  ('aa000000-0000-0000-0000-000000000001', 'tkt19-tenant-a', 'TKT-019 Tenant A'),
  ('ab000000-0000-0000-0000-000000000001', 'tkt19-tenant-b', 'TKT-019 Tenant B');

insert into public.memberships (
  id, tenant_id, user_id, functional_role, is_tenant_admin, status
) values
  ('aa000000-0000-0000-0000-00000000d001', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000a001', 'operator', false, 'active'),
  ('aa000000-0000-0000-0000-00000000d002', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000a002', 'operator', false, 'active'),
  ('aa000000-0000-0000-0000-00000000d003', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000a003', 'technical_lead', false, 'active'),
  ('ab000000-0000-0000-0000-00000000d001', 'ab000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000a004', 'operator', false, 'active');

insert into public.membership_scope_grants (
  tenant_id, membership_id, scope, granted_by_membership_id
) values
  ('aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000d003', 'institution', 'aa000000-0000-0000-0000-00000000d003');

insert into public.ticket_categories (id, tenant_id, slug, label) values
  ('aa000000-0000-0000-0000-00000000c001', 'aa000000-0000-0000-0000-000000000001', 'computador', 'Computador');

-- Tickets para los tests
insert into public.tickets (id, tenant_id, requester_id, category_id, title, description, assigned_to, state) values
  ('aa000000-0000-0000-0000-00000000e001', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000a001', 'aa000000-0000-0000-0000-00000000c001', 'TKT-019 ticket asignado', 'Descripcion valida con suficiente longitud.', 'aa000000-0000-0000-0000-00000000a002', 'ABIERTO'),
  ('aa000000-0000-0000-0000-00000000e002', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000a001', 'aa000000-0000-0000-0000-00000000c001', 'TKT-019 ticket en proceso', 'Descripcion valida con suficiente longitud.', 'aa000000-0000-0000-0000-00000000a002', 'EN_PROCESO');

-- ============================================================
-- TKT-019-AC-01: tabla notification_outbox existe
-- ============================================================
select ok(
  (select count(*) from pg_tables
    where schemaname = 'public' and tablename = 'notification_outbox') = 1,
  'TKT-019-AC-01: public.notification_outbox existe'
);

-- ============================================================
-- TKT-019-AC-02: enqueue_ticket_notifications existe
-- ============================================================
select ok(
  (select count(*) from pg_proc
    where proname = 'enqueue_ticket_notifications'
      and pronamespace = 'public'::regnamespace) = 1,
  'TKT-019-AC-02: public.enqueue_ticket_notifications() existe'
);

-- ============================================================
-- TKT-019-AC-03: claim_pending_notifications existe
-- ============================================================
select ok(
  (select count(*) from pg_proc
    where proname = 'claim_pending_notifications'
      and pronamespace = 'public'::regnamespace) = 1,
  'TKT-019-AC-03: public.claim_pending_notifications() existe'
);

-- ============================================================
-- TKT-019-AC-04: complete_notification existe
-- ============================================================
select ok(
  (select count(*) from pg_proc
    where proname = 'complete_notification'
      and pronamespace = 'public'::regnamespace) = 1,
  'TKT-019-AC-04: public.complete_notification() existe'
);

-- ============================================================
-- TKT-019-ACL-01: PUBLIC no tiene EXECUTE sobre enqueue
-- ============================================================
select ok(
  not has_function_privilege('public', 'public.enqueue_ticket_notifications(uuid)', 'EXECUTE'),
  'TKT-019-ACL-01: PUBLIC no tiene EXECUTE sobre enqueue_ticket_notifications'
);

-- ============================================================
-- TKT-019-ACL-02: authenticated SÍ tiene EXECUTE sobre enqueue
-- ============================================================
select ok(
  has_function_privilege('authenticated', 'public.enqueue_ticket_notifications(uuid)', 'EXECUTE'),
  'TKT-019-ACL-02: authenticated SÍ tiene EXECUTE sobre enqueue_ticket_notifications'
);

-- ============================================================
-- TKT-019-ACL-03: PUBLIC no tiene EXECUTE sobre complete
-- ============================================================
select ok(
  not has_function_privilege('public', 'public.complete_notification(uuid, uuid, text, text)', 'EXECUTE'),
  'TKT-019-ACL-03: PUBLIC no tiene EXECUTE sobre complete_notification'
);

-- ============================================================
-- TKT-019-ACL-04: authenticated NO tiene INSERT en notification_outbox
-- ============================================================
select ok(
  not has_table_privilege('authenticated', 'public.notification_outbox', 'INSERT'),
  'TKT-019-ACL-04: authenticated NO tiene INSERT en notification_outbox (sólo SECURITY DEFINER)'
);

-- ============================================================
-- TKT-019-ACL-05: authenticated NO tiene UPDATE en notification_outbox
-- ============================================================
select ok(
  not has_table_privilege('authenticated', 'public.notification_outbox', 'UPDATE'),
  'TKT-019-ACL-05: authenticated NO tiene UPDATE en notification_outbox'
);

-- ============================================================
-- TKT-019-OK-01: enqueue genera 'ticket.assigned' al nuevo assignee
-- Insertamos manualmente un ticket_event tipo 'assigned' para no depender
-- de la SECURITY DEFINER de assign_ticket (que requiere can_assign_ticket).
-- El trigger on ticket_events se dispara automáticamente.
-- ============================================================
insert into public.ticket_events (
  tenant_id, ticket_id, actor_id, event_type, metadata
) values (
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-00000000e001',
  'aa000000-0000-0000-0000-00000000a003',
  'assigned',
  jsonb_build_object('assignee_id', 'aa000000-0000-0000-0000-00000000a002')
);

select ok(
  (select count(*) = 1 from public.notification_outbox
    where notification_type = 'ticket.assigned'
      and recipient_user_id = 'aa000000-0000-0000-0000-00000000a002'
      and tenant_id = 'aa000000-0000-0000-0000-000000000001'
      and status = 'pending') is true,
  'TKT-019-OK-01: enqueue generó ticket.assigned para el nuevo assignee'
);

-- ============================================================
-- TKT-019-OK-02: idempotencia — re-disparar enqueue no duplica
-- ============================================================
-- El trigger ya disparó al insertar. Llamamos enqueue de nuevo manualmente
-- con el mismo event_id y verificamos que sigue habiendo 1 fila.
select is(
  public.enqueue_ticket_notifications((
    select id from public.ticket_events
     where event_type = 'assigned'
       and ticket_id = 'aa000000-0000-0000-0000-00000000e001'
     limit 1
  )),
  0::int,
  'TKT-019-OK-02a: enqueue idempotente devuelve 0 (no nuevas filas)'
);

select is(
  (select count(*) from public.notification_outbox
    where notification_type = 'ticket.assigned'
      and recipient_user_id = 'aa000000-0000-0000-0000-00000000a002'
      and ticket_id = 'aa000000-0000-0000-0000-00000000e001'),
  1::bigint,
  'TKT-019-OK-02b: sigue habiendo exactamente 1 fila de ticket.assigned'
);

-- ============================================================
-- TKT-019-OK-03: enqueue genera 'ticket.state_changed_to_resolved' al requester
-- ============================================================
insert into public.ticket_events (
  tenant_id, ticket_id, actor_id, event_type, from_state, to_state, metadata
) values (
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-00000000e002',
  'aa000000-0000-0000-0000-00000000a002',
  'state_changed',
  'EN_PROCESO'::public.ticket_state,
  'RESUELTO'::public.ticket_state,
  jsonb_build_object('actor_role', 'operator')
);

select ok(
  (select count(*) = 1 from public.notification_outbox
    where notification_type = 'ticket.state_changed_to_resolved'
      and recipient_user_id = 'aa000000-0000-0000-0000-00000000a001'
      and tenant_id = 'aa000000-0000-0000-0000-000000000001') is true,
  'TKT-019-OK-03: enqueue generó ticket.state_changed_to_resolved para el requester'
);

-- ============================================================
-- TKT-019-OK-04: state_changed a EN_PROCESO NO genera notificación
-- ============================================================
insert into public.ticket_events (
  tenant_id, ticket_id, actor_id, event_type, from_state, to_state, metadata
) values (
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-00000000e001',
  'aa000000-0000-0000-0000-00000000a002',
  'state_changed',
  'ABIERTO'::public.ticket_state,
  'EN_PROCESO'::public.ticket_state,
  jsonb_build_object('actor_role', 'operator')
);

-- El assignee de este ticket ya tiene un ticket.assigned; no debe tener un
-- ticket.state_changed_to_in_process (no existe ese type). Verificamos que
-- NO se creó una fila NUEVA por este state_changed.
select is(
  (select count(*) from public.notification_outbox
    where ticket_id = 'aa000000-0000-0000-0000-00000000e001'),
  1::bigint,
  'TKT-019-OK-04: state_changed a EN_PROCESO NO genera notificación nueva'
);

-- ============================================================
-- TKT-019-OK-05: 'created' NO genera notificación (sin policy)
-- ============================================================
insert into public.ticket_events (
  tenant_id, ticket_id, actor_id, event_type, to_state, metadata
) values (
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-00000000e001',
  'aa000000-0000-0000-0000-00000000a001',
  'created',
  'ABIERTO'::public.ticket_state,
  jsonb_build_object('category_slug', 'computador')
);

-- El ticket ya tenía 1 notificación (la assigned). Verificamos que
-- este 'created' no añadió otra.
select is(
  (select count(*) from public.notification_outbox
    where ticket_id = 'aa000000-0000-0000-0000-00000000e001'),
  1::bigint,
  'TKT-019-OK-05: event_type=created NO genera notificación (TBD policy)'
);

-- ============================================================
-- TKT-019-OK-06: claim_pending_notifications marca processing y asigna claim_id
-- ============================================================
-- Set authenticated role para que las funciones SECURITY DEFINER ejecuten
-- dentro del contexto esperado (con auth.uid()).
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-00000000a003', true);

-- Tomar el id de la primera fila pending.
select lives_ok(
  $$ with claimed as (
       select * from public.claim_pending_notifications(10, 60)
     )
     select count(*) from claimed $$,
  'TKT-019-OK-06a: claim_pending_notifications ejecuta sin error'
);

-- La fila antes pending ahora debe estar processing con claim_id no nulo.
select ok(
  (select status = 'processing' from public.notification_outbox
    where notification_type = 'ticket.assigned'
      and ticket_id = 'aa000000-0000-0000-0000-00000000e001') is true,
  'TKT-019-OK-06b: la fila claimed pasó a status=processing'
);

select ok(
  (select claim_id is not null from public.notification_outbox
    where notification_type = 'ticket.assigned'
      and ticket_id = 'aa000000-0000-0000-0000-00000000e001') is true,
  'TKT-019-OK-06c: la fila claimed tiene claim_id no nulo'
);

-- ============================================================
-- TKT-019-OK-07: complete_notification con claim_id correcto cierra como sent
-- ============================================================
select lives_ok(
  $$ select public.complete_notification(
       (select id from public.notification_outbox
         where notification_type = 'ticket.assigned'
           and ticket_id = 'aa000000-0000-0000-0000-00000000e001'),
       (select claim_id from public.notification_outbox
         where notification_type = 'ticket.assigned'
           and ticket_id = 'aa000000-0000-0000-0000-00000000e001'),
       'sent',
       null
     ) $$,
  'TKT-019-OK-07a: complete_notification cierra la fila como sent'
);

select is(
  (select status::text from public.notification_outbox
    where notification_type = 'ticket.assigned'
      and ticket_id = 'aa000000-0000-0000-0000-00000000e001'),
  'sent',
  'TKT-019-OK-07b: status final = sent'
);

select is(
  (select processed_at is not null from public.notification_outbox
    where notification_type = 'ticket.assigned'
      and ticket_id = 'aa000000-0000-0000-0000-00000000e001'),
  true,
  'TKT-019-OK-07c: processed_at quedó seteado'
);

-- ============================================================
-- TKT-019-OK-08: complete_notification con claim_id incorrecto -> 42501
-- ============================================================
-- Reclamar la otra fila (ticket.state_changed_to_resolved).
select lives_ok(
  $$ with claimed as (
       select * from public.claim_pending_notifications(10, 60)
     )
     select count(*) from claimed $$,
  'TKT-019-OK-08a: claim la segunda fila pending'
);

select throws_ok(
  $$ select public.complete_notification(
       (select id from public.notification_outbox
         where notification_type = 'ticket.state_changed_to_resolved'),
       gen_random_uuid(),
       'sent',
       null
     ) $$,
  '42501',
  null,
  'TKT-019-OK-08b: complete con claim_id incorrecto -> 42501 (claim_id mismatch)'
);

-- ============================================================
-- TKT-019-OK-09: complete_notification con status inválido -> P0001
-- ============================================================
select throws_ok(
  $$ select public.complete_notification(
       (select id from public.notification_outbox
         where notification_type = 'ticket.state_changed_to_resolved'),
       (select claim_id from public.notification_outbox
         where notification_type = 'ticket.state_changed_to_resolved'),
       'bogus',
       null
     ) $$,
  'P0001',
  null,
  'TKT-019-OK-09: complete con status inválido -> P0001'
);

-- ============================================================
-- TKT-019-OK-10: complete_notification con status=failed incrementa attempt_count
-- ============================================================
select lives_ok(
  $$ select public.complete_notification(
       (select id from public.notification_outbox
         where notification_type = 'ticket.state_changed_to_resolved'),
       (select claim_id from public.notification_outbox
         where notification_type = 'ticket.state_changed_to_resolved'),
       'failed',
       'smtp timeout'
     ) $$,
  'TKT-019-OK-10a: complete con failed ejecuta sin error'
);

select is(
  (select attempt_count from public.notification_outbox
    where notification_type = 'ticket.state_changed_to_resolved'),
  1::int,
  'TKT-019-OK-10b: attempt_count se incrementó a 1'
);

select is(
  (select last_error from public.notification_outbox
    where notification_type = 'ticket.state_changed_to_resolved'),
  'smtp timeout',
  'TKT-019-OK-10c: last_error quedó registrado'
);

select is(
  (select status::text from public.notification_outbox
    where notification_type = 'ticket.state_changed_to_resolved'),
  'failed',
  'TKT-019-OK-10d: status final = failed'
);

-- ============================================================
-- TKT-019-OK-11: tenant isolation — un actor de OTRO tenant no ve la fila
-- ============================================================
-- Volvemos a authenticated, ahora con el usuario de tenant B.
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-00000000a004', true);

select is(
  (select count(*) from public.notification_outbox
    where tenant_id = 'aa000000-0000-0000-0000-000000000001'),
  0::bigint,
  'TKT-019-OK-11: RLS deniega SELECT a actor de otro tenant (no ve 0 filas de tenant A)'
);

reset role;
select * from finish();
rollback;
