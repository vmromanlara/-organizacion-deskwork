/**
 * DeskWork Ticketing Core / Fase Block 1.
 * TKT-005 — Vocabulario de tipos compartidos.
 * Esta capa NO realiza accesos a DB: es solo contrato de tipos para el service layer
 * y para los consumidores (UI, API routes en TKT-006).
 */

export const TICKET_PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATES = [
  "ABIERTO",
  "EN_PROCESO",
  "ESPERANDO_USUARIO",
  "ESCALADO",
  "RESUELTO",
  "CERRADO",
] as const;
export type TicketState = (typeof TICKET_STATES)[number];

export const TERMINAL_TICKET_STATES: readonly TicketState[] = ["CERRADO"];

export const TICKET_EVENT_TYPES = [
  "created",
  "state_changed",
  "assigned",
  "unassigned",
  "commented",
  "attachment_added",
  "priority_changed",
  "sla_breached",
] as const;
export type TicketEventType = (typeof TICKET_EVENT_TYPES)[number];

export const SLA_STATUSES = ["on_track", "at_risk", "overdue", "met"] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

/** Identidad operativa en el sentido del authorization model v3 §2.4. */
export type TicketActorKind =
  | "requester"
  | "supervisor"
  | "agent"
  | "technical_lead"
  | "director"
  | "system";

export interface TicketActor {
  /** Auth.uid() del actor actual. */
  userId: string | null;
  /** functional_role del actor en el tenant del ticket, si tiene membership. */
  functionalRole: string | null;
  /** Determinado por el service layer en base a userId + role + scope grants. */
  kind: TicketActorKind;
}

export interface TicketSnapshot {
  id: string;
  tenantId: string;
  requesterId: string;
  assignedTo: string | null;
  state: TicketState;
  priority: TicketPriority;
  areaId: string | null;
  teamId: string | null;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaStatus: SlaStatus;
}

export interface TransitionResult {
  valid: boolean;
  /** Razón legible cuando valid=false; null cuando valid=true. */
  reason: string | null;
}

export function hasTicketState(value: string): value is TicketState {
  return (TICKET_STATES as readonly string[]).includes(value);
}

export function hasTicketPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value);
}

export function isTerminalState(state: TicketState): boolean {
  return TERMINAL_TICKET_STATES.includes(state);
}
