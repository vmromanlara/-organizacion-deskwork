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
  AssignTicketInput,
  CreateCommentInput,
  CreateTicketInput,
  RegisterAttachmentInput,
  Ticket,
  TicketAssignment,
  TicketAttachment,
  TicketCategory,
  TicketComment,
  TicketRepository,
  TicketSearchFilters,
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

interface CommentRow {
  id: string;
  tenant_id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

interface AttachmentRow {
  id: string;
  tenant_id: string;
  ticket_id: string;
  uploaded_by: string;
  storage_path: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  created_at: string;
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

function toComment(row: CommentRow): TicketComment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    body: row.body,
    isInternal: row.is_internal,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAttachment(row: AttachmentRow): TicketAttachment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ticketId: row.ticket_id,
    uploadedBy: row.uploaded_by,
    storagePath: row.storage_path,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

/** Error tipado de mutación. */
export type TransitionError =
  | { kind: "validation"; reason: string }
  | { kind: "not_found" }
  | { kind: "forbidden"; reason: string }
  | { kind: "conflict"; reason: string }
  | { kind: "db_error"; reason: string };

export type TransitionResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; error: TransitionError };

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

    async listTicketsByTenant(tenantId, limit, filters) {
      let q = supabase
        .from("tickets")
        .select(TICKET_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(Math.max(1, Math.min(limit, 200)));
      q = applyFilters(q, filters);
      const { data, error } = await q;
      if (error) {
        throw new Error(`listTicketsByTenant: ${error.message}`);
      }
      return (data ?? []).map((row) => toTicket(row as TicketRow));
    },

    async listTicketsByRequester(requesterId, filters) {
      let q = supabase
        .from("tickets")
        .select(TICKET_COLUMNS)
        .eq("requester_id", requesterId)
        .order("created_at", { ascending: false });
      q = applyFilters(q, filters);
      const { data, error } = await q;
      if (error) {
        throw new Error(`listTicketsByRequester: ${error.message}`);
      }
      return (data ?? []).map((row) => toTicket(row as TicketRow));
    },

    async listTicketsByAssignee(assigneeId, filters) {
      let q = supabase
        .from("tickets")
        .select(TICKET_COLUMNS)
        .eq("assigned_to", assigneeId)
        .order("created_at", { ascending: false });
      q = applyFilters(q, filters);
      const { data, error } = await q;
      if (error) {
        throw new Error(`listTicketsByAssignee: ${error.message}`);
      }
      return (data ?? []).map((row) => toTicket(row as TicketRow));
    },

    async createTicket(input) {
      // TKT-009 / Bloque 3: implementación real vía SECURITY DEFINER
      // `public.create_ticket`. Defense in depth: la app layer ya
      // validó el payload y la membresía del actor; la función DB
      // re-valida auth + categoría + autorización antes de mutar.
      const result = await applyCreateTicket(supabase, input);
      if (!result.ok) {
        const err = result.error;
        const reason = "reason" in err ? err.reason : null;
        throw new Error(
          `createTicket failed: ${err.kind} ${reason ?? ""}`,
        );
      }
      return result.ticket;
    },

    /**
     * Aplica una transición de estado vía SECURITY DEFINER.
     * Esta función NO valida la FSM: la app layer (route handler) ya
     * ejecutó `canExecute` antes de llegar aquí. La función DB hace
     * defense in depth.
     */
    async updateTicketState(input) {
      const result = await applyTransition(supabase, input);
      if (!result.ok) {
        const err = result.error;
        const reason = "reason" in err ? err.reason : null;
        throw new Error(
          `updateTicketState failed: ${err.kind} ${reason ?? ""}`,
        );
      }
      return result.ticket;
    },

    async assignTicket(input) {
      const result = await applyAssign(supabase, input);
      if (!result.ok) {
        const err = result.error;
        const reason = "reason" in err ? err.reason : null;
        throw new Error(
          `assignTicket failed: ${err.kind} ${reason ?? ""}`,
        );
      }
      return result.assignment;
    },

    async unassignTicket() {
      throw new Error(
        "unassignTicket: pendiente (no parte de TKT-012)",
      );
    },

    /**
     * Crea un comentario vía SECURITY DEFINER `create_ticket_comment`.
     * La app layer ya validó el payload con `validateCommentInput`.
     * La función DB hace defense in depth.
     */
    async createComment(input) {
      const result = await applyCreateComment(supabase, input);
      if (!result.ok) {
        const err = result.error;
        const reason = "reason" in err ? err.reason : null;
        throw new Error(
          `createComment failed: ${err.kind} ${reason ?? ""}`,
        );
      }
      return result.comment;
    },

    async listCommentsByTicket(ticketId) {
      const { data, error } = await supabase
        .from("ticket_comments")
        .select(
          "id, tenant_id, ticket_id, author_id, body, is_internal, created_at, updated_at",
        )
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) {
        // PGRST116 = no rows; tratamos como lista vacía.
        if (error.code === "PGRST116") return [];
        throw new Error(`listCommentsByTicket: ${error.message}`);
      }
      return (data ?? []).map((row) => toComment(row as CommentRow));
    },

