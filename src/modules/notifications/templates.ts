/**
 * DeskWork Ticketing Core / TKT-019.
 * Templates de email por notification_type.
 *
 * TKT-019 v1: render simple (sin i18n, sin Markdown). Sustituible por
 * un motor de templates más rico (TKT-023) sin cambiar el contrato del
 * dispatcher.
 *
 * El provider recibe EmailMessage { to, subject, body, ... } y se
 * responsabiliza del transporte. La función `renderTemplate` sólo
 * produce strings a partir del payload.
 */

import type { NotificationRow } from "./types";

export interface RenderedEmail {
  subject: string;
  body: string;
}

/**
 * Render simple a partir del payload. No-op para campos faltantes.
 * El email siempre lleva un subject identificable para triage manual.
 */
export function renderTemplate(
  notification: NotificationRow,
): RenderedEmail {
  const title = notification.payload.ticket_title ?? "(sin título)";
  const ticketId = notification.payload.ticket_id ?? notification.ticketId;

  switch (notification.notificationType) {
    case "ticket.assigned":
      return {
        subject: `DeskWork — Ticket asignado: ${title}`,
        body: [
          `Hola,`,
          ``,
          `Te han asignado un nuevo ticket en DeskWork.`,
          ``,
          `  Título:   ${title}`,
          `  Ticket:   ${ticketId}`,
          `  Asignado por: ${notification.payload.assigned_by ?? "(sistema)"}`,
          ``,
          `Ingresa a DeskWork para iniciar la atención.`,
          ``,
          `— DeskWork`,
        ].join("\n"),
      };
    case "ticket.state_changed_to_resolved":
      return {
        subject: `DeskWork — Tu ticket fue resuelto: ${title}`,
        body: [
          `Hola,`,
          ``,
          `Tu solicitud fue resuelta.`,
          ``,
          `  Título:    ${title}`,
          `  Ticket:    ${ticketId}`,
          `  Estado:    ${notification.payload.from_state ?? "?"} → ${notification.payload.to_state ?? "RESUELTO"}`,
          ``,
          `Si consideras que la solución no es correcta, puedes solicitar`,
          `reapertura desde la página del ticket.`,
          ``,
          `— DeskWork`,
        ].join("\n"),
      };
    default: {
      // Exhaustivo: si llega un tipo nuevo, TS lo señala aquí.
      const exhaustiveCheck: never = notification.notificationType;
      void exhaustiveCheck;
      return {
        subject: `DeskWork — Notificación`,
        body: `Notificación sin plantilla (${notification.notificationType}).`,
      };
    }
  }
}
