-- DeskWork Ticketing Core / TKT-012.
-- Mutador seguro para asignar tickets.
--
-- Por qué SECURITY DEFINER:
--   ticket_assignments y tickets tienen REVOKE INSERT/UPDATE a authenticated
--   (defense in depth, ver migration 00730/00740). El único camino válido
--   es vía función SECURITY DEFINER con permisos del owner.
--
-- Defense in depth:
--   1) auth.uid() presente
--   2) is_active_member(tenant_id)
--   3) can_assign_ticket(tenant_id) (helper existente): ticket.assignment.execute
--      + has_scope(institution)  -> sólo lead/director
--   4) ticket existe
--   5) ticket.tenant_id coincide
--   6) assignee es miembro activo del tenant (no se puede asignar a un user
--      que no pertenece al tenant)
--   7) Si hay asignación activa previa, cerrarla (unassigned_at=now())
--   8) INSERT nueva asignación
--   9) UPDATE tickets.assigned_to
--   10) INSERT ticket_events (event_type='assigned')
--   11) audit log
--
-- Atomicidad:
--   Todo en una transacción. Si algo falla, ROLLBACK.

create or replace function public.assign_ticket(
  p_ticket_id  uuid,
  p_assignee_id uuid
) returns public.ticket_assignments
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id     uuid := auth.uid();
  v_ticket       public.tickets;
  v_assignee     public.memberships;
  v_prev         public.ticket_assignments;
  v_new          public.ticket_assignments;
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

  -- 3) Pertenencia al tenant
  if not public.is_active_member(v_ticket.tenant_id) then
    raise exception 'actor is not an active member of the ticket tenant'
      using errcode = '42501';
  end if;

  -- 4) Defense in depth: el helper can_assign_ticket ya valida
  --    ticket.assignment.execute + has_scope(institution).
  if not public.can_assign_ticket(v_ticket.tenant_id) then
    raise exception 'actor not authorized to assign tickets in this tenant'
      using errcode = '42501';
  end if;

  -- 5) El assignee debe ser miembro activo del MISMO tenant
  select * into v_assignee
    from public.memberships
   where tenant_id = v_ticket.tenant_id
     and user_id = p_assignee_id
     and status = 'active';
  if not found then
    raise exception 'assignee is not an active member of the ticket tenant'
      using errcode = 'P0001';
  end if;

  -- 6) Cerrar asignación activa previa (si existe). El índice parcial
  --    UNIQUE (ticket_assignments_one_active_per_ticket_idx) garantiza
  --    que no haya dos activas simultáneas.
  update public.ticket_assignments
     set unassigned_at = now()
   where ticket_id = p_ticket_id
     and unassigned_at is null
  returning * into v_prev;

  -- 7) Insertar nueva asignación
  insert into public.ticket_assignments (
    tenant_id, ticket_id, assignee_id, assigned_by
  ) values (
    v_ticket.tenant_id, v_ticket.id, p_assignee_id, v_actor_id
  )
  returning * into v_new;

  -- 8) Actualizar tickets.assigned_to (necesita UPDATE privilege, ok via SECURITY DEFINER)
  update public.tickets
     set assigned_to = p_assignee_id,
         updated_at  = now()
   where id = p_ticket_id;

  -- 9) Registrar evento (inmutabilidad preservada; SECURITY DEFINER bypasea
  --    la policy ticket_events_insert_system que cierra INSERT a authenticated).
  insert into public.ticket_events (
    tenant_id, ticket_id, actor_id, event_type, metadata
  ) values (
    v_ticket.tenant_id, v_ticket.id, v_actor_id, 'assigned',
    jsonb_build_object(
      'assignee_id', p_assignee_id,
      'previous_assignee_id', v_ticket.assigned_to,
      'previous_assignment_closed', v_prev.id
    )
  );

  -- 10) Audit log
  perform public.write_audit_log(
    v_ticket.tenant_id,
    'ticket.assigned',
    'ticket',
    v_ticket.id,
    jsonb_build_object('assigned_to', v_ticket.assigned_to),
    jsonb_build_object('assigned_to', p_assignee_id),
    'success',
    'api',
    null,
    null
  );

  return v_new;
end;
$$;

-- Privilegios
revoke all on function public.assign_ticket(uuid, uuid) from public;
grant execute on function public.assign_ticket(uuid, uuid) to authenticated;

comment on function public.assign_ticket(uuid, uuid) is
  'TKT-012 / Bloque 2: mutador seguro para asignar tickets. La app layer valida el payload; esta función re-valida auth + membresía + can_assign_ticket + assignee es miembro activo del tenant. Cierra asignación activa previa, inserta nueva, actualiza tickets.assigned_to, registra evento + audit. Atómica.';