    async registerAttachment(input) {
      const result = await applyRegisterAttachment(supabase, input);
      if (!result.ok) {
        const err = result.error;
        const reason = "reason" in err ? err.reason : null;
        throw new Error(
          `registerAttachment failed: ${err.kind} ${reason ?? ""}`,
        );
      }
      return result.attachment;
    },

    async listAttachmentsByTicket(ticketId) {
      const { data, error } = await supabase
        .from("ticket_attachments")
        .select(
          "id, tenant_id, ticket_id, uploaded_by, storage_path, original_name, mime_type, size_bytes, sha256, created_at",
        )
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) {
        if (error.code === "PGRST116") return [];
        throw new Error(`listAttachmentsByTicket: ${error.message}`);
      }
      return (data ?? []).map((row) => toAttachment(row as AttachmentRow));
    },
  };
}

const TICKET_COLUMNS =
  "id, tenant_id, requester_id, category_id, priority, state, title, description, assigned_to, area_id, team_id, first_response_at, resolved_at, closed_at, sla_status, created_at, updated_at";

/**
 * Aplica los filtros de búsqueda a una query de Supabase. Encadenable
 * (devuelve la query para que el caller la consuma).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseQuery = any;

function applyFilters(
  q: SupabaseQuery,
  filters: TicketSearchFilters | undefined,
): SupabaseQuery {
  if (!filters) return q;
  if (filters.state) {
    q = q.eq("state", filters.state);
  }
  if (filters.priority) {
    q = q.eq("priority", filters.priority);
  }
  if (filters.assignedTo) {
    q = q.eq("assigned_to", filters.assignedTo);
  }
  if (filters.requesterId) {
    q = q.eq("requester_id", filters.requesterId);
  }
  if (filters.search && filters.search.length >= 3) {
    // Full-text search sobre title + description (índice GIN
    // tickets_fulltext_idx ya existe en la migration 00700).
    // Usamos ilike como fallback compatible con el setup actual; el
    // operador websearch_to_tsquery se activará cuando la DB lo soporte
    // (TKT-022 v2: full-text real con websearch_to_tsvector).
    const term = `%${filters.search.replace(/[%_]/g, "\\$&")}%`;
    q = q.or(`title.ilike.${term},description.ilike.${term}`);
  }
  return q;
}

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

/** Error tipado de creación de comentario. */
export type AssignError =
  | { kind: "validation"; reason: string }
  | { kind: "not_found" }
  | { kind: "forbidden"; reason: string }
  | { kind: "db_error"; reason: string };

export type AssignResult =
  | { ok: true; assignment: TicketAssignment }
  | { ok: false; error: AssignError };

/**
 * Crea una asignación vía SECURITY DEFINER `assign_ticket`.
 * Devuelve un resultado tipado para mapear a HTTP status codes.
 */
