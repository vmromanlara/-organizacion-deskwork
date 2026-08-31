/**
 * DeskWork Ticketing Core / TKT-013.
 * GET  /api/tickets/[id]/comments   (listado)
 * POST /api/tickets/[id]/comments   (crear)
 *
 * Crea un comentario asociado a un ticket. La barrera de seguridad es:
 *
 *   1) auth.getUser -> 401
 *   2) payload validation (longitud, isInternal) -> 400
 *   3) ticket existe y es visible al actor -> 404
 *   4) actor es miembro activo del tenant del ticket -> 403
 *   5) SECURITY DEFINER create_ticket_comment re-valida todo en DB
 *
 * IMPORTANTE: este endpoint NO cambia el estado del ticket. Es la ruta
 * natural del "SOLICITAR" para actores que no pueden ejecutar (supervisor,
 * agente en transiciones restringidas, requester). El cambio de estado
 * sigue siendo exclusivo de POST /api/tickets/[id]/transitions con
 * canExecute=true.
 *
 * Flow:
 *   request -> auth -> payload -> getTicket -> resolveActor ->
 *   membership check -> SECURITY DEFINER create_ticket_comment
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { resolveActor } from "@/modules/ticketing/actor";
import {
  applyCreateComment,
  createSupabaseTicketRepository,
} from "@/modules/ticketing/supabase-repository";
import { validateCommentInput } from "@/modules/ticketing/comments";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface CreateCommentRequestBody {
  body?: unknown;
  isInternal?: unknown;
}

const BODY_MAX = 10000;

/**
 * GET /api/tickets/[id]/comments
 * Lista los comentarios visibles para el actor actual.
 * La RLS ya filtra comentarios internos a usuarios no autorizados.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: ticketId } = await context.params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  // Cargar el ticket para obtener su tenant y verificar visibilidad.
  const repo = createSupabaseTicketRepository(supabase);
  const ticket = await repo.getTicket(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  // La RLS de comments + can_read_ticket hace el resto del filtrado.
  // Si llegamos aquí, el actor puede ver el ticket.
  let comments;
  try {
    comments = await repo.listCommentsByTicket(ticket.id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "db_error", reason },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { comments, meta: { total: comments.length } },
    { status: 200 },
  );
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
  let body: CreateCommentRequestBody;
  try {
    body = (await request.json()) as CreateCommentRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.body !== "string") {
    return NextResponse.json(
      { error: "invalid_body", received: body.body === undefined ? "undefined" : body.body === null ? "null" : typeof body.body },
      { status: 400 },
    );
  }
  if (body.isInternal !== undefined && typeof body.isInternal !== "boolean") {
    return NextResponse.json(
      { error: "invalid_is_internal", received: typeof body.isInternal },
      { status: 400 },
    );
  }

  // 3) Validación de contrato via validateCommentInput (reutiliza la
  //    función existente en comments.ts).
  const validation = validateCommentInput({
    tenantId: "00000000-0000-0000-0000-000000000000", // placeholder; se sobreescribe abajo
    ticketId,
    authorId: user.id,
    body: body.body,
    isInternal: body.isInternal as boolean | undefined,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { error: "validation_failed", reason: validation.reason },
      { status: 400 },
    );
  }
  if (body.body.length > BODY_MAX) {
    return NextResponse.json(
      { error: "body_too_long", max: BODY_MAX },
      { status: 400 },
    );
  }

  // 4) Cargar ticket vía repository (SELECT pasa por RLS)
  const repo = createSupabaseTicketRepository(supabase);
  const ticket = await repo.getTicket(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  // 5) Resolver actor en el tenant del ticket
  const actorResolution = await resolveActor(supabase, ticket.tenantId, user.id);
  if (!actorResolution.ok) {
    const status = actorResolution.reason === "not_authenticated" ? 401 : 403;
    return NextResponse.json(
      { error: actorResolution.reason },
      { status },
    );
  }

  // 6) Persistencia segura via SECURITY DEFINER
  const result = await applyCreateComment(supabase, {
    ticketId,
    body: body.body,
    isInternal: body.isInternal as boolean | undefined,
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

  // 7) OK
  return NextResponse.json(
    {
      comment: result.comment,
      by: actorResolution.actor.userId,
      isInternal: result.comment.isInternal,
    },
    { status: 201 },
  );
}
