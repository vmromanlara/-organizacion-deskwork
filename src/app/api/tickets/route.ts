/**
 * DeskWork Ticketing Core / TKT-010.
 * GET /api/tickets
 *
 * Lista tickets visibles para el usuario autenticado. La RLS filtra
 * automáticamente (can_read_ticket se evalúa por fila). El usuario NO
 * ve tickets fuera de su scope.
 *
 * Query params soportados:
 *   - scope: "mine" | "assigned" | "tenant" (default: "tenant")
 *   - state: filtro opcional por estado (validado contra TICKET_STATES)
 *   - limit: 1..200 (default 50)
 *
 * El parámetro `scope=tenant` requiere que el actor tenga scope institución
 * (típicamente technical_lead, director). Si el actor no califica, el RLS
 * filtra la lista a sus tickets visibles.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { createSupabaseTicketRepository } from "@/modules/ticketing/supabase-repository";
import { resolveActor } from "@/modules/ticketing/actor";
import {
  hasTicketPriority,
  hasTicketState,
  type TicketPriority,
  type TicketState,
} from "@/modules/ticketing/types";
import type { TicketSearchFilters } from "@/modules/ticketing/repository";

const VALID_SCOPES = new Set(["mine", "assigned", "tenant"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseFilters(url: URL): {
  ok: true;
  filters: TicketSearchFilters;
} | { ok: false; error: string; received?: string | null } {
  const filters: TicketSearchFilters = {};

  const state = url.searchParams.get("state");
  if (state !== null) {
    if (!hasTicketState(state)) {
      return { ok: false, error: "invalid_state", received: state };
    }
    filters.state = state as TicketState;
  }

  const priority = url.searchParams.get("priority");
  if (priority !== null) {
    if (!hasTicketPriority(priority)) {
      return { ok: false, error: "invalid_priority", received: priority };
    }
    filters.priority = priority as TicketPriority;
  }

  const assignedTo = url.searchParams.get("assigned_to");
  if (assignedTo !== null) {
    if (assignedTo !== "unassigned" && !UUID_RE.test(assignedTo)) {
      return { ok: false, error: "invalid_assigned_to", received: assignedTo };
    }
    if (assignedTo !== "unassigned") {
      filters.assignedTo = assignedTo;
    }
  }

  const requesterId = url.searchParams.get("requester_id");
  if (requesterId !== null) {
    if (!UUID_RE.test(requesterId)) {
      return { ok: false, error: "invalid_requester_id", received: requesterId };
    }
    filters.requesterId = requesterId;
  }

  const search = url.searchParams.get("search");
  if (search !== null) {
    if (search.length < 3 || search.length > 200) {
      return { ok: false, error: "invalid_search_length", received: `${search.length}` };
    }
    filters.search = search;
  }

  return { ok: true, filters };
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

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "tenant";
  if (!VALID_SCOPES.has(scope)) {
    return NextResponse.json(
      { error: "invalid_scope", received: scope },
      { status: 400 },
    );
  }
  const limit = parseLimit(url.searchParams.get("limit"));

  // Parsear filtros de búsqueda (TKT-022)
  const parsed = parseFilters(url);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, received: "received" in parsed ? parsed.received : null },
      { status: 400 },
    );
  }
  const filters = parsed.filters;

  // Resolver el tenant del actor. Si el actor no tiene membership
  // activa en ningún tenant, no listamos nada.
  const { data: memberships } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);
  const tenantId = memberships?.[0]?.tenant_id ?? null;
  if (!tenantId) {
    return NextResponse.json(
      { error: "no_active_membership" },
      { status: 403 },
    );
  }

  // Verificación del scope solicitado vs el rol del actor.
  const actorResolution = await resolveActor(supabase, tenantId, user.id);
  if (!actorResolution.ok) {
    const status = actorResolution.reason === "not_authenticated" ? 401 : 403;
    return NextResponse.json({ error: actorResolution.reason }, { status });
  }
  const actor = actorResolution.actor;

  if (scope === "tenant" && actor.kind !== "technical_lead" && actor.kind !== "director") {
    return NextResponse.json(
      { error: "scope_tenant_requires_institution_grant" },
      { status: 403 },
    );
  }

  const repo = createSupabaseTicketRepository(supabase);

  let tickets;
  if (scope === "mine") {
    tickets = await repo.listTicketsByRequester(user.id, filters);
  } else if (scope === "assigned") {
    tickets = await repo.listTicketsByAssignee(user.id, filters);
  } else {
    tickets = await repo.listTicketsByTenant(tenantId, limit, filters);
  }

  return NextResponse.json(
    {
      tickets,
      meta: {
        scope,
        filters,
        limit,
        total: tickets.length,
      },
    },
    { status: 200 },
  );
}
