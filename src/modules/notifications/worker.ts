/**
 * DeskWork Ticketing Core / TKT-026 Phase 2B.
 *
 * Notification worker — entrypoint ejecutable por un runtime server-side
 * privilegiado (Supabase Edge Function, pg_cron trigger, Vercel cron, etc.).
 *
 * ## Composición
 *
 * El worker es una capa shell delgada sobre `dispatchBatch` (TKT-019). NO
 * reimplementa la orquestación claim → render → send → complete. Aporta:
 *
 *   1. Logging estructurado por evento (ver §Logging abajo).
 *   2. Redacción defensiva de secretos en los logs.
 *   3. Inyección de un logger para tests deterministas.
 *   4. `itemTimeoutMs` como audit/configuration field (ver §Timeout abajo).
 *
 * El dispatcher (TKT-019) conserva su contrato: error isolation, sin retry
 * interno, propagando `outboxId` como `EmailMessage.outboxId` →
 * `Idempotency-Key` upstream.
 *
 * ## Política de reintentos (NO worker)
 *
 * El worker NO implementa reintentos. La política de reintentos vive en
 * `complete_notification` (F-5: cap hard-coded de 5, transición
 * automática a 'dead'). El worker simplemente refleja el resultado del
 * provider: success → 'sent', error → 'failed'. Si la RPC evalúa que
 * `attempt_count >= 5`, el status final será 'dead' (no decisión del
 * worker).
 *
 * ## Idempotencia
 *
 *   notification_outbox.id (DB, PK estable)
 *     → EmailMessage.outboxId (worker)
 *     → ResendProvider.idempotencyKey
 *     → header HTTP "Idempotency-Key"
 *
 * El worker NO usa `event_id` como clave de idempotencia: `event_id`
 * puede cambiar en re-enqueue legítimos de estados pending/failed
 * (Fase 2A migration 20260901000930), mientras que
 * `notification_outbox.id` es la identidad operacional estable.
 *
 * ## Timeout (F-7 / F-9)
 *
 * `itemTimeoutMs` is currently an **audit/configuration field** recorded
 * in `worker.start`. It is **NOT enforced** by `runWorkerOnce`. The
 * worker intentionally remains a thin observability shell over
 * `dispatchBatch`; implementing per-item timeout here would require
 * duplicating or intercepting the dispatcher loop (out of Phase 2B
 * scope).
 *
 * Specifically:
 *
 *   - `runWorkerOnce` does NOT use `Promise.race`. There is no
 *     per-item timer, no `AbortController`, no `setTimeout`.
 *   - `itemTimeoutMs` is read in `runWorkerOnce` and included in the
 *     `worker.start` log fields, and that's all.
 *   - `WorkerResult.itemTimeouts` is currently always 0. The field is
 *     reserved for future runtime-level timeout integration (Phase 2C /
 *     2D) and retained for result/schema stability.
 *
 * Execution timeout belongs to the **runtime layer** that invokes
 * `runWorkerOnce`. Future runtime integrations may use mechanisms
 * appropriate to the platform:
 *
 *   - Supabase Edge Functions: `AbortController` or platform deadline.
 *   - pg_cron invocation: `statement_timeout` GUC.
 *   - Vercel cron: function-level `maxDuration`.
 *   - Self-hosted Node: `setTimeout` race around the call.
 *
 * Such a runtime-level timeout MUST respect the relationship with the
 * DB lease: `executionTimeout < leaseSeconds * 1000` is the safe
 * invariant. If the runtime cuts off the worker invocation, the lease
 * expires and another worker can reclaim the row; the provider, thanks
 * to `Idempotency-Key: notification_outbox.id`, will not generate an
 * upstream duplicate even if the original fetch completes after the
 * cutoff.
 *
 * The DB lease is the real recovery mechanism. The runtime timeout is
 * a hygiene mechanism to prevent zombie invocations.
 *
 * ## Logging
 *
 * Eventos emitidos por el worker actual (todos opcionales, vía logger
 * inyectable):
 *
 *   - worker.start       { batchSize, leaseSeconds, itemTimeoutMs, provider }
 *   - worker.claimed     { claimed }
 *   - item.failed        { notificationId, error }                  (per failed item)
 *   - worker.summary     { claimed, sent, failed, durationMs, provider, itemTimeouts }
 *
 * Eventos que **NO** se emiten en Phase 2B (intencionalmente):
 *
 *   - item.processing
 *   - provider.result
 *   - complete.result
 *   - item.timeout
 *
 * These per-item lifecycle events would require dispatcher
 * instrumentation or duplication of the dispatch loop and are
 * intentionally outside Phase 2B scope. They are documented here so
 * operators do not search the code for them.
 *
 * Los campos se redactan para NO incluir:
 *   - API keys (regex `re_[A-Za-z0-9_]{6,}`)
 *   - Authorization headers
 *   - Contenido completo del email (subject/body)
 *   - PII innecesaria
 *
 * El logger por defecto escribe en `stdout` con formato
 * `key=value` separado por espacios (sin estructura JSON para evitar
 * acoplamiento con un logger externo en Phase 2B).
 *
 * ## Known limitation (TKT-019 dispatcher)
 *
 * `dispatchBatch` provides isolation against errors returned by the
 * provider (`{ok: false, error}`) and against exceptions thrown by
 * `provider.send` (the dispatcher has a `try/catch` around
 * `provider.send`). However, the `await completeNotification(...)`
 * calls inside `dispatchOne` are NOT wrapped in any `try/catch`. If the
 * `complete_notification` RPC itself throws (Supabase SDK network
 * error, transient unavailability), the error propagates out of
 * `dispatchOne`, out of the per-item `for` loop in `dispatchBatch`,
 * and aborts processing of the remaining items in the batch.
 *
 * This is a property of the TKT-019 dispatcher, NOT a Phase 2B
 * regression. The Phase 2B worker composes `dispatchBatch` as-is and
 * inherits this behavior. Hardening the dispatcher's complete-throw
 * path belongs to TKT-019 territory and is **explicitly out of
 * Phase 2B scope**. Documented as a known limitation / follow-up.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchBatch, type DispatcherResult } from "./dispatcher";
import type { EmailProvider } from "./provider";
import type { NotificationRow } from "./types";

// =====================================================================
// Logger
// =====================================================================

/**
 * Logger inyectable. Los tests pasan un mock que captura las llamadas.
 * La implementación por defecto escribe en stdout con formato
 * `key=value key=value ...` (sin JSON para evitar acoplamiento).
 */
