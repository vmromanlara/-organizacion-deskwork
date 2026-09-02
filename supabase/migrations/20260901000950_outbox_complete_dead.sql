-- DeskWork Ticketing Core / TKT-026 Phase 2A-2.
-- Reemplazo de `complete_notification` con:
--   1) Aceptación del estado terminal `dead` (F-2 / 2A-1).
--   2) Hard-coded retry cap = 5 (F-5: el cap es ley, no parámetro).
--   3) Restricción de EXECUTE a `service_role` solamente (F-1: P0 security).
--
-- CAMBIOS DE CONTRATO (firmas idénticas, semántica ampliada):
--   Entrada: complete_notification(p_notification_id, p_claim_id, p_status, p_error)
--   `p_status` ahora acepta: 'sent' | 'failed' | 'dead'.
--   `p_status='failed'` con nuevo attempt_count >= 5 → transición a 'dead'.
--   `p_status='dead'` explícito → estado 'dead' (admite override administrativo).
--
-- CAMBIOS DE PRIVILEGIO (F-1 — P0):
--   ANTES: `authenticated` tenía EXECUTE sobre claim_pending_notifications
--          y complete_notification. Funciones SECURITY DEFINER ejecutan como
--          `postgres`, BYPASSRLS, sin auth.uid() ni tenant check. Cualquier
--          logged-in user podía claim/complete notificaciones de cualquier
--          tenant. Verificado vía pg_proc.proacl en la DB live.
--   AHORA: `authenticated` NO tiene EXECUTE. Solo `service_role` puede
--          invocar estas funciones. Defense in depth: el worker (Edge Function)
--          usa service_role key, que es la única identidad autorizada.
--
-- NO SE MODIFICAN:
--   * La firma de la función (sigue siendo `(uuid, uuid, text, text)`).
--   * El comportamiento de `claim_pending_notifications`.
--   * El comportamiento de `enqueue_ticket_notifications` (eso es 2A-3).
--   * La tabla `notification_outbox` ni sus índices.
--   * El trigger `ticket_events_after_insert_notify`.
--   * La RLS policy.
--
-- Defense in depth adicional:
--   * DROP explícito de CUALQUIER overload previo de complete_notification
--     con la firma `(uuid, uuid, text, text)` para garantizar que solo
--     exista esta versión.
--   * `grant execute` final solo a `service_role` (re-confirma).
--   * Comentario de tabla y función actualizados para documentar
--     el cambio de privilege y el cap hard-coded.
--
-- Rollback strategy:
--   1) Re-aplicar la versión previa de `complete_notification` (obtenida
--      de `git log` o del tag 00900/00920 — son las 3 revisiones del
--      cuerpo, todas equivalentes en su efecto).
--   2) Re-otorgar EXECUTE a `authenticated` con `grant execute ... to
--      authenticated;`.
--   3) NO intentar eliminar `dead` del enum (no soportado por PG).
--   4) Verificar DEAD-08/DEAD-09 pgTAP tests pasan después del rollback.

set search_path = public, auth;

-- =====================================================================
-- 1) F-1 — Privileges: revoke from authenticated, grant to service_role
-- =====================================================================
-- Aplica tanto a claim_pending_notifications como a complete_notification.
-- El trigger `ticket_events_after_insert_notify` llama a
-- enqueue_ticket_notifications que mantiene su grant (no se toca aquí).

revoke execute on function public.claim_pending_notifications(int, int) from authenticated;
revoke execute on function public.complete_notification(uuid, uuid, text, text) from authenticated;

-- Defense: grants explícitos solo a service_role.
grant execute on function public.claim_pending_notifications(int, int) to service_role;
grant execute on function public.complete_notification(uuid, uuid, text, text) to service_role;

-- Defense adicional: grants redundantes a postgres (owner) para
-- llamadas internas del trigger si las hubiera.
grant execute on function public.claim_pending_notifications(int, int) to postgres;
grant execute on function public.complete_notification(uuid, uuid, text, text) to postgres;

-- =====================================================================
-- 2) Defense: eliminar cualquier overload previo de complete_notification
--    con la firma objetivo para evitar ambigüedad.
-- =====================================================================
-- PostgreSQL permite múltiples funciones con el mismo nombre y firmas
-- diferentes (overloading). Si existiera un overload con la firma
-- (uuid, uuid, text, text) Y firma diferente (e.g., con p_max_attempts),
-- CREATE OR REPLACE crearía un nuevo overload, no reemplazaría. Para
-- garantizar que solo exista esta versión, eliminamos explícitamente
-- el overload con la firma objetivo antes de CREATE.
drop function if exists public.complete_notification(uuid, uuid, text, text);

-- =====================================================================
-- 3) F-2 + F-5 — Reemplazar complete_notification
-- =====================================================================
create function public.complete_notification(
  p_notification_id uuid,
  p_claim_id        uuid,
  p_status          text,
  p_error           text default null
) returns public.notification_outbox
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row          public.notification_outbox;
  v_max_attempts constant int := 5;     -- F-5: hard-coded, source of truth
  v_new_attempt  int;
  v_new_status   public.notification_status;
