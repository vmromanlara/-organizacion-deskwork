-- DeskWork Ticketing Core / Fase Block 1.
-- Remediation: hardening de ACL para funciones SECURITY DEFINER de tickets.
-- Por defecto, PostgreSQL concede EXECUTE a PUBLIC al crear una funcion.
-- Esto significa que cualquier rol (anon, authenticated, service_role) podria
-- invocar estas funciones directamente. Para funciones SECURITY DEFINER que
-- validan tenant boundary, esto es un riesgo: un attacker podria llamar
-- is_active_member(tenant_uuid) sin pasar por la capa de Supabase Auth.
--
-- Esta migration aplica el patron de defensa en profundidad:
--   REVOKE EXECUTE ... FROM PUBLIC
--   GRANT EXECUTE ... TO authenticated
-- De este modo, solo los usuarios autenticados pueden invocar las funciones,
-- y el auth.uid() de Supabase evalua correctamente.
--
-- NO se modifican las firmas, cuerpos, search_path, ni el flag SECURITY DEFINER.
-- NO se ampla el alcance de ninguna funcion.
-- Foundation 3A no se toca (las funciones de Foundation mantienen su ACL por defecto).

-- ============================================================
-- 1. is_ticket_assignee
-- ============================================================
revoke execute on function public.is_ticket_assignee(uuid, uuid) from public;
grant  execute on function public.is_ticket_assignee(uuid, uuid) to authenticated;

-- ============================================================
-- 2. can_read_ticket
-- ============================================================
revoke execute on function public.can_read_ticket(uuid, uuid) from public;
grant  execute on function public.can_read_ticket(uuid, uuid) to authenticated;

-- ============================================================
-- 3. can_modify_ticket
-- ============================================================
revoke execute on function public.can_modify_ticket(uuid, uuid) from public;
grant  execute on function public.can_modify_ticket(uuid, uuid) to authenticated;

-- ============================================================
-- 4. can_comment_ticket
-- ============================================================
revoke execute on function public.can_comment_ticket(uuid, uuid) from public;
grant  execute on function public.can_comment_ticket(uuid, uuid) to authenticated;

-- ============================================================
-- 5. can_attach_ticket
-- ============================================================
revoke execute on function public.can_attach_ticket(uuid, uuid) from public;
grant  execute on function public.can_attach_ticket(uuid, uuid) to authenticated;

-- ============================================================
-- 6. can_read_internal_comment
-- ============================================================
revoke execute on function public.can_read_internal_comment(uuid, uuid) from public;
grant  execute on function public.can_read_internal_comment(uuid, uuid) to authenticated;

-- ============================================================
-- 7. can_assign_ticket
-- ============================================================
revoke execute on function public.can_assign_ticket(uuid) from public;
grant  execute on function public.can_assign_ticket(uuid) to authenticated;

comment on function public.is_ticket_assignee(uuid, uuid) is
  'Hardened ACL (Block 1 remediation): EXECUTE revoked from PUBLIC, granted to authenticated only.';
comment on function public.can_read_ticket(uuid, uuid) is
  'Hardened ACL (Block 1 remediation): EXECUTE revoked from PUBLIC, granted to authenticated only.';
comment on function public.can_modify_ticket(uuid, uuid) is
  'Hardened ACL (Block 1 remediation): EXECUTE revoked from PUBLIC, granted to authenticated only.';
comment on function public.can_comment_ticket(uuid, uuid) is
  'Hardened ACL (Block 1 remediation): EXECUTE revoked from PUBLIC, granted to authenticated only.';
comment on function public.can_attach_ticket(uuid, uuid) is
  'Hardened ACL (Block 1 remediation): EXECUTE revoked from PUBLIC, granted to authenticated only.';
comment on function public.can_read_internal_comment(uuid, uuid) is
  'Hardened ACL (Block 1 remediation): EXECUTE revoked from PUBLIC, granted to authenticated only.';
comment on function public.can_assign_ticket(uuid) is
  'Hardened ACL (Block 1 remediation): EXECUTE revoked from PUBLIC, granted to authenticated only.';
