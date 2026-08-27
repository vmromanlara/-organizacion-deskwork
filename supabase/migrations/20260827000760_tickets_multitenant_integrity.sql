-- DeskWork Ticketing Core / Fase Block 1 — Remediación.
-- Multi-tenant integrity via composite FKs y constraints a nivel de DB.
-- Antes, las filas hijas (attachments, comments, events, assignments) tenían
-- un tenant_id independiente del ticket, sin enforce de que coincidiera.
-- Un INSERT cross-tenant sólo era bloqueado por las policies RLS — un fallo
-- de policy (o una inserción vía service_role) podría crear registros huérfanos.
-- Esta migration agrega FKs compuestas que el optimizador y los constraints
-- chequean ANTES de las policies.

-- ============================================================
-- 1. tickets.category_id debe corresponder al mismo tenant
-- ============================================================
alter table public.tickets
  drop constraint if exists tickets_category_tenant_fk;
alter table public.tickets
  add constraint tickets_category_tenant_fk
  foreign key (tenant_id, category_id)
  references public.ticket_categories(tenant_id, id)
  on delete restrict
  not valid;
alter table public.tickets validate constraint tickets_category_tenant_fk;

-- ============================================================
-- 2. ticket_attachments.tenant_id debe coincidir con tickets.tenant_id
-- ============================================================
alter table public.ticket_attachments
  drop constraint if exists ticket_attachments_ticket_tenant_fk;
alter table public.ticket_attachments
  add constraint ticket_attachments_ticket_tenant_fk
  foreign key (ticket_id, tenant_id)
  references public.tickets(id, tenant_id)
  on delete cascade
  not valid;
alter table public.ticket_attachments validate constraint ticket_attachments_ticket_tenant_fk;

-- ============================================================
-- 3. ticket_comments.tenant_id debe coincidir con tickets.tenant_id
-- ============================================================
alter table public.ticket_comments
  drop constraint if exists ticket_comments_ticket_tenant_fk;
alter table public.ticket_comments
  add constraint ticket_comments_ticket_tenant_fk
  foreign key (ticket_id, tenant_id)
  references public.tickets(id, tenant_id)
  on delete cascade
  not valid;
alter table public.ticket_comments validate constraint ticket_comments_ticket_tenant_fk;

-- ============================================================
-- 4. ticket_events.tenant_id debe coincidir con tickets.tenant_id
-- ============================================================
alter table public.ticket_events
  drop constraint if exists ticket_events_ticket_tenant_fk;
alter table public.ticket_events
  add constraint ticket_events_ticket_tenant_fk
  foreign key (ticket_id, tenant_id)
  references public.tickets(id, tenant_id)
  on delete cascade
  not valid;
alter table public.ticket_events validate constraint ticket_events_ticket_tenant_fk;

-- ============================================================
-- 5. ticket_assignments.tenant_id debe coincidir con tickets.tenant_id
-- ============================================================
alter table public.ticket_assignments
  drop constraint if exists ticket_assignments_ticket_tenant_fk;
alter table public.ticket_assignments
  add constraint ticket_assignments_ticket_tenant_fk
  foreign key (ticket_id, tenant_id)
  references public.tickets(id, tenant_id)
  on delete cascade
  not valid;
alter table public.ticket_assignments validate constraint ticket_assignments_ticket_tenant_fk;

-- ============================================================
-- 6. ticket_assignments: unassigned_at >= assigned_at
-- ============================================================
alter table public.ticket_assignments
  drop constraint if exists ticket_assignments_unassigned_after_assigned;
alter table public.ticket_assignments
  add constraint ticket_assignments_unassigned_after_assigned
  check (unassigned_at is null or unassigned_at >= assigned_at);

-- ============================================================
-- 7. ticket_assignments.assigned_by debe ser un usuario del mismo tenant
-- (queda enforced a nivel de RLS/service layer; ver documentación Bloque 1 §10)
-- ============================================================
-- Esta invariante requiere verificar que existe una membership activa
-- en public.memberships(tenant_id, user_id) con status='active'.
-- No se modela como FK porque memberships es many-to-many. La validación
-- se hace en la capa service (Bloque 2) y en las RLS policies que filtran
-- por is_active_member(tenant_id). El constraint no es una FK clásica
-- sino una función check que se valida al INSERT.

-- ============================================================
-- Comentarios de auditoría
-- ============================================================
comment on constraint tickets_category_tenant_fk on public.tickets is
  'Remediation 2026-08-27: category debe pertenecer al mismo tenant que el ticket.';
comment on constraint ticket_attachments_ticket_tenant_fk on public.ticket_attachments is
  'Remediation 2026-08-27: attachment debe pertenecer al mismo tenant que el ticket.';
comment on constraint ticket_comments_ticket_tenant_fk on public.ticket_comments is
  'Remediation 2026-08-27: comment debe pertenecer al mismo tenant que el ticket.';
comment on constraint ticket_events_ticket_tenant_fk on public.ticket_events is
  'Remediation 2026-08-27: event debe pertenecer al mismo tenant que el ticket.';
comment on constraint ticket_assignments_ticket_tenant_fk on public.ticket_assignments is
  'Remediation 2026-08-27: assignment debe pertenecer al mismo tenant que el ticket.';
comment on constraint ticket_assignments_unassigned_after_assigned on public.ticket_assignments is
  'Remediation 2026-08-27: unassigned_at debe ser >= assigned_at (o NULL).';
