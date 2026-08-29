/**
 * DeskWork Ticketing Core / Fase Block 1.
 * TKT-005 — Repository (contrato).
 *
 * Esta capa NO ejecuta queries reales: define las firmas que las API routes
 * (TKT-006, Bloque 2) implementarán. Los tipos reflejan exactamente el
 * schema de supabase/migrations/20260827000700_tickets_schema.sql.
 */

import type {
  SlaStatus,
  TicketEventType,
  TicketPriority,
  TicketState,
} from "./types";

export interface TicketCategory {
  id: string;
  tenantId: string;
  slug: string;
  label: string;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
}

export interface Ticket {
  id: string;
  tenantId: string;
  requesterId: string;
  categoryId: string;
  priority: TicketPriority;
  state: TicketState;
  title: string;
  description: string;
  assignedTo: string | null;
  areaId: string | null;
  teamId: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaStatus: SlaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TicketAttachment {
  id: string;
  tenantId: string;
  ticketId: string;
  uploadedBy: string;
  storagePath: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  createdAt: string;
}

export interface TicketComment {
  id: string;
  tenantId: string;
  ticketId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvent {
  id: string;
  tenantId: string;
  ticketId: string;
  actorId: string | null;
  eventType: TicketEventType;
  fromState: TicketState | null;
  toState: TicketState | null;
  fromPriority: TicketPriority | null;
  toPriority: TicketPriority | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TicketAssignment {
  id: string;
  tenantId: string;
  ticketId: string;
  assigneeId: string;
  assignedBy: string;
  assignedAt: string;
  unassignedAt: string | null;
}

export interface CreateTicketInput {
  tenantId: string;
  requesterId: string;
  categoryId: string;
  title: string;
  description: string;
  areaId?: string | null;
  teamId?: string | null;
}

export interface UpdateTicketStateInput {
  ticketId: string;
  fromState: TicketState;
  toState: TicketState;
  actorId: string;
  reason?: string;
}

export interface AssignTicketInput {
  ticketId: string;
  assigneeId: string;
  assignedBy: string;
}

export interface CreateCommentInput {
  ticketId: string;
  body: string;
  isInternal?: boolean;
}

/**
 * Contrato del repository. Las implementaciones concretas viven en TKT-006
 * (API routes), no en este archivo. Este módulo sólo garantiza tipos y firmas.
 */
export interface TicketRepository {
  listCategories(tenantId: string): Promise<TicketCategory[]>;
  getCategory(tenantId: string, slug: string): Promise<TicketCategory | null>;

  getTicket(ticketId: string): Promise<Ticket | null>;
  listTicketsByTenant(tenantId: string, limit: number): Promise<Ticket[]>;
  listTicketsByRequester(requesterId: string): Promise<Ticket[]>;
  listTicketsByAssignee(assigneeId: string): Promise<Ticket[]>;
  createTicket(input: CreateTicketInput): Promise<Ticket>;
  updateTicketState(input: UpdateTicketStateInput): Promise<Ticket>;

  assignTicket(input: AssignTicketInput): Promise<TicketAssignment>;
  unassignTicket(ticketId: string, actorId: string): Promise<TicketAssignment>;

  createComment(input: CreateCommentInput): Promise<TicketComment>;
  listCommentsByTicket(ticketId: string): Promise<TicketComment[]>;
}
