/**
 * DeskWork Ticketing Core / TKT-006.
 * POST /api/tickets/[id]/transitions
 *
 * Aplica una transición de estado a un ticket. La FSM se evalúa ANTES
 * de cualquier mutación: un actor con `canExecute=false` recibe 403 sin
 * tocar la base.
 *
 * Flow:
 *   1) Autenticación → 401 si no hay sesión
 *   2) Validación de body → 400 si falta to_state
 *   3) Cargar ticket → 404 si no existe
 *   4) Resolver actor (auth.uid() + role en tenant del ticket)
 *   5) Evaluar FSM (canExecute)
 *   6) Si !canExecute → 403 con razón legible
 *   7) Si canExecute → invocar SECURITY DEFINER `apply_ticket_transition`
 *   8) Mapear resultado a HTTP status
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { resolveActor } from "@/modules/ticketing/actor";
import { canTransition } from "@/modules/ticketing/state-machine";
import {
  applyTransition,
  createSupabaseTicketRepository,
  toTicketSnapshot,
} from "@/modules/ticketing/supabase-repository";
import { hasTicketState, type TicketState } from "@/modules/ticketing/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface TransitionRequestBody {
  toState?: unknown;
  reason?: unknown;
}

function isTicketState(value: unknown): value is TicketState {
  return typeof value === "string" && hasTicketState(value);
}

function isPlainString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: ticketId } = await context.params;

  // 1) Cliente Supabase autenticado
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  // 2) Body parsing + validación
  let body: TransitionRequestBody;
  try {
    body = (await request.json()) as TransitionRequestBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!isTicketState(body.toState)) {
    return NextResponse.json(
      { error: "invalid_to_state", received: body.toState ?? null },
      { status: 400 },
    );
  }
  if (body.reason !== undefined && !isPlainString(body.reason, 500)) {
    return NextResponse.json(
      { error: "invalid_reason" },
      { status: 400 },
    );
  }
  const toState: TicketState = body.toState;
  const reason = typeof body.reason === "string" ? body.reason : null;

  // 3) Cargar ticket vía repository (SELECT pasa por RLS)
  const repo = createSupabaseTicketRepository(supabase);
  const ticket = await repo.getTicket(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  // 4) Resolver actor en el tenant del ticket
  const actorResolution = await resolveActor(supabase, ticket.tenantId, user.id);
  if (!actorResolution.ok) {
    const status = actorResolution.reason === "not_authenticated" ? 401 : 403;
    return NextResponse.json(
      { error: actorResolution.reason },
      { status },
    );
  }
  const actor = actorResolution.actor;

  // 5) Evaluar FSM
  const fsm = canTransition(
    ticket.state,
    toState,
    actor,
    toTicketSnapshot(ticket),
  );

  // 6) Barrera: si NO puede ejecutar, NO mutamos
  if (!fsm.canExecute) {
    return NextResponse.json(
      {
        error: "fsm_denied",
        reason: fsm.reason,
        canRequest: fsm.canRequest,
        fromState: ticket.state,
        toState,
      },
      { status: 403 },
    );
  }

  // 7) Mutación segura vía SECURITY DEFINER
  const result = await applyTransition(supabase, {
    ticketId,
    fromState: ticket.state,
    toState,
    actorId: actor.userId ?? "",
    reason: reason ?? undefined,
  });

  if (!result.ok || !result.ticket) {
    const err = result.error;
    const statusByKind: Record<typeof err.kind, number> = {
      validation: 400,
      not_found: 404,
      forbidden: 403,
      conflict: 409,
      db_error: 500,
    };
    return NextResponse.json(
      { error: err.kind, reason: "reason" in err ? err.reason : null },
      { status: statusByKind[err.kind] ?? 500 },
    );
  }

  // 8) OK
  return NextResponse.json(
    {
      ticket: result.ticket,
      transition: { from: ticket.state, to: toState, by: actor.userId },
    },
    { status: 200 },
  );
}
