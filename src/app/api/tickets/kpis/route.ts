/**
 * DeskWork Ticketing Core / TKT-021.
 * GET /api/tickets/kpis
 *
 * Devuelve KPIs agregados del tenant del actor para el dashboard del
 * supervisor. Las metricas son OPERATIVAS (counts, promedios derivados
 * de timestamps) — NO incluyen SLA contractual (TKT-008 bloqueado).
 *
 * Reglas de autorizacion:
 *  - Sesion requerida.
 *  - Actor debe ser miembro activo del tenant resuelto.
 *  - Actor debe tener scope 'institution' (supervisor / lead / director).
 *  - El SECURITY DEFINER `public.compute_ticket_kpis` re-valida esto.
 *
 * Query params:
 *  - periodDays: int [1, 90], default 30. Tamaño de la ventana para la
 *    tendencia diaria.
 *
 * Response:
 *  {
 *    totals: { total, active, unassigned, byState, byPriority },
 *    operationalAverages: {
 *      firstResponseMinutes, resolutionMinutes, resolvedCount, firstResponseCount
 *    },
 *    dailyTrend: [ { date, created } ],
 *    period: { days, start, end },
 *    generatedAt: ISO string
 *  }
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { resolveActor } from "@/modules/ticketing/actor";
import { getTicketKpis } from "@/modules/ticketing/supabase-repository";

const DEFAULT_PERIOD = 30;
const MIN_PERIOD = 1;
const MAX_PERIOD = 90;

function parsePeriod(raw: string | null): number {
  if (!raw) return DEFAULT_PERIOD;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < MIN_PERIOD || n > MAX_PERIOD) {
    return DEFAULT_PERIOD;
  }
  return n;
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  // Resolver el tenant del actor.
  const { data: memberships } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);
  const tenantId = memberships?.[0]?.tenant_id;
  if (!tenantId) {
    return NextResponse.json(
      { error: "no_active_membership" },
      { status: 403 },
    );
  }

  // Defense in depth: validar el actor a nivel de aplicacion antes de
  // invocar el SECURITY DEFINER. La funcion DB vuelve a validar.
  const actorResolution = await resolveActor(supabase, tenantId, user.id);
  if (!actorResolution.ok) {
    const status = actorResolution.reason === "not_authenticated" ? 401 : 403;
    return NextResponse.json({ error: actorResolution.reason }, { status });
  }
  const actor = actorResolution.actor;
  // El dashboard requiere ver datos a nivel institucion. Solo
  // technical_lead / director tienen scope 'institution' (regla DB).
  // El functional_role 'supervisor' (department/team) NO califica para
  // un dashboard institucional — usaría su vista de scope acotado.
  const isInstitutional =
    actor.kind === "technical_lead" || actor.kind === "director";
  if (!isInstitutional) {
    return NextResponse.json(
      { error: "scope_institution_required" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const periodDays = parsePeriod(url.searchParams.get("periodDays"));

  const result = await getTicketKpis(supabase, {
    tenantId,
    periodDays,
  });

  if (!result.ok) {
    const err = result.error;
    const statusByKind: Record<typeof err.kind, number> = {
      validation: 400,
      forbidden: 403,
      not_found: 404,
      db_error: 500,
    };
    return NextResponse.json(
      {
        error: err.kind,
        reason: "reason" in err ? err.reason : null,
      },
      { status: statusByKind[err.kind] ?? 500 },
    );
  }

  return NextResponse.json(result.data, { status: 200 });
}
