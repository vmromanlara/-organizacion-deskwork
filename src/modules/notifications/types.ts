/**
 * DeskWork Ticketing Core / TKT-019.
 * Vocabulario de tipos compartidos del subsistema de notificaciones.
 *
 * El outbox persistente está en la tabla `public.notification_outbox`
 * (ver migration 20260827000840). Aquí sólo reflejamos ese vocabulario
 * para uso en la app layer (dispatcher, provider, tests).
 */

export const NOTIFICATION_TYPES = [
  "ticket.assigned",
  "ticket.state_changed_to_resolved",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed",
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isNotificationStatus(value: string): value is NotificationStatus {
  return (NOTIFICATION_STATUSES as readonly string[]).includes(value);
}

export interface NotificationPayload {
  ticket_id: string;
  ticket_title: string;
  from_state?: string;
  to_state?: string;
  assigned_by?: string;
}

export interface NotificationRow {
  id: string;
  tenantId: string;
  ticketId: string;
  eventId: string;
  notificationType: NotificationType;
  recipientUserId: string;
  recipientEmailSnapshot: string;
  payload: NotificationPayload;
  status: NotificationStatus;
  attemptCount: number;
  claimId: string | null;
  claimExpiresAt: string | null;
  availableAt: string;
  createdAt: string;
  processedAt: string | null;
  lastError: string | null;
}
