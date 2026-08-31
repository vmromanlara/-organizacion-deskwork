-- DeskWork Ticketing Core / TKT-019.
-- Infraestructura persistente de notificaciones (outbox) + dispatcher hints.
--
-- Por qué outbox / no envío directo:
--   Acoplar el mutador crítico (create_ticket, apply_ticket_transition, etc.)
--   con un proveedor de email externo violaría el principio de no-acoplamiento:
--   una operación de Ticketing nunca debe fallar porque el proveedor esté caído.
--   El outbox desacopla: la mutación registra la intención de notificar dentro
--   de la misma transacción; un dispatcher posterior la entrega.
--
-- Eventos cubiertos en TKT-019 v1 (sólo los que tienen destinatario claro
-- del contrato vigente):
--   - 'assigned'              -> notifica al nuevo asignado
--   - 'state_changed' a RESUELTO -> notifica al requester
--   Otros eventos (created, commented, attachment_added, otros state_changed)
--   no generan notificaciones hasta que PO defina política explícita.
--
-- Defense in depth:
--   1) Trigger AFTER INSERT ON ticket_events dispara enqueue_ticket_notifications
--      en la misma transacción que la mutación (atomicidad: ticket event + outbox row).
--   2) Idempotencia: UNIQUE (event_id, notification_type, recipient_user_id) +
--      ON CONFLICT DO NOTHING => un mismo evento no genera duplicados por
--      reintentos accidentales.
--   3) RLS: authenticated puede SELECT (sólo su tenant); INSERT/UPDATE/DELETE
--      denegados. Las mutaciones del outbox pasan exclusivamente por las
--      funciones SECURITY DEFINER (enqueue, claim, complete).
--   4) Dispatcher: lease pattern (claim_id + claim_expires_at). Una fila en
--      'processing' cuyo lease expiró puede ser re-reclamada.
--
-- Atomicidad:
--   La inserción en notification_outbox ocurre DENTRO de la misma transacción
--   que la inserción en ticket_events. Si el outbox falla, ROLLBACK de toda
--   la operación (ticket + event + notification atómicos).

-- ============================================================
-- 1) Tabla notification_outbox
-- ============================================================
do $$ begin
  create type public.notification_status as enum (
    'pending', 'processing', 'sent', 'failed'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  event_id uuid not null references public.ticket_events(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'ticket.assigned',
    'ticket.state_changed_to_resolved'
  )),
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  recipient_email_snapshot text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'pending',
  attempt_count int not null default 0 check (attempt_count >= 0),
  claim_id uuid,
  claim_expires_at timestamptz,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  -- Idempotencia: un mismo evento no puede generar dos notificaciones
  -- idénticas para el mismo destinatario.
  unique (event_id, notification_type, recipient_user_id)
);

-- Índices para el dispatcher.
create index if not exists notification_outbox_tenant_status_available_idx
  on public.notification_outbox (tenant_id, status, available_at);
create index if not exists notification_outbox_ticket_idx
  on public.notification_outbox (ticket_id);
create index if not exists notification_outbox_claim_idx
  on public.notification_outbox (claim_id)
  where claim_id is not null;

-- Habilitar RLS.
alter table public.notification_outbox enable row level security;

-- ============================================================
-- 2) RLS: tenant-scoped SELECT, no INSERT/UPDATE/DELETE para authenticated.
--    Toda escritura al outbox pasa por las funciones SECURITY DEFINER.
-- ============================================================
create policy "notification_outbox_select_tenant_members"
  on public.notification_outbox
  for select
  to authenticated
  using (
    public.is_active_member(tenant_id)
  );

-- authenticated NO tiene INSERT/UPDATE/DELETE. Las mutaciones sólo se
-- hacen vía SECURITY DEFINER (enqueue / claim / complete).

-- ============================================================
-- 3) enqueue_ticket_notifications(p_event_id uuid)
--    SECURITY DEFINER. Idempotente vía UNIQUE constraint.
--    Calcula destinatarios según event_type y snapshot de email.
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
  --    Sólo se encolan notificaciones con destinatario determinable.
  if v_event.event_type = 'assigned' then
    -- Preferir metadata.assignee_id; fallback a ticket.assigned_to.
    v_assignee := coalesce(
      (v_event.metadata->>'assignee_id')::uuid,
      v_ticket.assigned_to
    );
    if v_assignee is not null then
      select email into v_email from auth.users where id = v_assignee;
      if v_email is not null then
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
        on conflict (event_id, notification_type, recipient_user_id) do nothing;
        get diagnostics v_inserted = row_count;
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
        on conflict (event_id, notification_type, recipient_user_id) do nothing;
        get diagnostics v_inserted = row_count;
      end if;
    end if;

  -- Otros eventos: contrato no define destinatario. Se documenta en
  -- DESKWORK_TICKETING_CORE_TKT_019_REPORT.md como TBD policy.
  end if;

  return v_inserted;
end;
$$;

revoke all on function public.enqueue_ticket_notifications(uuid) from public;
grant execute on function public.enqueue_ticket_notifications(uuid) to authenticated;

