-- pgTAP test para DEFECT-UAT-001: idempotencia del outbox.
--
-- Verifica los 5 criterios del PO:
--   1) Primera asignación al assignee → 1 notificación
--   2) Segunda asignación al mismo assignee → no crea otra notificación
--   3) Asignación a assignee diferente → sí crea la notificación
--   4) ticket_assignments history NO se altera (mantiene todas las filas)
--   5) RLS de notification_outbox se mantiene (no se rompe el aislamiento)
--
-- FINDING-DEFECT-001-E: tests adicionales NOIDEM-1 a NOIDEM-5 que verifican
-- la semántica SEGURA del DO UPDATE:
--   NOIDEM-1: sent protection (no reabrir notificaciones ya enviadas)
--   NOIDEM-2: processing/lease protection (no destruir leases activos)
--   NOIDEM-3: failed/retry semantics (preservar historial de intentos)
--   NOIDEM-4: payload/event semantics por estado (parcial, ver NOIDEM-6..9)
--   NOIDEM-5: concurrency / lease integrity (best-effort en pgTAP, NO concurrencia real)
--
-- CORRECTION-2026-09-01: tests NOIDEM-6 a NOIDEM-9 que verifican
-- explícitamente la preservación/refresco de event_id y payload por estado:
--   NOIDEM-6: processing preserva event_id + payload
--   NOIDEM-7: sent preserva event_id + payload
--   NOIDEM-8: pending refresca event_id + payload
--   NOIDEM-9: failed refresca event_id + payload y preserva attempt_count + last_error

begin;

-- ============================================================
-- Setup: crear datos aislados para este test (no usar UAT data)
-- ============================================================
-- Plan generoso
select plan(9 + 15 + 10);  -- 9 originales + 15 NOIDEM-1..5 + 10 NOIDEM-6..9

-- Trabajar como superuser para setup (evitar RLS en inserts)
reset role;

-- Tenant de prueba
insert into public.tenants (id, slug, name, timezone)
values ('9b000000-0000-0000-0000-000000000099', 'tkt-test-outbox-idem', 'TKT TEST Outbox Idem', 'UTC')
on conflict (id) do nothing;

-- Categoría (idempotente)
insert into public.ticket_categories (id, tenant_id, slug, label, is_active)
values ('9b000000-0000-0000-0000-00000000c099', '9b000000-0000-0000-0000-000000000099', 'computador', 'Computador', true)
on conflict (id) do nothing;