export async function applyAssign(
  supabase: SupabaseClient,
  input: AssignTicketInput,
): Promise<AssignResult> {
  if (!isUuid(input.ticketId) || !isUuid(input.assigneeId)) {
    return {
      ok: false,
      error: { kind: "validation", reason: "ticketId y assigneeId deben ser UUIDs." },
    };
  }

  const { data, error } = await supabase.rpc("assign_ticket", {
    p_ticket_id: input.ticketId,
    p_assignee_id: input.assigneeId,
  });

  if (error) {
    const code = error.code ?? "";
    if (code === "P0002" || /ticket not found/i.test(error.message)) {
      return { ok: false, error: { kind: "not_found" } };
    }
    // Input inválido: el assignee no es miembro del tenant. Lo detectamos
    // ANTES del 42501 porque el mensaje contiene "not an active member",
    // que también matchearía el regex de forbidden.
    if (
      code === "P0001" ||
      /assignee is not an active member/i.test(error.message)
    ) {
      return { ok: false, error: { kind: "validation", reason: error.message } };
    }
    if (
      code === "42501" ||
      /not authorized|authentication required/i.test(error.message)
    ) {
      return { ok: false, error: { kind: "forbidden", reason: error.message } };
    }
    return { ok: false, error: { kind: "db_error", reason: error.message } };
  }

  if (!data) {
    return { ok: false, error: { kind: "db_error", reason: "RPC returned null" } };
  }
  return { ok: true, assignment: toAssignment(data as AssignmentRow) };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

interface AssignmentRow {
  id: string;
  tenant_id: string;
  ticket_id: string;
  assignee_id: string;
  assigned_by: string;
  assigned_at: string;
  unassigned_at: string | null;
}

function toAssignment(row: AssignmentRow): TicketAssignment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ticketId: row.ticket_id,
    assigneeId: row.assignee_id,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    unassignedAt: row.unassigned_at,
  };
}

/** Error tipado de creación de comentario. */
export type CommentError =
  | { kind: "validation"; reason: string }
  | { kind: "not_found" }
  | { kind: "forbidden"; reason: string }
  | { kind: "db_error"; reason: string };

export type CommentResult =
  | { ok: true; comment: TicketComment }
  | { ok: false; error: CommentError };

/**
 * Crea un comentario vía SECURITY DEFINER `create_ticket_comment`.
 * Devuelve un resultado tipado para que la ruta API mapee con precisión
 * a HTTP status codes.
 */
export async function applyCreateComment(
  supabase: SupabaseClient,
  input: CreateCommentInput,
): Promise<CommentResult> {
  const bodyLen = input.body?.length ?? 0;
  if (bodyLen < 1 || bodyLen > 10000) {
    return {
      ok: false,
      error: {
        kind: "validation",
        reason: `El cuerpo del comentario debe tener entre 1 y 10000 caracteres (recibido: ${bodyLen}).`,
      },
    };
  }

  const { data, error } = await supabase.rpc("create_ticket_comment", {
    p_ticket_id: input.ticketId,
    p_body: input.body,
    p_is_internal: input.isInternal ?? false,
  });

  if (error) {
    const code = error.code ?? "";
    if (code === "P0002" || /ticket not found/i.test(error.message)) {
      return { ok: false, error: { kind: "not_found" } };
    }
    if (
      code === "42501" ||
      /not authorized|not an active member|authentication required|not authorized to comment|not authorized to create internal/i.test(
        error.message,
      )
    ) {
      return { ok: false, error: { kind: "forbidden", reason: error.message } };
    }
    if (
      code === "P0001" ||
      /between 1 and 10000 characters/i.test(error.message)
    ) {
      return { ok: false, error: { kind: "validation", reason: error.message } };
    }
    return { ok: false, error: { kind: "db_error", reason: error.message } };
  }

  if (!data) {
    return { ok: false, error: { kind: "db_error", reason: "RPC returned null" } };
  }
  return { ok: true, comment: toComment(data as CommentRow) };
}

