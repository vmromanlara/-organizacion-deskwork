/**
 * DeskWork Ticketing Core / Fase Block 1.
 * TKT-005 — Helpers para eventos de ticket.
 * Los eventos son append-only: la inmutabilidad se enforce en DB.
 * Aquí sólo construimos payloads.
 */

import { TICKET_EVENT_TYPES, type TicketEventType } from "./types";

export interface EventPayload {
  tenantId: string;
  ticketId: string;
  actorId: string | null;
  eventType: TicketEventType;
  fromState?: string | null;
  toState?: string | null;
  fromPriority?: string | null;
  toPriority?: string | null;
  metadata?: Record<string, unknown>;
}

export function isKnownEventType(value: string): value is TicketEventType {
  return (TICKET_EVENT_TYPES as readonly string[]).includes(value);
}

export function normalizeEventMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata === null || metadata === undefined) return {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as Record<string, unknown>;
}
