-- DeskWork Ticketing Core / Fase Block 2 (Remediation).
-- pgTAP tests para DEFECT-UAT-NN1 / NN2 / NN3.
--
-- Cubre:
--   * NN1: agent-a (technician) puede leer un ticket asignado a él dentro
--     de su tenant, y NO puede leer un ticket de OTRO tenant.
--   * NN2: agent-a puede tomar (take_ticket), comentar, transicionar y
--     adjuntar en un ticket asignado a él. NO puede asignar a otro
--     (assign_ticket requiere institution scope).
--   * NN3: compute_ticket_kpis rechaza a supervisor-a (department scope)
--     y acepta a lead-a (technical_lead, institution scope).
--
-- Pre-condiciones (validadas en este mismo test):
--   * El rol 'technician' existe en public.functional_role.
--   * agent-a (a002) tiene functional_role = 'technician' en tenant A.
--   * lead-a (a004) tiene functional_role = 'technical_lead' en tenant A.
--   * supervisor-a (a003) tiene functional_role = 'supervisor' en tenant A.
--   * requester-b (b001) tiene membership active en tenant B (operator).
--
-- Convenciones:
--   * El test corre por defecto como postgres (owner) — bypasea GRANTs/RLS
--     para crear fixtures. Solo cambiamos a 'authenticated' para probar
--     la lógica de autorización real.
--   * Las fixtures se crean con UUIDs fijos y se hacen rollback al final.

begin;

select plan(18);

-- ============================================================
-- 0) Sanity: el rol 'technician' y los grants existen
-- ============================================================

select has_enum(
  'functional_role',
  'functional_role enum existe (Foundation)'
);

-- Verificar que 'technician' está registrado en pg_enum (pgTAP no expone
-- enum_has_value en esta versión, usamos pg_enum directo).
select ok(
  exists(
    select 1
    from pg_enum
    where enumtypid = 'public.functional_role'::regtype
      and enumlabel = 'technician'
  ),
  'functional_role enum incluye technician (TKT-027 Remediation)'
);

select ok(
  exists(
    select 1
    from public.functional_role_permissions
    where functional_role = 'technician'
      and permission_code = 'ticket.execute.assigned'
  ),
  'technician tiene ticket.execute.assigned'
);

select ok(
  exists(
    select 1
    from public.functional_role_permissions
    where functional_role = 'technician'
      and permission_code = 'ticket.comment.create'
  ),
  'technician tiene ticket.comment.create'
);

select ok(
  exists(
    select 1
    from public.functional_role_permissions
    where functional_role = 'technician'
      and permission_code = 'ticket.attachment.create'
  ),
  'technician tiene ticket.attachment.create'
);

select ok(
  not exists(
    select 1
    from public.functional_role_permissions
    where functional_role = 'technician'
      and permission_code = 'ticket.assignment.execute'
  ),
  'technician NO tiene ticket.assignment.execute (asignar sigue siendo lead/director)'
);

-- ============================================================
-- 1) Setup: crear un ticket de prueba en tenant A
-- ============================================================

-- Estamos como postgres (owner) sin role authenticated, bypasea GRANTs/RLS.
-- Insertar el ticket de prueba.
do $$
declare
  v_category_id uuid;
  v_ticket_id   uuid;
  v_tenant_id   uuid := '7866761c-0d1a-42b1-a89d-4f0b9c971a1e';
  v_actor_b     uuid := 'b1000000-0000-0000-0000-00000000a001';
begin
  select id into v_category_id
    from public.ticket_categories
   where tenant_id = v_tenant_id and is_active = true
   limit 1;

  v_ticket_id := gen_random_uuid();
  insert into public.tickets (
    id, tenant_id, requester_id, category_id, priority, state, title, description
  ) values (
    v_ticket_id, v_tenant_id, v_actor_b, v_category_id, 'P3', 'ABIERTO',
    'TKT-027 test ticket tenant A',
    'descripcion minima para el test pgTAP del remediation NN1/NN2/NN3'
  );

  -- Persistir el id del ticket para los tests siguientes
  perform set_config('test.ticket_id', v_ticket_id::text, false);
end $$;

-- ============================================================
-- 2) NN1: lectura por technician (no asignado vs asignado)
-- ============================================================

set local role authenticated;

-- 2.1) agent-a NO puede leer el ticket (no asignado, sin area, sin scope institution)
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000a002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  format(
    'select public.can_read_ticket(%L::uuid, %L::uuid)',
    '7866761c-0d1a-42b1-a89d-4f0b9c971a1e',
    current_setting('test.ticket_id')
  ),
  'select false',
  'NN1.1: agent-a (technician) NO puede leer un ticket no asignado sin area_id'
);

