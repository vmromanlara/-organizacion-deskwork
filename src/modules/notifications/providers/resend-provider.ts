/**
 * DeskWork Ticketing Core / TKT-026 Phase 1.
 *
 * ResendProvider — adapter que implementa la interfaz `EmailProvider`
 * utilizando el SDK oficial de Resend (`resend` ≥ 6.x).
 *
 * Decisiones de diseño:
 *
 *  1) Identidad externa (idempotency): se deriva SIEMPRE de
 *     `notification_outbox.id` (no de `event_id`). Razón: `event_id`
 *     puede cambiar en re-enqueue legítimos de estados pending/failed;
 *     `notification_outbox.id` representa la identidad operacional
 *     estable de la notificación. Esto convierte la entrega en
 *     "at-least-once con mitigación de duplicados vía idempotency-key"
 *     — NO "exactly-once".
 *
 *  2) Sin retry interno: cualquier fallo (4xx, 5xx, network) se traduce
 *     a `EmailResult = { ok: false, error }`. La política de retry
 *     pertenece al outbox/worker (TKT-026 Phase 2+).
 *
 *  3) Defense in depth: la API key NUNCA se expone en mensajes de error
 *     retornados al dispatcher. Si el SDK filtrara el secreto (p.ej. en
 *     un TypeError de fetch), se redacta antes de propagar.
 *
 *  4) Configuración server-side: `apiKey` y `from` se pasan vía
 *     constructor (NO se leen de process.env en este archivo). El
 *     wiring a `RESEND_API_KEY` / `RESEND_FROM_EMAIL` se hace en el
 *     entrypoint (worker / Edge Function) — fuera de Phase 1.
 *
 *  5) `baseUrl` y `userAgent` opcionales para facilitar testing local
 *     y para no acoplar la implementación al endpoint público.
 *
 * Contrato cumplido:
 *   - implements EmailProvider
 *   - readonly name = "resend"
 *   - send(message): Promise<EmailResult>
 */

import { Resend } from "resend";
import type { EmailMessage, EmailProvider, EmailResult } from "../provider";

export interface ResendProviderOptions {
  /** Resend API key (`re_…`). Requerida. NUNCA debe leerse desde el cliente. */
  apiKey: string;
  /**
   * Remitente. Acepta tanto "email@dominio" como
   * "Nombre <email@dominio>" (formato RFC 5322 display-name).
   * Requerido.
   */
  from: string;
  /** Override del endpoint HTTP — útil para tests locales. */
  baseUrl?: string;
  /** Override del User-Agent. */
  userAgent?: string;
}

// Heurística mínima: contiene una sola "@" y al menos un punto en la
// parte del dominio. Acepta tanto "a@b.c" como "Name <a@b.c>".
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Extrae la dirección de email real de un `from` con formato RFC 5322
 * display-name, o devuelve el string tal cual si ya es un email simple.
 *  - "a@b.c"          -> "a@b.c"
 *  - "Name <a@b.c>"   -> "a@b.c"
 *  - "  <a@b.c>  "    -> "a@b.c"
 */
function extractEmail(from: string): string {
  const match = from.match(/<\s*([^<>]+?)\s*>$/);
  if (match) return match[1];
  // Si no hay "<...>" y el string contiene "<" en otro lugar, es inválido.
  if (from.includes("<") || from.includes(">")) return "";
  return from.trim();
}

/**
 * Redacta prefijos de API key Resend (`re_…`) en strings potencialmente
 * contaminados por el SDK o por stacks de fetch. Conservador — no
 * pretende ser un sanitizer universal.
 */
function redactApiKey(text: string): string {
  // Resend API keys tienen el formato `re_<token>` donde el token contiene
  // letras, dígitos y underscores. La heurística es: `re_` + ≥6 chars del
  // alfabeto extendido. Esto NO pretende cubrir todos los formatos; es
  // defense in depth.
  return text.replace(/re_[A-Za-z0-9_]{6,}/g, "re_***REDACTED***");
}

export class ResendProvider implements EmailProvider {
  readonly name = "resend";

  private readonly client: Resend;
  private readonly from: string;

  constructor(options: ResendProviderOptions) {
    const apiKey = options.apiKey?.trim() ?? "";
    if (apiKey.length === 0) {
      throw new Error(
        "ResendProvider: apiKey is required (configurar RESEND_API_KEY server-side).",
      );
    }
    if (!options.from || !EMAIL_REGEX.test(extractEmail(options.from))) {
      throw new Error(
        `ResendProvider: 'from' inválido. Esperado "email@dominio" o "Nombre <email@dominio>" (recibido: ${JSON.stringify(options.from)}).`,
      );
    }
    this.from = options.from;
    this.client = new Resend(apiKey, {
      baseUrl: options.baseUrl,
      userAgent: options.userAgent,
    });
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      // El SDK retorna un `Response<T>` discriminated union: { data, error: null }
      // o { data: null, error } — no lanza en respuestas 4xx/5xx de la API.
      const response = await this.client.emails.send(
        {
          from: this.from,
          to: message.to,
          subject: message.subject,
          // `body` del contrato EmailMessage es texto plano (templates.ts).
          text: message.body,
          // Metadato de correlación — útil para triage en logs de Resend.
          tags: [
            { name: "notification_type", value: message.notificationType },
          ],
        },
        {
          // Idempotency-Key: derivado del outboxId. Garantiza que un
          // reintento del worker no duplique el envío upstream.
          idempotencyKey: message.outboxId,
        },
      );

      if (response.error) {
        const status = response.error.statusCode ?? "?";
        return {
          ok: false,
          error: `resend api error (${response.error.name}, status=${status}): ${response.error.message}`,
        };
      }
      if (!response.data?.id) {
        return {
          ok: false,
          error:
            "resend api returned success without id (contrato SDK inesperado)",
        };
      }
      return { ok: true, providerMessageId: response.data.id };
    } catch (err) {
      // Errores no controlados: timeouts, abort, red caída, etc.
      // El SDK de Resend puede propagar fetch errors con info sensible.
      const raw = err instanceof Error ? err.message : String(err);
      const sanitized = redactApiKey(raw);
      return {
        ok: false,
        error: `resend network error: ${sanitized}`,
      };
    }
  }
}
