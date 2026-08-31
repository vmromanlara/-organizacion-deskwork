/**
 * DeskWork Ticketing Core / TKT-010 + TKT-009.
 * GET /api/tickets   — lista con scope y filtros.
 * POST /api/tickets  — crea un ticket real (TKT-009 Mockup→Real).
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
import {
  applyCreateTicket,
  createSupabaseTicketRepository,
} from "@/modules/ticketing/supabase-repository";
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

const TITLE_MIN = 5;
const TITLE_MAX = 200;
const DESC_MIN = 10;
const DESC_MAX = 5000;

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

function resolveActorTenantId(
  memberships: ReadonlyArray<{ tenant_id: string | null }>,
): string | null {
  return memberships?.[0]?.tenant_id ?? null;
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
  const tenantId = resolveActorTenantId(memberships ?? []);
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

/**
 * POST /api/tickets — TKT-009 Mockup→Real.
 *
 * Crea un ticket real mediante la SECURITY DEFINER `public.create_ticket`.
 *
 * Body esperado:
 *   {
 *     tenantId:     uuid (opcional; se resuelve desde memberships si falta)
 *     categoryId:   uuid
 *     title:        string [5, 200]
 *     description:  string [10, 5000]
 *     areaId?:      uuid
 *     teamId?:      uuid
 *   }
 *
 * NOTA: `requesterId` NO se acepta. La SECURITY DEFINER lo deriva de
 * `auth.uid()`. Esto blinda contra impersonation.
 *
 * Flow:
 *   1) auth.getUser -> 401
 *   2) payload validation (longitudes, UUIDs) -> 400
 *   3) resolver tenant del actor desde memberships -> 403 si no tiene
 *   4) SECURITY DEFINER create_ticket re-valida + persiste atómicamente
 */
interface CreateRequestBody {
  tenantId?: unknown;
  categoryId?: unknown;
  title?: unknown;
  description?: unknown;
  areaId?: unknown;
  teamId?: unknown;
}

export async function POST(request: NextRequest) {
  // 1) Autenticación
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  // 2) Body parsing
  let body: CreateRequestBody;
  try {
    body = (await request.json()) as CreateRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 3) Validación de payload
  if (typeof body.categoryId !== "string" || !UUID_RE.test(body.categoryId)) {
    return NextResponse.json(
      { error: "invalid_category_id" },
      { status: 400 },
    );
  }
  if (typeof body.title !== "string") {
    return NextResponse.json(
      { error: "invalid_title", received: typeof body.title },
      { status: 400 },
    );
  }
  const titleLen = body.title.length;
  if (titleLen < TITLE_MIN || titleLen > TITLE_MAX) {
    return NextResponse.json(
      {
        error: "invalid_title_length",
        min: TITLE_MIN,
        max: TITLE_MAX,
        received: titleLen,
      },
      { status: 400 },
    );
  }
  if (typeof body.description !== "string") {
    return NextResponse.json(
      { error: "invalid_description", received: typeof body.description },
      { status: 400 },
    );
  }
  const descLen = body.description.length;
  if (descLen < DESC_MIN || descLen > DESC_MAX) {
    return NextResponse.json(
      {
        error: "invalid_description_length",
        min: DESC_MIN,
        max: DESC_MAX,
        received: descLen,
      },
      { status: 400 },
    );
  }
  if (body.areaId !== undefined && body.areaId !== null) {
    if (typeof body.areaId !== "string" || !UUID_RE.test(body.areaId)) {
      return NextResponse.json(
        { error: "invalid_area_id" },
        { status: 400 },
      );
    }
  }
  if (body.teamId !== undefined && body.teamId !== null) {
    if (typeof body.teamId !== "string" || !UUID_RE.test(body.teamId)) {
      return NextResponse.json(
        { error: "invalid_team_id" },
        { status: 400 },
      );
    }
  }

  // 4) Resolver tenant del actor
  const { data: memberships } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);
  const tenantId = resolveActorTenantId(memberships ?? []);
  if (!tenantId) {
    return NextResponse.json(
      { error: "no_active_membership" },
      { status: 403 },
    );
  }
  // Si el body trae tenantId, debe coincidir (no se puede crear en otro tenant)
  if (body.tenantId !== undefined && body.tenantId !== null) {
    if (typeof body.tenantId !== "string" || body.tenantId !== tenantId) {
      return NextResponse.json(
        { error: "tenant_mismatch" },
        { status: 400 },
      );
    }
  }

  // 5) Persistencia segura vía SECURITY DEFINER
  const result = await applyCreateTicket(supabase, {
    tenantId,
    categoryId: body.categoryId,
    title: body.title,
    description: body.description,
    areaId: (body.areaId as string | null | undefined) ?? null,
    teamId: (body.teamId as string | null | undefined) ?? null,
  });

  if (!result.ok) {
    const err = result.error;
    const statusByKind: Record<typeof err.kind, number> = {
      validation: 400,
      forbidden: 403,
      db_error: 500,
    };
    return NextResponse.json(
      { error: err.kind, reason: "reason" in err ? err.reason : null },
      { status: statusByKind[err.kind] ?? 500 },
    );
  }

  // 6) OK — devolver el ticket creado
  return NextResponse.json(
    {
      ticket: result.ticket,
      by: user.id,
    },
    { status: 201 },
  );
}
