-- DeskWork Ticketing Core / FINDING-DEFECT-001-E.
-- Idempotencia del outbox: semántica de UPSERT SEGURA que respeta el estado
-- actual de la fila.
--
-- Defecto:
--   La migration 20260901000900 introdujo el ON CONFLICT (ticket_id,
--   notification_type, recipient_user_id) DO UPDATE pero con un SET
--   INCONDICIONAL que sobrescribía TODAS las columnas operacionales,
--   incluyendo:
--     - status  (sent -> pending, processing -> pending)
--     - claim_id / claim_expires_at (lease del worker destruido)
--     - attempt_count (historial de reintentos perdido)
--     - processed_at / last_error (evidencia de envío previo perdida)
--
--   Consecuencias:
--     1) Re-asignar al MISMO assignee después de `sent` re-queua la fila
--        y produce un segundo envío de la misma notificación lógica.
--     2) Re-asignar durante `processing` invalida el lease del worker:
--        complete_notification falla por claim_id mismatch, y la fila
--        queda en `pending` huérfana, re-enviándose por el siguiente
--        worker.
--
-- Corrección:
--   Mantener la identidad lógica (ticket_id, notification_type,
--   recipient_user_id) y la identidad operacional notification_outbox.id.
--   Usar CASE expressions en el SET para preservar el estado cuando
--   la fila está en estado terminal (sent) u operacional (processing).
--
-- Política por estado (NEW):
--
--   previous_state | status    | claim_id | claim_exp | attempt | processed_at | last_error | available_at
--   ---------------+-----------+----------+-----------+---------+--------------+------------+--------------
--   pending        | pending   | null     | null      | 0       | null         | null       | now()
--   processing     | preserve  | preserve | preserve  | preserve| preserve     | preserve   | preserve
--   sent           | preserve  | null     | null      | preserve| preserve     | null       | preserve
--   failed         | pending   | null     | null      | preserve| null         | preserve   | now()
--
-- Decisión de diseño para `failed -> pending`:
--   - status: 'pending' (retry)
--   - attempt_count: PRESERVAR (no perder historial; complete_notification
--     ya incrementa en cada fallo, así que el conteo es acumulativo)
--   - last_error: PRESERVAR (audit, hasta que el próximo intento lo
--     sobreescriba o limpie vía complete_notification)
--   - available_at: now() (retry inmediato)
--
-- Decisión de diseño para `event_id` y `payload`:
--   - event_id: refresh para pending/failed (refleja el evento más
--     reciente que intentó re-encolar). PRESERVAR para processing y
--     sent (no tocar la fila que el worker está usando o ya entregó).
--   - payload: misma política que event_id.
--
-- Contrato de retorno preservado:
--   RETURNING (xmax = 0)::int INTO v_inserted;
--   - 1 = INSERT puro (nueva fila)
--   - 0 = UPDATE via DO UPDATE (fila existía)
--   Como el DO UPDATE SIEMPRE se ejecuta (no usamos WHERE en DO UPDATE
--   para no romper el contrato de RETURNING), xmax siempre != 0 cuando
--   hay conflicto, devolviendo 0. Esto preserva el contrato del
--   TKT-019 original: return 0 = no-op idempotente, return 1 = nueva
--   fila.
--
-- ¿Por qué NO usamos WHERE en el DO UPDATE?
--   PostgreSQL tiene un comportamiento sutil: cuando un ON CONFLICT
--   ... DO UPDATE ... WHERE false no se ejecuta, el RETURNING clause
--   NO se evalúa. Esto rompería el contrato de retorno
--   (v_inserted retendría su valor anterior o sería NULL). Por eso
--   optamos por CASE expressions: el UPDATE se ejecuta siempre, pero
--   los valores quedan inalterados cuando corresponde.
--
-- Defense in depth:
--   1) NO se altera la UNIQUE constraint (sigue siendo
--      (ticket_id, notification_type, recipient_user_id)).
--   2) NO se altera la signature ni el return type de la función.
--   3) NO se altera RLS (defense in depth del aislamiento cross-tenant).
--   4) NO se altera claim_pending_notifications ni complete_notification.
--   5) NO se altera ticket_assignments ni ticket_events.
--   6) Sólo se reemplaza el cuerpo de enqueue_ticket_notifications.

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
        -- Idempotente vía UNIQUE (ticket_id, notification_type, recipient_user_id).
        -- FINDING-DEFECT-001-E fix: el DO UPDATE usa CASE expressions para
        -- preservar el estado operacional (processing) y terminal (sent).
        -- Para estados re-enqueuables (pending, failed) se actualiza el
        -- event_id + payload y se resetea a pending.
        --
        -- (xmax = 0)::int = 1 cuando es INSERT puro, 0 cuando es UPDATE del
        -- conflict. El DO UPDATE SIEMPRE se ejecuta (sin WHERE para no
        -- romper el contrato de RETURNING), preservando así el contrato
        -- de return: 0 = no-op idempotente, 1 = nueva fila.
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
          set event_id = excluded.event_id,
              payload = excluded.payload,
              -- status: preserve sent/processing, else 'pending'
              status = case
                when notification_outbox.status in ('sent', 'processing')
                  then notification_outbox.status
                else 'pending'::public.notification_status
              end,
              -- attempt_count: preserve processing/sent/failed, else 0
              attempt_count = case
                when notification_outbox.status in ('sent', 'processing', 'failed')
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
              -- available_at: now() for re-enqueue, preserve sent/processing
              available_at = case
                when notification_outbox.status in ('sent', 'processing')
                  then notification_outbox.available_at
                else now()
              end,
              -- processed_at: preserve sent/processing, else null
              processed_at = case
                when notification_outbox.status in ('sent', 'processing')
                  then notification_outbox.processed_at
                else null
              end,
              -- last_error: preserve processing/failed, else null
              last_error = case
                when notification_outbox.status in ('processing', 'failed')
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
          set event_id = excluded.event_id,
              payload = excluded.payload,
              status = case
                when notification_outbox.status in ('sent', 'processing')
                  then notification_outbox.status
                else 'pending'::public.notification_status
              end,
              attempt_count = case
                when notification_outbox.status in ('sent', 'processing', 'failed')
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
                when notification_outbox.status in ('sent', 'processing')
                  then notification_outbox.available_at
                else now()
              end,
              processed_at = case
                when notification_outbox.status in ('sent', 'processing')
                  then notification_outbox.processed_at
                else null
              end,
              last_error = case
                when notification_outbox.status in ('processing', 'failed')
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
revoke all on function public.enqueue_ticket_notifications(uuid) from public;
grant execute on function public.enqueue_ticket_notifications(uuid) to authenticated;

