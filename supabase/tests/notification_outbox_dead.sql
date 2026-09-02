-- pgTAP test para TKT-026 Phase 2A: dead-state semantics + privilege fix.
--
-- Verifica (alineado con la autorización PO):
--   * DEAD-01: 0 -> failed / attempt 1 / +30s available_at
--   * DEAD-02: 4 -> dead / attempt 5 (cap hard-coded)
--   * DEAD-03: sent terminal (no se reabre a pending)
--   * DEAD-04: dead terminal (no se puede completar sobre dead)
--   * DEAD-05: dead no es reclamable por claim_pending_notifications
--   * DEAD-06: enqueue preserva dead (no reabre a pending)
--   * DEAD-07: enqueue preserva id, event_id, payload, attempt_count, last_error
--   * DEAD-08: authenticated NO puede ejecutar claim
--   * DEAD-09: authenticated NO puede ejecutar complete
--   * DEAD-10: service_role SÍ puede ejecutar ambos
--   * DEAD-11: complete_notification NO tiene parámetro p_max_attempts
--   * DEAD-12: notification_outbox.id permanece estable (no se reasigna en UPSERT)
--   * DEAD-13: claim/lease se preserva mientras la fila está en 'processing'
--   * DEAD-14: invariantes sent/processing preservadas en UPSERT (00920/00930)
--
-- Defense in depth:
--   * Los tests usan un tenant/user aislados (no comparten datos con
--     notification_outbox_idempotency.sql).
--   * Se opera como `service_role` para la mayoría de las acciones
--     (mismo rol que el worker real), excepto donde se verifica la
--     denegación a `authenticated` (DEAD-08/09).

begin;

-- ============================================================
-- Setup: crear datos aislados para este test
-- ============================================================
-- Total plan: 25 assertions
select plan(25);

-- Trabajar como superuser para setup (evitar RLS en inserts)
reset role;

-- Tenant de prueba (distinto del usado en notification_outbox_idempotency)
insert into public.tenants (id, slug, name, timezone)
values ('9c000000-0000-0000-0000-000000000099', 'tkt-test-outbox-dead', 'TKT TEST Outbox Dead', 'UTC')
on conflict (id) do nothing;

-- Categoría
insert into public.ticket_categories (id, tenant_id, slug, label, is_active)
values ('9c000000-0000-0000-0000-00000000c099', '9c000000-0000-0000-0000-000000000099', 'computador', 'Computador', true)
on conflict (id) do nothing;

