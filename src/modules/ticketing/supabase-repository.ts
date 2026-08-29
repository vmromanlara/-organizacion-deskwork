/**
 * DeskWork Ticketing Core / TKT-006.
 * Implementación del contrato TicketRepository sobre Supabase server client.
 *
 * Reglas críticas:
 *  1) Las mutaciones (UPDATE tickets, INSERT ticket_events) NO pasan por
 *     `.from('tickets').update(...)` porque authenticated tiene REVOKE
 *     INSERT/UPDATE/DELETE sobre la tabla. Toda mutación va por la
 *     SECURITY DEFINER `public.apply_ticket_transition` (ver migration
 *     20260827000780). Esta función corre con permisos del owner y registra
 *     el evento + audit log atómicamente.
 *  2) Los SELECT pasan por RLS (las policies de tickets_*, comments_*,
 *     events_*, assignments_* ya están en migration 20260827000730).
 *  3) El cliente Supabase ya tiene la sesión del usuario. NO se usa
 *     service_role key; el mutador SECURITY DEFINER es el bypass de RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Ticket,
  TicketCategory,
  TicketRepository,
  UpdateTicketStateInput,
} from "./repository";
import { hasTicketState, type TicketState } from "./types";

interface TicketRow {
  id: string;
  tenant_id: string;
  requester_id: string;
  category_id: string;
  priority: string;
  state: string;
  title: string;
  description: string;
  assigned_to: string | null;
  area_id: string | null;
  team_id: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  sla_status: string;
  created_at: string;
  updated_at: string;
}

interface CategoryRow {
  id: string;
  tenant_id: string;
  slug: string;
  label: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
}

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    requesterId: row.requester_id,
    categoryId: row.category_id,
    priority: row.priority as Ticket["priority"],
    state: row.state as TicketState,
    title: row.title,
    description: row.description,
    assignedTo: row.assigned_to,
    areaId: row.area_id,
    teamId: row.team_id,
    firstResponseAt: row.first_response_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    slaStatus: row.sla_status as Ticket["slaStatus"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCategory(row: CategoryRow): TicketCategory {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    slug: row.slug,
    label: row.label,
    description: row.description,
    isActive: row.is_active,
    displayOrder: row.display_order,
  };
}

/** Error tipado de mutación. */
export type TransitionError =
  | { kind: "validation"; reason: string }
  | { kind: "not_found" }
  | { kind: "forbidden"; reason: string }
  | { kind: "conflict"; reason: string }
  | { kind: "db_error"; reason: string };

export interface TransitionResult {
  ok: boolean;
  ticket?: Ticket;
  error?: TransitionError;
}

/**
 * Fábrica del repository concreto. La app layer recibe la instancia y la
 * inyecta en las API routes / service consumers.
 */
export function createSupabaseTicketRepository(
  supabase: SupabaseClient,
): TicketRepository {
  return {
    async listCategories(tenantId) {
      const { data, error } = await supabase
        .from("ticket_categories")
        .select("id, tenant_id, slug, label, description, is_active, display_order")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) {
        throw new Error(`listCategories: ${error.message}`);
      }
      return (data ?? []).map((row) => toCategory(row as CategoryRow));
    },

    async getCategory(tenantId, slug) {
      const { data, error } = await supabase
        .from("ticket_categories")
        .select("id, tenant_id, slug, label, description, is_active, display_order")
        .eq("tenant_id", tenantId)
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) {
        throw new Error(`getCategory: ${error.message}`);
      }
      return data ? toCategory(data as CategoryRow) : null;
    },

    async getTicket(ticketId) {
      const { data, error } = await supabase
        .from("tickets")
        .select(TICKET_COLUMNS)
        .eq("id", ticketId)
        .maybeSingle();
      if (error) {
        // PGRST116 = no rows; tratamos como null.
        if (error.code === "PGRST116") return null;
        throw new Error(`getTicket: ${error.message}`);
      }
      return data ? toTicket(data as TicketRow) : null;
    },

    async listTicketsByTenant(tenantId, limit) {
      const { data, error } = await supabase
        .from("tickets")
        .select(TICKET_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(Math.max(1, Math.min(limit, 200)));
      if (error) {
        throw new Error(`listTicketsByTenant: ${error.message}`);
      }
      return (data ?? []).map((row) => toTicket(row as TicketRow));
    },

    async listTicketsByRequester(requesterId) {
      const { data, error } = await supabase
        .from("tickets")
        .select(TICKET_COLUMNS)
        .eq("requester_id", requesterId)
        .order("created_at", { ascending: false });
      if (error) {
        throw new Error(`listTicketsByRequester: ${error.message}`);
      }
      return (data ?? []).map((row) => toTicket(row as TicketRow));
    },

    async listTicketsByAssignee(assigneeId) {
      const { data, error } = await supabase
        .from("tickets")
        .select(TICKET_COLUMNS)
        .eq("assigned_to", assigneeId)
        .order("created_at", { ascending: false });
      if (error) {
        throw new Error(`listTicketsByAssignee: ${error.message}`);
      }
      return (data ?? []).map((row) => toTicket(row as TicketRow));
    },

    async createTicket(input) {
      // TODO TKT-009: Bloque 3 — la app layer (mockup→real) ya no es acá.
      // Stub mínimo: por ahora delegamos en el service layer que se
      // materializará en Bloque 3. Lanzamos para no crear una regresión.
      throw new Error(
        "createTicket: pendiente TKT-009 (Bloque 3 — service layer)",
      );
    },

    /**
     * Aplica una transición de estado vía SECURITY DEFINER.
     * Esta función NO valida la FSM: la app layer (route handler) ya
     * ejecutó `canExecute` antes de llegar aquí. La función DB hace
     * defense in depth.
     */
    async updateTicketState(input) {
      const result = await applyTransition(supabase, input);
      if (!result.ok || !result.ticket) {
        throw new Error(
          `updateTicketState failed: ${result.error?.kind} ${result.error?.reason ?? ""}`,
        );
      }
      return result.ticket;
    },

    async assignTicket() {
      throw new Error(
        "assignTicket: pendiente TKT-012 (Bloque 2 — UI de asignación)",
      );
    },

    async unassignTicket() {
      throw new Error(
        "unassignTicket: pendiente TKT-012 (Bloque 2 — UI de asignación)",
      );
    },
  };
}

