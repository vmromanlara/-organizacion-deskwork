/**
 * TKT-026 — Phase 2C.2 — Supabase Edge Function: notify-worker.
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
 *   3. Obtener secrets del runtime (Deno.env.get).
 *   4. Crear un SupabaseClient con service_role.
 *   5. Crear el ResendProvider con la API key de runtime.
 *   6. Ejecutar runWorkerOnce.
 *   7. Devolver el resultado estructurado (NO secrets).
 *   8. Capturar errores y devolverlos sin filtrar.
 *
 * Arquitectura (de la capa externa a la interna):
 *
 *   HTTP request
 *     -> Deno.serve handler (este archivo)
 *       -> runWorkerOnce (Phase 2B)            [src/modules/notifications/worker.ts]
 *         -> dispatchBatch (TKT-019)            [src/modules/notifications/dispatcher.ts]
 *           -> claim_pending_notifications RPC   [DB]
 *           -> ResendProvider.send               [src/modules/notifications/providers/resend-provider.ts]
 *           -> complete_notification RPC        [DB]
 *
 * NO-VALIDADO todavía en este commit (Phase 2C.2 task = validación):
 *   - supabase functions serve notify-worker (instrucción del PO).
 *   - curl POST al endpoint local.
 *   - service_role RPC contra la DB local.
 *
 * Secrets (obtenidos vía Deno.env.get, NUNCA hardcoded):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - RESEND_API_KEY
 *   - RESEND_FROM_EMAIL
 *
 * Permisos Deno necesarios para la función:
 *   --allow-net=<api-url>,<resend-api>   (Supabase API + Resend API)
 *   --allow-env                          (Deno.env.get)
 *   --allow-read=<project-source>        (imports de src/ relativos)
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
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/^api[_-]?key$|^authorization$|^auth[_-]?token$/i.test(k)) {
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

  // 2) Body parsing (best-effort; required for POST).
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

  // 3) Secrets.
  const cfg = loadRuntimeConfig();
  if (!cfg.ok) {
    log("error", "function.config_missing", { missing: cfg.error.missing });
    return jsonResponse(500, {
      ok: false,
      error: cfg.error,
    });
  }

  // 4) Supabase client (service_role).
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

  // 5) ResendProvider.
  const provider = new ResendProvider({
    apiKey: cfg.config.resendApiKey,
    from: cfg.config.resendFrom,
  });

  // 6) Run worker.
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

  // 7) Return structured result.
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