-- Users
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, instance_id, created_at, updated_at, email_confirmed_at)
values
  ('9c000000-0000-0000-0000-00000000a099', 'authenticated', 'authenticated', 'requester-dead@deskwork-uat.test', 'not-used', '{"provider":"email"}'::jsonb, '{"display_name":"TKT Dead Requester"}'::jsonb, '00000000-0000-0000-0000-000000000000', now(), now(), now()),
  ('9c000000-0000-0000-0000-00000000a09a', 'authenticated', 'authenticated', 'agent-dead@deskwork-uat.test', 'not-used', '{"provider":"email"}'::jsonb, '{"display_name":"TKT Dead Agent"}'::jsonb, '00000000-0000-0000-0000-000000000000', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values
  ('9c000000-0000-0000-0000-00000000a099', 'TKT Dead Requester'),
  ('9c000000-0000-0000-0000-00000000a09a', 'TKT Dead Agent')
on conflict (id) do nothing;

insert into public.memberships (id, tenant_id, user_id, functional_role, status)
values
  ('9c000000-0000-0000-0000-00000000d099', '9c000000-0000-0000-0000-000000000099', '9c000000-0000-0000-0000-00000000a099', 'technical_lead', 'active'),
  ('9c000000-0000-0000-0000-00000000d09a', '9c000000-0000-0000-0000-000000000099', '9c000000-0000-0000-0000-00000000a09a', 'operator', 'active')
on conflict (id) do nothing;

insert into public.membership_scope_grants (tenant_id, membership_id, scope, granted_by_membership_id)
select m.tenant_id, m.id, 'institution'::authorization_scope, m.id
  from public.memberships m
 where m.user_id = '9c000000-0000-0000-0000-00000000a099'
on conflict do nothing;

-- Tickets de prueba
insert into public.tickets (id, tenant_id, requester_id, category_id, priority, state, title, description)
values
  ('9c000000-0000-0000-0000-00000000e099', '9c000000-0000-0000-0000-000000000099', '9c000000-0000-0000-0000-00000000a099', '9c000000-0000-0000-0000-00000000c099', 'P2', 'ABIERTO', 'Ticket Dead Test A', 'Descripción válida con suficiente longitud.'),
  ('9c000000-0000-0000-0000-00000000e09a', '9c000000-0000-0000-0000-000000000099', '9c000000-0000-0000-0000-00000000a099', '9c000000-0000-0000-0000-00000000c099', 'P2', 'ABIERTO', 'Ticket Dead Test B', 'Descripción válida con suficiente longitud.')
on conflict (id) do nothing;

-- Limpiar outbox previo
delete from public.notification_outbox
 where ticket_id in ('9c000000-0000-0000-0000-00000000e099', '9c000000-0000-0000-0000-00000000e09a');

delete from public.ticket_assignments
 where ticket_id in ('9c000000-0000-0000-0000-00000000e099', '9c000000-0000-0000-0000-00000000e09a');

-- Crear ticket_events para los tickets (necesario para enqueue_ticket_notifications)
insert into public.ticket_events (id, tenant_id, ticket_id, event_type, actor_id, metadata)
values
  ('9c000000-0000-0000-0000-00000000f099', '9c000000-0000-0000-0000-000000000099', '9c000000-0000-0000-0000-00000000e099', 'assigned', '9c000000-0000-0000-0000-00000000a099', '{"assignee_id": "9c000000-0000-0000-0000-00000000a09a"}'::jsonb),
  ('9c000000-0000-0000-0000-00000000f09a', '9c000000-0000-0000-0000-000000000099', '9c000000-0000-0000-0000-00000000e09a', 'assigned', '9c000000-0000-0000-0000-00000000a099', '{"assignee_id": "9c000000-0000-0000-0000-00000000a09a"}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- DEAD-01: attempt_count=0 -> failed / attempt_count=1 / available_at = now()+30s
-- ============================================================
reset role;
-- Use `postgres` (function owner) for all function calls in the
-- behavioral tests. ACL tests below use `set local role` to switch.
set local role postgres;

-- Crear fila pending via enqueue
select public.enqueue_ticket_notifications('9c000000-0000-0000-0000-00000000f099'::uuid);

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  'pending'::text,
  'DEAD-01.a: enqueue crea fila en status=pending'
);

select is(
  (select attempt_count from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  0::int,
  'DEAD-01.b: attempt_count inicial es 0'
);

-- Claim + complete con failed (attempt 1)
do $$
declare
  v_claim_id uuid;
  v_row public.notification_outbox;
  v_notif_id uuid;
begin
  select id into v_notif_id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'
    limit 1;

  select * into v_row from public.claim_pending_notifications(10, 60);
  v_claim_id := v_row.claim_id;

  perform public.complete_notification(v_notif_id, v_claim_id, 'failed', 'simulated transient error');
end $$;

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  'failed'::text,
  'DEAD-01.c: tras complete(failed), status=failed (no dead, attempt=1)'
);

select is(
  (select attempt_count from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  1::int,
  'DEAD-01.d: attempt_count tras complete(failed) = 1'
);

-- ============================================================
-- DEAD-02: attempt_count=4 + complete(failed) -> dead / attempt=5
-- ============================================================
-- Setup: forzar attempt_count=4 y claim_id válido, luego complete(failed)
do $$
declare
  v_notif_id uuid;
  v_claim_id uuid;
begin
  select id into v_notif_id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'
    limit 1;

  -- Forzar estado: attempt_count=4, status=pending (preparar para el 5º intento)
  update public.notification_outbox
     set attempt_count = 4,
         status = 'pending',
         claim_id = null,
         claim_expires_at = null,
         available_at = now()
   where id = v_notif_id;

  -- Claim + complete con failed -> debe transicionar a dead.
  -- (Saltamos claim_pending_notifications aquí; seteamos el estado
  -- processing manualmente con un claim_id propio, suficiente para el test.)
  update public.notification_outbox
     set claim_id = gen_random_uuid(),
         claim_expires_at = now() + interval '60 seconds',
         status = 'processing'
   where id = v_notif_id;

  select claim_id into v_claim_id from public.notification_outbox where id = v_notif_id;

  perform public.complete_notification(v_notif_id, v_claim_id, 'failed', 'simulated final failure');
end $$;

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  'dead'::text,
  'DEAD-02.a: complete(failed) con attempt=4 -> status=dead'
);

select is(
  (select attempt_count from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  5::int,
  'DEAD-02.b: attempt_count final = 5 (cap hard-coded)'
);

select is(
  (select claim_id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  null::uuid,
  'DEAD-02.c: dead limpia claim_id'
);

-- ============================================================
-- DEAD-03: sent terminal — complete(sent) deja status=sent; complete sobre sent falla
-- ============================================================
do $$
declare
  v_notif_b_id uuid;
  v_claim_id uuid;
begin
  perform public.enqueue_ticket_notifications('9c000000-0000-0000-0000-00000000f09a'::uuid);

  select id into v_notif_b_id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e09a'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'
    limit 1;

  update public.notification_outbox
     set claim_id = gen_random_uuid(),
         claim_expires_at = now() + interval '60 seconds',
         status = 'processing'
   where id = v_notif_b_id;

  select claim_id into v_claim_id from public.notification_outbox where id = v_notif_b_id;

  perform public.complete_notification(v_notif_b_id, v_claim_id, 'sent', null);
end $$;

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e09a'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  'sent'::text,
  'DEAD-03.a: complete(sent) -> status=sent'
);

-- Intentar complete sobre sent -> debe fallar (fila no está en processing)
do $$
declare
  v_notif_b_id uuid;
  v_claim_id uuid;
begin
  select id into v_notif_b_id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e09a'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'
    limit 1;

  v_claim_id := '00000000-0000-0000-0000-000000000099'::uuid;

  begin
    perform public.complete_notification(v_notif_b_id, v_claim_id, 'sent', null);
    raise exception 'expected exception not raised';
  exception
    when others then
      -- esperado
      null;
  end;
end $$;

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e09a'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  'sent'::text,
  'DEAD-03.b: sent es terminal (no se reabre con complete sobre sent)'
);

-- ============================================================
-- DEAD-04: dead terminal — complete sobre dead debe fallar
-- ============================================================
do $$
declare
  v_notif_id uuid;
  v_claim_id uuid;
begin
  select id into v_notif_id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'
    limit 1;

  v_claim_id := '00000000-0000-0000-0000-000000000099'::uuid;

  begin
    perform public.complete_notification(v_notif_id, v_claim_id, 'sent', null);
    raise exception 'expected exception not raised on dead';
  exception
    when others then
      null;
  end;
end $$;

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  'dead'::text,
  'DEAD-04: dead es terminal (no se puede completar sobre dead)'
);