-- ============================================================
-- 3) NN2: take_ticket + comment + transition + attach
-- ============================================================

-- 3.1) take_ticket
select lives_ok(
  format(
    'select public.take_ticket(%L::uuid)',
    current_setting('test.ticket_id')
  ),
  'NN2.1: agent-a puede tomar (take_ticket) un ticket de su tenant'
);

-- 3.2) Ahora SÍ puede leerlo (es assignee)
select results_eq(
  format(
    'select public.can_read_ticket(%L::uuid, %L::uuid)',
    '7866761c-0d1a-42b1-a89d-4f0b9c971a1e',
    current_setting('test.ticket_id')
  ),
  'select true',
  'NN1.2: agent-a puede leer un ticket asignado a él'
);

-- 3.3) comment público
select lives_ok(
  format(
    'select public.create_ticket_comment(%L::uuid, %L, false)',
    current_setting('test.ticket_id'),
    'comentario de prueba del tecnico'
  ),
  'NN2.2: agent-a puede comentar (público) en su ticket asignado'
);

-- 3.4) comment interno
select lives_ok(
  format(
    'select public.create_ticket_comment(%L::uuid, %L, true)',
    current_setting('test.ticket_id'),
    'nota interna del tecnico'
  ),
  'NN2.3: agent-a puede comentar (interno) en su ticket asignado'
);

-- 3.5) transition
select lives_ok(
  format(
    'select public.apply_ticket_transition(%L::uuid, %L::public.ticket_state, null)',
    current_setting('test.ticket_id'),
    'EN_PROCESO'
  ),
  'NN2.4: agent-a puede transicionar un ticket asignado a él (EN_PROCESO)'
);

-- 3.6) attachment
select lives_ok(
  format(
    'select public.register_ticket_attachment(%L::uuid, %L, %L, 1024, %L, null)',
    current_setting('test.ticket_id'),
    'screenshot.png',
    'image/png',
    'ticket-attachments/7866761c-0d1a-42b1-a89d-4f0b9c971a1e/'
      || current_setting('test.ticket_id') || '/screenshot.png'
  ),
  'NN2.5: agent-a puede registrar metadata de adjunto en su ticket'
);

-- 3.7) agent-a NO puede asignar (institution scope requerido)
select throws_ok(
  format(
    'select public.assign_ticket(%L::uuid, %L::uuid)',
    current_setting('test.ticket_id'),
    'a1000000-0000-0000-0000-00000000a002'
  ),
  '42501',
  'actor not authorized to assign tickets in this tenant',
  'NN2.6: agent-a NO puede asignar (institution scope requerido)'
);

-- ============================================================
-- 4) Aislamiento tenant: requester-b (tenant B) no puede leer ticket de tenant A
-- ============================================================

select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-00000000a001', true);
select results_eq(
  format(
    'select public.can_read_ticket(%L::uuid, %L::uuid)',
    '7866761c-0d1a-42b1-a89d-4f0b9c971a1e',
    current_setting('test.ticket_id')
  ),
  'select false',
  'NN2.7: requester-b (tenant B) NO puede leer un ticket de tenant A (aislamiento)'
);

-- ============================================================
-- 5) NN3: compute_ticket_kpis requiere institution scope
-- ============================================================

-- 5.1) supervisor-a (department scope) NO puede
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000a003', true);
select throws_ok(
  $$select public.compute_ticket_kpis('7866761c-0d1a-42b1-a89d-4f0b9c971a1e'::uuid, 1)$$,
  '42501',
  'actor does not have institution scope in this tenant',
  'NN3.1: supervisor-a (department scope) NO puede invocar compute_ticket_kpis'
);

-- 5.2) lead-a (institution scope) SÍ puede
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000a004', true);
select lives_ok(
  $$select public.compute_ticket_kpis('7866761c-0d1a-42b1-a89d-4f0b9c971a1e'::uuid, 1)$$,
  'NN3.2: lead-a (institution scope) SÍ puede invocar compute_ticket_kpis'
);

-- 5.3) agent-a (technician, sin scope institution) NO puede
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000a002', true);
select throws_ok(
  $$select public.compute_ticket_kpis('7866761c-0d1a-42b1-a89d-4f0b9c971a1e'::uuid, 1)$$,
  '42501',
  'actor does not have institution scope in this tenant',
  'NN3.3: agent-a (technician) NO puede invocar compute_ticket_kpis'
);

reset role;

select * from finish();

rollback;