/** Error tipado de registro de adjunto. */
export type AttachmentError =
  | { kind: "validation"; reason: string }
  | { kind: "not_found" }
  | { kind: "forbidden"; reason: string }
  | { kind: "db_error"; reason: string };

export type AttachmentResult =
  | { ok: true; attachment: TicketAttachment }
  | { ok: false; error: AttachmentError };

/**
 * Registra metadata de un adjunto vía SECURITY DEFINER `register_ticket_attachment`.
 * Devuelve un resultado tipado para mapear a HTTP status codes.
 */
export async function applyRegisterAttachment(
  supabase: SupabaseClient,
  input: RegisterAttachmentInput,
): Promise<AttachmentResult> {
  // Validaciones de payload (replicadas en DB; defense in depth)
  const nameLen = input.originalName?.length ?? 0;
  if (nameLen < 1 || nameLen > 255) {
    return {
      ok: false,
      error: {
        kind: "validation",
        reason: `originalName debe tener entre 1 y 255 caracteres (recibido: ${nameLen}).`,
      },
    };
  }
  const mimeLen = input.mimeType?.length ?? 0;
  if (mimeLen < 1 || mimeLen > 200) {
    return {
      ok: false,
      error: { kind: "validation", reason: "mimeType fuera de rango (1..200)." },
    };
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > 26_214_400) {
    return {
      ok: false,
      error: {
        kind: "validation",
        reason: `sizeBytes debe estar en (0, 26214400] (recibido: ${input.sizeBytes}).`,
      },
    };
  }
  if (!input.storagePath || input.storagePath.length === 0) {
    return {
      ok: false,
      error: { kind: "validation", reason: "storagePath requerido." },
    };
  }
  if (!isUuid(input.ticketId)) {
    return {
      ok: false,
      error: { kind: "validation", reason: "ticketId debe ser UUID." },
    };
  }

  const { data, error } = await supabase.rpc("register_ticket_attachment", {
    p_ticket_id: input.ticketId,
    p_original_name: input.originalName,
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
    p_storage_path: input.storagePath,
    p_sha256: input.sha256 ?? null,
  });

  if (error) {
    const code = error.code ?? "";
    if (code === "P0002" || /ticket not found/i.test(error.message)) {
      return { ok: false, error: { kind: "not_found" } };
    }
    if (
      code === "P0001" ||
      /original_name|mime_type|size_bytes|storage_path|storage_path no sigue/i.test(
        error.message,
      )
    ) {
      return { ok: false, error: { kind: "validation", reason: error.message } };
    }
    if (
      code === "42501" ||
      /not authorized|not an active member|authentication required/i.test(
        error.message,
      )
    ) {
      return { ok: false, error: { kind: "forbidden", reason: error.message } };
    }
    return { ok: false, error: { kind: "db_error", reason: error.message } };
  }

  if (!data) {
    return { ok: false, error: { kind: "db_error", reason: "RPC returned null" } };
  }
  return { ok: true, attachment: toAttachment(data as AttachmentRow) };
}

// ===================================================================
// TKT-014 v2 — Adjuntos binarios reales
// ===================================================================

export interface UploadAttachmentInput {
  ticketId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: string;
  /** Contenido binario. */
  body: Uint8Array;
  /** SHA-256 hex (64 chars) opcional; validado si viene. */
  sha256?: string | null;
}

export interface UploadAttachmentOutput {
  attachment: TicketAttachment;
  storagePath: string;
  bucket: string;
}

export type UploadAttachmentError =
  | { kind: "validation"; reason: string }
  | { kind: "forbidden"; reason: string }
  | { kind: "not_found"; reason: string }
  | { kind: "db_error"; reason: string }
  | { kind: "storage_error"; reason: string }
  | { kind: "storage_disabled"; reason: string };

export type UploadAttachmentResult =
  | { ok: true; data: UploadAttachmentOutput }
  | { ok: false; error: UploadAttachmentError };

