-- DeskWork Ticketing Core / Fase Block 2 (Remediation).
-- DEFECT-UAT-NN1/NN2: matriz del rol 'technician' + RPC take_ticket.
--
-- Esta migraci�n REFERENCIA el valor 'technician' a�adido por
-- 20260902230000_add_technician_role.sql. Se ejecuta en una transacci�n
-- NUEVA, por lo que el valor ya es utilizable.
--
-- Defensa del principio "no se inventan permisos":
--   Todos los permission_code concedidos a 'technician' YA EXIST�AN en
--   authorization_permissions antes de esta migraci�n (8 Foundation +
--   5 Ticketing). No se crea ning�n permiso nuevo. Se respeta la
--   convenci�n del constraint 3-segmento.
--
-- Defensa del principio "no se duplican permisos":
--   Los grants se limitan a permisos ya granted a otros roles no-administrativos
--   (operator, supervisor, administrative). El t�cnico recibe el subconjunto
--   necesario para la operaci�n de tickets: leer su �mbito, comentar,
--   transicionar, adjuntar, auto-asignarse (v�a RPC dedicada take_ticket).
--
-- Defensa del principio "no se debilita RLS":
--   take_ticket es SECURITY DEFINER (como assign_ticket) y re-valida
--   membres�a, permiso (ticket.execute.assigned) y que el assignee sea
--   el propio actor. NO permite asignar a terceros; ese camino sigue
--   siendo v�a assign_ticket (institution scope, lead/director).
--
-- Sobre el alcance de scope:
--   'department' (no 'institution') se otorga expl�citamente a las
--   memberships t�cnicas v�a grant_membership_scope (no autom�tico).
--   El t�cnico puede ver tickets donde el �rea del ticket coincida con
--   su scope department (v�a can_read_ticket, l�gicamente
--   ticket.read.scope + has_scope('department', t.area_id)).
--
-- Sobre el aislamiento tenant:
--   La prueba de cross-tenant isolation ("requester-b NO puede acceder al
--   ticket de tenant A") se valida con el usuario 'requester-b' (ya existe
--   en auth.users y en memberships como operator de tenant B). NO se crea
--   'agent-b' aqu� porque:
--     a) implica tocar auth.users (Foundation 3A), lo cual est� fuera
--        del scope de esta remediaci�n.
--     b) la prueba de aislamiento usa requester-b contra tenant A, no
--        agent-b contra tenant A.
--   Si en el futuro se necesita agent-b, ser� en una migraci�n separada
--   con autorizaci�n expl�cita para tocar auth.users.
--
-- Irreversibilidad:
--   PG17 forward-only. Para revertir sem�nticamente (no t�cnicamente):
--   degradar las memberships a 'operator' y revocar grants en una
--   migraci�n posterior. El valor 'technician' en s� permanece.

-- ============================================================
-- 1) Matriz del rol 'technician'
-- ============================================================

-- 9 grants. NO se incluye:
--   * ticket.assignment.execute (solo lead/director; el t�cnico usa take_ticket)
--   * ticket.kpis.read.institution (solo lead/director; el t�cnico no es supervisor)
--   * ticket.read.institution (solo lead/director; el t�cnico usa ticket.read.scope)
--   * ticket.create.scope / .institution (no aplica: el t�cnico crea sus propios tickets)
--   * report.request.scope / .institution (no aplica al perfil t�cnico en MVP)
insert into public.functional_role_permissions (functional_role, permission_code) values
  ('technician', 'directory.read.scope'),
  ('technician', 'report.request.self'),
  ('technician', 'project.create.self'),
  ('technician', 'ticket.create.self'),
  ('technician', 'ticket.read.scope'),
  ('technician', 'ticket.status.request'),
  ('technician', 'ticket.execute.assigned'),
  ('technician', 'ticket.comment.create'),
  ('technician', 'ticket.attachment.create')
on conflict do nothing;

-- ============================================================
-- 2) RPC take_ticket (auto-asignaci�n)
-- ============================================================

