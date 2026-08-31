-- DeskWork Ticketing Core / TKT-009.
-- Mutador seguro para crear tickets.
--
-- Por qué SECURITY DEFINER:
--   public.tickets tiene REVOKE INSERT/UPDATE/DELETE a authenticated (defense
--   in depth, ver migration 20260827000730 + 20260827000740). El único camino
--   válido para crear un ticket es a través de una función SECURITY DEFINER
--   que corra con permisos del owner.
--
-- Defense in depth:
--   1) App layer (POST /api/tickets) valida payload ANTES de invocar.
--   2) Esta función re-valida:
--      - auth.uid() presente
--      - actor es miembro activo del tenant solicitado
--      - actor tiene al menos ticket.create.self (lo más bajo)
--      - la categoría existe, pertenece al tenant y está activa
--      - title length [5, 200] (replicado del CHECK del schema)
--      - description length [10, 5000] (replicado del CHECK del schema)
--      - area_id/team_id (si vienen) pertenecen al mismo tenant
--   3) requester_id siempre = auth.uid(); no se puede crear un ticket
--      en nombre de otro usuario (defense against impersonation).
--
-- Priority:
--   TKT-007 (priority contractual) está BLOQUEADO por decisión PO. Hasta
--   que se desbloquee, esta función computa la prioridad desde el slug de
--   la categoría con la misma matriz stub que src/modules/ticketing/priority.ts.
--   El CASE está marcado con un comentario explícito y queda aislado para
--   que TKT-007 lo reemplace sin tocar el resto de la función.
--
-- Atomicidad:
--   INSERT tickets + INSERT ticket_events + write_audit_log en una sola
--   transacción. Si algo falla, ROLLBACK.

create or replace function public.create_ticket(
  p_tenant_id   uuid,
  p_category_id uuid,
  p_title       text,
  p_description text,
  p_area_id     uuid default null,
  p_team_id     uuid default null
) returns public.tickets
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id      uuid := auth.uid();
  v_category      public.ticket_categories;
  v_actor_role    text;
  v_title_len     int := coalesce(length(p_title), 0);
  v_desc_len      int := coalesce(length(p_description), 0);
  v_has_create_self boolean;
  v_has_create_scope boolean;
  v_has_create_inst  boolean;
  v_computed_priority public.ticket_priority;
  v_ticket        public.tickets;