comment on function public.enqueue_ticket_notifications(uuid) is
  'TKT-019 / DEFECT-UAT-001 / FINDING-DEFECT-001-E: encola una notificación pendiente derivada de un ticket_event. Idempotente vía UNIQUE (ticket_id, notification_type, recipient_user_id). El DO UPDATE usa CASE expressions para preservar el estado operacional (processing) y terminal (sent) de la fila: nunca re-queua una notificación ya enviada, nunca destruye un lease activo, nunca resetea attempt_count en re-intentos post-fallo. Contrato de retorno preservado: 1 = nueva fila (INSERT puro), 0 = no-op (UPDATE vía conflict).';

-- Actualizar comentario de tabla para reflejar la nueva semántica.
comment on table public.notification_outbox is
  'Outbox persistente de notificaciones. TKT-019 / DEFECT-UAT-001 / FINDING-DEFECT-001-E. Mutaciones exclusivas vía funciones SECURITY DEFINER (enqueue, claim, complete). Estado: pending -> processing -> (sent | failed). Idempotencia por UNIQUE (ticket_id, notification_type, recipient_user_id). UPSERT seguro: el DO UPDATE preserva sent y processing (no re-envía, no destruye leases); pending se actualiza con event_id+payload nuevo; failed vuelve a pending preservando attempt_count y last_error.';

-- ============================================================
-- down_migration (referencia; NO se aplica automáticamente)
-- ============================================================
-- Para revertir manualmente:
--   Restaurar la versión previa de enqueue_ticket_notifications
--   (la del migration 20260901000900, con DO UPDATE incondicional).
--   git log / git show pueden usarse para recuperar el cuerpo exacto.
