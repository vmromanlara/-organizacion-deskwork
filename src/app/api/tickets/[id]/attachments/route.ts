/**
 * DeskWork Ticketing Core / TKT-014 v2.
 *
 * POST /api/tickets/[id]/attachments
 *   Sube el binario a Supabase Storage y registra la metadata atómicamente.
 *   Body: multipart/form-data con:
 *     - file:        Blob (binario)
 *     - originalName: string (opcional; cae a file.name)
 *     - mimeType:    string (opcional; cae a file.type)
 *     - sha256:      string hex de 64 chars (opcional)
 *
 *   Flujo (defense in depth):
 *     1) App: sesión + ticket + actor.
 *     2) Server-side: upload binario via service_role (admin client) al
 *        bucket privado `ticket-attachments/{tenant_id}/{ticket_id}/{name}`.
 *     3) Server-side: register_ticket_attachment SECURITY DEFINER para
 *        persistir la metadata + emitir evento + audit.
 *     4) Si (3) falla, cleanup del objeto subido en (2) para evitar
 *        huérfanos en Storage.
 *
 * GET /api/tickets/[id]/attachments
 *   Lista metadata de adjuntos visibles (mismo que TKT-014 v1).
 *
 * El endpoint original (TKT-014 v1) que recibía JSON con storagePath
 * pre-subido por el cliente se mantiene detrás de `?v=metadata` como
 * legacy path para no romper integraciones existentes.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { resolveActor } from "@/modules/ticketing/actor";
import {
  createSupabaseTicketRepository,
  uploadAttachmentBlob,
} from "@/modules/ticketing/supabase-repository";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_SIZE = 26_214_400; // 25 MB
const SHA256_RE = /^[0-9a-f]{64}$/i;

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: ticketId } = await context.params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      {
        error: "expected_multipart",
        hint: "TKT-014 v2: enviar multipart/form-data con campo 'file'.",
      },
      { status: 415 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "invalid_multipart", reason },
      { status: 400 },
    );
  }

  const fileEntry = form.get("file");
  // `form.get` puede devolver string | File | null. Necesitamos un Blob/File.
  if (typeof fileEntry === "string" || fileEntry == null) {
    return NextResponse.json(
      { error: "missing_file", hint: "campo 'file' requerido (binary blob)." },
      { status: 400 },
    );
  }
  // Después de descartar string/null, lo que queda es File. Construimos
  // un File normalizado para tener `name`/`type`/`size` consistentes.
  const file: File =
    fileEntry instanceof File
      ? fileEntry
      : new File(
          [fileEntry as BlobPart],
          "upload.bin",
          {
            type:
              (fileEntry as Blob).type && (fileEntry as Blob).type.length > 0
                ? (fileEntry as Blob).type
                : "application/octet-stream",
          },
        );

  const originalName = typeof form.get("originalName") === "string" && (form.get("originalName") as string).length > 0
    ? (form.get("originalName") as string)
    : (file.name || "upload.bin");
  const mimeType = typeof form.get("mimeType") === "string" && (form.get("mimeType") as string).length > 0
    ? (form.get("mimeType") as string)
    : (file.type || "application/octet-stream");
  const sha256Raw = form.get("sha256");
  const sha256 = typeof sha256Raw === "string" && sha256Raw.length > 0 ? sha256Raw : null;

  // Validaciones de payload.
  if (originalName.length < 1 || originalName.length > 255) {
    return NextResponse.json(
      { error: "invalid_original_name" },
      { status: 400 },
    );
  }
  if (mimeType.length < 1 || mimeType.length > 200) {
    return NextResponse.json(
      { error: "invalid_mime_type" },
      { status: 400 },
    );
  }
  if (file.size <= 0) {
    return NextResponse.json(
      { error: "empty_file" },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "file_too_large", max: MAX_SIZE, received: file.size },
      { status: 413 },
    );
  }
  if (sha256 !== null && !SHA256_RE.test(sha256)) {
    return NextResponse.json(
      { error: "invalid_sha256" },
      { status: 400 },
    );
  }

  // Validar ticket antes del upload (para conocer tenant).
  const repo = createSupabaseTicketRepository(supabase);
  const ticket = await repo.getTicket(ticketId);
  if (!ticket) {
    return NextResponse.json(
      { error: "ticket_not_found" },
      { status: 404 },
    );
  }

  // resolveActor para contexto (defense in depth); la autorización real
  // la hace la SECURITY DEFINER `register_ticket_attachment`.
  const actorResolution = await resolveActor(supabase, ticket.tenantId, user.id);
  if (!actorResolution.ok) {
    const status = actorResolution.reason === "not_authenticated" ? 401 : 403;
    return NextResponse.json({ error: actorResolution.reason }, { status });
  }

  // Leer el binario a memoria.
  const arrayBuffer = await file.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);

  // Subir + registrar (con cleanup si la metadata falla).
  const result = await uploadAttachmentBlob(supabase, {
    ticketId,
    uploadedBy: user.id,
    originalName,
    mimeType,
    body,
    sha256,
  });

  if (!result.ok) {
    const err = result.error;
    const statusByKind: Record<typeof err.kind, number> = {
      validation: 400,
      not_found: 404,
      forbidden: 403,
      storage_error: 502,
      storage_disabled: 503,
      db_error: 500,
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
      attachment: result.data.attachment,
      by: user.id,
      storage: {
        bucket: result.data.bucket,
        path: result.data.storagePath,
      },
    },
    { status: 201 },
  );
}

/**
 * GET /api/tickets/[id]/attachments
 * Lista la metadata de los adjuntos visibles para el actor.
 * La RLS ya filtra según can_read_ticket; si el actor no puede ver
 * el ticket -> 404.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: ticketId } = await context.params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );
  }

  const repo = createSupabaseTicketRepository(supabase);
  const ticket = await repo.getTicket(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  let attachments;
  try {
    attachments = await repo.listAttachmentsByTicket(ticket.id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "db_error", reason },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { attachments, meta: { total: attachments.length } },
    { status: 200 },
  );
}