comment on function public.enqueue_ticket_notifications(uuid) is
  'TKT-019: encola una notificación pendiente derivada de un ticket_event. Idempotente vía UNIQUE (event_id, notification_type, recipient_user_id). Sólo encola cuando el contrato vigente define destinatario determinable (assigned, state_changed->RESUELTO).';

-- ============================================================
-- 4) Trigger AFTER INSERT ON ticket_events -> enqueue
-- ============================================================
create or replace function public.notify_ticket_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.enqueue_ticket_notifications(NEW.id);
  return NEW;
end;
$$;

drop trigger if exists ticket_events_after_insert_notify on public.ticket_events;
create trigger ticket_events_after_insert_notify
  after insert on public.ticket_events
  for each row execute function public.notify_ticket_event();

-- ============================================================
-- 5) claim_pending_notifications(p_limit int, p_lease_seconds int)
--    SECURITY DEFINER. Lease pattern. Devuelve hasta N notificaciones
--    pendientes (o cuyo lease expiró) marcándolas 'processing' con
--    claim_id y claim_expires_at.
-- ============================================================
create or replace function public.claim_pending_notifications(
  p_limit int,
  p_lease_seconds int default 60
) returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_claim_id    uuid := gen_random_uuid();
  v_lease_until timestamptz := now() + make_interval(secs => p_lease_seconds);
begin
  if p_limit is null or p_limit <= 0 then
    return;
  end if;
  if p_lease_seconds is null or p_lease_seconds < 0 then
    p_lease_seconds := 60;
  end if;

  return query
    update public.notification_outbox n
       set status = 'processing',
           claim_id = v_claim_id,
           claim_expires_at = v_lease_until,
           attempt_count = n.attempt_count
     where n.id in (
       select id from public.notification_outbox
        where (status = 'pending' and available_at <= now())
           or (status = 'processing' and claim_expires_at < now())
        order by available_at asc
        limit p_limit
        for update skip locked
     )
    returning *;
end;
$$;

revoke all on function public.claim_pending_notifications(int, int) from public;
grant execute on function public.claim_pending_notifications(int, int) to authenticated;

comment on function public.claim_pending_notifications(int, int) is
  'TKT-019: dispatcher-side. Reclama hasta N notificaciones pendientes (o con lease expirado) marcándolas processing con claim_id. El claim_id se usa luego en complete_notification para validar que el mismo worker está cerrando la fila.';

-- ============================================================
-- 6) complete_notification(p_notification_id, p_claim_id, p_status, p_error)
--    SECURITY DEFINER. Marca sent o failed validando el claim_id.
--    Si status='failed' incrementa attempt_count y reagenda (available_at + 30s).
-- ============================================================
create or replace function public.complete_notification(
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
  v_row public.notification_outbox;
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'p_status must be sent or failed' using errcode = 'P0001';
  end if;

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

  update public.notification_outbox
     set status = p_status::public.notification_status,
         processed_at = now(),
         last_error = p_error,
         claim_id = null,
         claim_expires_at = null,
         attempt_count = case when p_status = 'failed'
                              then attempt_count + 1
                              else attempt_count
                         end,
         -- Si failed, reagendar con backoff lineal simple (30s * attempts).
         available_at = case when p_status = 'failed'
                             then now() + (interval '30 seconds' * (attempt_count + 1))
                             else available_at
                        end
   where id = p_notification_id
   returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.complete_notification(uuid, uuid, text, text) from public;
grant execute on function public.complete_notification(uuid, uuid, text, text) to authenticated;

comment on function public.complete_notification(uuid, uuid, text, text) is
  'TKT-019: dispatcher-side. Cierra una notificación reclamada. Valida claim_id (defense in depth contra otro worker). Si status=failed, reagenda con backoff lineal.';

-- ============================================================
-- 7) Revoke ALL privileges en la tabla (defense in depth)
-- ============================================================
-- Mismo patrón que 20260820000600_harden_table_privileges.sql:
-- Supabase concede privilegios amplios por defecto (incluyendo TRUNCATE).
-- Los revocamos totalmente y luego otorgamos SELECT explícitamente.
-- Foundation 3A no se toca; sólo replicamos el patrón para esta tabla.
revoke all privileges on table public.notification_outbox from anon, authenticated;
grant select on public.notification_outbox to authenticated;
-- Las mutaciones (INSERT/UPDATE/DELETE) NO se otorgan a authenticated.
-- Sólo se materializan vía las funciones SECURITY DEFINER
-- (enqueue_ticket_notifications, claim_pending_notifications,
-- complete_notification). Defense in depth: incluso si authenticated
-- sorteara RLS por error, no tiene el grant de tabla necesario.

comment on table public.notification_outbox is
  'Outbox persistente de notificaciones. TKT-019. Mutaciones exclusivas vía funciones SECURITY DEFINER (enqueue, claim, complete). Estado: pending -> processing -> (sent | failed). Idempotencia por UNIQUE (event_id, notification_type, recipient_user_id).';