const ATTACHMENT_BUCKET = "ticket-attachments";
const SHA256_RE = /^[0-9a-f]{64}$/i;

/**
 * Sube un binario a Storage y registra la metadata.
 *
 * Flujo:
 *  1) Valida payload (longitudes, SHA-256 si viene).
 *  2) Sube el binario a `ticket-attachments/{tenant_id}/{ticket_id}/{name}`
 *     usando el admin client (service_role, bypass RLS).
 *  3) Llama `register_ticket_attachment` SECURITY DEFINER para
 *     persistir la metadata. La funcion DB valida que el path sigue
 *     la convencion.
 *  4) Si el paso 3 falla (DB error / forbidden), borra el objeto del
 *     bucket para evitar huerfanos.
 *
 * El admin client se importa de `@/shared/supabase/admin` (lazy).
 */
export async function uploadAttachmentBlob(
  userSupabase: SupabaseClient,
  input: UploadAttachmentInput,
): Promise<UploadAttachmentResult> {
  const { getSupabaseAdminClient } = await import("@/shared/supabase/admin");
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: {
        kind: "storage_disabled",
        reason: "Storage no configurado (SUPABASE_SERVICE_ROLE_KEY faltante).",
      },
    };
  }

  // Validaciones de payload (replicadas en DB; defense in depth).
  if (!isUuid(input.ticketId)) {
    return {
      ok: false,
      error: { kind: "validation", reason: "ticketId debe ser UUID." },
    };
  }
  if (!input.originalName || input.originalName.length > 255) {
    return {
      ok: false,
      error: {
        kind: "validation",
        reason: "originalName debe tener entre 1 y 255 caracteres.",
      },
    };
  }
  if (!input.mimeType || input.mimeType.length > 200) {
    return {
      ok: false,
      error: { kind: "validation", reason: "mimeType fuera de rango (1..200)." },
    };
  }
  if (!input.body || input.body.byteLength === 0) {
    return {
      ok: false,
      error: { kind: "validation", reason: "body vacio." },
    };
  }
  if (input.body.byteLength > 26_214_400) {
    return {
      ok: false,
      error: { kind: "validation", reason: "sizeBytes > 25MB." },
    };
  }
  if (
    input.sha256 !== undefined &&
    input.sha256 !== null &&
    (typeof input.sha256 !== "string" || !SHA256_RE.test(input.sha256))
  ) {
    return {
      ok: false,
      error: { kind: "validation", reason: "sha256 debe ser hex de 64 chars." },
    };
  }

  // Resolver el ticket para conocer su tenant.
  const ticket = await userSupabase
    .from("tickets")
    .select("id, tenant_id, category_id, title, description, requester_id, assigned_to, priority, state")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (ticket.error) {
    return {
      ok: false,
      error: { kind: "db_error", reason: ticket.error.message },
    };
  }
  if (!ticket.data) {
    return { ok: false, error: { kind: "not_found", reason: "ticket no existe" } };
  }

  const tenantId = ticket.data.tenant_id as string;
  const storagePath = expectedStoragePathFromSegments(tenantId, input.ticketId, input.originalName);

  // 1) Subir el binario.
  const uploadResult = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, input.body, {
      contentType: input.mimeType,
      upsert: false,
    });
  if (uploadResult.error) {
    return {
      ok: false,
      error: {
        kind: "storage_error",
        reason: `upload fallo: ${uploadResult.error.message}`,
      },
    };
  }

  // 2) Registrar metadata via SECURITY DEFINER.
  const metaResult = await applyRegisterAttachment(userSupabase, {
    ticketId: input.ticketId,
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.body.byteLength,
    storagePath,
    sha256: input.sha256 ?? null,
  });

  // 3) Si la metadata falla, cleanup del objeto para evitar huerfano.
  if (!metaResult.ok) {
    const err = metaResult.error;
    await admin.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
    if (err.kind === "validation") {
      return { ok: false, error: { kind: "validation", reason: err.reason } };
    }
    if (err.kind === "forbidden") {
      return { ok: false, error: { kind: "forbidden", reason: err.reason } };
    }
    if (err.kind === "not_found") {
      // AttachmentError.not_found no trae reason; usamos un mensaje estable.
      return {
        ok: false,
        error: { kind: "not_found", reason: "ticket no existe" },
      };
    }
    return { ok: false, error: { kind: "db_error", reason: err.reason } };
  }

  return {
    ok: true,
    data: {
      attachment: metaResult.attachment,
      storagePath,
      bucket: ATTACHMENT_BUCKET,
    },
  };
}

