/**
 * /supervisor — TKT-027 Remediation (DEFECT-UAT-NN3).
 *
 * Server component que actúa como guardián del scope institucional antes
 * de renderizar el `SupervisorDashboard` (client component).
 *
 * Política:
 *   - El RPC `public.compute_ticket_kpis` requiere institution scope
 *     (solo technical_lead / director, no supervisor department-only).
 *   - NO se relaja `compute_ticket_kpis` para aceptar department scope
 *     (decisión explícita: la pantalla /supervisor es la vista
 *     institucional; no hay aún dashboard departamental separado).
 *   - El guard se aplica a nivel server (no client) para que el RPC
 *     nunca se invoque cuando el actor no tiene el scope. Esto evita
 *     fugas de información de error y mantiene el principio
 *     "verificar antes de invocar".
 *
 * Comportamiento:
 *   - Sin sesión: redirect a /login?next=/supervisor.
 *   - Con sesión pero sin scope institucional: render del componente
 *     `SupervisorForbidden` (mensaje claro, sin invocar el RPC).
 *   - Con sesión + scope institucional: render del `SupervisorDashboard`
 *     (client) que sí invoca el RPC.
 *
 * Decisión de scope:
 *   Se valida con `rpc('compute_ticket_kpis', ...)` en un try/catch y
 *   periodo 1 día (mínimo, barato). Si retorna 200 → institution scope
 *   confirmado. Si retorna 42501 o no_row → no tiene scope.
 *   Alternativa más estricta: SELECT sobre membership_scope_grants +
 *   has_scope() directo. Pero `compute_ticket_kpis` es la fuente
 *   canónica de "institution scope válido" y ya la invoca el dashboard;
 *   no duplicamos la lógica.
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { SupervisorDashboard } from "@/components/demo/supervisor-dashboard";
import { SupervisorForbidden } from "@/components/demo/supervisor-forbidden";

export const dynamic = "force-dynamic";

async function resolveInstitutionScope(): Promise<
  | { ok: true; tenantId: string; actorId: string; displayName: string | null }
  | { ok: false; reason: "no_session" | "no_membership" | "no_institution_scope" }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no_session" };

  // Membership activa del actor. La primera membership activa es la canónica
  // para la app (no multi-tenant por usuario en MVP).
  const { data: membership } = await supabase
    .from("memberships")
    .select("tenant_id, functional_role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return { ok: false, reason: "no_membership" };

  // Probe de institution scope. Se invoca el RPC con periodo 1 (mínimo)
  // porque solo queremos verificar el flag de autorización, no leer KPIs.
  // Cualquier 200 = scope válido. 42501 = no institution scope.
  const { error: kpisError } = await supabase.rpc("compute_ticket_kpis", {
    p_tenant_id: membership.tenant_id,
    p_period_days: 1,
  });
  if (kpisError) {
    return { ok: false, reason: "no_institution_scope" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    ok: true,
    tenantId: membership.tenant_id,
    actorId: user.id,
    displayName: profile?.display_name ?? null,
  };
}

export default async function SupervisorPage() {
  const scope = await resolveInstitutionScope();

  if (!scope.ok) {
    if (scope.reason === "no_session") {
      redirect("/login?next=/supervisor");
    }
    // no_membership | no_institution_scope: render guard. El usuario debe
    // usar el dashboard operacional (/dashboard) o solicitar acceso a un
    // usuario con institution scope (lead/director).
    return <SupervisorForbidden reason={scope.reason} />;
  }

  return <SupervisorDashboard />;
}