const TICKET_COLUMNS =
  "id, tenant_id, requester_id, category_id, priority, state, title, description, assigned_to, area_id, team_id, first_response_at, resolved_at, closed_at, sla_status, created_at, updated_at";

/**
 * Aplica la transición vía SECURITY DEFINER. Devuelve un resultado tipado
 * en lugar de throw, para que la ruta API pueda mapear a HTTP status codes
 * con precisión.
 */
export async function applyTransition(
  supabase: SupabaseClient,
  input: UpdateTicketStateInput,
): Promise<TransitionResult> {
  if (!hasTicketState(input.toState)) {
    return {
      ok: false,
      error: { kind: "validation", reason: `Estado destino inválido: ${input.toState}` },
    };
  }
  if (!hasTicketState(input.fromState)) {
    return {
      ok: false,
      error: { kind: "validation", reason: `Estado origen inválido: ${input.fromState}` },
    };
  }

  const { data, error } = await supabase.rpc("apply_ticket_transition", {
    p_ticket_id: input.ticketId,
    p_to_state: input.toState,
    p_reason: input.reason ?? null,
  });

  if (error) {
    // Postgres errors llegan con códigos en `error.code`:
    //   PGRST116: no rows (no debería pasar acá)
    //   42501   : insufficient_privilege / excepción SECURITY DEFINER
    //   P0001   : raise_exception (estado terminal / transición inválida)
    //   P0002   : no_data_found (ticket no existe)
    const code = error.code ?? "";
    if (code === "P0002" || /ticket not found/i.test(error.message)) {
      return { ok: false, error: { kind: "not_found" } };
    }
    if (code === "42501" || /not authorized|not an active member|authentication required/i.test(error.message)) {
      return { ok: false, error: { kind: "forbidden", reason: error.message } };
    }
    if (code === "P0001" || /terminal|equals current/i.test(error.message)) {
      return { ok: false, error: { kind: "conflict", reason: error.message } };
    }
    return { ok: false, error: { kind: "db_error", reason: error.message } };
  }

  if (!data) {
    return { ok: false, error: { kind: "db_error", reason: "RPC returned null" } };
  }
  return { ok: true, ticket: toTicket(data as TicketRow) };
}

/** Helper público: snapshot mínimo para alimentar la FSM. */
export function toTicketSnapshot(ticket: Ticket): import("./types").TicketSnapshot {
  return {
    id: ticket.id,
    tenantId: ticket.tenantId,
    requesterId: ticket.requesterId,
    assignedTo: ticket.assignedTo,
    state: ticket.state,
    priority: ticket.priority,
    areaId: ticket.areaId,
    teamId: ticket.teamId,
    createdAt: ticket.createdAt,
    firstResponseAt: ticket.firstResponseAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    slaStatus: ticket.slaStatus,
  };
}