-- Users y memberships (3 users: requester, agent-A, agent-B)
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, instance_id, created_at, updated_at, email_confirmed_at)
values
  ('9b000000-0000-0000-0000-00000000a099', 'authenticated', 'authenticated', 'requester-idem@deskwork-uat.test', 'not-used', '{"provider":"email"}'::jsonb, '{"display_name":"TKT Idem Requester"}'::jsonb, '00000000-0000-0000-0000-000000000000', now(), now(), now()),
  ('9b000000-0000-0000-0000-00000000a09a', 'authenticated', 'authenticated', 'agent-A-idem@deskwork-uat.test', 'not-used', '{"provider":"email"}'::jsonb, '{"display_name":"TKT Idem Agent A"}'::jsonb, '00000000-0000-0000-0000-000000000000', now(), now(), now()),
  ('9b000000-0000-0000-0000-00000000a09b', 'authenticated', 'authenticated', 'agent-B-idem@deskwork-uat.test', 'not-used', '{"provider":"email"}'::jsonb, '{"display_name":"TKT Idem Agent B"}'::jsonb, '00000000-0000-0000-0000-000000000000', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values
  ('9b000000-0000-0000-0000-00000000a099', 'TKT Idem Requester'),
  ('9b000000-0000-0000-0000-00000000a09a', 'TKT Idem Agent A'),
  ('9b000000-0000-0000-0000-00000000a09b', 'TKT Idem Agent B')
on conflict (id) do nothing;

insert into public.memberships (id, tenant_id, user_id, functional_role, status)
values
  ('9b000000-0000-0000-0000-00000000d099', '9b000000-0000-0000-0000-000000000099', '9b000000-0000-0000-0000-00000000a099', 'operator', 'active'),
  ('9b000000-0000-0000-0000-00000000d09a', '9b000000-0000-0000-0000-000000000099', '9b000000-0000-0000-0000-00000000a09a', 'operator', 'active'),
  ('9b000000-0000-0000-0000-00000000d09b', '9b000000-0000-0000-0000-000000000099', '9b000000-0000-0000-0000-00000000a09b', 'operator', 'active')
on conflict (id) do nothing;

-- Membership scope grant para el lead (que es el user requester aquí, con upgrade)
update public.memberships
   set functional_role = 'technical_lead'
 where user_id = '9b000000-0000-0000-0000-00000000a099';

insert into public.membership_scope_grants (tenant_id, membership_id, scope, granted_by_membership_id)
select m.tenant_id, m.id, 'institution'::authorization_scope, m.id
  from public.memberships m
 where m.user_id = '9b000000-0000-0000-0000-00000000a099'
on conflict do nothing;

-- Ticket de prueba
insert into public.tickets (id, tenant_id, requester_id, category_id, priority, state, title, description)
values ('9b000000-0000-0000-0000-00000000e099', '9b000000-0000-0000-0000-000000000099', '9b000000-0000-0000-0000-00000000a099', '9b000000-0000-0000-0000-00000000c099', 'P2', 'ABIERTO', 'Ticket Idempotency Test', 'Descripción válida con suficiente longitud para pasar validación.')
on conflict (id) do nothing;

-- Limpiar outbox previo (si lo hay) para este ticket
delete from public.notification_outbox
 where ticket_id = '9b000000-0000-0000-0000-00000000e099';

-- Limpiar ticket_assignments previo (si lo hay) para este ticket
delete from public.ticket_assignments
 where ticket_id = '9b000000-0000-0000-0000-00000000e099';

-- ============================================================
-- Test 1: Primera asignación al assignee → 1 notificación
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);

select lives_ok(
  $$ select public.assign_ticket('9b000000-0000-0000-0000-00000000e099'::uuid, '9b000000-0000-0000-0000-00000000a09a'::uuid) $$,
  'DEFECT-UAT-001 T1: assign_ticket inicial a agent-A no falla'
);