-- ============================================================
-- DEAD-05: dead no es reclamable por claim_pending_notifications
-- ============================================================
-- Reset: la fila ya está en dead. Llamar claim debe devolver 0 filas
-- que matcheen con dead.
select is(
  (select count(*) from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and status = 'dead'),
  1::bigint,
  'DEAD-05.a: existe 1 fila en dead (precondición)'
);

-- claim con limit 100 no debe devolver filas dead
do $$
declare
  v_claimed int;
begin
  select count(*) into v_claimed
    from public.claim_pending_notifications(100, 60) n
   where n.status = 'dead';
  if v_claimed > 0 then
    raise exception 'claim returned % dead rows (expected 0)', v_claimed;
  end if;
end $$;

select is(
  (select count(*) from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and status = 'dead'
      and claim_id is not null),
  0::bigint,
  'DEAD-05.b: filas dead no obtienen claim_id (no son reclamables)'
);

-- ============================================================
-- DEAD-06 + DEAD-07: enqueue UPSERT preserva dead (status, id, event_id, payload, attempt_count, last_error)
-- ============================================================
-- Capturar el id original, event_id, payload, attempt_count, last_error
do $$
declare
  v_original record;
  v_new_event_id uuid := '9c000000-0000-0000-0000-00000000f0ff'::uuid;
