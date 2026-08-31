/**
 * DeskWork Ticketing Core / TKT-014 v2.
 * Admin client de Supabase (service_role).
 *
 * SOLO server-side. NUNCA importar este modulo en componentes "use client".
 * Se usa para operaciones de Storage que requieren bypass de RLS:
 * upload a un bucket privado, signed URL generation, cleanup de
 * huerfanos. Toda operacion aqui pasa primero por la API server-side
 * que ya valido actor + tenant + path.
 *
 * Si SUPABASE_SERVICE_ROLE_KEY no esta configurada, getSupabaseAdminClient
 * retorna null. La API debe manejar ese caso (Storage deshabilitado).
 */

import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/shared/config/env";

let cached: ReturnType<typeof createClient> | null | undefined;

export function getSupabaseAdminClient(): ReturnType<typeof createClient> | null {
  if (cached !== undefined) return cached;
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    cached = null;
    return cached;
  }
  cached = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  return cached;
}
