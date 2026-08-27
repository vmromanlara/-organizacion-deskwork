-- DeskWork Ticketing Core / Fase Block 1.
-- TKT-002 — RLS de tickets: 12+ policies + 7 helper functions SECURITY DEFINER.
-- Las funciones son STABLE, no PL/pgSQL; usan search_path seguro; nunca
-- se auto-referencian de forma recursiva; respetan tenant boundary.

-- ============================================================
-- Helper functions SECURITY DEFINER
-- ============================================================

-- ¿El usuario actual es el asignado de un ticket?
create or replace function public.is_ticket_assignee(target_tenant_id uuid, target_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.tickets t
    where t.tenant_id = target_tenant_id
      and t.id = target_ticket_id
      and t.assigned_to = auth.uid()
  );
$$;

-- ¿Puede el usuario actual leer el ticket? (requester self, scope, assigned, o institución)
create or replace function public.can_read_ticket(target_tenant_id uuid, target_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_active_member(target_tenant_id) and (
    exists (
      select 1 from public.tickets t
      where t.tenant_id = target_tenant_id
        and t.id = target_ticket_id
        and (
          t.requester_id = auth.uid()
          or t.assigned_to = auth.uid()
          or (public.has_permission(target_tenant_id, 'ticket.read.institution')
              and public.has_scope(target_tenant_id, 'institution'))
          or (public.has_permission(target_tenant_id, 'ticket.read.scope')
              and (
                (t.area_id is not null and public.has_scope(target_tenant_id, 'department', t.area_id))
                or (t.team_id is not null and public.has_scope(target_tenant_id, 'team', null, t.team_id))
              ))
        )
    )
  );
$$;

-- ¿Puede el usuario actual escribir (UPDATE) en el ticket? Requiere ticket.execute.assigned
-- (si soy el asignado) o ticket.status.execute (institución) o ticket.status.request + ejecutor.
-- Para UPDATE de tickets se usa una función más estricta: can_modify_ticket.
create or replace function public.can_modify_ticket(target_tenant_id uuid, target_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_active_member(target_tenant_id) and (
    public.is_ticket_assignee(target_tenant_id, target_ticket_id)
    or (public.has_permission(target_tenant_id, 'ticket.status.execute')
        and public.has_scope(target_tenant_id, 'institution'))
  );
$$;

-- ¿Puede el usuario actual crear comentarios en el ticket?
create or replace function public.can_comment_ticket(target_tenant_id uuid, target_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.has_permission(target_tenant_id, 'ticket.comment.create')
    and public.can_read_ticket(target_tenant_id, target_ticket_id);
$$;

-- ¿Puede el usuario actual registrar adjuntos en el ticket?
create or replace function public.can_attach_ticket(target_tenant_id uuid, target_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.has_permission(target_tenant_id, 'ticket.attachment.create')
    and public.can_read_ticket(target_tenant_id, target_ticket_id);
$$;

-- ¿Puede el usuario ver comentarios internos de un ticket? (No aplica a requester.)
create or replace function public.can_read_internal_comment(target_tenant_id uuid, target_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_active_member(target_tenant_id) and (
    public.is_ticket_assignee(target_tenant_id, target_ticket_id)
    or (public.has_permission(target_tenant_id, 'ticket.status.execute')
        and public.has_scope(target_tenant_id, 'institution'))
    or (public.has_permission(target_tenant_id, 'ticket.status.request')
        and public.can_read_ticket(target_tenant_id, target_ticket_id))
  );
$$;

-- ¿Puede el usuario asignar tickets en este tenant? (ticket.assignment.execute + scope institución)
create or replace function public.can_assign_ticket(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.has_permission(target_tenant_id, 'ticket.assignment.execute')
    and public.has_scope(target_tenant_id, 'institution');
$$;

-- ============================================================
-- Privilegios a nivel de tabla (sin privileges no hay RLS que valga)
-- ============================================================

-- Defense in depth: revocar TODO lo que las nuevas tablas traen por default
-- (incluyendo TRUNCATE). El patrón es idéntico al de
-- 20260820000600_harden_table_privileges.sql pero aplicado a las 6 tablas
-- nuevas. Foundation 3A no se toca.
revoke all privileges on table public.ticket_categories    from anon, authenticated;
revoke all privileges on table public.tickets              from anon, authenticated;
revoke all privileges on table public.ticket_attachments   from anon, authenticated;
revoke all privileges on table public.ticket_comments      from anon, authenticated;
revoke all privileges on table public.ticket_events        from anon, authenticated;
revoke all privileges on table public.ticket_assignments   from anon, authenticated;

grant select on public.ticket_categories   to authenticated;
grant select on public.tickets              to authenticated;
grant select on public.ticket_attachments   to authenticated;
grant select on public.ticket_comments      to authenticated;
grant select on public.ticket_events        to authenticated;
grant select on public.ticket_assignments   to authenticated;

-- Mutaciones sólo a través de SECURITY DEFINER (commit 5); no se otorgan a authenticated.
revoke insert, update, delete on public.ticket_categories   from authenticated;
revoke insert, update, delete on public.tickets              from authenticated;
revoke insert, update, delete on public.ticket_attachments   from authenticated;
revoke insert, update, delete on public.ticket_comments      from authenticated;
revoke insert, update, delete on public.ticket_events        from authenticated;
revoke insert, update, delete on public.ticket_assignments   from authenticated;

-- ============================================================
-- Policies (12 totales)
-- ============================================================

-- ticket_categories: SELECT — todo miembro activo del tenant lee categorías activas.
drop policy if exists ticket_categories_select_tenant on public.ticket_categories;
create policy ticket_categories_select_tenant
  on public.ticket_categories
  for select
  to authenticated
  using (public.is_active_member(tenant_id));

-- tickets: SELECT — requester, asignado, scope o institución.
drop policy if exists tickets_select_member on public.tickets;
create policy tickets_select_member
  on public.tickets
  for select
  to authenticated
  using (public.can_read_ticket(tenant_id, id));

-- tickets: INSERT — todo miembro activo del tenant puede crear (la lógica de scope
-- y permisos granulares la enforce la capa de servicio/API en commit 5/6).
drop policy if exists tickets_insert_member on public.tickets;
create policy tickets_insert_member
  on public.tickets
  for insert
  to authenticated
  with check (public.is_active_member(tenant_id));

-- tickets: UPDATE — agente asignado, lead o director del tenant.
drop policy if exists tickets_update_member on public.tickets;
create policy tickets_update_member
  on public.tickets
  for update
  to authenticated
  using (public.can_modify_ticket(tenant_id, id))
  with check (public.can_modify_ticket(tenant_id, id));

-- ticket_attachments: SELECT — todo participante del ticket.
drop policy if exists ticket_attachments_select_member on public.ticket_attachments;
create policy ticket_attachments_select_member
  on public.ticket_attachments
  for select
  to authenticated
  using (public.can_read_ticket(tenant_id, ticket_id));

-- ticket_attachments: INSERT — permiso ticket.attachment.create + lectura del ticket.
drop policy if exists ticket_attachments_insert_member on public.ticket_attachments;
create policy ticket_attachments_insert_member
  on public.ticket_attachments
  for insert
  to authenticated
  with check (public.can_attach_ticket(tenant_id, ticket_id));

-- ticket_comments: SELECT — participantes leen no-internal; agentes/lead ven internal.
drop policy if exists ticket_comments_select_member on public.ticket_comments;
create policy ticket_comments_select_member
  on public.ticket_comments
  for select
  to authenticated
  using (
    (is_internal = false
     and public.can_read_ticket(tenant_id, ticket_id))
    or (is_internal = true
        and public.can_read_internal_comment(tenant_id, ticket_id))
  );

-- ticket_comments: INSERT — permiso ticket.comment.create + lectura.
drop policy if exists ticket_comments_insert_member on public.ticket_comments;
create policy ticket_comments_insert_member
  on public.ticket_comments
  for insert
  to authenticated
  with check (public.can_comment_ticket(tenant_id, ticket_id));

-- ticket_events: SELECT — todo participante del ticket.
drop policy if exists ticket_events_select_member on public.ticket_events;
create policy ticket_events_select_member
  on public.ticket_events
  for select
  to authenticated
  using (public.can_read_ticket(tenant_id, ticket_id));

-- ticket_events: INSERT — sólo mediante SECURITY DEFINER (system actor o service role).
-- La policy permite INSERT sólo a service_role, denegándolo a authenticated.
drop policy if exists ticket_events_insert_system on public.ticket_events;
create policy ticket_events_insert_system
  on public.ticket_events
  for insert
  to authenticated
  with check (false);

-- ticket_assignments: SELECT — todo participante del ticket.
drop policy if exists ticket_assignments_select_member on public.ticket_assignments;
create policy ticket_assignments_select_member
  on public.ticket_assignments
  for select
  to authenticated
  using (public.can_read_ticket(tenant_id, ticket_id));

-- ticket_assignments: INSERT — sólo quien tiene ticket.assignment.execute + scope institución.
drop policy if exists ticket_assignments_insert_assignor on public.ticket_assignments;
create policy ticket_assignments_insert_assignor
  on public.ticket_assignments
  for insert
  to authenticated
  with check (public.can_assign_ticket(tenant_id));

-- Comments update: ventana de 5 minutos para el autor. Se valida con NOW() en USING/WITH CHECK.
drop policy if exists ticket_comments_update_author on public.ticket_comments;
create policy ticket_comments_update_author
  on public.ticket_comments
  for update
  to authenticated
  using (author_id = auth.uid() and created_at > now() - interval '5 minutes')
  with check (author_id = auth.uid() and created_at > now() - interval '5 minutes');

-- Comentario sobre el modelo de grants: ticket_events INSERT está cerrado a authenticated
-- para preservar inmutabilidad. La capa de servicio (TKT-005) usa service_role para emitir eventos.
comment on policy ticket_events_insert_system on public.ticket_events is
  'Inmutabilidad de la auditoría. Sólo SECURITY DEFINER (service_role) puede INSERT.';
