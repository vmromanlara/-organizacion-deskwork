-- DeskWork Ticketing Core / Fase Block 1 — Remediación.
-- Endurecimiento de public.can_modify_ticket():
-- verificación EXPLÍCITA del permiso `ticket.execute.assigned` además de la
-- comprobación de asignación. La intención queda autodocumentada y
-- defense-in-depth: si un cambio futuro rompe la FK de assigned_to, el
-- permiso sigue verificando la capacidad del actor para modificar.
--
-- El comportamiento es equivalente al anterior (cualquiera con assigned_to o
-- con status.execute en la institución puede modificar) pero ahora el permiso
-- queda explícito en la función.
--
-- No se modifican firmas ni search_path ni el flag SECURITY DEFINER.
-- Foundation 3A no se toca.

create or replace function public.can_modify_ticket(
  target_tenant_id uuid,
  target_ticket_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_active_member(target_tenant_id) and (
    -- Vía ticket.execute.assigned (operador/supervisor/technical_lead asignado)
    public.has_permission(target_tenant_id, 'ticket.execute.assigned')
    -- O por asignación directa al ticket (defense in depth)
    or public.is_ticket_assignee(target_tenant_id, target_ticket_id)
    -- O por ticket.status.execute a nivel de institución (lead/director)
    or (
      public.has_permission(target_tenant_id, 'ticket.status.execute')
      and public.has_scope(target_tenant_id, 'institution')
    )
  );
$$;

-- Mantener ACL del bloque de remediación (20260827000740).
revoke execute on function public.can_modify_ticket(uuid, uuid) from public;
grant  execute on function public.can_modify_ticket(uuid, uuid) to authenticated;

comment on function public.can_modify_ticket(uuid, uuid) is
  'Remediation 2026-08-27: explicit check on ticket.execute.assigned + is_ticket_assignee + status.execute.';
