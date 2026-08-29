-- DeskWork Ticketing Core / TKT-014.
-- Mutador seguro para registrar metadata de adjuntos.
--
-- Flujo asumido (v1):
--   1) El cliente pide signed URL al backend (out of scope de TKT-014 v1).
--   2) El cliente sube el binario a Supabase Storage con la signed URL.
--   3) El cliente llama POST /api/tickets/[id]/attachments con la
--      metadata (storage_path, original_name, mime_type, size_bytes, sha256).
--   4) Esta función registra la metadata y emite el evento.
--
-- Por qué SECURITY DEFINER:
--   ticket_attachments tiene REVOKE INSERT/UPDATE/DELETE a authenticated
--   (defense in depth). El único camino válido es vía SECURITY DEFINER.
--
-- Defense in depth:
--   1) auth.uid() presente
--   2) ticket existe (lock for update)
--   3) is_active_member(tenant_id)
--   4) can_attach_ticket(tenant_id, ticket_id) -> ticket.attachment.create
--      + can_read_ticket
--   5) validaciones de tamaño/formato (replicadas como barrera)
--   6) storage_path debe seguir la convención esperada (defense in depth
--      contra path traversal / metadata injection)
--   7) sha256 opcional (puede ser NULL hasta TKT-014 v2)
--   8) INSERT ticket_attachments + INSERT ticket_events + audit log

create or replace function public.register_ticket_attachment(
  p_ticket_id     uuid,
  p_original_name text,
  p_mime_type     text,
  p_size_bytes    bigint,
  p_storage_path  text,
  p_sha256        text default null
) returns public.ticket_attachments
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id     uuid := auth.uid();
  v_ticket       public.tickets;
  v_attachment   public.ticket_attachments;
  v_expected_path text;
  v_name_len     int := coalesce(length(p_original_name), 0);
  v_mime_len     int := coalesce(length(p_mime_type), 0);
begin
  -- 1) Autenticación
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 2) Validaciones de payload (replicadas en app layer; defense in depth)
  if v_name_len < 1 or v_name_len > 255 then
    raise exception 'original_name debe tener entre 1 y 255 caracteres'
      using errcode = 'P0001';
  end if;
  if v_mime_len < 1 or v_mime_len > 200 then
    raise exception 'mime_type fuera de rango' using errcode = 'P0001';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 26214400 then
    raise exception 'size_bytes debe estar en (0, 26214400]'
      using errcode = 'P0001';
  end if;
  if p_storage_path is null or length(p_storage_path) = 0 then
    raise exception 'storage_path requerido' using errcode = 'P0001';
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

  -- 5) Defense in depth: helper can_attach_ticket ya valida permiso
  --    ticket.attachment.create + can_read_ticket.
  if not public.can_attach_ticket(v_ticket.tenant_id, v_ticket.id) then
    raise exception 'actor not authorized to attach files to this ticket'
      using errcode = '42501';
  end if;

  -- 6) Validación del storage_path: debe seguir la convención
  --    `ticket-attachments/{tenant_id}/{ticket_id}/{filename}`
  v_expected_path := 'ticket-attachments/' || v_ticket.tenant_id::text || '/'
                  || v_ticket.id::text || '/';
  if position(v_expected_path in p_storage_path) <> 1 then
    raise exception 'storage_path no sigue la convención del tenant/ticket'
      using errcode = 'P0001';
  end if;

  -- 7) Insertar metadata
  insert into public.ticket_attachments (
    tenant_id, ticket_id, uploaded_by, original_name, mime_type,
    size_bytes, storage_path, sha256
  ) values (
    v_ticket.tenant_id, v_ticket.id, v_actor_id, p_original_name, p_mime_type,
    p_size_bytes, p_storage_path, p_sha256
  )
  returning * into v_attachment;

  -- 8) Registrar evento
  insert into public.ticket_events (
    tenant_id, ticket_id, actor_id, event_type, metadata
  ) values (
    v_ticket.tenant_id, v_ticket.id, v_actor_id, 'attachment_added',
    jsonb_build_object(
      'attachment_id', v_attachment.id,
      'original_name', p_original_name,
      'mime_type', p_mime_type,
      'size_bytes', p_size_bytes,
      'storage_path', p_storage_path,
      'has_sha256', p_sha256 is not null
    )
  );

  -- 9) Audit log
  perform public.write_audit_log(
    v_ticket.tenant_id,
    'ticket.attachment.registered',
    'ticket_attachment',
    v_attachment.id,
    null,
    jsonb_build_object(
      'ticket_id', v_ticket.id,
      'original_name', p_original_name,
      'size_bytes', p_size_bytes
    ),
    'success',
    'api',
    null,
    null
  );

  return v_attachment;
end;
$$;

-- Privilegios
revoke all on function public.register_ticket_attachment(uuid, text, text, bigint, text, text) from public;
grant execute on function public.register_ticket_attachment(uuid, text, text, bigint, text, text) to authenticated;

comment on function public.register_ticket_attachment(uuid, text, text, bigint, text, text) is
  'TKT-014 / Bloque 2 v1: mutador seguro para registrar metadata de adjuntos. El cliente sube el binario a Supabase Storage out-of-band (signed URL, fuera de scope); esta función registra la metadata, valida convención de path, emite evento y audit. Atómica.';