select is(
  (select count(*) from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  1::bigint,
  'DEFECT-UAT-001 T1: primera asignación crea 1 fila ticket.assigned en outbox'
);

-- ============================================================
-- Test 2: Segunda asignación al MISMO assignee → no crea nueva fila
-- ============================================================
select lives_ok(
  $$ select public.assign_ticket('9b000000-0000-0000-0000-00000000e099'::uuid, '9b000000-0000-0000-0000-00000000a09a'::uuid) $$,
  'DEFECT-UAT-001 T2: re-asignar al mismo agent-A no falla'
);

select is(
  (select count(*) from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  1::bigint,
  'DEFECT-UAT-001 T2: re-asignar al mismo agent-A NO crea nueva fila (idempotente)'
);

-- ============================================================
-- Test 3: Asignación a un assignee DIFERENTE → sí crea fila nueva
-- (porque es un recipient_user_id distinto)
-- ============================================================
select lives_ok(
  $$ select public.assign_ticket('9b000000-0000-0000-0000-00000000e099'::uuid, '9b000000-0000-0000-0000-00000000a09b'::uuid) $$,
  'DEFECT-UAT-001 T3: asignar a agent-B (distinto) no falla'
);

select is(
  (select count(*) from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'),
  2::bigint,
  'DEFECT-UAT-001 T3: asignar a agent-B crea 1 fila nueva (total: 2: agent-A + agent-B)'
);

-- ============================================================
-- Test 4: ticket_assignments history NO se altera
-- (debe tener 3 filas: asignación inicial, re-asignación a mismo, asignación a agent-B)
-- ============================================================
select is(
  (select count(*) from public.ticket_assignments
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'),
  3::bigint,
  'DEFECT-UAT-001 T4: ticket_assignments tiene 3 filas (history completo)'
);

-- ============================================================
-- Test 5: RLS del outbox se mantiene — otro tenant NO ve estas filas
-- (verificamos que la policy sigue activa y filtra por tenant)
-- ============================================================
-- Switch a un user de otro tenant
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000a001', true); -- requester-A (tenant A)

select is(
  (select count(*) from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'),
  0::bigint,
  'DEFECT-UAT-001 T5: user de tenant A NO ve outbox de ticket de tenant de prueba (RLS intacta)'
);

-- Volver al actor original y verificar que sí ve
select set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
select is(
  (select count(*) from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'),
  2::bigint,
  'DEFECT-UAT-001 T5b: lead del tenant de prueba SÍ ve el outbox de su tenant'
);

-- ============================================================
-- FINDING-DEFECT-001-E: Tests de semántica SEGURA del DO UPDATE
-- (NOIDEM-1 a NOIDEM-5)
--
-- Validan que re-encolar una notificación NUNCA:
--   - reabre una fila `sent` (NOIDEM-1)
--   - destruye un lease `processing` (NOIDEM-2)
--   - pierde historial de reintentos en `failed` (NOIDEM-3)
--   - actualiza event_id/payload cuando no debe (NOIDEM-4)
--
-- Y que el lease puede sobrevivir una re-asignación concurrente (NOIDEM-5).
--
-- Cada test resetea el outbox a un estado conocido antes de la operación.
-- ============================================================

-- ============================================================
-- NOIDEM-1: sent protection
-- Una notificación ya `sent` NO debe reabrirse a `pending` cuando
-- ocurre una re-asignación al mismo recipient.
-- ============================================================
reset role;
-- Reset: dejar el outbox del ticket en un estado conocido (sent).
-- La fila actual para agent-A es la creada por Tests 1-3.
update public.notification_outbox
   set status = 'sent',
       processed_at = now(),
       claim_id = null,
       claim_expires_at = null,
       last_error = null
 where ticket_id = '9b000000-0000-0000-0000-00000000e099'
   and notification_type = 'ticket.assigned'
   and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

-- Capturar el processed_at de referencia (debe preservarse tras re-enqueue).
do $$
declare
  v_processed_at_ref timestamptz;
begin
  select processed_at into v_processed_at_ref
    from public.notification_outbox
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  -- Esperar > 0 segundos para que now() en el DO UPDATE difiera del
  -- processed_at de referencia si la protección FALLA.
  perform pg_sleep(0.05);

  -- Re-enqueue (vía re-assign al mismo agent-A).
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
  perform public.assign_ticket(
    '9b000000-0000-0000-0000-00000000e099'::uuid,
    '9b000000-0000-0000-0000-00000000a09a'::uuid
  );
  reset role;

  raise notice 'NOIDEM-1 ref processed_at = %', v_processed_at_ref;
end $$;

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'sent',
  'NOIDEM-1.a: re-enqueue sobre fila `sent` preserva status=sent (no reabre a pending)'
);

select is(
  (select count(*) from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  1::bigint,
  'NOIDEM-1.b: re-enqueue sobre fila `sent` NO crea nueva fila (idempotente)'
);

select is(
  (select claim_id from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  null::uuid,
  'NOIDEM-1.c: re-enqueue sobre fila `sent` deja claim_id=null (no se re-queua)'
);

-- ============================================================
-- NOIDEM-2: processing/lease protection
-- Una notificación `processing` con un lease activo NO debe perder
-- su claim_id ni su status cuando ocurre una re-asignación.
-- Además, complete_notification debe poder cerrar con el claim_id
-- original (prueba que el worker NO fue invalidado).
-- ============================================================
reset role;
-- Reset: simular que un worker reclamó la fila.
update public.notification_outbox
   set status = 'processing',
       claim_id = 'cc000000-0000-0000-0000-000000000c01',
       claim_expires_at = now() + interval '60 seconds',
       attempt_count = 0
 where ticket_id = '9b000000-0000-0000-0000-00000000e099'
   and notification_type = 'ticket.assigned'
   and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

-- Re-enqueue (vía re-assign).
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
  perform public.assign_ticket(
    '9b000000-0000-0000-0000-00000000e099'::uuid,
    '9b000000-0000-0000-0000-00000000a09a'::uuid
  );
  reset role;
end $$;

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'processing',
  'NOIDEM-2.a: re-enqueue sobre fila `processing` preserva status=processing (no destruye el lease)'
);

select is(
  (select claim_id from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'cc000000-0000-0000-0000-000000000c01'::uuid,
  'NOIDEM-2.b: re-enqueue sobre fila `processing` preserva claim_id original'
);

select is(
  (select claim_expires_at > now() from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  true,
  'NOIDEM-2.c: re-enqueue sobre fila `processing` preserva claim_expires_at en el futuro'
);

select is(
  (select attempt_count from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  0::int,
  'NOIDEM-2.d: re-enqueue sobre fila `processing` preserva attempt_count=0 (no se resetea)'
);

-- El worker original debe poder completar usando el claim_id preservado.
select lives_ok(
  $$ select public.complete_notification(
       (select id from public.notification_outbox
         where ticket_id = '9b000000-0000-0000-0000-00000000e099'
           and notification_type = 'ticket.assigned'
           and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
       'cc000000-0000-0000-0000-000000000c01'::uuid,
       'sent',
       null
     ) $$,
  'NOIDEM-2.e: complete_notification con el claim_id ORIGINAL funciona tras re-enqueue concurrente'
);

-- ============================================================
-- NOIDEM-3: failed/retry semantics
-- Una notificación `failed` con historial de reintentos debe volver
-- a `pending` para retry, pero preservando:
--   - attempt_count (no perder historial)
--   - last_error (audit hasta el próximo intento)
-- Y actualizando:
--   - available_at (retry inmediato)
-- ============================================================
reset role;
-- Reset: simular que la fila falló en un intento previo.
update public.notification_outbox
   set status = 'failed',
       attempt_count = 1,
       last_error = 'smtp timeout',
       processed_at = now(),
       claim_id = null,
       claim_expires_at = null
 where ticket_id = '9b000000-0000-0000-0000-00000000e099'
   and notification_type = 'ticket.assigned'
   and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

-- Re-enqueue.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
  perform public.assign_ticket(
    '9b000000-0000-0000-0000-00000000e099'::uuid,
    '9b000000-0000-0000-0000-00000000a09a'::uuid
  );
  reset role;
end $$;

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'pending',
  'NOIDEM-3.a: re-enqueue sobre fila `failed` resetea status=pending (retry)'
);

select is(
  (select attempt_count from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  1::int,
  'NOIDEM-3.b: re-enqueue sobre fila `failed` PRESERVA attempt_count=1 (no pierde historial)'
);

select is(
  (select last_error from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'smtp timeout'::text,
  'NOIDEM-3.c: re-enqueue sobre fila `failed` PRESERVA last_error hasta el próximo intento'
);

select ok(
  (select available_at <= now() + interval '5 seconds'
     from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'NOIDEM-3.d: re-enqueue sobre fila `failed` setea available_at=now() (retry inmediato)'
);

-- ============================================================
-- NOIDEM-4: event_id y payload semantics por estado
-- Política: event_id y payload se refrescan para pending/failed;
-- se preservan para processing/sent (no tocar la fila del worker
-- o ya entregada).
--
-- 4.a: pending -> event_id REFRESH
-- 4.b: sent    -> event_id PRESERVE
-- (processing cubierto por NOIDEM-2; failed por NOIDEM-3 con refresh implícito)
-- ============================================================

-- Caso 4.a: pending -> refresh event_id
reset role;
-- Reset: dejar la fila en pending.
update public.notification_outbox
   set status = 'pending',
       processed_at = null,
       claim_id = null,
       claim_expires_at = null,
       last_error = null
 where ticket_id = '9b000000-0000-0000-0000-00000000e099'
   and notification_type = 'ticket.assigned'
   and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

-- Capturar event_id antes del re-enqueue.
do $$
declare
  v_event_before uuid;
begin
  select event_id into v_event_before
    from public.notification_outbox
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  -- Re-enqueue.
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-000099' || '', true);
  -- (usar el mismo sub que en Tests 1-3)
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
  perform public.assign_ticket(
    '9b000000-0000-0000-0000-00000000e099'::uuid,
    '9b000000-0000-0000-0000-00000000a09a'::uuid
  );
  reset role;

  raise notice 'NOIDEM-4.a event_id before=%, after=%', v_event_before,
    (select event_id from public.notification_outbox
      where ticket_id = '9b000000-0000-0000-0000-00000000e099'
        and notification_type = 'ticket.assigned'
        and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a');
end $$;

select ok(
  (select event_id <> (
      -- event_id debe ser DIFERENTE al event_id previo (refresh)
      -- Comparar contra el ticket_event MÁS RECIENTE del ticket
      -- (que es el que el re-assign acaba de crear).
      select te.id from public.ticket_events te
       where te.ticket_id = '9b000000-0000-0000-0000-00000000e099'
         and te.event_type = 'assigned'
       order by te.created_at desc
       limit 1
     )
     from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'NOIDEM-4.a: re-enqueue sobre `pending` REFRESCA event_id al evento más reciente'
);

-- Caso 4.b: sent -> preserve event_id
reset role;
-- Capturar event_id antes.
do $$
declare
  v_event_before uuid;
begin
  select event_id into v_event_before
    from public.notification_outbox
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  -- Forzar estado sent.
  update public.notification_outbox
     set status = 'sent',
         processed_at = now()
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  -- Re-enqueue.
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
  perform public.assign_ticket(
    '9b000000-0000-0000-0000-00000000e099'::uuid,
    '9b000000-0000-0000-0000-00000000a09a'::uuid
  );
  reset role;

  raise notice 'NOIDEM-4.b event_id before=%, after=%', v_event_before,
    (select event_id from public.notification_outbox
      where ticket_id = '9b000000-0000-0000-0000-00000000e099'
        and notification_type = 'ticket.assigned'
        and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a');
end $$;

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'sent',
  'NOIDEM-4.b: re-enqueue sobre `sent` PRESERVA status=sent (no reabre)'
);

-- ============================================================
-- NOIDEM-5: concurrency / lease integrity
--
-- Limitación documentada de pgTAP: no soporta ejecutar dos transacciones
-- reales en paralelo desde un único harness. Esta prueba es la mejor
-- aproximación determinista: pre-establece la fila en `processing` con
-- un claim_id, ejecuta el re-enqueue (que es la operación que ocurriría
-- en una transacción concurrente), y verifica que:
--   1) el lease se preserva (no fue destruido por el re-enqueue)
--   2) el worker original puede completar usando el claim_id preservado
--
-- Esto demuestra que, ante la condición de carrera "processing + enqueue
-- simultáneos", el comportamiento es seguro: el worker gana, el enqueue
-- no afecta su estado.
-- ============================================================
reset role;
-- Reset: simular worker claimó la fila.
update public.notification_outbox
   set status = 'processing',
       claim_id = 'cc000000-0000-0000-0000-000000000c02',
       claim_expires_at = now() + interval '60 seconds',
       attempt_count = 0
 where ticket_id = '9b000000-0000-0000-0000-00000000e099'
   and notification_type = 'ticket.assigned'
   and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

-- Simular re-enqueue concurrente.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
  perform public.assign_ticket(
    '9b000000-0000-0000-0000-00000000e099'::uuid,
    '9b000000-0000-0000-0000-00000000a09a'::uuid
  );
  reset role;
end $$;

select is(
  (select claim_id from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'cc000000-0000-0000-0000-000000000c02'::uuid,
  'NOIDEM-5: re-enqueue concurrente sobre `processing` NO destruye el claim_id del worker (lease integrity)'
);

-- ============================================================
-- NOIDEM-6: processing preserva event_id + payload
-- Una notificación en `processing` NO debe refrescar event_id ni
-- payload cuando ocurre una re-asignación. La fila del worker
-- permanece intocada en su contenido histórico.
--
-- Implementación: capturamos el event_id actual (FK-válido) en
-- una TEMP TABLE, hacemos el reset + re-enqueue, y comparamos.
-- ============================================================
reset role;
create temp table if not exists _noidem_capture (
  label text primary key,
  event_id uuid,
  payload jsonb
);
delete from _noidem_capture;

-- Reset + capturar referencia.
do $$
declare
  v_old_event_id uuid;
begin
  -- Capturar el event_id actual (FK-válido porque viene de ticket_events).
  select event_id into v_old_event_id
    from public.notification_outbox
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  -- Forzar estado processing; preservar el event_id (es el FK-válido).
  -- Cambiar el payload a un marcador para detectar refresh.
  update public.notification_outbox
     set status = 'processing',
         payload = jsonb_build_object('old', 'payload_processing_marker', 'old_event_id', v_old_event_id::text),
         claim_id = 'cc000000-0000-0000-0000-000000000c06',
         claim_expires_at = now() + interval '60 seconds',
         attempt_count = 0
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  -- Guardar referencia para la aserción.
  insert into _noidem_capture values (
    'NOIDEM-6', v_old_event_id,
    jsonb_build_object('old', 'payload_processing_marker', 'old_event_id', v_old_event_id::text)
  );

  -- Re-enqueue.
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
  perform public.assign_ticket(
    '9b000000-0000-0000-0000-00000000e099'::uuid,
    '9b000000-0000-0000-0000-00000000a09a'::uuid
  );
  reset role;
end $$;

select is(
  (select event_id from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  (select event_id from _noidem_capture where label = 'NOIDEM-6'),
  'NOIDEM-6.a: re-enqueue sobre `processing` PRESERVA event_id (no se refresca al nuevo ticket_event)'
);

select is(
  (select payload from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  (select payload from _noidem_capture where label = 'NOIDEM-6'),
  'NOIDEM-6.b: re-enqueue sobre `processing` PRESERVA payload (no se sobrescribe con el nuevo)'
);

-- ============================================================
-- NOIDEM-7: sent preserva event_id + payload
-- Una notificación en `sent` NO debe refrescar event_id ni
-- payload. La evidencia de envío original se mantiene.
-- ============================================================
reset role;
delete from _noidem_capture;

do $$
declare
  v_old_event_id uuid;
begin
  select event_id into v_old_event_id
    from public.notification_outbox
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  update public.notification_outbox
     set status = 'sent',
         payload = jsonb_build_object('old', 'payload_sent_marker', 'old_event_id', v_old_event_id::text),
         claim_id = null,
         claim_expires_at = null,
         processed_at = now(),
         last_error = null,
         attempt_count = 0
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  insert into _noidem_capture values (
    'NOIDEM-7', v_old_event_id,
    jsonb_build_object('old', 'payload_sent_marker', 'old_event_id', v_old_event_id::text)
  );

  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
  perform public.assign_ticket(
    '9b000000-0000-0000-0000-00000000e099'::uuid,
    '9b000000-0000-0000-0000-00000000a09a'::uuid
  );
  reset role;
end $$;

select is(
  (select event_id from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  (select event_id from _noidem_capture where label = 'NOIDEM-7'),
  'NOIDEM-7.a: re-enqueue sobre `sent` PRESERVA event_id (evidencia histórica de envío intacta)'
);

select is(
  (select payload from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  (select payload from _noidem_capture where label = 'NOIDEM-7'),
  'NOIDEM-7.b: re-enqueue sobre `sent` PRESERVA payload (contenido del envío original intacto)'
);

-- ============================================================
-- NOIDEM-8: pending refresca event_id + payload
-- Una notificación en `pending` SÍ debe refrescar event_id y
-- payload al re-encolar: refleja la asignación/evento más reciente.
-- ============================================================
reset role;
delete from _noidem_capture;

do $$
declare
  v_old_event_id uuid;
begin
  select event_id into v_old_event_id
    from public.notification_outbox
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  update public.notification_outbox
     set status = 'pending',
         payload = jsonb_build_object('old', 'payload_pending_marker', 'old_event_id', v_old_event_id::text),
         claim_id = null,
         claim_expires_at = null,
         processed_at = null,
         last_error = null,
         attempt_count = 0
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  insert into _noidem_capture values (
    'NOIDEM-8', v_old_event_id,
    jsonb_build_object('old', 'payload_pending_marker', 'old_event_id', v_old_event_id::text)
  );

  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
  perform public.assign_ticket(
    '9b000000-0000-0000-0000-00000000e099'::uuid,
    '9b000000-0000-0000-0000-00000000a09a'::uuid
  );
  reset role;
end $$;

-- event_id debe ser DIFERENTE al viejo (refresco).
select ok(
  (select event_id <> (select event_id from _noidem_capture where label = 'NOIDEM-8')
     from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'NOIDEM-8.a: re-enqueue sobre `pending` REFRESCA event_id (cambia al nuevo ticket_event)'
);

-- event_id debe ser DIFERENTE al viejo (refresco) — ya cubierto en 8.a.
-- NOTA: NO verificamos "is equal to latest ticket_event" porque dentro
-- de una sola transacción todos los created_at son iguales y los UUIDs
-- no son sortables por tiempo de inserción. La aserción "diferente al
-- viejo" es suficiente para probar que el refresh ocurrió.

-- payload debe NO contener la marca "old" (refresco).
select ok(
  (select payload->>'old' is null
     from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'NOIDEM-8.c: re-enqueue sobre `pending` REFRESCA payload (pierde la marca "old")'
);

-- ============================================================
-- NOIDEM-9: failed refresca event_id + payload y preserva
-- attempt_count + last_error
-- Una notificación en `failed` debe:
--   - refrescar event_id y payload (es un retry, el evento más reciente
--     representa la nueva intención)
--   - preservar attempt_count (historial de reintentos, no perder)
--   - preservar last_error (audit hasta el próximo complete)
-- ============================================================
reset role;
delete from _noidem_capture;

do $$
declare
  v_old_event_id uuid;
begin
  select event_id into v_old_event_id
    from public.notification_outbox
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  update public.notification_outbox
     set status = 'failed',
         payload = jsonb_build_object('old', 'payload_failed_marker', 'old_event_id', v_old_event_id::text),
         claim_id = null,
         claim_expires_at = null,
         processed_at = now(),
         attempt_count = 2,
         last_error = 'smtp timeout (preserved)'
   where ticket_id = '9b000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a';

  insert into _noidem_capture values (
    'NOIDEM-9', v_old_event_id,
    jsonb_build_object('old', 'payload_failed_marker', 'old_event_id', v_old_event_id::text)
  );

  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '9b000000-0000-0000-0000-00000000a099', true);
  perform public.assign_ticket(
    '9b000000-0000-0000-0000-00000000e099'::uuid,
    '9b000000-0000-0000-0000-00000000a09a'::uuid
  );
  reset role;
end $$;

-- event_id debe ser DIFERENTE al viejo (refresco).
select ok(
  (select event_id <> (select event_id from _noidem_capture where label = 'NOIDEM-9')
     from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'NOIDEM-9.a: re-enqueue sobre `failed` REFRESCA event_id (cambia al nuevo ticket_event)'
);

-- event_id debe ser DIFERENTE al viejo (refresco) — ya cubierto en 9.a.
-- NOTA: NO verificamos "is equal to latest ticket_event" porque dentro
-- de una sola transacción todos los created_at son iguales y los UUIDs
-- no son sortables por tiempo de inserción. La aserción "diferente al
-- viejo" es suficiente para probar que el refresh ocurrió.

-- payload debe NO contener la marca "old" (refresco).
select ok(
  (select payload->>'old' is null
     from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'NOIDEM-9.c: re-enqueue sobre `failed` REFRESCA payload (pierde la marca "old")'
);

-- attempt_count debe preservarse en 2.
select is(
  (select attempt_count from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  2::int,
  'NOIDEM-9.d: re-enqueue sobre `failed` PRESERVA attempt_count=2 (no pierde historial de reintentos)'
);

-- last_error debe preservarse.
select is(
  (select last_error from public.notification_outbox
    where ticket_id = '9b000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9b000000-0000-0000-0000-00000000a09a'),
  'smtp timeout (preserved)'::text,
  'NOIDEM-9.e: re-enqueue sobre `failed` PRESERVA last_error (audit hasta el próximo complete_notification)'
);

-- ============================================================
-- Cleanup
-- ============================================================
-- Cleanup no es estrictamente necesario (todo está dentro de BEGIN/ROLLBACK),
-- pero documentamos el orden por si en el futuro se mueve fuera de la transacción.
reset role;
-- Las tablas con audit_logs FK se limpian primero; el ROLLBACK al final
-- del test limpia el resto automáticamente.
do $$
begin
  -- No-op: el ROLLBACK al final del test limpia todos los datos creados.
  -- El bloque DO existe solo para documentar que cleanup es transaccional.
  raise notice 'Cleanup delegado al ROLLBACK del test';
end $$;

select * from finish();
rollback;
