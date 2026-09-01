/**
 * DeskWork Ticketing Core / TKT-023 — Capa de presentacion de labels.
 *
 * Convierte los valores internos de estado y prioridad (que NO se
 * traducen — son contractuales) a su etiqueta localizada.
 *
 * NO usar estas funciones para logica de negocio. Solo para
 * presentacion.
 */
import type { Locale } from "./locale";
import { getMessages } from "./messages";

/** Estados contractuales. Mantener sincronizado con supabase enum. */
export const TICKET_STATES = [
  "ABIERTO",
  "EN_PROCESO",
  "ESPERANDO_USUARIO",
  "ESCALADO",
  "RESUELTO",
  "CERRADO",
] as const;

export type TicketStateCode = (typeof TICKET_STATES)[number];

/** Prioridades contractuales. Mantener sincronizado con supabase enum. */
export const TICKET_PRIORITIES = ["P1", "P2", "P3", "P4"] as const;

export type TicketPriorityCode = (typeof TICKET_PRIORITIES)[number];

export function isTicketStateCode(value: unknown): value is TicketStateCode {
  return (
    typeof value === "string" &&
    (TICKET_STATES as readonly string[]).includes(value)
  );
}

export function isTicketPriorityCode(
  value: unknown,
): value is TicketPriorityCode {
  return (
    typeof value === "string" &&
    (TICKET_PRIORITIES as readonly string[]).includes(value)
  );
}

export function getStateLabel(code: string, locale: Locale): string {
  const messages = getMessages(locale);
  if (isTicketStateCode(code)) {
    return messages.states[code];
  }
  // Fallback: devuelve el codigo tal cual para mantener trazabilidad.
  return code;
}

export function getPriorityLabel(code: string, locale: Locale): string {
  const messages = getMessages(locale);
  if (isTicketPriorityCode(code)) {
    return messages.priorities[code];
  }
  return code;
}
