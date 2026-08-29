-- DeskWork Ticketing Core / TKT-013.
-- Mutador seguro para crear comentarios en tickets.
--
-- Por qué SECURITY DEFINER:
--   Mismo patrón que apply_ticket_transition: la tabla ticket_comments tiene
--   REVOKE INSERT/UPDATE/DELETE a authenticated (defense in depth). El único
--   camino válido para crear un comentario es a través de una función
--   SECURITY DEFINER que corra con permisos del owner.
--
-- Defense in depth:
--   1) App layer (TKT-013) valida el payload ANTES de invocar.
--   2) Esta función re-valida:
--      - auth.uid() presente
--      - membership activa en el tenant del ticket
--      - helper can_comment_ticket(tenant_id, ticket_id) (existente)
--        que verifica ticket.comment.create + can_read_ticket
--      - si is_internal=true, helper can_read_internal_comment
--        (los internos sólo los ven agentes/supervisores/lead/director)
--      - longitud del body dentro de [1, 10000]
--   3) Si algo falla: raise exception con errcode 42501.
--
-- Atomicidad:
--   INSERT ticket_comments + INSERT ticket_events + write_audit_log en
--   una sola transacción. Si algo falla, ROLLBACK.

create or replace function public.create_ticket_comment(
  p_ticket_id  uuid,
  p_body       text,
  p_is_internal boolean default false
) returns public.ticket_comments
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id     uuid := auth.uid();
  v_ticket       public.tickets;
  v_comment      public.ticket_comments;
  v_body_len     int := coalesce(length(p_body), 0);
begin
  -- 1) Autenticación
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 2) Longitud del body
  if v_body_len < 1 or v_body_len > 10000 then
    raise exception 'comment body must be between 1 and 10000 characters'
      using errcode = 'P0001';
  end if;

  -- 3) Cargar y lockear el ticket
  select * into v_ticket
    from public.tickets
   where id = p_ticket_id
   for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;

  -- 4) Pertenencia al tenant
  if not public.is_active_member(v_ticket.tenant_id) then
    raise exception 'actor is not an active member of the ticket tenant'
      using errcode = '42501';
  end if;

  -- 5) Defense in depth: el helper can_comment_ticket ya revalida
  --    ticket.comment.create + can_read_ticket. Esta es la barrera
  --    primaria.
  if not public.can_comment_ticket(v_ticket.tenant_id, v_ticket.id) then
    raise exception 'actor not authorized to comment on this ticket'
      using errcode = '42501';
  end if;

  -- 6) Si el comentario es interno, exigir además capacidad de leer
  --    comentarios internos (no cualquier participante puede crear
  --    notas internas — sólo agentes/lead/director del tenant).
  if p_is_internal
     and not public.can_read_internal_comment(v_ticket.tenant_id, v_ticket.id) then
    raise exception 'actor not authorized to create internal comments'
      using errcode = '42501';
  end if;

  -- 7) Insertar comentario
  insert into public.ticket_comments (
    tenant_id, ticket_id, author_id, body, is_internal
  ) values (
    v_ticket.tenant_id, v_ticket.id, v_actor_id, p_body, p_is_internal
  )
  returning * into v_comment;

  -- 8) Registrar evento (inmutabilidad preservada; SECURITY DEFINER bypasea
  --    la policy ticket_events_insert_system que cierra INSERT a authenticated).
  insert into public.ticket_events (
    tenant_id, ticket_id, actor_id, event_type, metadata
  ) values (
    v_ticket.tenant_id, v_ticket.id, v_actor_id, 'commented',
    jsonb_build_object(
      'comment_id', v_comment.id,
      'is_internal', p_is_internal,
      'body_length', v_body_len
    )
  );

  -- 9) Audit log
  perform public.write_audit_log(
    v_ticket.tenant_id,
    'ticket.comment.created',
    'ticket_comment',
    v_comment.id,
    null,
    jsonb_build_object(
      'ticket_id', v_ticket.id,
      'is_internal', p_is_internal,
      'body_length', v_body_len
    ),
    'success',
    'api',
    null,
    null
  );

  return v_comment;
end;
$$;

-- Privilegios: solo authenticated puede invocar. Sin PUBLIC.
revoke all on function public.create_ticket_comment(uuid, text, boolean) from public;
grant execute on function public.create_ticket_comment(uuid, text, boolean) to authenticated;

comment on function public.create_ticket_comment(uuid, text, boolean) is
  'TKT-013 / Bloque 2: mutador seguro para crear comentarios. La app layer valida el payload; esta función re-valida auth + membresía + capacidad de comentar + (si is_internal) capacidad de leer internos. Atómica: INSERT comment + event + audit en una sola transacción.';
