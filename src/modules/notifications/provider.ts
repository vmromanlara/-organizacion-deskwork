/**
 * DeskWork Ticketing Core / TKT-019.
 * EmailProvider — abstracción de envío de email.
 *
 * El dispatcher depende de esta interfaz, no de un proveedor concreto.
 * La implementación por defecto en TKT-019 v1 es `InMemoryProvider`
 * (tests, dev). Un proveedor real (SMTP/Resend/SendGrid/...) implementa
 * la misma interfaz y se inyecta al dispatcher.
 *
 * El sistema Ticketing NUNCA se acopla directamente a un proveedor: la
 * mutación crítica sólo escribe en `notification_outbox`; el envío se
 * hace fuera de la transacción principal.
 */

import type { NotificationRow } from "./types.ts";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  /** Tipo de notificación original; útil para el provider para enrutar a un template. */
  notificationType: NotificationRow["notificationType"];
  /** ID de la fila del outbox; útil para correlación. */
  outboxId: string;
}

export type EmailResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: string };

export interface EmailProvider {
  /** Identificador del provider (para logging / diagnóstico). */
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}
