/**
 * DeskWork Ticketing Core / TKT-012 follow-up.
 * GET /api/tenant-members
 *
 * Devuelve los miembros activos del tenant del actor actual.
 * La UI de asignación usa este endpoint para poblar el selector de
 * posibles asignados.
 *
 * La query pasa por RLS de memberships: un actor sólo ve los miembros
 * de su propio tenant. Si el actor no tiene membership activa -> 403.
 *
 * Query params: ninguno. La membership del actor actual define el tenant.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";

interface MembershipRow {
  user_id: string;
  functional_role: string;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  // Resolver tenant del actor.
  const { data: actorMembership, error: actorError } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (actorError) {
    return NextResponse.json(
      { error: "membership_query_failed", reason: actorError.message },
      { status: 500 },
    );
  }
  const tenantId = actorMembership?.tenant_id ?? null;
  if (!tenantId) {
    return NextResponse.json(
      { error: "no_active_membership" },
      { status: 403 },
    );
  }

  // Listar miembros activos del tenant. RLS de memberships + can_read_membership
  // asegura que el actor sólo vea los miembros de su tenant.
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, functional_role")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("functional_role", { ascending: true });
  if (error) {
    return NextResponse.json(
      { error: "members_query_failed", reason: error.message },
      { status: 500 },
    );
  }

  const members = (data as MembershipRow[] | null) ?? [];
  return NextResponse.json(
    { members, meta: { tenantId, total: members.length } },
    { status: 200 },
  );
}
