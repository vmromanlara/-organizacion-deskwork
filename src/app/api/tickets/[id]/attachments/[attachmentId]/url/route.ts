/**
 * DeskWork Ticketing Core / TKT-014 v2.
 *
 * GET /api/tickets/[id]/attachments/[attachmentId]/url
 *   Genera una signed URL temporal para descargar/visualizar un adjunto.
 *
 *   Reglas:
 *     - Autenticación requerida.
 *     - El actor debe ser miembro activo del tenant del attachment.
 *     - El attachment debe pertenecer al ticket indicado.
 *     - El attachment debe tener storage_path (no metadata-only legacy).
 *     - Expiración: 60..3600 segundos; default 300.
 *     - La URL NO se persiste en la DB (es de un solo uso temporal).
 *
 *   Flujo (defense in depth):
 *     1) App: sesión + tenant + ticket + attachment.
 *     2) App: validación de parámetros + membership.
 *     3) Server-side: createSignedUrl via service_role (admin client).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { createAttachmentSignedUrl } from "@/modules/ticketing/supabase-repository";

interface RouteContext {
  params: Promise<{ id: string; attachmentId: string }>;
}

const MIN_EXPIRES = 60;
const MAX_EXPIRES = 3600;
const DEFAULT_EXPIRES = 300;

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: ticketId, attachmentId } = await context.params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  // expiresInSeconds es opcional; validar rango si viene.
  const url = new URL(request.url);
  const expiresRaw = url.searchParams.get("expiresInSeconds");
  let expiresInSeconds: number | undefined;
  if (expiresRaw !== null) {
    const parsed = Number.parseInt(expiresRaw, 10);
    if (
      !Number.isInteger(parsed) ||
      parsed < MIN_EXPIRES ||
      parsed > MAX_EXPIRES
    ) {
      return NextResponse.json(
        {
          error: "invalid_expires",
          min: MIN_EXPIRES,
          max: MAX_EXPIRES,
          default: DEFAULT_EXPIRES,
        },
        { status: 400 },
      );
    }
    expiresInSeconds = parsed;
  }

  const result = await createAttachmentSignedUrl(supabase, {
    ticketId,
    attachmentId,
    expiresInSeconds,
  });

  if (!result.ok) {
    const err = result.error;
    const statusByKind: Record<typeof err.kind, number> = {
      validation: 400,
      forbidden: 403,
      not_found: 404,
      storage_error: 502,
      storage_disabled: 503,
    };
    return NextResponse.json(
      {
        error: err.kind,
        reason: "reason" in err ? err.reason : null,
      },
      { status: statusByKind[err.kind] ?? 500 },
    );
  }

  return NextResponse.json(
    {
      url: result.data.url,
      expiresAt: result.data.expiresAt,
      expiresInSeconds: result.data.expiresInSeconds,
    },
    { status: 200 },
  );
}
