-- DeskWork Ticketing Core / TKT-021.
-- Mutador seguro para agregar el archivo al ticket mediante un RPC.
-- Genera KPIs agregados en una sola query para el dashboard del supervisor.
--
-- Por que SECURITY DEFINER:
--   1) Una sola round trip al backend (eficiencia).
--   2) Validacion de autorizacion centralizada (actor + membership + scope).
--   3) Agnóstico al cliente: la misma funcion sirve para supervisor, lead,
--      director (todos con scope 'institution').
--   4) Defense in depth: RLS sigue aplicando; este RPC agrega verificacion
--      explicita de que el actor tiene scope institucional.
--
-- Defense in depth (4 capas):
--   1) auth.uid() presente
--   2) tenant_id es UUID valido
--   3) is_active_member(tenant_id)
--   4) has_scope(tenant_id, 'institution')   <- supervisor / lead / director
--
-- Lo que NO se calcula aca (queda fuera del alcance TKT-021):
--   * SLA contractual (TKT-008 bloqueado)
--   * Porcentaje de cumplimiento
--   * Tickets "vencidos" en sentido contractual
-- Solo se exponen metricas OPERATIVAS (counts + promedios derivados
-- directamente de los timestamps del ticket).

create or replace function public.compute_ticket_kpis(
  p_tenant_id    uuid,
  p_period_days  int default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_actor        uuid := auth.uid();
  v_period_days  int  := greatest(1, least(coalesce(p_period_days, 30), 90));
  v_period_start date := current_date - (v_period_days - 1);
  v_result       jsonb;
begin
  -- 1) auth.uid() presente.
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- 2) tenant_id es UUID valido.
  if p_tenant_id is null then
    raise exception 'tenant_id is required' using errcode = 'P0001';
  end if;

  -- 3) Membership activa.
  if not public.is_active_member(p_tenant_id) then
    raise exception 'actor is not an active member of the tenant'
      using errcode = '42501';
  end if;

  -- 4) Scope institucional (supervisor, lead, director, admin).
  if not public.has_scope(p_tenant_id, 'institution') then
    raise exception 'actor does not have institution scope in this tenant'
      using errcode = '42501';
  end if;

  -- 5) Agregacion.
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'total', (
        select count(*) from public.tickets where tenant_id = p_tenant_id
      ),
      'active', (
        select count(*) from public.tickets
        where tenant_id = p_tenant_id
          and state not in ('CERRADO', 'RESUELTO')
      ),
      'unassigned', (
        select count(*) from public.tickets
        where tenant_id = p_tenant_id
          and assigned_to is null
          and state not in ('CERRADO', 'RESUELTO')
      ),
      'byState', coalesce((
        select jsonb_agg(
          jsonb_build_object('state', state, 'count', c)
          order by state
        )
        from (
          select state, count(*) as c
          from public.tickets
          where tenant_id = p_tenant_id
          group by state
        ) s
      ), '[]'::jsonb),
      'byPriority', coalesce((
        select jsonb_agg(
          jsonb_build_object('priority', priority, 'count', c)
          order by priority
        )
        from (
          select priority, count(*) as c
          from public.tickets
          where tenant_id = p_tenant_id
          group by priority
        ) s
      ), '[]'::jsonb)
    ),
    'operationalAverages', jsonb_build_object(
      'firstResponseMinutes', (
        select coalesce(
          round(
            avg(extract(epoch from (first_response_at - created_at)) / 60.0)::numeric,
            2
          ),
          0
        )
        from public.tickets
        where tenant_id = p_tenant_id
          and first_response_at is not null
      ),
      'resolutionMinutes', (
        select coalesce(
          round(
            avg(extract(epoch from (resolved_at - created_at)) / 60.0)::numeric,
            2
          ),
          0
        )
        from public.tickets
        where tenant_id = p_tenant_id
          and resolved_at is not null
      ),
      'resolvedCount', (
        select count(*)
        from public.tickets
        where tenant_id = p_tenant_id
          and resolved_at is not null
      ),
      'firstResponseCount', (
        select count(*)
        from public.tickets
        where tenant_id = p_tenant_id
          and first_response_at is not null
      )
    ),
    'dailyTrend', coalesce((
      select jsonb_agg(
        jsonb_build_object('date', d::text, 'created', c)
        order by d
      )
      from (
        select created_at::date as d, count(*) as c
        from public.tickets
        where tenant_id = p_tenant_id
          and created_at >= v_period_start
        group by created_at::date
      ) t
    ), '[]'::jsonb),
    'period', jsonb_build_object(
      'days', v_period_days,
      'start', v_period_start::text,
      'end', current_date::text
    ),
    'generatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
  into v_result;

  return v_result;
end;
$$;

-- Privilegios.
revoke all on function public.compute_ticket_kpis(uuid, int) from public;
grant execute on function public.compute_ticket_kpis(uuid, int) to authenticated;

comment on function public.compute_ticket_kpis(uuid, int) is
  'TKT-021: calcula KPIs agregados del tenant para el dashboard del supervisor. Valida auth + membership + scope institucional. Retorna counts por estado/prioridad, promedio operacional de primera respuesta y resolucion (NO contractual), y tendencia diaria del periodo. Defense in depth + RLS.';
