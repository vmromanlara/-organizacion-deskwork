-- DeskWork Ticketing Core / TKT-026 Phase 2A-3.
-- Extensión de `enqueue_ticket_notifications` para preservar el estado
-- terminal `dead` en la rama UPSERT (F-2 / 2A-1 / PO).
--
-- Decisión de diseño (alineada con la autorización PO):
--   Un registro `dead` representa un fallo terminal tras agotar los
--   5 intentos (hard-coded en `complete_notification` 2A-2). El re-enqueue
--   automático NO debe resucitarlo:
--
--     pending  → se re-enqueua (preserva attempt_count, refresca event/payload).
--     failed   → reintento vía UPSERT (status=pending, attempt+last_error preservados).
--     sent     → preservado (no re-enviar).
--     processing → preservado (no molestar al worker en lease).
--     dead     → preservado (terminal, sin re-enqueue automático).
--
-- Cambios vs 20260901000930 (corrección previa):
--   * status: añadir 'dead' al set de preservación.
--   * attempt_count: añadir 'dead' al set de preservación.
--   * event_id: añadir 'dead' al set de preservación.
--   * payload: añadir 'dead' al set de preservación.
--   * available_at: añadir 'dead' al set de preservación (terminal, no re-attempt).
--   * processed_at: añadir 'dead' al set de preservación.
--   * last_error: añadir 'dead' al set de preservación (preservar la causa final).
--   * claim_id / claim_expires_at: dead ya tiene null por transición previa;
--     la rama existente (status='processing' → preserve, else null) sigue
--     produciendo null para dead. NO requiere cambio.
--
-- NO se reabre `dead` a `pending` bajo ninguna condición.
--
-- NO se modifican:
--   * `claim_pending_notifications` (cubierto en 2A-2 privilege fix).
--   * `complete_notification` (cubierto en 2A-2).
--   * El enum (cubierto en 2A-1).
--   * El trigger `ticket_events_after_insert_notify`.
--   * La tabla `notification_outbox` ni la constraint UNIQUE.
--   * Las migrations previas 00920, 00930 (forward-only).
--
-- Defense in depth:
--   * Las columnas inalteradas de la fila (`tenant_id`, `ticket_id`,
--     `recipient_user_id`, `recipient_email_snapshot`) jamás se
--     modifican en el UPSERT — solo se mantienen en el INSERT inicial.
--   * El `notification_outbox.id` (PK) jamás se reasigna — la rama
--     DO UPDATE actualiza la fila existente, nunca inserta un duplicado.
--   * `RETURNING (xmax = 0)::int` preserva el contrato del TKT-019:
--     1 = INSERT puro, 0 = UPDATE vía conflict.
--
-- Rollback strategy:
--   Re-aplicar la versión previa de `enqueue_ticket_notifications`
--   (la del 20260901000930) desde `git log`. La rama UPSERT vuelve
--   a la semántica pre-dead: dead se trataría como failed o pending.
--   NO intentar remover `dead` del enum (PG17 no soporta DROP VALUE).

set search_path = public, auth;

create or replace function public.enqueue_ticket_notifications(p_event_id uuid)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event       public.ticket_events;
  v_ticket      public.tickets;
  v_assignee    uuid;
  v_requester   uuid;
  v_email       text;
  v_inserted    int := 0;
  v_updated     int := 0;
