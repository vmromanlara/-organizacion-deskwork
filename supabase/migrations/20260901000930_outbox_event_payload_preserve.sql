-- DeskWork Ticketing Core / FINDING-DEFECT-001-E / CORRECTION.
-- Cierre de la discrepancia entre la semántica declarada y el SQL efectivo
-- en la migration 20260901000920.
--
-- Defecto residual:
--   La migration 20260901000920 introdujo CASE expressions en
--   status/attempt_count/claim_id/claim_expires_at/available_at/processed_at/last_error,
--   pero dejó `event_id` y `payload` con asignación INCONDICIONAL:
--
--     set event_id = excluded.event_id,
--         payload = excluded.payload,
--
--   Esto significa que, en la práctica, re-encolar sobre una fila
--   `processing` o `sent` SÍ refrescaba `event_id` y `payload`,
--   contradiciendo la semántica declarada en la matriz de estados
--   ("processing preserve event_id/payload", "sent preserve event_id/payload").
--
-- Corrección:
--   Reemplazar la asignación incondicional por CASE expressions que
--   respetan exactamente la matriz:
--
--     previous_state | event_id  | payload
--     ---------------+-----------+--------
--     pending        | REFRESH   | REFRESH
--     processing     | PRESERVE  | PRESERVE
--     sent           | PRESERVE  | PRESERVE
--     failed         | REFRESH   | REFRESH
--
-- Implementación:
--   Reemplazar la función `enqueue_ticket_notifications` con la versión
--   corregida, en sus DOS ramas (assigned + state_changed->RESUELTO).
--
-- Defense in depth:
--   1) NO se modifica retroactivamente la migration 20260901000920.
--      Esta migration es estrictamente incremental.
--   2) NO se altera la signature ni el return type.
--   3) NO se altera RLS ni la UNIQUE constraint.
--   4) NO se alteran claim_pending_notifications ni complete_notification.
--   5) NO se altera el contrato de RETURNING (xmax=0)::int: el UPDATE
--      SIEMPRE se ejecuta (sin WHERE) para que RETURNING se evalúe.
--      Los CASE expressions son no-op en el path de filas nuevas (INSERT)
--      porque `excluded.event_id` y `excluded.payload` se usan
--      condicionalmente, pero cuando el path es UPDATE puro el
--      `excluded.*` corresponde al row que se intentó insertar (el
--      mismo evento que está re-encolando), por lo que la decisión
--      "refresh vs preserve" se basa en `notification_outbox.*` (la
--      fila existente), no en `excluded.*`.
--
-- Consecuencia sobre el contrato (xmax=0)::int:
--   - INSERT puro: xmax=0 -> 1 (sin cambio)
--   - UPDATE via conflict: xmax != 0 -> 0 (sin cambio)
--   El CASE no altera xmax, sólo los valores. Contrato preservado.

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
        -- y de identidad lógica, incluido event_id y payload.
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
          set -- event_id: refresh para pending/failed, preserve para processing/sent
              event_id = case
                when notification_outbox.status in ('processing', 'sent')
                  then notification_outbox.event_id
                else excluded.event_id
              end,
              -- payload: refresh para pending/failed, preserve para processing/sent
              payload = case
                when notification_outbox.status in ('processing', 'sent')
                  then notification_outbox.payload
                else excluded.payload
              end,
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
          set event_id = case
                when notification_outbox.status in ('processing', 'sent')
                  then notification_outbox.event_id
                else excluded.event_id
              end,
              payload = case
                when notification_outbox.status in ('processing', 'sent')
                  then notification_outbox.payload
                else excluded.payload
              end,
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

-- Mantener grants consistentes.
revoke all on function public.enqueue_ticket_notifications(uuid) from public;
grant execute on function public.enqueue_ticket_notifications(uuid) to authenticated;

-- Comentarios de función y tabla actualizados para reflejar el SQL FINAL
-- (post-corrección), incluyendo la semántica de event_id y payload.
comment on function public.enqueue_ticket_notifications(uuid) is
  'TKT-019 / DEFECT-UAT-001 / FINDING-DEFECT-001-E / CORRECTION-2026-09-01: encola una notificación pendiente derivada de un ticket_event. Idempotente vía UNIQUE (ticket_id, notification_type, recipient_user_id). El DO UPDATE usa CASE expressions en TODAS las columnas, incluyendo event_id y payload. Política: pending y failed refrescan event_id+payload (retry/re-asign con nuevo evento); processing y sent preservan event_id+payload (no tocar la fila del worker o ya entregada). Adicionalmente: nunca re-queua una notificación `sent`, nunca destruye un lease `processing`, preserva attempt_count y last_error en re-intentos post-failed. Contrato de retorno preservado: 1 = nueva fila (INSERT puro), 0 = no-op (UPDATE vía conflict).';

comment on table public.notification_outbox is
  'Outbox persistente de notificaciones. TKT-019 / DEFECT-UAT-001 / FINDING-DEFECT-001-E / CORRECTION-2026-09-01. Mutaciones exclusivas vía funciones SECURITY DEFINER (enqueue, claim, complete). Estado: pending -> processing -> (sent | failed). Idempotencia por UNIQUE (ticket_id, notification_type, recipient_user_id). UPSERT seguro: el DO UPDATE preserva event_id, payload y todo el estado operacional de filas en `processing` y `sent` (no re-envía, no destruye leases, no contamina la evidencia de envío). Para `pending` y `failed` refresca event_id+payload preservando attempt_count y last_error (en failed).';

-- ============================================================
-- down_migration (referencia; NO se aplica automáticamente)
-- ============================================================
-- Para revertir manualmente:
--   Restaurar la versión de la migration 20260901000920 con
--   event_id = excluded.event_id, payload = excluded.payload sin CASE.
--   git show <sha>:supabase/migrations/20260901000920_outbox_do_update_safe.sql
--   recupera el cuerpo exacto.
