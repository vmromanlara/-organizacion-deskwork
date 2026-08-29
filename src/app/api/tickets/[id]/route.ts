/**
 * DeskWork Ticketing Core / TKT-010.
 * GET /api/tickets/[id]
 *
 * Lee un ticket específico. La RLS de Foundation/Ticketing (can_read_ticket)
 * filtra el SELECT: si el usuario no tiene acceso al ticket, retorna 404
 * (no 403 — no se filtra la existencia del recurso).
 *
 * Flow:
 *   1) auth.getUser → 401
 *   2) repo.getTicket → 404 si no existe o no es visible
 *   3) retorna el ticket
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { createSupabaseTicketRepository } from "@/modules/ticketing/supabase-repository";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: ticketId } = await context.params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  const repo = createSupabaseTicketRepository(supabase);
  const ticket = await repo.getTicket(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ticket }, { status: 200 });
}
