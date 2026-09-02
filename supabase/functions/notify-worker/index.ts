/**
 * TKT-026 — Phase 2D — Supabase Edge Function: notify-worker.
 *
 * Esta función es el entrypoint ejecutable server-side que orquesta
 * Phase 2B. La función NO duplica la lógica de claim/dispatch/complete
 * — esa responsabilidad es de `runWorkerOnce` (worker) →
 * `dispatchBatch` (dispatcher) → `claim/complete` (DB RPC).
 *
 * Responsabilidades de la Edge Function:
 *   1. Recibir un HTTP request (POST para trigger manual; cron-invoked
 *      en producción vía pg_cron en Phase 2D).
 *   2. Validar método HTTP.
 *   3. **Validar `Authorization: Bearer <CRON_SECRET>`** (Phase 2D,
 *      requerido porque `verify_jwt = false` en config.toml).
 *   4. Obtener secrets del runtime (Deno.env.get).
 *   5. Crear un SupabaseClient con service_role.
 *   6. Crear el ResendProvider con la API key de runtime.
 *   7. Ejecutar runWorkerOnce.
 *   8. Devolver el resultado estructurado (NO secrets).
 *   9. Capturar errores y devolverlos sin filtrar.
 *
 * Arquitectura (de la capa externa a la interna):
 *
 *   HTTP request
 *     -> Deno.serve handler (este archivo)
 *       -> CRON_SECRET validation (Phase 2D)    [constant-time, logs NOTHING]
 *       -> runWorkerOnce (Phase 2B)            [src/modules/notifications/worker.ts]
 *         -> dispatchBatch (TKT-019)            [src/modules/notifications/dispatcher.ts]
 *           -> claim_pending_notifications RPC   [DB]
 *           -> ResendProvider.send               [src/modules/notifications/providers/resend-provider.ts]
 *           -> complete_notification RPC        [DB]
 *
 * Secrets (obtenidos vía Deno.env.get, NUNCA hardcoded):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - RESEND_API_KEY
 *   - RESEND_FROM_EMAIL
 *   - CRON_SECRET (Phase 2D — used for Authorization Bearer check)
 *
 * Permisos Deno necesarios para la función:
 *   --allow-net=<api-url>,<resend-api>   (Supabase API + Resend API)
 *   --allow-env                          (Deno.env.get)
 *   --allow-read=<project-source>        (imports de src/ relativos)
 *
 * Phase 2D auth model:
 *   - `verify_jwt = false` en supabase/config.toml: pg_cron no puede
 *     mintear JWTs, así que la verificación del gateway está deshabilitada.
 *   - Esta función valida explícitamente `Authorization: Bearer <CRON_SECRET>`
 *     con comparación de tiempo constante. Devuelve 401 en todos los
 *     casos de fallo (header ausente, esquema incorrecto, secreto ausente,
 *     secreto incorrecto). Nunca registra el secreto recibido ni el
 *     secreto esperado.
 *   - El secreto vive en el GUC Postgres `app.outbox_cron_secret` y en
 *     `Deno.env.get("CRON_SECRET")` del runtime del Edge Function. La
 *     source-of-truth de rotación es el GUC.
 */

// ESM imports — Deno nativo TypeScript.
// The version specifier is in deno.json's import map. Using bare
// `npm:@supabase/supabase-js` lets Deno resolve to the version pinned
// there, avoiding version drift from package.json.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js";
import { ResendProvider } from "../../../src/modules/notifications/providers/resend-provider.ts";
import { runWorkerOnce } from "../../../src/modules/notifications/worker.ts";

// =====================================================================
// Types
// =====================================================================

interface RequestBody {
  batchSize?: number;
  leaseSeconds?: number;
  itemTimeoutMs?: number;
}

// =====================================================================
// Secrets resolution
// =====================================================================

/**
 * Lee secrets del runtime. La función NO tiene defaults hardcoded para
 * secrets reales. Si falta alguno, devuelve 500 con detalle del secret
 * faltante (sin filtrar valores).
 *
 * Phase 2D: CRON_SECRET NO se valida aquí — se valida explícitamente
 * en `validateCronAuth` (antes de esta función, en `handleNotify`).
 * Si la validación del CRON_SECRET falla, no se llega a invocar
 * `loadRuntimeConfig`, así que la auth y el resto de secrets quedan
 * desacoplados.
 */
function loadRuntimeConfig() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL");

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!resendApiKey) missing.push("RESEND_API_KEY");
  if (!resendFrom) missing.push("RESEND_FROM_EMAIL");

  if (missing.length > 0) {
    return {
      ok: false as const,
      error: {
        kind: "config",
        message: `Missing required env vars: ${missing.join(", ")}`,
        missing,
      },
    };
  }

  return {
    ok: true as const,
    config: {
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      resendApiKey: resendApiKey!,
      resendFrom: resendFrom!,
    },
  };
}

// =====================================================================
// Logger minimal (no deps, sin leaks)
// =====================================================================

function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  // Redacción defensiva de campos sensibles conocidos.
  // Phase 2D: incluye `cron_secret` para que cualquier log que inadvertidamente
  // contenga el secreto sea redactado. Defense in depth — la función
  // `validateCronAuth` jamás loggea el secreto, pero la regex cubre el
  // caso de un futuro caller que pase un campo así.
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/^api[_-]?key$|^authorization$|^auth[_-]?token$|^cron[_-]?secret$/i.test(k)) {
      safe[k] = "***REDACTED***";
    } else {
      safe[k] = v;
    }
  }
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// =====================================================================
// Phase 2D — CRON_SECRET validation (Authorization: Bearer)
// =====================================================================

