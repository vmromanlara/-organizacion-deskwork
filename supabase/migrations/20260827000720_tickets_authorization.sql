-- DeskWork Ticketing Core / Fase Block 1.
-- TKT-003 — Refinamiento de authorization: 5 permisos nuevos para Ticketing.
-- Los códigos siguen el constraint Foundation `^[a-z_]+(?:\.[a-z_]+){2,3}$`
-- (3 o 4 segmentos). Esta migration NO modifica permisos existentes de
-- Foundation; sólo agrega 5 nuevos a authorization_permissions y los asigna
-- a los functional_role_permissions conforme a la matriz canónica v3 §2.2.

-- 5 permisos nuevos.
insert into public.authorization_permissions (code, description) values
  ('ticket.assignment.execute', 'Assign or reassign a ticket to an active tenant member.'),
  ('ticket.comment.create', 'Add a public or internal comment to a ticket.'),
  ('ticket.attachment.create', 'Register an attachment (metadata) on a ticket.'),
  ('ticket.kpis.read.institution', 'Read aggregated ticket KPIs across the institution.'),
  ('ticket.execute.assigned', 'Execute authorized status transitions on tickets assigned to me.')
on conflict (code) do nothing;

-- Asignaciones a functional_role_permissions conforme a la matriz v3 §2.2.
-- ticket.assignment.execute     -> technical_lead, director
-- ticket.comment.create         -> operator, administrative, supervisor, technical_lead, director
-- ticket.attachment.create      -> operator, administrative, supervisor, technical_lead, director
-- ticket.kpis.read.institution  -> technical_lead, director
-- ticket.execute.assigned       -> operator, supervisor, technical_lead  (no administrative, no director)
insert into public.functional_role_permissions (functional_role, permission_code) values
  ('technical_lead', 'ticket.assignment.execute'),
  ('technical_lead', 'ticket.comment.create'),
  ('technical_lead', 'ticket.attachment.create'),
  ('technical_lead', 'ticket.kpis.read.institution'),
  ('technical_lead', 'ticket.execute.assigned'),
  ('director', 'ticket.assignment.execute'),
  ('director', 'ticket.comment.create'),
  ('director', 'ticket.attachment.create'),
  ('director', 'ticket.kpis.read.institution'),
  ('supervisor', 'ticket.comment.create'),
  ('supervisor', 'ticket.attachment.create'),
  ('supervisor', 'ticket.execute.assigned'),
  ('administrative', 'ticket.comment.create'),
  ('administrative', 'ticket.attachment.create'),
  ('operator', 'ticket.comment.create'),
  ('operator', 'ticket.attachment.create'),
  ('operator', 'ticket.execute.assigned')
on conflict do nothing;

comment on table public.authorization_permissions is
  'Catálogo de permisos. Foundation Fase 3A + 5 entradas nuevas de Ticketing Core (TKT-003).';
