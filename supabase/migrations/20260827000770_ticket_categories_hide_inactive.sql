-- DeskWork Ticketing Core / Post PO-Decisions.
-- F-09 — Categorías inactivas: ocultar en la selección normal.
-- La policy de SELECT sobre public.ticket_categories debe exigir:
--   (1) is_active_member(tenant_id)               -- multi-tenant intacto
--   (2) category.tenant_id = current tenant
--   (3) is_active = true                          -- F-09 (ocultar inactivas)
-- Esta migration reemplaza la policy original del commit 4 (RLS) sin tocar
-- ninguna otra policy ni Foundation 3A.

drop policy if exists ticket_categories_select_tenant on public.ticket_categories;
create policy ticket_categories_select_tenant
  on public.ticket_categories
  for select
  to authenticated
  using (
    public.is_active_member(tenant_id)
    and is_active = true
  );

comment on policy ticket_categories_select_tenant on public.ticket_categories is
  'F-09 (PO 2026-08-27): categorías activas del tenant. Las inactivas (is_active=false) quedan ocultas para el rol authenticated en la selección normal. Multi-tenant preservado.';
