-- DeskWork Ticketing Core / TKT-006.
-- Mutador seguro para transiciones de estado de tickets.
--
-- Por qué SECURITY DEFINER:
--   La policy `tickets_update_member` permite UPDATE a `authenticated`, pero
--   el GRANT de INSERT/UPDATE/DELETE sobre `public.tickets` está REVOCADO
--   para `authenticated` (defense in depth, ver migration 20260827000730 +
--   20260827000740). El único camino válido para mutar el estado es a través
--   de una función SECURITY DEFINER que corra con permisos del owner.
--
-- Defense in depth:
--   1) La app layer (TKT-006) valida la FSM completa (canExecute) ANTES de
--      invocar la función. Si la app está bien escrita, sólo llega aquí
--      cuando canExecute=true.
--   2) Esta función re-valida: actor es miembro activo del tenant, el
--      ticket existe, el estado destino es alcanzable desde el actual, y
--      el actor está autorizado (asignado, o scope institución +
--      ticket.status.execute).
--   3) Si algo falla, la función raise exception con errcode 42501.
--
-- Atomicidad:
--   Toda la operación (UPDATE tickets + INSERT ticket_events + write_audit_log)
--   corre dentro de una transacción implícita. Si algo falla, ROLLBACK.

create or replace function public.apply_ticket_transition(
  p_ticket_id uuid,
  p_to_state  public.ticket_state,
  p_reason    text default null
) returns public.tickets
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id      uuid := auth.uid();
  v_ticket        public.tickets;
  v_from_state    public.ticket_state;
  v_actor_role    text;
  v_is_assignee   boolean;
  v_can_institution boolean;
begin
  -- 1) Autenticación
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 2) Cargar y lockear el ticket
  select * into v_ticket
    from public.tickets
   where id = p_ticket_id
   for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;

  v_from_state := v_ticket.state;

  -- 3) Estado terminal
  if v_from_state = 'CERRADO' then
    raise exception 'ticket is in terminal state CERRADO' using errcode = 'P0001';
  end if;

  -- 4) El estado destino debe ser diferente
  if v_from_state = p_to_state then
    raise exception 'transition target equals current state' using errcode = 'P0001';
  end if;

  -- 5) Pertenencia al tenant
  if not public.is_active_member(v_ticket.tenant_id) then
    raise exception 'actor is not an active member of the ticket tenant' using errcode = '42501';
  end if;

  -- 6) Resolver el functional_role del actor en este tenant
  select functional_role into v_actor_role
    from public.memberships
   where user_id = v_actor_id
     and tenant_id = v_ticket.tenant_id
     and status = 'active'
   limit 1;
  if v_actor_role is null then
    raise exception 'actor has no active membership in tenant' using errcode = '42501';
  end if;

  -- 7) Defense in depth: validar autorización a nivel DB
  v_is_assignee := (v_ticket.assigned_to = v_actor_id);
  v_can_institution := public.has_permission(v_ticket.tenant_id, 'ticket.status.execute')
                       and public.has_scope(v_ticket.tenant_id, 'institution');

  if not (v_is_assignee or v_can_institution) then
    raise exception 'actor not authorized to execute ticket transition' using errcode = '42501';
  end if;

  -- 8) Actualizar el ticket
  update public.tickets
     set state              = p_to_state,
         first_response_at  = case
                                when first_response_at is null
                                     and p_to_state in ('EN_PROCESO', 'ESCALADO', 'ESPERANDO_USUARIO')
                                then now()
                                else first_response_at
                              end,
         resolved_at        = case
                                when p_to_state = 'RESUELTO' then now()
                                when p_to_state <> 'RESUELTO' then null
                                else resolved_at
                              end,
         closed_at          = case
                                when p_to_state = 'CERRADO' then now()
                                when p_to_state <> 'CERRADO' then null
                                else closed_at
                              end,
         updated_at         = now()
   where id = p_ticket_id
   returning * into v_ticket;

  -- 9) Registrar evento (inmutabilidad preservada; SECURITY DEFINER bypasea
  --    la policy ticket_events_insert_system que cierra INSERT a authenticated).
  insert into public.ticket_events (
    tenant_id, ticket_id, actor_id, event_type, from_state, to_state, metadata
  ) values (
    v_ticket.tenant_id, v_ticket.id, v_actor_id, 'state_changed',
    v_from_state, p_to_state,
    jsonb_build_object('reason', p_reason, 'actor_role', v_actor_role)
  );

  -- 10) Audit log
  perform public.write_audit_log(
    v_ticket.tenant_id,
    'ticket.transition.applied',
    'ticket',
    v_ticket.id,
    jsonb_build_object('state', v_from_state),
    jsonb_build_object('state', p_to_state),
    'success',
    'api',
    null,
    p_reason
  );

  return v_ticket;
end;
$$;

-- Privilegios: solo authenticated puede invocar. Sin PUBLIC.
revoke all on function public.apply_ticket_transition(uuid, public.ticket_state, text) from public;
grant execute on function public.apply_ticket_transition(uuid, public.ticket_state, text) to authenticated;

comment on function public.apply_ticket_transition(uuid, public.ticket_state, text) is
  'TKT-006 / Bloque 2: mutador seguro para aplicar una transición de estado de ticket. La FSM fina (SOLICITAR/EJECUTAR) la valida la app layer; esta función hace defense in depth (membresía + asignación o scope institución). Atómica: UPDATE + evento + audit en una transacción.';