/**
 * Comparación de tiempo constante entre dos strings. Devuelve `true` sólo
 * si ambos tienen la misma longitud y todos los caracteres son iguales.
 *
 * Implementación clásica: XOR acumulado sobre `charCodeAt`. El resultado
 * se acumula antes de comparar contra cero, así el tiempo de ejecución
 * no depende de cuántos bytes difieran.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Valida que el header `Authorization: Bearer <CRON_SECRET>` de la request
 * coincida con el secreto configurado en `Deno.env.get("CRON_SECRET")`.
 *
 * Comportamiento (Phase 2D, decision D5):
 *   - secret ausente en runtime          → 401 (config error, no work)
 *   - header ausente                     → 401
 *   - esquema distinto de `Bearer`       → 401
 *   - secreto ausente en el header       → 401
 *   - secreto no coincide                → 401
 *   - secreto coincide                   → null (continuar)
 *
 * Esta función NO registra el secreto recibido, NI el esperado, NI la
 * razón específica del 401. Los mensajes de log son uniformes para
 * evitar oracle attacks.
 */
function validateCronAuth(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    log("error", "function.cron_secret_missing");
    return jsonResponse(401, {
      ok: false,
      error: {
        kind: "auth",
        message: "CRON_SECRET is not configured on the function runtime.",
      },
    });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    log("warn", "function.auth_failed", { reason: "missing_header" });
    return jsonResponse(401, {
      ok: false,
      error: { kind: "auth", message: "Invalid CRON_SECRET" },
    });
  }

  // Esquema estricto: "Bearer <token>" (case-insensitive para el esquema).
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    log("warn", "function.auth_failed", { reason: "bad_scheme" });
    return jsonResponse(401, {
      ok: false,
      error: { kind: "auth", message: "Invalid CRON_SECRET" },
    });
  }

  const received = match[1].trim();
  if (received.length === 0) {
    log("warn", "function.auth_failed", { reason: "empty_secret" });
    return jsonResponse(401, {
      ok: false,
      error: { kind: "auth", message: "Invalid CRON_SECRET" },
    });
  }

  if (!timingSafeEqual(received, expected)) {
    log("warn", "function.auth_failed", { reason: "mismatch" });
    return jsonResponse(401, {
      ok: false,
      error: { kind: "auth", message: "Invalid CRON_SECRET" },
    });
  }

  return null; // auth OK — continuar.
}

// =====================================================================
// Request handlers
// =====================================================================

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handleNotify(req: Request): Promise<Response> {
  // 1) Method validation.
  // Only POST is allowed. GET is intentionally not supported to keep the
  // endpoint surface minimal for scheduler / cron invocation. Any other
  // method (including GET, PUT, PATCH, DELETE) returns 405.
  if (req.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: {
        kind: "method",
        message: `Method ${req.method} not allowed; expected POST.`,
      },
    });
  }

  // 2) Phase 2D — CRON_SECRET auth check (Authorization: Bearer).
  // MUST run BEFORE body parse and config load so unauth requests do
  // not consume cycles, and so the work is gated before any DB /
  // provider / external call.
  const authResp = validateCronAuth(req);
  if (authResp !== null) return authResp;

  // 3) Body parsing (best-effort; required for POST).
  let body: RequestBody = {};
  try {
    const text = await req.text();
    if (text.length > 0) {
      const parsed = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null) {
        body = parsed as RequestBody;
      }
    }
  } catch (err) {
    return jsonResponse(400, {
      ok: false,
      error: {
        kind: "body",
        message: `Invalid JSON body: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
  }

  // 4) Secrets.
  const cfg = loadRuntimeConfig();
  if (!cfg.ok) {
    log("error", "function.config_missing", { missing: cfg.error.missing });
    return jsonResponse(500, {
      ok: false,
      error: cfg.error,
    });
  }

  // 5) Supabase client (service_role).
  let supabase: SupabaseClient;
  try {
    supabase = createClient(cfg.config.supabaseUrl, cfg.config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (err) {
    log("error", "function.supabase_init_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(500, {
      ok: false,
      error: { kind: "supabase_init", message: "Failed to create Supabase client" },
    });
  }

  // 6) ResendProvider.
  const provider = new ResendProvider({
    apiKey: cfg.config.resendApiKey,
    from: cfg.config.resendFrom,
  });

  // 7) Run worker.
  log("info", "function.run_start", {
    batchSize: body.batchSize,
    leaseSeconds: body.leaseSeconds,
  });
  const t0 = Date.now();
  let result;
  try {
    result = await runWorkerOnce({
      supabase,
      provider,
      batchSize: body.batchSize,
      leaseSeconds: body.leaseSeconds,
      itemTimeoutMs: body.itemTimeoutMs,
    });
  } catch (err) {
    log("error", "function.worker_threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(500, {
      ok: false,
      error: {
        kind: "worker_exception",
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
  const durationMs = Date.now() - t0;

  // 8) Return structured result.
  log("info", "function.run_end", {
    claimed: result.claimed,
    sent: result.sent,
    failed: result.failed,
    durationMs,
  });
  return jsonResponse(200, {
    ok: true,
    result: {
      claimed: result.claimed,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
      itemTimeouts: result.itemTimeouts,
      durationMs,
    },
  });
}

// =====================================================================
// Deno.serve entrypoint
// =====================================================================

Deno.serve({ port: Number(Deno.env.get("PORT") ?? "8080") }, (req) => handleNotify(req));
