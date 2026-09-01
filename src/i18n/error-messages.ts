/**
 * DeskWork Ticketing Core / TKT-023 — Mapeo de errores API a mensajes.
 *
 * Convierte el `kind` (ClientApiError.kind) o un codigo de error
 * conocido a un string localizado. Si no hay traduccion, devuelve
 * la razon cruda o el codigo.
 */
import type { ClientApiError } from "@/modules/ticketing/client-api";
import type { Messages } from "./messages";

export function getErrorMessage(
  err: ClientApiError,
  messages: Messages,
): string {
  // network: mensaje dedicado
  if (err.kind === "network") {
    return messages.errors.network;
  }
  // unknown: la razon suele ser HTTP generico
  if (err.kind === "unknown") {
    return messages.errors.unknown;
  }
  // forbidden / not_found / conflict / validation: si la razon es un
  // codigo conocido, lo traducimos; si no, mostramos la razon cruda.
  const reason = (err as { reason?: string }).reason ?? "";
  const translated = (messages.errors as unknown as Record<string, string>)[
    reason
  ];
  if (translated) {
    return translated;
  }
  // Validation con razon: el caller suele querer "validation: reason".
  if (err.kind === "validation" && reason) {
    return messages.errors.validation_with_reason.replace("{reason}", reason);
  }
  // Default por kind
  const fallback = (messages.errors as Record<string, string>)[err.kind];
  return fallback ?? reason ?? messages.errors.unknown;
}