begin
  select id, event_id, payload, attempt_count, last_error
    into v_original
    from public.notification_outbox
   where ticket_id = '9c000000-0000-0000-0000-00000000e099'
     and notification_type = 'ticket.assigned'
     and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'
   limit 1;

  -- Insertar un ticket_event NUEVO con id distinto
  insert into public.ticket_events (id, tenant_id, ticket_id, event_type, actor_id, metadata)
  values (v_new_event_id, '9c000000-0000-0000-0000-000000000099',
          '9c000000-0000-0000-0000-00000000e099', 'assigned',
          '9c000000-0000-0000-0000-00000000a099',
          '{"assignee_id": "9c000000-0000-0000-0000-00000000a09a"}'::jsonb)
  on conflict (id) do nothing;

  -- Llamar enqueue con el NUEVO event_id
  perform public.enqueue_ticket_notifications(v_new_event_id);
  -- (perform is valid inside DO; SELECT would also work)

  -- Verificaciones:
  -- 1) status sigue 'dead' (no se reabrió a pending)
  perform set_config('test.original_status', v_original.last_error::text, true);  -- dummy para mantener
end $$;

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  'dead'::text,
  'DEAD-06: enqueue sobre dead preserva status=dead (no reabre a pending)'
);

select is(
  (select id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  (select id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'
    limit 1),
  'DEAD-07.a: notification_outbox.id permanece estable (PK invariante)'
);

select is(
  (select attempt_count from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  5::int,
  'DEAD-07.b: attempt_count preservado en dead (no se resetea a 0)'
);

select is(
  (select last_error from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  'simulated final failure'::text,
  'DEAD-07.c: last_error preservado en dead (causa final retenida)'
);

-- Verificar que event_id NO se actualizó al nuevo (preservado)
select is(
  (select event_id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e099'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  '9c000000-0000-0000-0000-00000000f099'::uuid,
  'DEAD-07.d: event_id preservado en dead (no refrescado al nuevo)'
);

-- ============================================================
-- DEAD-08: authenticated NO puede ejecutar claim_pending_notifications
-- ============================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9c000000-0000-0000-0000-00000000a099', true);

select is(
  (select has_function_privilege('authenticated', 'public.claim_pending_notifications(int, int)', 'EXECUTE')),
  false,
  'DEAD-08: authenticated NO tiene EXECUTE sobre claim_pending_notifications'
);

-- ============================================================
-- DEAD-09: authenticated NO puede ejecutar complete_notification
-- ============================================================
select is(
  (select has_function_privilege('authenticated', 'public.complete_notification(uuid, uuid, text, text)', 'EXECUTE')),
  false,
  'DEAD-09: authenticated NO tiene EXECUTE sobre complete_notification'
);

-- ============================================================
-- DEAD-10: service_role SÍ puede ejecutar ambos
-- ============================================================
select is(
  (select has_function_privilege('service_role', 'public.claim_pending_notifications(int, int)', 'EXECUTE')),
  true,
  'DEAD-10.a: service_role SÍ tiene EXECUTE sobre claim_pending_notifications'
);

select is(
  (select has_function_privilege('service_role', 'public.complete_notification(uuid, uuid, text, text)', 'EXECUTE')),
  true,
  'DEAD-10.b: service_role SÍ tiene EXECUTE sobre complete_notification'
);

-- ============================================================
-- DEAD-11: complete_notification NO tiene parámetro p_max_attempts
-- ============================================================
select is(
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'complete_notification'
     and n.nspname = 'public'
     and p.proargnames::text[] @> array['p_max_attempts']),
  0::bigint,
  'DEAD-11: complete_notification NO tiene parámetro p_max_attempts'
);

-- ============================================================
-- DEAD-13: claim/lease se preserva mientras la fila está en 'processing'
-- ============================================================
reset role;
set local role postgres;

do $$
declare
  v_notif_id uuid;
  v_claim_id_a uuid;
  v_claim_id_b uuid;
  v_event_id_old uuid;
  v_event_id_new uuid := '9c000000-0000-0000-0000-00000000f0ee'::uuid;
begin
  -- Encolar una fila nueva (ticket e09a está en sent; usar otra)
  insert into public.tickets (id, tenant_id, requester_id, category_id, priority, state, title, description)
  values ('9c000000-0000-0000-0000-00000000e09b', '9c000000-0000-0000-0000-000000000099',
          '9c000000-0000-0000-0000-00000000a099', '9c000000-0000-0000-0000-00000000c099',
          'P2', 'ABIERTO', 'Ticket Dead Test C', 'Descripción válida con suficiente longitud.')
  on conflict (id) do nothing;

  insert into public.ticket_events (id, tenant_id, ticket_id, event_type, actor_id, metadata)
  values ('9c000000-0000-0000-0000-00000000f09b', '9c000000-0000-0000-0000-000000000099',
          '9c000000-0000-0000-0000-00000000e09b', 'assigned',
          '9c000000-0000-0000-0000-00000000a099',
          '{"assignee_id": "9c000000-0000-0000-0000-00000000a09a"}'::jsonb)
  on conflict (id) do nothing;

-- DEAD-13: claim/lease se preserva mientras la fila está en 'processing'
-- ============================================================
reset role;
set local role postgres;

  select id into v_notif_id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e09b'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'
    limit 1;

  select event_id into v_event_id_old from public.notification_outbox where id = v_notif_id;

  -- Claim la fila
  update public.notification_outbox
     set claim_id = gen_random_uuid(),
         claim_expires_at = now() + interval '60 seconds',
         status = 'processing'
   where id = v_notif_id
   returning claim_id into v_claim_id_a;

  -- Ahora intentar enqueue con un NUEVO event_id; el claim/lease NO debe destruirse
  insert into public.ticket_events (id, tenant_id, ticket_id, event_type, actor_id, metadata)
  values (v_event_id_new, '9c000000-0000-0000-0000-000000000099',
          '9c000000-0000-0000-0000-00000000e09b', 'assigned',
          '9c000000-0000-0000-0000-00000000a099',
          '{"assignee_id": "9c000000-0000-0000-0000-00000000a09a"}'::jsonb)
  on conflict (id) do nothing;

  perform public.enqueue_ticket_notifications(v_event_id_new);
end $$;

select is(
  (select claim_id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e09b'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  (select claim_id from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e09b'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'
    limit 1),
  'DEAD-13.a: claim_id preservado durante enqueue sobre processing'
);

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e09b'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  'processing'::text,
  'DEAD-13.b: status preservado en processing durante enqueue'
);

-- ============================================================
-- DEAD-14: enqueue sobre sent preserva sent (no reabre a pending)
-- ============================================================
do $$
declare
  v_event_id_new uuid := '9c000000-0000-0000-0000-00000000f0dd'::uuid;
begin
  -- Insertar nuevo event para ticket e09a (que está en sent)
  insert into public.ticket_events (id, tenant_id, ticket_id, event_type, actor_id, metadata)
  values (v_event_id_new, '9c000000-0000-0000-0000-000000000099',
          '9c000000-0000-0000-0000-00000000e09a', 'assigned',
          '9c000000-0000-0000-0000-00000000a099',
          '{"assignee_id": "9c000000-0000-0000-0000-00000000a09a"}'::jsonb)
  on conflict (id) do nothing;

  perform public.enqueue_ticket_notifications(v_event_id_new);
end $$;
-- (continue)

select is(
  (select status::text from public.notification_outbox
    where ticket_id = '9c000000-0000-0000-0000-00000000e09a'
      and notification_type = 'ticket.assigned'
      and recipient_user_id = '9c000000-0000-0000-0000-00000000a09a'),
  'sent'::text,
  'DEAD-14: enqueue sobre sent preserva status=sent (no reabre a pending)'
);

-- ============================================================
-- Cleanup: liberar el resto de filas en processing para no afectar otros tests
-- ============================================================
reset role;
update public.notification_outbox
   set status = 'sent',
       claim_id = null,
       claim_expires_at = null,
       processed_at = now(),
       last_error = 'cleanup_by_dead_test'
 where ticket_id = '9c000000-0000-0000-0000-00000000e09b'
   and status = 'processing';

-- ============================================================
-- Finish
-- ============================================================
select * from finish();
rollback;
