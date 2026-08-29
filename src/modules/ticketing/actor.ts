/**
 * DeskWork Ticketing Core / TKT-006.
 * Resolver de actor para la FSM.
 *
 * Mapea el `auth.uid()` actual + su `functional_role` en el tenant del ticket
 * a un `TicketActor` con `kind` correcto. La app layer usa este `kind` para
 * evaluar la FSM (canRequest / canExecute) ANTES de invocar el mutador seguro.
 *
 * Defense in depth: la SECURITY DEFINER `public.apply_ticket_transition`
 * re-valida membresía + autorización; este resolver existe para que la
 * app layer pueda tomar la decisión fina (SOLICITAR/EJECUTAR) sin round-trip
 * a la DB para cada consulta.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FunctionalRole } from "@/modules/identity/roles";
import type { TicketActor, TicketActorKind } from "./types";

/** Códigos de functional_role conocidos. */
const ROLE_TO_KIND: Record<FunctionalRole, TicketActorKind> = {
  director: "director",
  technical_lead: "technical_lead",
  supervisor: "supervisor",
  operator: "agent",
  administrative: "agent",
};

/** Resultado de la resolución. */
export type ActorResolution =
  | { ok: true; actor: TicketActor }
  | { ok: false; reason: "not_authenticated" | "no_membership" | "tenant_mismatch" };

/**
 * Resuelve el actor a partir de `auth.uid()` y el tenant del ticket.
 *
 * @param supabase Cliente de Supabase (server-side, ya con sesión).
 * @param tenantId Tenant del ticket (para filtrar la membership correcta).
 * @param fallbackUserId Si lo pasas, se usa en lugar de `auth.uid()`. Útil
 *   para tests deterministas.
 */
export async function resolveActor(
  supabase: SupabaseClient,
  tenantId: string,
  fallbackUserId: string | null = null,
): Promise<ActorResolution> {
  // 1) Resolver el userId del actor.
  let userId: string | null = fallbackUserId;
  if (userId === null) {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  }
  if (userId === null) {
    return { ok: false, reason: "not_authenticated" };
  }

  // 2) Cargar la membership activa en el tenant del ticket.
  //    Usamos el cliente con auth.uid() implícito. La RLS de memberships
  //    limita el SELECT a la fila del propio usuario, lo cual está OK
  //    porque sólo nos interesa el membership del actor.
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("tenant_id, user_id, functional_role, status")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    // En error de DB, devolvemos no_membership para no filtrar info.
    return { ok: false, reason: "no_membership" };
  }
  if (!membership) {
    return { ok: false, reason: "no_membership" };
  }

  // 3) Mapear functional_role → TicketActorKind
  const role = membership.functional_role as FunctionalRole;
  const kind = ROLE_TO_KIND[role] ?? null;
  if (kind === null) {
    return { ok: false, reason: "no_membership" };
  }

  return {
    ok: true,
    actor: {
      userId,
      functionalRole: role,
      kind,
    },
  };
}

/**
 * Helper para tests: crea un TicketActor determinista a partir de
 * un userId y un functional_role, sin tocar la DB.
 */
export function makeTestActor(
  userId: string | null,
  functionalRole: FunctionalRole | null,
): TicketActor {
  if (userId === null && functionalRole !== null) {
    throw new Error("userId null only allowed for system actor");
  }
  if (functionalRole === null) {
    return { userId, functionalRole: null, kind: "system" };
  }
  return {
    userId,
    functionalRole,
    kind: ROLE_TO_KIND[functionalRole],
  };
}
