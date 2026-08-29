-- DeskWork Ticketing Core / TKT-006 — fix de defensa en profundidad.
--
-- Bug detectado en validación real con pgTAP (TKT-006-ERR-03):
--   `v_ticket.assigned_to = v_actor_id` retorna NULL cuando assigned_to IS NULL
--   (en SQL estándar, NULL = algo -> NULL, no false). Como consecuencia,
--   la expresión `not (v_is_assignee or v_can_institution)` evaluaba a NULL
--   en lugar de true, saltándose la barrera de defensa en profundidad.
--   Un agente no asignado a un ticket con assigned_to = NULL podía ejecutar
--   la transición sin levantar la excepción esperada.
--
-- Fix: usar `IS NOT DISTINCT FROM` (que sí maneja NULL correctamente) en
-- la comparación, o normalizar a booleano vía COALESCE. Adoptamos
-- COALESCE por legibilidad.

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

  -- 7) Defense in depth: validar autorización a nivel DB.
  --    FIX: COALESCE para normalizar NULL → false. La comparación `=`
  --    en SQL estándar retorna NULL cuando uno de los operandos es NULL,
  --    no false. Sin COALESCE, la barrera de defensa se saltaba cuando
  --    assigned_to IS NULL.
  v_is_assignee := coalesce(v_ticket.assigned_to = v_actor_id, false);
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

  -- 9) Registrar evento
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
  'TKT-006 / Bloque 2 (v2): mutador seguro para aplicar una transición de estado de ticket. Defense in depth: la FSM fina la valida la app layer; esta función re-valida membresía + asignación (con COALESCE para NULL safety) o scope institución. Atómica: UPDATE + evento + audit en una sola transacción. Fix 2026-08-29: comparación de NULL en v_is_assignee ahora retorna false vía COALESCE.';
