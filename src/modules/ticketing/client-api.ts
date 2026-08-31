/**
 * DeskWork Ticketing Core / TKT-009 follow-up.
 * Client-side API wrapper.
 *
 * Funciones tipadas que envuelven `fetch` contra los endpoints de
 * Ticketing. Usadas por los componentes de UI (form, listados, detail,
 * transiciones). Las cookies de Supabase se envían automáticamente por
 * el browser, así que el server side puede resolver auth.uid().
 *
 * Cada función devuelve un resultado discriminado para que la UI pueda
 * mapear con precisión a loading/error/success.
 */

import type { Ticket, TicketAttachment, TicketCategory, TicketComment } from "./repository";
import type { TicketState } from "./types";

export type ClientApiError =
  | { kind: "network"; reason: string }
  | { kind: "http"; status: number; reason: string; body?: unknown }
  | { kind: "validation"; reason: string }
  | { kind: "forbidden"; reason: string }
  | { kind: "not_found"; reason: string }
  | { kind: "conflict"; reason: string }
  | { kind: "unknown"; reason: string };

export type ClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ClientApiError };

interface ServerErrorBody {
  error?: string;
  reason?: string;
  received?: unknown;
}

async function parseErrorBody(response: Response): Promise<ServerErrorBody> {
  try {
    return (await response.json()) as ServerErrorBody;
  } catch {
    return {};
  }
}

function mapError(status: number, body: ServerErrorBody): ClientApiError {
  const reason = body.reason ?? body.error ?? `HTTP ${status}`;
  if (status === 401) return { kind: "forbidden", reason };
  if (status === 403) return { kind: "forbidden", reason };
  if (status === 404) return { kind: "not_found", reason };
  if (status === 409) return { kind: "conflict", reason };
  if (status === 400) return { kind: "validation", reason };
  return { kind: "http", status, reason, body };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ClientResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      credentials: "same-origin",
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "network",
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }
  if (!response.ok) {
    const body = await parseErrorBody(response);
    return { ok: false, error: mapError(response.status, body) };
  }
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "validation",
        reason: `Respuesta no es JSON válido: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
  return { ok: true, data };
}

// =====================================================================
// Tickets
// =====================================================================

export interface CreateTicketPayload {
  categoryId: string;
  title: string;
  description: string;
  areaId?: string;
  teamId?: string;
}

export function listTicketCategories(): Promise<ClientResult<{ categories: TicketCategory[] }>> {
  return request("/api/ticket-categories");
}

export function listTickets(
  scope: "mine" | "assigned" | "tenant" = "mine",
  filters: {
    state?: TicketState;
    priority?: "P1" | "P2" | "P3" | "P4";
    search?: string;
  } = {},
): Promise<ClientResult<{ tickets: Ticket[]; meta: { total: number } }>> {
  const params = new URLSearchParams({ scope });
  if (filters.state) params.set("state", filters.state);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.search) params.set("search", filters.search);
  return request(`/api/tickets?${params.toString()}`);
}

export function getTicket(
  ticketId: string,
): Promise<ClientResult<{ ticket: Ticket }>> {
  return request(`/api/tickets/${encodeURIComponent(ticketId)}`);
}

export function createTicket(
  payload: CreateTicketPayload,
): Promise<ClientResult<{ ticket: Ticket }>> {
  return request("/api/tickets", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function transitionTicket(
  ticketId: string,
  toState: TicketState,
  reason?: string,
): Promise<ClientResult<{ ticket: Ticket }>> {
  return request(
    `/api/tickets/${encodeURIComponent(ticketId)}/transitions`,
    {
      method: "POST",
      body: JSON.stringify({ toState, reason }),
    },
  );
}

// =====================================================================
// Comments
// =====================================================================

export interface CreateCommentPayload {
  body: string;
  isInternal?: boolean;
}

export function listComments(
  ticketId: string,
): Promise<ClientResult<{ comments: TicketComment[]; meta: { total: number } }>> {
  return request(`/api/tickets/${encodeURIComponent(ticketId)}/comments`);
}

export function createComment(
  ticketId: string,
  payload: CreateCommentPayload,
): Promise<ClientResult<{ comment: TicketComment; by: string; isInternal: boolean }>> {
  return request(`/api/tickets/${encodeURIComponent(ticketId)}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// =====================================================================
// Assignment (TKT-012)
// =====================================================================

export interface TenantMember {
  user_id: string;
  functional_role: string;
}

export function listTenantMembers(): Promise<ClientResult<{ members: TenantMember[] }>> {
  return request("/api/tenant-members");
}

export function assignTicket(
  ticketId: string,
  assigneeId: string,
): Promise<ClientResult<{ assignment: { id: string; assigneeId: string }; ticket: { id: string; assignedTo: string } }>> {
  return request(
    `/api/tickets/${encodeURIComponent(ticketId)}/assignments`,
    {
      method: "POST",
      body: JSON.stringify({ assigneeId }),
    },
  );
}

// =====================================================================
// Attachments (TKT-014 v1 — metadata only)
// =====================================================================

export interface CreateAttachmentPayload {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  sha256?: string | null;
}

export function listAttachments(
  ticketId: string,
): Promise<ClientResult<{ attachments: TicketAttachment[]; meta: { total: number } }>> {
  return request(`/api/tickets/${encodeURIComponent(ticketId)}/attachments`);
}

export function registerAttachment(
  ticketId: string,
  payload: CreateAttachmentPayload,
): Promise<ClientResult<{ attachment: TicketAttachment; by: string }>> {
  return request(`/api/tickets/${encodeURIComponent(ticketId)}/attachments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
