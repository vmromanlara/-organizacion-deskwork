-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- No DDL or DML outside the transaction block.

begin;
select plan(19);

-- ============================================================
-- TKT-014 v2 — Storage infrastructure para adjuntos de ticket
-- Migration: 20260827000850_storage_attachments.sql
--
-- Cubre:
--   1) Bucket `ticket-attachments` (privado, 25MB).
--   2) Helper `ticket_attachment_tenant_id` (extrae tenant del path).
--   3) Helper `can_upload_to_attachment_bucket` (autorización).
--   4) Helper `can_read_attachment_bucket` (defense in depth).
--   5) ACL: PUBLIC no EXECUTE; authenticated SÍ EXECUTE.
--   6) RLS policies en storage.objects.
-- ============================================================

-- ============================================================
-- 1) Bucket
-- ============================================================

-- TEST-STG-01: el bucket `ticket-attachments` existe.
select ok(
  exists(
    select 1 from storage.buckets where id = 'ticket-attachments'
  ),
  'TEST-STG-01: bucket ticket-attachments existe'
);

-- TEST-STG-02: el bucket es privado (public = false).
select ok(
  coalesce(
    (select public from storage.buckets where id = 'ticket-attachments' limit 1),
    false
  ) = false,
  'TEST-STG-02: bucket ticket-attachments es privado (public=false)'
);

-- TEST-STG-03: el bucket tiene el límite de 25MB.
select ok(
  coalesce(
    (select file_size_limit from storage.buckets where id = 'ticket-attachments' limit 1),
    0
  ) = 26214400,
  'TEST-STG-03: file_size_limit del bucket es 25MB (26214400)'
);

-- ============================================================
-- 2) Helper ticket_attachment_tenant_id
-- ============================================================

-- TEST-STG-04: extrae el tenant_id de un path válido.
select is(
  public.ticket_attachment_tenant_id(
    'ticket-attachments/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/captura.png'
  ),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'TEST-STG-04: extrae tenant_id (UUID) del path'
);

-- TEST-STG-05: retorna NULL si el path no tiene tenant.
select is(
  public.ticket_attachment_tenant_id('ticket-attachments//ticket/file.png'),
  null,
  'TEST-STG-05: retorna NULL si el path no tiene tenant'
);

-- TEST-STG-06: retorna NULL si el segmento no es UUID.
select is(
  public.ticket_attachment_tenant_id('ticket-attachments/no-uuid/ticket/file.png'),
  null,
  'TEST-STG-06: retorna NULL si el segundo segmento no es UUID'
);

-- TEST-STG-07: retorna NULL si el path es vacío.
select is(
  public.ticket_attachment_tenant_id(''),
  null,
  'TEST-STG-07: retorna NULL si el path es vacío'
);

-- ============================================================
-- 3) Helper can_upload_to_attachment_bucket
-- ============================================================

-- TEST-STG-08: retorna false sin auth.uid() (no actor).
-- (El test corre como superuser; auth.uid() es null.)
select ok(
  public.can_upload_to_attachment_bucket(
    'ticket-attachments/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/captura.png'
  ) = false,
  'TEST-STG-08: can_upload_to_attachment_bucket retorna false sin auth.uid()'
);

-- TEST-STG-09: retorna false con path inválido (sin tenant_id).
select ok(
  public.can_upload_to_attachment_bucket('invalid/path/no/tenant') = false,
  'TEST-STG-09: can_upload_to_attachment_bucket retorna false con path inválido'
);

-- ============================================================
-- 4) Helper can_read_attachment_bucket
-- ============================================================

-- TEST-STG-10: existe.
select ok(
  has_function_privilege('authenticated', 'public.can_read_attachment_bucket(text)', 'execute'),
  'TEST-STG-10: can_read_attachment_bucket existe y es ejecutable por authenticated'
);

-- TEST-STG-11: retorna false sin auth.uid().
select ok(
  public.can_read_attachment_bucket(
    'ticket-attachments/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/captura.png'
  ) = false,
  'TEST-STG-11: can_read_attachment_bucket retorna false sin auth.uid()'
);

-- ============================================================
-- 5) ACL — defense in depth
-- ============================================================

-- TEST-STG-12: PUBLIC no EXECUTE sobre ticket_attachment_tenant_id.
select ok(
  not has_function_privilege('public', 'public.ticket_attachment_tenant_id(text)', 'execute'),
  'TEST-STG-12: PUBLIC no tiene EXECUTE sobre ticket_attachment_tenant_id'
);

-- TEST-STG-13: PUBLIC no EXECUTE sobre can_upload_to_attachment_bucket.
select ok(
  not has_function_privilege('public', 'public.can_upload_to_attachment_bucket(text)', 'execute'),
  'TEST-STG-13: PUBLIC no tiene EXECUTE sobre can_upload_to_attachment_bucket'
);

-- TEST-STG-14: PUBLIC no EXECUTE sobre can_read_attachment_bucket.
select ok(
  not has_function_privilege('public', 'public.can_read_attachment_bucket(text)', 'execute'),
  'TEST-STG-14: PUBLIC no tiene EXECUTE sobre can_read_attachment_bucket'
);

-- TEST-STG-15: authenticated SÍ EXECUTE sobre ticket_attachment_tenant_id.
select ok(
  has_function_privilege('authenticated', 'public.ticket_attachment_tenant_id(text)', 'execute'),
  'TEST-STG-15: authenticated SÍ tiene EXECUTE sobre ticket_attachment_tenant_id'
);

-- TEST-STG-16: authenticated SÍ EXECUTE sobre can_upload_to_attachment_bucket.
select ok(
  has_function_privilege('authenticated', 'public.can_upload_to_attachment_bucket(text)', 'execute'),
  'TEST-STG-16: authenticated SÍ tiene EXECUTE sobre can_upload_to_attachment_bucket'
);

-- ============================================================
-- 6) RLS policies en storage.objects
-- ============================================================

-- TEST-STG-17: policy `ticket_attachments_insert` existe.
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'ticket_attachments_insert'
  ),
  'TEST-STG-17: RLS policy ticket_attachments_insert existe en storage.objects'
);

-- TEST-STG-18: policy `ticket_attachments_delete` existe.
select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'ticket_attachments_delete'
  ),
  'TEST-STG-18: RLS policy ticket_attachments_delete existe en storage.objects'
);

-- TEST-STG-19: NO hay policy de SELECT público del bucket (el acceso se
-- hace via signed URL generada por la API con service_role).
select ok(
  not exists(
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'ticket_attachments_select',
        'ticket_attachments_select_anon',
        'ticket_attachments_public_select'
      )
  ),
  'TEST-STG-19: NO hay policy de SELECT público del bucket (defense in depth)'
);

select * from finish();
rollback;