export interface WorkerLogger {
  info(event: string, fields: Record<string, unknown>): void;
  warn(event: string, fields: Record<string, unknown>): void;
  error(event: string, fields: Record<string, unknown>): void;
}

/**
 * Redacción defensiva de secretos en campos string. NO pretende ser un
 * sanitizer universal — es defense in depth contra fugas accidentales
 * en logs. Específicamente:
 *
 *   - API keys estilo Resend (`re_<token>`)
 *   - Cadenas `Bearer <token>` / `Basic <token>` (Authorization)
 *   - Cadenas "api_key=<value>" o "apikey=<value>"
 */
function redactSecrets(value: string): string {
  return value
    .replace(/re_[A-Za-z0-9_]{6,}/g, "re_***REDACTED***")
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9._\-+/=]{6,}/gi, "$1 ***REDACTED***")
    .replace(
      /(["']?(?:api[_-]?key|apikey|api[_-]?secret)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
      "$1***REDACTED***",
    );
}

/**
 * Redacta recursivamente un objeto antes de pasarlo al logger. Strings
 * se redactan; otros tipos pasan tal cual. Keys llamadas
 * `apiKey`/`api_key`/`authorization` se reemplazan por `***REDACTED***`.
 */
function redactFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/^api[_-]?key$|^authorization$|^auth[_-]?token$/i.test(k)) {
      out[k] = "***REDACTED***";
    } else if (typeof v === "string") {
      out[k] = redactSecrets(v);
    } else if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      // No recursar en objetos nativos del runtime (Date, Error) ni en
      // filas crudas de Supabase (mantenerlas legibles).
      Object.getPrototypeOf(v) === Object.prototype
    ) {
      out[k] = redactFields(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function defaultFormat(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>,
): string {
  const parts = [`level=${level}`, `event=${event}`];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    parts.push(`${k}=${formatValue(v)}`);
  }
  return parts.join(" ");
}

function formatValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") {
    // Comillas si contiene espacios o caracteres especiales; escapar comillas.
    if (/[\s"'\\=]/.test(v)) {
      return JSON.stringify(v);
    }
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function defaultLogger(): WorkerLogger {
  return {
    info: (event, fields) =>
      console.log(defaultFormat("info", event, redactFields(fields))),
    warn: (event, fields) =>
      console.warn(defaultFormat("warn", event, redactFields(fields))),
    error: (event, fields) =>
      console.error(defaultFormat("error", event, redactFields(fields))),
  };
}

// =====================================================================
// Options / Result
// =====================================================================

/**
 * Opciones del worker. `supabase` y `provider` son obligatorios.
 * El resto tiene defaults razonables.
 *
 * IMPORTANTE: el `supabase` cliente DEBE ser uno configurado con
 * `service_role` (NO anon, NO authenticated) — los RPCs
 * `claim_pending_notifications` y `complete_notification` requieren
 * `EXECUTE` que sólo tienen `service_role` y `postgres` (F-1 Phase 2A).
 */
export interface WorkerOptions {
  supabase: SupabaseClient;
  provider: EmailProvider;
  batchSize?: number;
  leaseSeconds?: number;
  /**
   * Audit/configuration field. Currently recorded in `worker.start` log
   * for operator visibility. **NOT enforced by the worker** — see §Timeout
   * in the file header. A future runtime integration may use this value
   * to configure an outer `Promise.race` / `AbortController` /
   * `statement_timeout`, but `runWorkerOnce` itself does not apply it.
   * The DB lease remains the recovery mechanism.
   */
  itemTimeoutMs?: number;
  /** Logger inyectable. Default: stdout key=value. */
  logger?: WorkerLogger;
  /**
   * `now` inyectable para tests deterministas. Default: `Date.now`.
   * NO se usa para lógica — sólo para `durationMs` en logs y result.
   */
  now?: () => number;
}

/**
 * Resultado del worker. Extiende `DispatcherResult` con:
 *   - `logs`: snapshot de todos los eventos emitidos (útil para tests).
 *   - `itemTimeouts`: currently always 0 because Phase 2B does not
 *     enforce per-item timeouts. The field is reserved for future
 *     runtime-level timeout integration and is retained for
 *     result/schema stability.
 */
export interface WorkerResult extends DispatcherResult {
  logs: ReadonlyArray<{
    level: "info" | "warn" | "error";
    event: string;
    fields: Record<string, unknown>;
  }>;
  itemTimeouts: number;
}

// =====================================================================
// Public API
// =====================================================================

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LEASE_SECONDS = 60;

/**
 * Ejecuta UNA iteración del worker: claim → process → complete.
 *
 * El worker NO decide cuándo re-ejecutarse — eso pertenece al
 * scheduler (pg_cron, Vercel cron, etc.). El caller decide la cadencia.
 *
 * F-7 / F-9: `runWorkerOnce` does NOT apply per-item timeouts and does
 * NOT use `Promise.race`. `itemTimeoutMs` (if provided) is recorded in
 * the `worker.start` log for audit only. The DB lease remains the
 * recovery mechanism; execution timeout belongs to the runtime layer.
 * See §Timeout in the file header.
 */
export async function runWorkerOnce(opts: WorkerOptions): Promise<WorkerResult> {
  const outerLogger = opts.logger ?? defaultLogger();
  const now = opts.now ?? Date.now;
  const start = now();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const leaseSeconds = opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const itemTimeoutMs = opts.itemTimeoutMs;

  // IMPORTANTE: capturingLogger se crea ANTES de emitir worker.start,
  // para que el evento de inicio también quede registrado en
  // `result.logs` (no sólo en stdout del default logger).
  const capture: Array<{
    level: "info" | "warn" | "error";
    event: string;
    fields: Record<string, unknown>;
  }> = [];
  const logger: WorkerLogger = {
    info: (event, fields) => {
      capture.push({ level: "info", event, fields: redactFields(fields) });
      outerLogger.info(event, fields);
    },
    warn: (event, fields) => {
      capture.push({ level: "warn", event, fields: redactFields(fields) });
      outerLogger.warn(event, fields);
    },
    error: (event, fields) => {
      capture.push({ level: "error", event, fields: redactFields(fields) });
      outerLogger.error(event, fields);
    },
  };

  logger.info("worker.start", {
    batchSize,
    leaseSeconds,
    itemTimeoutMs: itemTimeoutMs ?? null,
    provider: opts.provider.name,
  });

  // =====================================================================
  // Logging per-item (interceptor del dispatcher)
  // =====================================================================
  //
  // El dispatcher (TKT-019) ya emite `outcome.kind` ('sent' | 'failed' |
  // 'skipped'). El worker añade observabilidad emitiendo el log
  // `item.failed` para los items que terminaron en error.
  //
  // Para hacer esto sin tocar dispatcher.ts, NO interceptamos a nivel
  // de `dispatchBatch` — confiamos en el `result` agregado del
  // dispatcher y emitimos logs sintéticos a partir del `errors[]`.
  //
  // Esto preserva el contrato TKT-019 y mantiene el worker como
  // observability layer, no orchestrator.

  const dispatcherResult = await dispatchBatch({
    supabase: opts.supabase,
    provider: opts.provider,
    batchSize,
    leaseSeconds,
  });

  // Log de batch-claimed post-facto (el dispatcher no expone
  // intermediate state sin un parche).
  logger.info("worker.claimed", {
    claimed: dispatcherResult.claimed,
  });

  // Logs per-item inferidos del resultado agregado. Para no
  // duplicar lógica, sólo emitimos logs para items que terminaron
  // en `failed` (donde `errors[]` tiene detalle).
  for (const err of dispatcherResult.errors) {
    logger.warn("item.failed", {
      notificationId: err.notificationId,
      error: err.error,
    });
  }

  // =====================================================================
  // Log summary
  // =====================================================================
  const durationMs = now() - start;
  logger.info("worker.summary", {
    claimed: dispatcherResult.claimed,
    sent: dispatcherResult.sent,
    failed: dispatcherResult.failed,
    durationMs,
    provider: opts.provider.name,
    itemTimeouts: 0,
  });

  return {
    ...dispatcherResult,
    logs: capture,
    itemTimeouts: 0,
  };
}

/**
 * Helper para tests / callers que quieran un logger que sólo captura
 * sin escribir a stdout.
 */
export function captureOnlyLogger(): WorkerLogger & {
  records: Array<{
    level: "info" | "warn" | "error";
    event: string;
    fields: Record<string, unknown>;
  }>;
} {
  const records: Array<{
    level: "info" | "warn" | "error";
    event: string;
    fields: Record<string, unknown>;
  }> = [];
  return {
    records,
    info: (event, fields) => records.push({ level: "info", event, fields }),
    warn: (event, fields) => records.push({ level: "warn", event, fields }),
    error: (event, fields) => records.push({ level: "error", event, fields }),
  };
}

// Re-exports para callers que sólo quieran el worker.
export type { NotificationRow };