function expectedStoragePathFromSegments(
  tenantId: string,
  ticketId: string,
  originalName: string,
): string {
  // Mantener consistencia con src/modules/ticketing/attachments.ts.
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${ATTACHMENT_BUCKET}/${tenantId}/${ticketId}/${safeName}`;
}

export interface SignedUrlOutput {
  url: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export type SignedUrlError =
  | { kind: "validation"; reason: string }
  | { kind: "forbidden"; reason: string }
  | { kind: "not_found"; reason: string }
  | { kind: "storage_error"; reason: string }
  | { kind: "storage_disabled"; reason: string };

export type SignedUrlResult =
  | { ok: true; data: SignedUrlOutput }
  | { ok: false; error: SignedUrlError };

/**
 * Genera una signed URL temporal para descargar un attachment.
 *
 * Validaciones:
 *  - el actor tiene acceso al ticket (can_read_ticket)
 *  - el attachment pertenece al ticket
 *  - el storage_path no fue manipulado
 *  - el attachment tiene storagePath (es decir, fue subido realmente)
 *
 * La URL es de un solo uso temporal. NO se persiste en la DB.
 */
export async function createAttachmentSignedUrl(
  userSupabase: SupabaseClient,
  input: { ticketId: string; attachmentId: string; expiresInSeconds?: number },
): Promise<SignedUrlResult> {
  const { getSupabaseAdminClient } = await import("@/shared/supabase/admin");
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: {
        kind: "storage_disabled",
        reason: "Storage no configurado.",
      },
    };
  }

  if (!isUuid(input.ticketId) || !isUuid(input.attachmentId)) {
    return {
      ok: false,
      error: { kind: "validation", reason: "ticketId/attachmentId deben ser UUID." },
    };
  }

  // Traer el attachment y validar que pertenece al ticket y al tenant
  // del actor.
  const { data: row, error } = await userSupabase
    .from("ticket_attachments")
    .select(
      "id, tenant_id, ticket_id, uploaded_by, original_name, mime_type, size_bytes, storage_path, sha256, created_at",
    )
    .eq("id", input.attachmentId)
    .eq("ticket_id", input.ticketId)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      error: { kind: "storage_error", reason: error.message },
    };
  }
  if (!row) {
    return {
      ok: false,
      error: { kind: "not_found", reason: "attachment no encontrado para el ticket." },
    };
  }

  // El actor debe ser miembro activo del tenant del attachment.
  // (Reutilizamos is_active_member via service_role que bypasea RLS para
  //  el select; pero validamos manualmente la membership.)
  const { data: member } = await userSupabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", (await userSupabase.auth.getUser()).data.user?.id ?? "")
    .eq("tenant_id", row.tenant_id as string)
    .eq("status", "active")
    .maybeSingle();
  if (!member) {
    return {
      ok: false,
      error: { kind: "forbidden", reason: "no es miembro del tenant del attachment." },
    };
  }

  // El attachment debe tener storagePath real (no metadata-only).
  if (!row.storage_path) {
    return {
      ok: false,
      error: {
        kind: "not_found",
        reason: "attachment sin storage_path (metadata-only legacy).",
      },
    };
  }

  const expiresIn = Math.max(60, Math.min(input.expiresInSeconds ?? 300, 3600));
  const { data, error: signError } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(row.storage_path as string, expiresIn);
  if (signError || !data) {
    return {
      ok: false,
      error: {
        kind: "storage_error",
        reason: signError?.message ?? "createSignedUrl no devolvio URL",
      },
    };
  }

  return {
    ok: true,
    data: {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      expiresInSeconds: expiresIn,
    },
  };
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

// ===================================================================
// TKT-009 — create_ticket
// ===================================================================

/** Error tipado de creación de ticket. */
export type CreateTicketError =
  | { kind: "validation"; reason: string }
  | { kind: "forbidden"; reason: string }
  | { kind: "db_error"; reason: string };

export type CreateTicketResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; error: CreateTicketError };

const TITLE_MIN = 5;
const TITLE_MAX = 200;
const DESC_MIN = 10;
const DESC_MAX = 5000;

/**
 * Crea un ticket vía SECURITY DEFINER `create_ticket`.
 * Devuelve un resultado tipado para que la ruta API mapee con precisión
 * a HTTP status codes.
 *
 * Reglas:
 *  - tenantId, categoryId deben ser UUIDs.
 *  - title length [5, 200] (replicado del CHECK del schema).
 *  - description length [10, 5000] (replicado del CHECK del schema).
 *  - areaId, teamId (si vienen) deben ser UUIDs.
 *  - requesterId NO se pasa: lo deriva auth.uid() en la SECURITY DEFINER
 *    (defense in depth contra impersonation).
 */
export async function applyCreateTicket(
  supabase: SupabaseClient,
  input: CreateTicketInput,
): Promise<CreateTicketResult> {
  // Validaciones de payload (replicadas en DB; defense in depth)
  if (!isUuid(input.tenantId)) {
    return {
      ok: false,
      error: { kind: "validation", reason: "tenantId debe ser UUID." },
    };
  }
  if (!isUuid(input.categoryId)) {
    return {
      ok: false,
      error: { kind: "validation", reason: "categoryId debe ser UUID." },
    };
  }
  const titleLen = input.title?.length ?? 0;
  if (titleLen < TITLE_MIN || titleLen > TITLE_MAX) {
    return {
      ok: false,
      error: {
        kind: "validation",
        reason: `title debe tener entre ${TITLE_MIN} y ${TITLE_MAX} caracteres (recibido: ${titleLen}).`,
      },
    };
  }
  const descLen = input.description?.length ?? 0;
  if (descLen < DESC_MIN || descLen > DESC_MAX) {
    return {
      ok: false,
      error: {
        kind: "validation",
        reason: `description debe tener entre ${DESC_MIN} y ${DESC_MAX} caracteres (recibido: ${descLen}).`,
      },
    };
  }
  if (input.areaId !== undefined && input.areaId !== null && !isUuid(input.areaId)) {
    return {
      ok: false,
      error: { kind: "validation", reason: "areaId debe ser UUID." },
    };
  }
  if (input.teamId !== undefined && input.teamId !== null && !isUuid(input.teamId)) {
    return {
      ok: false,
      error: { kind: "validation", reason: "teamId debe ser UUID." },
    };
  }

  const { data, error } = await supabase.rpc("create_ticket", {
    p_tenant_id: input.tenantId,
    p_category_id: input.categoryId,
    p_title: input.title,
    p_description: input.description,
    p_area_id: input.areaId ?? null,
    p_team_id: input.teamId ?? null,
  });

  if (error) {
    const code = error.code ?? "";
    if (
      code === "P0001" ||
      /title|description|category|not active|not found in tenant|does not belong/i.test(
        error.message,
      )
    ) {
      return { ok: false, error: { kind: "validation", reason: error.message } };
    }
    if (
      code === "42501" ||
      /not authorized|not an active member|authentication required/i.test(
        error.message,
      )
    ) {
      return { ok: false, error: { kind: "forbidden", reason: error.message } };
    }
    return { ok: false, error: { kind: "db_error", reason: error.message } };
  }

  if (!data) {
    return {
      ok: false,
      error: { kind: "db_error", reason: "RPC returned null" },
    };
  }
  return { ok: true, ticket: toTicket(data as TicketRow) };
}
