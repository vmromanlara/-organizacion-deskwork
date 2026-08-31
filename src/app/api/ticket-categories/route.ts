/**
 * DeskWork Ticketing Core / TKT-009 follow-up.
 * GET /api/ticket-categories
 *
 * Devuelve las categorías activas del tenant del actor actual. La UI de
 * creación de tickets usa este endpoint para poblar el selector.
 *
 * Reutiliza el repository `listCategories(tenantId)` (que pasa por RLS).
 * No expone categorías de otro tenant.
 *
 * Query params: ninguno. La membership del actor actual define el tenant.
 * Si el actor no tiene membership activa -> 403.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { createSupabaseTicketRepository } from "@/modules/ticketing/supabase-repository";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);
  if (membershipsError) {
    return NextResponse.json(
      { error: "memberships_query_failed", reason: membershipsError.message },
      { status: 500 },
    );
  }
  const tenantId = memberships?.[0]?.tenant_id ?? null;
  if (!tenantId) {
    return NextResponse.json(
      { error: "no_active_membership" },
      { status: 403 },
    );
  }

  const repo = createSupabaseTicketRepository(supabase);
  let categories;
  try {
    categories = await repo.listCategories(tenantId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "categories_query_failed", reason },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { categories, meta: { tenantId, total: categories.length } },
    { status: 200 },
  );
}