begin
  -- 1) Autenticación
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 2) Validaciones de payload (replicadas en app layer; defense in depth)
  if v_title_len < 5 or v_title_len > 200 then
    raise exception 'title debe tener entre 5 y 200 caracteres'
      using errcode = 'P0001';
  end if;
  if v_desc_len < 10 or v_desc_len > 5000 then
    raise exception 'description debe tener entre 10 y 5000 caracteres'
      using errcode = 'P0001';
  end if;

  -- 3) Pertenencia al tenant
  if not public.is_active_member(p_tenant_id) then
    raise exception 'actor is not an active member of the tenant'
      using errcode = '42501';
  end if;

  -- 4) Cargar la categoría y validar tenant + active
  select * into v_category
    from public.ticket_categories
   where id = p_category_id
     and tenant_id = p_tenant_id;
  if not found then
    raise exception 'category not found in tenant' using errcode = 'P0001';
  end if;
  if not v_category.is_active then
    raise exception 'category is not active' using errcode = 'P0001';
  end if;

  -- 5) Validar area_id / team_id (si vienen): deben pertenecer al tenant
  if p_area_id is not null
     and not exists (
       select 1 from public.areas
        where id = p_area_id
          and tenant_id = p_tenant_id
     ) then
    raise exception 'area_id does not belong to the tenant' using errcode = 'P0001';
  end if;
  if p_team_id is not null
     and not exists (
       select 1 from public.teams
        where id = p_team_id
          and tenant_id = p_tenant_id
     ) then
    raise exception 'team_id does not belong to the tenant' using errcode = 'P0001';
  end if;

  -- 6) Defense in depth: el actor debe tener al menos ticket.create.self
  --    (los roles con scope/institution también satisfacen este check porque
  --    is_active_member + ticket.create.*.self es el mínimo requerido).
  v_has_create_self  := public.has_permission(p_tenant_id, 'ticket.create.self');
  v_has_create_scope := public.has_permission(p_tenant_id, 'ticket.create.scope');
  v_has_create_inst  := public.has_permission(p_tenant_id, 'ticket.create.institution');
  if not (v_has_create_self or v_has_create_scope or v_has_create_inst) then
    raise exception 'actor not authorized to create tickets in this tenant'
      using errcode = '42501';
  end if;

  -- 7) Cargar el functional_role del actor (para el evento/audit)
  select functional_role into v_actor_role
    from public.memberships
   where user_id = v_actor_id
     and tenant_id = p_tenant_id
     and status = 'active'
   limit 1;
  if v_actor_role is null then
    raise exception 'actor has no active membership in tenant' using errcode = '42501';
  end if;

  -- ============================================================
  -- TKT-007 STUB: priority from category slug.
  -- This CASE statement mirrors the matrix in
  -- src/modules/ticketing/priority.ts. It is TEMPORARY: TKT-007
  -- (priority contractual) is BLOCKED on 5 Product Owner decisions.
  -- When PO responds, replace this CASE with the contractual engine.
  -- The CASE is isolated here so the replacement does not touch the
  -- rest of the function or the call sites.
  -- ============================================================
  v_computed_priority := case v_category.slug
    when 'accesos'   then 'P1'::public.ticket_priority
    when 'cuenta'    then 'P1'::public.ticket_priority
    when 'correo'    then 'P1'::public.ticket_priority
    when 'computador' then 'P2'::public.ticket_priority
    when 'software'  then 'P2'::public.ticket_priority
    when 'internet'  then 'P3'::public.ticket_priority
    when 'impresora' then 'P3'::public.ticket_priority
    when 'telefonia' then 'P3'::public.ticket_priority
    when 'otro'      then 'P4'::public.ticket_priority
    else 'P3'::public.ticket_priority
  end;

  -- 8) Insertar el ticket (requester_id = auth.uid() — sin impersonation)
  insert into public.tickets (
    tenant_id, requester_id, category_id, priority, state,
    title, description, area_id, team_id
  ) values (
    p_tenant_id, v_actor_id, p_category_id, v_computed_priority, 'ABIERTO',
    p_title, p_description, p_area_id, p_team_id
  )
  returning * into v_ticket;

  -- 9) Registrar evento (inmutabilidad preservada; SECURITY DEFINER bypasea
  --    la policy ticket_events_insert_system que cierra INSERT a authenticated).
  insert into public.ticket_events (
    tenant_id, ticket_id, actor_id, event_type, to_state, metadata
  ) values (
    v_ticket.tenant_id, v_ticket.id, v_actor_id, 'created', 'ABIERTO',
    jsonb_build_object(
      'title', p_title,
      'category_id', p_category_id,
      'category_slug', v_category.slug,
      'priority_source', 'tkt007_stub',
      'description_length', v_desc_len
    )
  );

  -- 10) Audit log
  perform public.write_audit_log(
    v_ticket.tenant_id,
    'ticket.created',
    'ticket',
    v_ticket.id,
    null,
    jsonb_build_object(
      'category_id', p_category_id,
      'category_slug', v_category.slug,
      'priority', v_computed_priority,
      'area_id', p_area_id,
      'team_id', p_team_id,
      'description_length', v_desc_len
    ),
    'success',
    'api',
    null,
    null
  );

  return v_ticket;
end;
$$;

-- Privilegios: solo authenticated puede invocar. Sin PUBLIC.
revoke all on function public.create_ticket(uuid, uuid, text, text, uuid, uuid) from public;
grant execute on function public.create_ticket(uuid, uuid, text, text, uuid, uuid) to authenticated;

comment on function public.create_ticket(uuid, uuid, text, text, uuid, uuid) is
  'TKT-009 / Bloque 3: mutador seguro para crear tickets. La app layer valida el payload; esta función re-valida auth + membresía + capacidad de crear (ticket.create.*) + categoría activa del tenant + area/team en el tenant + longitudes. requester_id = auth.uid() (no impersonation). Priority: TKT-007 stub aislado (reemplazable). Atómica: INSERT ticket + event + audit en una sola transacción.';