begin
  ------------------------------------------------------------------------
  -- Validación de entrada
  ------------------------------------------------------------------------
  if p_status not in ('sent', 'failed', 'dead') then
    raise exception 'p_status must be sent, failed, or dead' using errcode = 'P0001';
  end if;

  ------------------------------------------------------------------------
  -- Lock pesimista + validaciones de claim/state
  ------------------------------------------------------------------------
  select * into v_row
    from public.notification_outbox
   where id = p_notification_id
   for update;
  if not found then
    raise exception 'notification not found' using errcode = 'P0002';
  end if;
  if v_row.claim_id is distinct from p_claim_id then
    raise exception 'claim_id mismatch' using errcode = '42501';
  end if;
  if v_row.status <> 'processing' then
    raise exception 'notification is not in processing state' using errcode = 'P0001';
  end if;

  ------------------------------------------------------------------------
  -- Cálculo de nuevo attempt_count y nuevo status
  ------------------------------------------------------------------------
  v_new_attempt := v_row.attempt_count
                 + case when p_status in ('failed', 'dead') then 1 else 0 end;

  -- sent   → 'sent'    (terminal)
  -- dead   → 'dead'    (terminal, explícito o automático al alcanzar cap)
  -- failed → 'failed'  si aún hay retries; 'dead' si new_attempt >= 5
  v_new_status := case
    when p_status = 'sent' then 'sent'::public.notification_status
    when p_status = 'dead' then 'dead'::public.notification_status
    when p_status = 'failed' and v_new_attempt >= v_max_attempts
      then 'dead'::public.notification_status
    else 'failed'::public.notification_status
  end;

  ------------------------------------------------------------------------
  -- Update: limpia claim/lease, actualiza status/error, gestiona backoff
  ------------------------------------------------------------------------
  update public.notification_outbox
     set status = v_new_status,
         processed_at = now(),
         last_error = p_error,
         claim_id = null,
         claim_expires_at = null,
         attempt_count = v_new_attempt,
         -- Backoff SOLO para `failed`. sent/dead dejan available_at intacto:
         --   * sent: el cliente ya vio el email; no re-enviar.
         --   * dead: estado terminal; no re-intentar.
         available_at = case
           when v_new_status = 'failed'
             then now() + (interval '30 seconds' * v_new_attempt)
           else v_row.available_at
         end
   where id = p_notification_id
   returning * into v_row;

  return v_row;
end;
$$;

-- Defense: re-grant a service_role (idempotente) tras el CREATE.
-- CREATE FUNCTION no preserva grants previos si la firma cambia.
-- Además: CREATE FUNCTION otorga EXECUTE a PUBLIC por default. Es
-- OBLIGATORIO revocar de PUBLIC para que el grant explícito a
-- service_role sea el único camino.
revoke all on function public.complete_notification(uuid, uuid, text, text) from public;
grant execute on function public.complete_notification(uuid, uuid, text, text) to service_role;
grant execute on function public.complete_notification(uuid, uuid, text, text) to postgres;

-- =====================================================================
-- 4) Comentarios actualizados
-- =====================================================================
comment on function public.complete_notification(uuid, uuid, text, text) is
  'TKT-019 / TKT-026 Phase 2A-2: cierra una notificación reclamada. Estados válidos: ''sent'', ''failed'', ''dead''. Cap de intentos hard-coded en 5 (v_max_attempts constant). Si p_status=''failed'' y el nuevo attempt_count alcanza 5, transición automática a ''dead'' (estado terminal). Backoff lineal 30s * new_attempt_count solo si status=''failed''; sent/dead dejan available_at intacto. EXECUTE restringido a service_role (F-1). Forward-only: el valor ''dead'' del enum no puede removerse en PG17.';

comment on function public.claim_pending_notifications(int, int) is
  'TKT-019 / TKT-026 Phase 2A-2: dispatcher-side. Reclama hasta N notificaciones pendientes (o con lease expirado) marcándolas ''processing'' con claim_id. NO reclama filas en estado ''dead'' (el WHERE filtra por status=''pending'' o ''processing'' con lease expirado). El claim_id se usa luego en complete_notification para validar que el mismo worker está cerrando la fila. EXECUTE restringido a service_role (F-1).';

comment on table public.notification_outbox is
  'Outbox persistente de notificaciones. TKT-019 / TKT-026 Phase 2A-2. Mutaciones exclusivas vía funciones SECURITY DEFINER (enqueue, claim, complete) ejecutadas con EXECUTE restringido a service_role (F-1 — cualquier logged-in user ya NO puede invocar claim/complete). Estado: pending -> processing -> (sent | failed) y failed -> dead (tras 5 intentos, hard-coded). Idempotencia por UNIQUE (ticket_id, notification_type, recipient_user_id). UPSERT seguro preserva sent/processing/dead. En dead NO se re-enqueue automáticamente. dead es terminal y requiere intervención administrativa para re-intentar.';