begin
  -- 1) Cargar el evento.
  select * into v_event
    from public.ticket_events
   where id = p_event_id;
  if not found then
    return 0;
  end if;

  -- 2) Cargar el ticket asociado.
  select * into v_ticket
    from public.tickets
   where id = v_event.ticket_id;
  if not found then
    return 0;
  end if;

  -- 3) Mapear evento -> destinatario(s) según el contrato vigente.
  if v_event.event_type = 'assigned' then
    v_assignee := coalesce(
      (v_event.metadata->>'assignee_id')::uuid,
      v_ticket.assigned_to
    );
    if v_assignee is not null then
      select email into v_email from auth.users where id = v_assignee;
      if v_email is not null then
        -- DO UPDATE con CASE expressions en TODAS las columnas operacionales
        -- y de identidad lógica. 2A-3: añadir 'dead' a todos los sets de
        -- preservación. dead es terminal; ningún UPSERT automático puede
        -- resucitarlo a 'pending'.
        insert into public.notification_outbox (
          tenant_id, ticket_id, event_id, notification_type,
          recipient_user_id, recipient_email_snapshot, payload
        ) values (
          v_event.tenant_id, v_event.ticket_id, v_event.id,
          'ticket.assigned', v_assignee, v_email,
          jsonb_build_object(
            'ticket_title', v_ticket.title,
            'ticket_id', v_ticket.id,
            'assigned_by', v_event.actor_id
          )
        )
        on conflict (ticket_id, notification_type, recipient_user_id) do update
          set -- event_id: refresh para pending/failed, preserve para processing/sent/dead
              event_id = case
                when notification_outbox.status in ('processing', 'sent', 'dead')
                  then notification_outbox.event_id
                else excluded.event_id
              end,
              -- payload: refresh para pending/failed, preserve para processing/sent/dead
              payload = case
                when notification_outbox.status in ('processing', 'sent', 'dead')
                  then notification_outbox.payload
                else excluded.payload
              end,
              -- status: preserve sent/processing/dead, else 'pending'
              status = case
                when notification_outbox.status in ('sent', 'processing', 'dead')
                  then notification_outbox.status
                else 'pending'::public.notification_status
              end,
              -- attempt_count: preserve processing/sent/failed/dead, else 0
              attempt_count = case
                when notification_outbox.status in ('sent', 'processing', 'failed', 'dead')
                  then notification_outbox.attempt_count
                else 0
              end,
              -- claim_id: preserve only if processing
              claim_id = case
                when notification_outbox.status = 'processing'
                  then notification_outbox.claim_id
                else null
              end,
              -- claim_expires_at: preserve only if processing
              claim_expires_at = case
                when notification_outbox.status = 'processing'
                  then notification_outbox.claim_expires_at
                else null
              end,
              -- available_at: now() for re-enqueue, preserve sent/processing/dead
              available_at = case
                when notification_outbox.status in ('sent', 'processing', 'dead')
                  then notification_outbox.available_at
                else now()
              end,
              -- processed_at: preserve sent/processing/dead, else null
              processed_at = case
                when notification_outbox.status in ('sent', 'processing', 'dead')
                  then notification_outbox.processed_at
                else null
              end,
              -- last_error: preserve processing/failed/dead, else null
              last_error = case
                when notification_outbox.status in ('processing', 'failed', 'dead')
                  then notification_outbox.last_error
                else null
              end
        returning (xmax = 0)::int into v_inserted;
        v_updated := v_inserted;
      end if;
    end if;

  elsif v_event.event_type = 'state_changed' and v_event.to_state = 'RESUELTO' then
    v_requester := v_ticket.requester_id;
    if v_requester is not null then
      select email into v_email from auth.users where id = v_requester;
      if v_email is not null then
        insert into public.notification_outbox (
          tenant_id, ticket_id, event_id, notification_type,
          recipient_user_id, recipient_email_snapshot, payload
        ) values (
          v_event.tenant_id, v_event.ticket_id, v_event.id,
          'ticket.state_changed_to_resolved', v_requester, v_email,
          jsonb_build_object(
            'ticket_title', v_ticket.title,
            'ticket_id', v_ticket.id,
            'from_state', v_event.from_state,
            'to_state', v_event.to_state
          )
        )
        on conflict (ticket_id, notification_type, recipient_user_id) do update
          set event_id = case
                when notification_outbox.status in ('processing', 'sent', 'dead')
                  then notification_outbox.event_id
                else excluded.event_id
              end,
              payload = case
                when notification_outbox.status in ('processing', 'sent', 'dead')
                  then notification_outbox.payload
                else excluded.payload
              end,
              status = case
                when notification_outbox.status in ('sent', 'processing', 'dead')
                  then notification_outbox.status
                else 'pending'::public.notification_status
              end,
              attempt_count = case
                when notification_outbox.status in ('sent', 'processing', 'failed', 'dead')
                  then notification_outbox.attempt_count
                else 0
              end,
              claim_id = case
                when notification_outbox.status = 'processing'
                  then notification_outbox.claim_id
                else null
              end,
              claim_expires_at = case
                when notification_outbox.status = 'processing'
                  then notification_outbox.claim_expires_at
                else null
              end,
              available_at = case
                when notification_outbox.status in ('sent', 'processing', 'dead')
                  then notification_outbox.available_at
                else now()
              end,
              processed_at = case
                when notification_outbox.status in ('sent', 'processing', 'dead')
                  then notification_outbox.processed_at
                else null
              end,
              last_error = case
                when notification_outbox.status in ('processing', 'failed', 'dead')
                  then notification_outbox.last_error
                else null
              end
        returning (xmax = 0)::int into v_inserted;
        v_updated := v_inserted;
      end if;
    end if;
  end if;

  return v_updated;
end;
$$;

-- Mantener grants consistentes con la versión previa.
-- F-1 (2A-2) NO se aplica a enqueue_ticket_notifications — esta función
-- sigue siendo invocable por `authenticated` (necesario para flows de
-- cliente que disparen enqueue explícito) y por el trigger.
revoke all on function public.enqueue_ticket_notifications(uuid) from public;
grant execute on function public.enqueue_ticket_notifications(uuid) to authenticated;
grant execute on function public.enqueue_ticket_notifications(uuid) to postgres;

comment on function public.enqueue_ticket_notifications(uuid) is
  'TKT-019 / TKT-026 Phase 2A-3: encola una notificación pendiente derivada de un ticket_event. Idempotente vía UNIQUE (ticket_id, notification_type, recipient_user_id). El DO UPDATE usa CASE expressions que preservan sent/processing/dead en TODAS las columnas operacionales y de identidad lógica. Política: pending y failed refrescan event_id+payload (retry/re-asign con nuevo evento); processing, sent y dead preservan event_id+payload (no tocar la fila del worker, ya entregada, o terminal). Adicionalmente: nunca re-queua una notificación `sent` o `dead`, nunca destruye un lease `processing`, preserva attempt_count y last_error en re-intentos post-failed. Contrato de retorno preservado: 1 = nueva fila (INSERT puro), 0 = no-op (UPDATE vía conflict).';

comment on table public.notification_outbox is
  'Outbox persistente de notificaciones. TKT-019 / TKT-026 Phase 2A-3. Mutaciones exclusivas vía funciones SECURITY DEFINER (enqueue, claim, complete). claim/complete con EXECUTE restringido a service_role (F-1). Estado: pending -> processing -> (sent | failed) y failed -> dead (tras 5 intentos, hard-coded). Idempotencia por UNIQUE (ticket_id, notification_type, recipient_user_id). UPSERT seguro preserva sent/processing/dead en TODAS las columnas. En dead NO se re-enqueue automáticamente. dead es terminal y requiere intervención administrativa para re-intentar.';