-- Por qu� SECURITY DEFINER:
--   ticket_assignments y tickets tienen REVOKE INSERT/UPDATE a authenticated
--   (defense in depth, ver migration 00730/00740). El �nico camino v�lido
--   para asignar es v�a funci�n SECURITY DEFINER. Esta funci�n es la versi�n
--   SELF de assign_ticket: el actor se asigna a s� mismo.
--
-- Por qu� NO usa ticket.assignment.execute:
--   Ese permiso est� reservado a institution scope (lead/director).
--   take_ticket usa ticket.execute.assigned (operativo) porque el t�cnico
--   que se auto-asigna es porque VA A TRABAJAR el ticket. La decisi�n de
--   producto es que el t�cnico "toma" tickets, no que "asigna" tickets a
--   otros. Esa segunda acci�n sigue siendo potestad de lead/director.
--
-- Defense in depth:
--   1) auth.uid() presente
--   2) is_active_member(tenant_id)
--   3) has_permission('ticket.execute.assigned')
--   4) ticket existe (lock for update)
--   5) ticket no est� asignado a OTRO actor (solo a s� mismo o null)
--   6) cierra asignaci�n activa previa
--   7) inserta nueva asignaci�n con assignee_id = auth.uid()
--   8) actualiza tickets.assigned_to
--   9) emite evento 'assigned' con metadata self_taken=true
--   10) audit log
--
-- Atomicidad:
--   UPDATE + INSERT + audit en una sola transacci�n. Si algo falla, ROLLBACK.
create or replace function public.take_ticket(
  p_ticket_id uuid
) returns public.ticket_assignments
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id     uuid := auth.uid();
  v_ticket       public.tickets;
  v_prev         public.ticket_assignments;
  v_new          public.ticket_assignments;
begin
  -- 1) Autenticaci�n
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

  -- 3) Membres�a
  if not public.is_active_member(v_ticket.tenant_id) then
    raise exception 'actor is not an active member of the ticket tenant'
      using errcode = '42501';
  end if;

  -- 4) Permiso operativo (no requiere institution scope)
  if not public.has_permission(v_ticket.tenant_id, 'ticket.execute.assigned') then
    raise exception 'actor not authorized to take tickets in this tenant'
      using errcode = '42501';
  end if;

  -- 5) El ticket no debe estar ya asignado a otro actor
  if v_ticket.assigned_to is not null and v_ticket.assigned_to <> v_actor_id then
    raise exception 'ticket is already assigned to another actor'
      using errcode = 'P0001';
  end if;

  -- 6) Cerrar asignaci�n activa previa (si existe)
  update public.ticket_assignments
     set unassigned_at = now()
   where ticket_id = p_ticket_id
     and unassigned_at is null
  returning * into v_prev;

  -- 7) Insertar auto-asignaci�n
  insert into public.ticket_assignments (
    tenant_id, ticket_id, assignee_id, assigned_by
  ) values (
    v_ticket.tenant_id, v_ticket.id, v_actor_id, v_actor_id
  )
  returning * into v_new;

  -- 8) Actualizar tickets.assigned_to
  update public.tickets
     set assigned_to = v_actor_id,
         updated_at  = now()
   where id = p_ticket_id;

  -- 9) Evento con flag self_taken
  insert into public.ticket_events (
    tenant_id, ticket_id, actor_id, event_type, metadata
  ) values (
    v_ticket.tenant_id, v_ticket.id, v_actor_id, 'assigned',
    jsonb_build_object(
      'assignee_id', v_actor_id,
      'previous_assignee_id', v_ticket.assigned_to,
      'previous_assignment_closed', v_prev.id,
      'self_taken', true
    )
  );

  -- 10) Audit log
  perform public.write_audit_log(
    v_ticket.tenant_id,
    'ticket.taken',
    'ticket',
    v_ticket.id,
    jsonb_build_object('assigned_to', v_ticket.assigned_to),
    jsonb_build_object('assigned_to', v_actor_id),
    'success',
    'api',
    null,
    'self-take'
  );

  return v_new;
end;
$$;

-- Privilegios: solo authenticated puede invocar. Sin PUBLIC.
revoke all on function public.take_ticket(uuid) from public;
grant execute on function public.take_ticket(uuid) to authenticated;

comment on function public.take_ticket(uuid) is
  'TKT-027 / Bloque 2 Remediation: auto-asignaci�n segura. El actor se asigna un ticket a s� mismo. Defense in depth: requiere ticket.execute.assigned (operativo, no requiere institution scope). Cierra asignaci�n activa previa, inserta nueva, registra evento (self_taken=true) + audit. At�mica. NO permite asignar a terceros (para eso est� assign_ticket, con institution scope).';

-- ============================================================
-- 3) Actualizar memberships UAT a 'technician'
-- ============================================================

-- agent-a (tenant A): operator -> technician. Esto desbloquea NN1/NN2 para UAT.
-- La transacci�n ALTER TYPE de la migraci�n 20260902230000 ya est� confirmada.
update public.memberships
   set functional_role = 'technician'::public.functional_role,
       updated_at = now()
 where user_id = 'a1000000-0000-0000-0000-00000000a002'
   and tenant_id = '7866761c-0d1a-42b1-a89d-4f0b9c971a1e';

-- agent-b (tenant B): membership NO se crea aqu�. Ver comentario
-- "Sobre el aislamiento tenant" arriba.
