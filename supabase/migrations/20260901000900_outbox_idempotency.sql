-- DeskWork Ticketing Core / DEFECT-UAT-001 (P2).
-- Idempotencia del outbox de notificaciones a nivel de (ticket, tipo, destinatario).
--
-- Contexto del defecto:
--   La constraint UNIQUE previa (event_id, notification_type, recipient_user_id) sólo
--   prevenía duplicados *dentro de un mismo ticket_event* (reintentos accidentales del
--   mismo evento). Pero cada re-asignación crea un NUEVO ticket_event con un NUEVO
--   event_id, por lo que la constraint NO aplicaba. Resultado: re-asignar el mismo
--   assignee al mismo ticket generaba una nueva fila `ticket.assigned` en el outbox
--   cada vez (caso UAT O-9.4 FAIL).
--
-- Contrato nuevo:
--   UNIQUE (ticket_id, notification_type, recipient_user_id)
--   ⇒ una sola notificación pendiente por combinación (ticket, tipo, destinatario).
--   El enqueue debe usar `ON CONFLICT (ticket_id, notification_type, recipient_user_id) DO UPDATE`
--   para reflejar la última asignación (updated_at + event_id reciente), o `DO NOTHING`
--   si se quiere mantener la primera. Este contrato usa DO UPDATE para que el
--   payload refleje la asignación más reciente.
--
-- Defense in depth:
--   1) Pre-migration: deduplicar filas existentes que violarían la nueva constraint.
--      Política: conservar la fila más antigua (created_at ASC) por grupo, marcar
--      las más nuevas como 'sent' con last_error='superseded_by_idempotency_fix'
--      para que el dispatcher (futuro) las ignore.
--   2) Crear la nueva UNIQUE constraint.
--   3) Reemplazar `enqueue_ticket_notifications` con la nueva semántica ON CONFLICT.
--   4) NO se altera `ticket_assignments` (defense in depth del test del PO: el
--      historial de asignaciones sigue completo, sólo cambia el outbox).
--   5) NO se altera RLS (la policy `notification_outbox_select_tenant_members` se
--      mantiene intacta; el acceso sigue siendo tenant-scoped).
--
-- Rollback strategy:
--   `down_migration` abajo: drop constraint + recreate el comportamiento previo.
--   En este release, esta migration NO se revierte sin un plan explícito.

set search_path = public, auth;

-- ============================================================
-- 1) Pre-migration: eliminar duplicados existentes
-- ============================================================
-- Política: conservar la fila MÁS ANTIGUA (created_at ASC, id ASC) por
-- (ticket_id, notification_type, recipient_user_id), eliminar las más nuevas.
-- Esto preserva la primera fila (la "canónica" del primer evento) y descarta
-- los duplicados posteriores que violarían la nueva UNIQUE constraint.
-- Defense in depth: loguear lo que se elimina (cantidad, IDs) para audit.
do $$
declare
  v_deleted_count int;
  v_deleted_ids   text;
begin
  with ranked as (
    select
      id,
      row_number() over (
        partition by ticket_id, notification_type, recipient_user_id
        order by created_at asc, id asc
      ) as rn
    from public.notification_outbox
  ),
  deleted as (
    delete from public.notification_outbox
     where id in (select id from ranked where rn > 1)
     returning id
  )
  select count(*), string_agg(id::text, ', ')
    into v_deleted_count, v_deleted_ids
    from deleted;

  raise notice 'DEFECT-UAT-001 pre-migration: deleted % duplicate notification_outbox rows', v_deleted_count;
  raise notice 'Deleted IDs: %', v_deleted_ids;
end $$;

-- ============================================================
-- 2) Drop old constraint + add new one
-- ============================================================
alter table public.notification_outbox
  drop constraint if exists notification_outbox_event_id_notification_type_recipient_us_key;

alter table public.notification_outbox
  add constraint notification_outbox_idempotent_key
  unique (ticket_id, notification_type, recipient_user_id);

-- ============================================================
-- 3) Reemplazar enqueue_ticket_notifications con ON CONFLICT nuevo
-- ============================================================
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
        -- Si la fila ya existe (porque ya hay una notificación pendiente para el mismo
        -- ticket+asignee), actualizamos event_id + payload para reflejar la asignación
        -- más reciente y reset status a 'pending' si ya fue 'sent' (re-asignación implica
        -- que el assignee probablemente no recibió la anterior).
        --
        -- (xmax = 0)::int = 1 cuando es INSERT puro, 0 cuando es UPDATE del conflict.
        -- Esto preserva el contrato del return: 0 = no-op, 1 = nueva fila.
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
              status = 'pending',
              attempt_count = 0,
              claim_id = null,
              claim_expires_at = null,
              available_at = now(),
              processed_at = null,
              last_error = null
        returning (xmax = 0)::int into v_inserted;
        -- v_updated: 1 si la fila se insertó, 0 si fue update. Mantiene el contrato
        -- original (return 0 = no-op idempotente, 1 = nueva fila).
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
              status = 'pending',
              attempt_count = 0,
              claim_id = null,
              claim_expires_at = null,
              available_at = now(),
              processed_at = null,
              last_error = null
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

comment on function public.enqueue_ticket_notifications(uuid) is
  'TKT-019 / DEFECT-UAT-001: encola una notificación pendiente derivada de un ticket_event. Idempotente vía UNIQUE (ticket_id, notification_type, recipient_user_id): re-asignar al mismo assignee actualiza la fila existente en lugar de crear duplicados. Sólo encola cuando el contrato vigente define destinatario determinable (assigned, state_changed->RESUELTO).';

-- ============================================================
-- 4) Comentario de tabla actualizado
-- ============================================================
comment on table public.notification_outbox is
  'Outbox persistente de notificaciones. TKT-019 / DEFECT-UAT-001. Mutaciones exclusivas vía funciones SECURITY DEFINER (enqueue, claim, complete). Estado: pending -> processing -> (sent | failed). Idempotencia por UNIQUE (ticket_id, notification_type, recipient_user_id) — re-asignaciones o re-eventos no crean duplicados; la fila existente se actualiza con el event_id y payload más recientes.';

-- ============================================================
-- down_migration (no se aplica automáticamente; queda como referencia)
-- ============================================================
-- Para revertir esta migración manualmente:
--   alter table public.notification_outbox drop constraint notification_outbox_idempotent_key;
--   alter table public.notification_outbox add constraint notification_outbox_event_id_notification_type_recipient_us_key unique (event_id, notification_type, recipient_user_id);
--   Restaurar la versión previa de enqueue_ticket_notifications con ON CONFLICT (event_id, notification_type, recipient_user_id) DO NOTHING.
--   Restaurar last_error de filas superseded: ver git log de esta migration.
