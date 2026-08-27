/**
 * DeskWork Ticketing Core / Fase Block 1.
 * TKT-005 — Códigos canónicos de permisos de Ticketing.
 * Reflejan la authorization_permissions sembrada en TKT-003.
 * Si un código nuevo aparece, agregarlo simultáneamente a:
 *   - src/modules/ticketing/permissions.ts (este archivo)
 *   - supabase/migrations/20260827000720_tickets_authorization.sql
 */

export const TICKET_PERMISSIONS = {
  // 9 permisos heredados de Foundation Fase 3A.
  TICKET_CREATE_SELF: "ticket.create.self",
  TICKET_CREATE_SCOPE: "ticket.create.scope",
  TICKET_CREATE_INSTITUTION: "ticket.create.institution",
  TICKET_READ_SELF: "ticket.read.self",
  TICKET_READ_SCOPE: "ticket.read.scope",
  TICKET_READ_INSTITUTION: "ticket.read.institution",
  TICKET_STATUS_REQUEST: "ticket.status.request",
  TICKET_STATUS_EXECUTE: "ticket.status.execute",
  // 5 permisos nuevos de TKT-003.
  TICKET_ASSIGNMENT_EXECUTE: "ticket.assignment.execute",
  TICKET_COMMENT_CREATE: "ticket.comment.create",
  TICKET_ATTACHMENT_CREATE: "ticket.attachment.create",
  TICKET_KPIS_READ_INSTITUTION: "ticket.kpis.read.institution",
  TICKET_EXECUTE_ASSIGNED: "ticket.execute.assigned",
} as const;

export type TicketPermission =
  (typeof TICKET_PERMISSIONS)[keyof typeof TICKET_PERMISSIONS];

/** Conjunto total: 14 permisos canónicos (9 Foundation + 5 TKT-003). */
export const ALL_TICKET_PERMISSIONS: readonly TicketPermission[] = Object.values(
  TICKET_PERMISSIONS,
);

export function isTicketPermission(value: string): value is TicketPermission {
  return (ALL_TICKET_PERMISSIONS as readonly string[]).includes(value);
}
