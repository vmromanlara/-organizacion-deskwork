-- TEST ISOLATION CONTRACT
-- This file MUST be wrapped in begin; ... rollback;.
-- All fixtures MUST use fixed UUIDs to enable deterministic re-runs.
-- No DDL or DML outside the transaction block.

begin;
select plan(14);

-- ============================================================
-- ACL de las 7 funciones SECURITY DEFINER de Ticketing
-- Bloque 1 Remediación: hardening vía 20260827000740_tickets_hardening_acl.sql
-- ============================================================
-- Esperado: PUBLIC no tiene EXECUTE; authenticated tiene EXECUTE.
-- service_role y anon NO tienen EXECUTE (no fueron otorgados).

-- TEST-ACL-01: is_ticket_assignee — PUBLIC no EXECUTE.
select ok(
  not has_function_privilege('public', 'public.is_ticket_assignee(uuid, uuid)', 'execute'),
  'TEST-ACL-01: PUBLIC no tiene EXECUTE sobre is_ticket_assignee'
);

-- TEST-ACL-02: can_read_ticket — PUBLIC no EXECUTE.
select ok(
  not has_function_privilege('public', 'public.can_read_ticket(uuid, uuid)', 'execute'),
  'TEST-ACL-02: PUBLIC no tiene EXECUTE sobre can_read_ticket'
);

-- TEST-ACL-03: can_modify_ticket — PUBLIC no EXECUTE.
select ok(
  not has_function_privilege('public', 'public.can_modify_ticket(uuid, uuid)', 'execute'),
  'TEST-ACL-03: PUBLIC no tiene EXECUTE sobre can_modify_ticket'
);

-- TEST-ACL-04: can_comment_ticket — PUBLIC no EXECUTE.
select ok(
  not has_function_privilege('public', 'public.can_comment_ticket(uuid, uuid)', 'execute'),
  'TEST-ACL-04: PUBLIC no tiene EXECUTE sobre can_comment_ticket'
);

-- TEST-ACL-05: can_attach_ticket — PUBLIC no EXECUTE.
select ok(
  not has_function_privilege('public', 'public.can_attach_ticket(uuid, uuid)', 'execute'),
  'TEST-ACL-05: PUBLIC no tiene EXECUTE sobre can_attach_ticket'
);

-- TEST-ACL-06: can_read_internal_comment — PUBLIC no EXECUTE.
select ok(
  not has_function_privilege('public', 'public.can_read_internal_comment(uuid, uuid)', 'execute'),
  'TEST-ACL-06: PUBLIC no tiene EXECUTE sobre can_read_internal_comment'
);

-- TEST-ACL-07: can_assign_ticket — PUBLIC no EXECUTE.
select ok(
  not has_function_privilege('public', 'public.can_assign_ticket(uuid)', 'execute'),
  'TEST-ACL-07: PUBLIC no tiene EXECUTE sobre can_assign_ticket'
);

-- ============================================================
-- Verificación positiva: authenticated SÍ tiene EXECUTE.
-- El freeze v3 §3.A exige que las funciones sean invocables
-- por el actor (vía el RLS policy evaluator) en sesión authenticated.
-- ============================================================

-- TEST-ACL-08: is_ticket_assignee — authenticated SÍ tiene EXECUTE.
select ok(
  has_function_privilege('authenticated', 'public.is_ticket_assignee(uuid, uuid)', 'execute'),
  'TEST-ACL-08: authenticated SÍ tiene EXECUTE sobre is_ticket_assignee'
);

-- TEST-ACL-09: can_read_ticket — authenticated SÍ tiene EXECUTE.
select ok(
  has_function_privilege('authenticated', 'public.can_read_ticket(uuid, uuid)', 'execute'),
  'TEST-ACL-09: authenticated SÍ tiene EXECUTE sobre can_read_ticket'
);

-- TEST-ACL-10: can_modify_ticket — authenticated SÍ tiene EXECUTE.
select ok(
  has_function_privilege('authenticated', 'public.can_modify_ticket(uuid, uuid)', 'execute'),
  'TEST-ACL-10: authenticated SÍ tiene EXECUTE sobre can_modify_ticket'
);

-- TEST-ACL-11: can_comment_ticket — authenticated SÍ tiene EXECUTE.
select ok(
  has_function_privilege('authenticated', 'public.can_comment_ticket(uuid, uuid)', 'execute'),
  'TEST-ACL-11: authenticated SÍ tiene EXECUTE sobre can_comment_ticket'
);

-- TEST-ACL-12: can_attach_ticket — authenticated SÍ tiene EXECUTE.
select ok(
  has_function_privilege('authenticated', 'public.can_attach_ticket(uuid, uuid)', 'execute'),
  'TEST-ACL-12: authenticated SÍ tiene EXECUTE sobre can_attach_ticket'
);

-- TEST-ACL-13: can_read_internal_comment — authenticated SÍ tiene EXECUTE.
select ok(
  has_function_privilege('authenticated', 'public.can_read_internal_comment(uuid, uuid)', 'execute'),
  'TEST-ACL-13: authenticated SÍ tiene EXECUTE sobre can_read_internal_comment'
);

-- TEST-ACL-14: can_assign_ticket — authenticated SÍ tiene EXECUTE.
select ok(
  has_function_privilege('authenticated', 'public.can_assign_ticket(uuid)', 'execute'),
  'TEST-ACL-14: authenticated SÍ tiene EXECUTE sobre can_assign_ticket'
);

select * from finish();
rollback;
