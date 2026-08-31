-- DeskWork Ticketing Core / TKT-014 v2.
-- Bucket privado `ticket-attachments` + RLS + helpers SECURITY DEFINER.
--
-- Convencion de path: `ticket-attachments/{tenant_id}/{ticket_id}/{filename}`.
-- El primer segmento actua como prefijo logico; el bucket en si es uno solo
-- y los paths viven todos dentro.
--
-- Por que bucket privado: la informacion de Ticketing no es publica. Acceso
-- via signed URLs temporales generadas por la API (no permanentes en DB).
--
-- Defense in depth:
--  1) Helpers SECURITY DEFINER validan path/tenant/permisos.
--  2) Policies en storage.objects usan esos helpers.
--  3) El client (browser) NO escribe directamente a Storage; la API es el
--     unico camino. La API usa service_role para I/O Storage y valida
--     actor + tenant + path antes de cada operacion.
--  4) El binario se sube PRIMERO y la metadata se registra DESPUES. Si
--     la metadata falla, el objeto se borra (cleanup) para evitar
--     huerfanos. La transaccion se realiza en el server, no en DB.

-- ============================================================
-- 1) Bucket
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  26214400, -- 25 MB; mismo limite que el CHECK del schema de tickets.
  null      -- null = acepta cualquier MIME; validamos por aplicacion.
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- ============================================================
-- 2) Helpers SECURITY DEFINER
-- ============================================================
create or replace function public.ticket_attachment_tenant_id(p_path text)
returns uuid
language plpgsql
immutable
security definer
set search_path = public, storage
as $$
declare
  v_tenant text;
begin
  -- Path: ticket-attachments/{tenant_id}/{ticket_id}/{filename}
  v_tenant := split_part(p_path, '/', 2);
  if v_tenant is null or v_tenant = '' then
    return null;
  end if;
  begin
    return v_tenant::uuid;
  exception when others then
    return null;
  end;
end;
$$;

revoke all on function public.ticket_attachment_tenant_id(text) from public;
grant execute on function public.ticket_attachment_tenant_id(text) to authenticated;

-- Puede el actor actual subir/eliminar un objeto en el bucket cuyo path
-- pertenece al tenant del path?
create or replace function public.can_upload_to_attachment_bucket(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, storage
as $$
declare
  v_actor uuid := auth.uid();
  v_tenant uuid;
begin
  if v_actor is null then return false; end if;
  v_tenant := public.ticket_attachment_tenant_id(p_path);
  if v_tenant is null then return false; end if;
  return public.is_active_member(v_tenant);
end;
$$;

revoke all on function public.can_upload_to_attachment_bucket(text) from public;
grant execute on function public.can_upload_to_attachment_bucket(text) to authenticated;

-- Puede el actor actual leer (signed URL o SELECT directo) objetos del
-- bucket cuyo path pertenece a su tenant?
create or replace function public.can_read_attachment_bucket(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, storage
as $$
  select public.can_upload_to_attachment_bucket(p_path);
$$;

revoke all on function public.can_read_attachment_bucket(text) from public;
grant execute on function public.can_read_attachment_bucket(text) to authenticated;

-- ============================================================
-- 3) Policies en storage.objects
-- ============================================================
-- RLS ya esta habilitado por defecto en storage.objects (Supabase init).
-- Anadimos policies adicionales que validan tenant via path.

drop policy if exists "ticket_attachments_insert" on storage.objects;
create policy "ticket_attachments_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and public.can_upload_to_attachment_bucket(name)
  );

drop policy if exists "ticket_attachments_delete" on storage.objects;
create policy "ticket_attachments_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and public.can_upload_to_attachment_bucket(name)
  );

-- SELECT y UPDATE: el acceso de lectura se hace via signed URLs generadas
-- por la API (que validan tenant/permission antes de firmar). El SELECT
-- directo esta cerrado en storage.objects: los clientes que necesiten
-- descargar pasan por GET /api/tickets/[id]/attachments/[attId]/url.
-- Defense in depth: aunque el cliente intentara SELECT directo, las
-- policies no lo permitiran salvo via service_role (que es server-side).
-- Esto esta alineado con la decision de bucket privado.
-- (La API puede usar service_role para signed URLs.)

comment on function public.ticket_attachment_tenant_id(text) is
  'TKT-014 v2: extrae el tenant_id del path `ticket-attachments/{tenant_id}/{ticket_id}/{filename}`. Retorna null si el path es invalido.';
comment on function public.can_upload_to_attachment_bucket(text) is
  'TKT-014 v2: el actor actual puede escribir/borrar objetos en el bucket cuyo path pertenece a un tenant donde es miembro activo.';
comment on function public.can_read_attachment_bucket(text) is
  'TKT-014 v2: el actor actual puede leer objetos del bucket cuyo path pertenece a su tenant. (Defense in depth — el acceso real va por signed URL.)';
