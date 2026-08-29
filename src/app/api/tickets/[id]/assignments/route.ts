/**
 * DeskWork Ticketing Core / TKT-012.
 * POST /api/tickets/[id]/assignments
 *
 * Asigna un ticket a un miembro activo del tenant.
 * Sólo lead/director del tenant (verifica can_assign_ticket en DB).
 *
 * Flow:
 *   auth -> parse body -> getTicket (RLS) -> resolveActor ->
 *   SECURITY DEFINER assign_ticket
 *
 * Reasignar a otro agente cierra la asignación activa previa
 * automáticamente (la función DB lo hace).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { resolveActor } from "@/modules/ticketing/actor";
import {
  applyAssign,
  createSupabaseTicketRepository,
} from "@/modules/ticketing/supabase-repository";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface AssignRequestBody {
  assigneeId?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: ticketId } = await context.params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  let body: AssignRequestBody;
  try {
    body = (await request.json()) as AssignRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.assigneeId !== "string" || !UUID_RE.test(body.assigneeId)) {
    return NextResponse.json(
      { error: "invalid_assignee_id" },
      { status: 400 },
    );
  }
  if (body.assigneeId === user.id) {
    // Permitido por la lógica de DB, pero en app layer pedimos confirmación
    // explícita: ¿realmente querés auto-asignarte? Por ahora, no bloqueamos.
  }
  const assigneeId = body.assigneeId;

  const repo = createSupabaseTicketRepository(supabase);
  const ticket = await repo.getTicket(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  // resolveActor sólo se necesita para contexto (auditoría); la
  // autorización real la hace la SECURITY DEFINER (can_assign_ticket).
  const actorResolution = await resolveActor(supabase, ticket.tenantId, user.id);
  if (!actorResolution.ok) {
    const status = actorResolution.reason === "not_authenticated" ? 401 : 403;
    return NextResponse.json(
      { error: actorResolution.reason },
      { status },
    );
  }

  const result = await applyAssign(supabase, {
    ticketId,
    assigneeId,
    assignedBy: user.id,
  });

  if (!result.ok) {
    const err = result.error;
    const statusByKind: Record<typeof err.kind, number> = {
      validation: 400,
      not_found: 404,
      forbidden: 403,
      db_error: 500,
    };
    return NextResponse.json(
      { error: err.kind, reason: "reason" in err ? err.reason : null },
      { status: statusByKind[err.kind] ?? 500 },
    );
  }

  return NextResponse.json(
    {
      assignment: result.assignment,
      ticket: { id: ticket.id, assignedTo: assigneeId },
    },
    { status: 201 },
  );
}
