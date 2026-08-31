/**
 * DeskWork Ticketing Core / TKT-014.
 * POST /api/tickets/[id]/attachments
 *
 * Registra metadata de un adjunto. El binario en sí debe subirse
 * out-of-band (signed URL a Supabase Storage); este endpoint sólo
 * persiste la metadata.
 *
 * Flujo asumido (v1):
 *   1) El cliente pide signed URL al backend (out of scope de v1).
 *   2) El cliente sube el binario a Storage.
 *   3) El cliente llama este endpoint con la metadata.
 *   4) SECURITY DEFINER register_ticket_attachment valida y registra.
 *
 * Reglas de autorización: mismas que create_ticket_comment
 * (can_attach_ticket = ticket.attachment.create + can_read_ticket).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { resolveActor } from "@/modules/ticketing/actor";
import {
  applyRegisterAttachment,
  createSupabaseTicketRepository,
} from "@/modules/ticketing/supabase-repository";
import { expectedStoragePath } from "@/modules/ticketing/attachments";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface AttachmentRequestBody {
  originalName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  storagePath?: unknown;
  sha256?: unknown;
}

const SHA256_RE = /^[0-9a-f]{64}$/i;
const MAX_SIZE = 26_214_400;

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

  let body: AttachmentRequestBody;
  try {
    body = (await request.json()) as AttachmentRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.originalName !== "string") {
    return NextResponse.json({ error: "invalid_original_name" }, { status: 400 });
  }
  if (typeof body.mimeType !== "string") {
    return NextResponse.json({ error: "invalid_mime_type" }, { status: 400 });
  }
  if (
    typeof body.sizeBytes !== "number" ||
    !Number.isInteger(body.sizeBytes) ||
    body.sizeBytes <= 0 ||
    body.sizeBytes > MAX_SIZE
  ) {
    return NextResponse.json(
      { error: "invalid_size_bytes", max: MAX_SIZE },
      { status: 400 },
    );
  }
  if (typeof body.storagePath !== "string" || body.storagePath.length === 0) {
    return NextResponse.json({ error: "invalid_storage_path" }, { status: 400 });
  }
  if (
    body.sha256 !== undefined &&
    body.sha256 !== null &&
    (typeof body.sha256 !== "string" || !SHA256_RE.test(body.sha256))
  ) {
    return NextResponse.json({ error: "invalid_sha256" }, { status: 400 });
  }

  const repo = createSupabaseTicketRepository(supabase);
  const ticket = await repo.getTicket(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  // Defense in depth: verificar que el storage_path esperado coincide
  // con el recibido. La DB también valida, pero acá cortamos antes.
  const expected = expectedStoragePath(ticket.tenantId, ticket.id, body.originalName);
  if (body.storagePath !== expected) {
    return NextResponse.json(
      {
        error: "storage_path_mismatch",
        expected,
        received: body.storagePath,
      },
      { status: 400 },
    );
  }

  // resolveActor para contexto (defense in depth); la autorización real
  // la hace la SECURITY DEFINER.
  const actorResolution = await resolveActor(supabase, ticket.tenantId, user.id);
  if (!actorResolution.ok) {
    const status = actorResolution.reason === "not_authenticated" ? 401 : 403;
    return NextResponse.json({ error: actorResolution.reason }, { status });
  }

  const result = await applyRegisterAttachment(supabase, {
    ticketId,
    originalName: body.originalName,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
    storagePath: body.storagePath,
    sha256: (body.sha256 as string | null | undefined) ?? null,
  });

  if (!result.ok) {
    const err = result.error;
    const statusByKind: Record<typeof err.kind, number> = {
      validation: 400,
      not_found: 404,
      forbidden: 403,
      db_error: 500,
    };
    return NextResponse.json(
      { error: err.kind, reason: "reason" in err ? err.reason : null },
      { status: statusByKind[err.kind] ?? 500 },
    );
  }

  return NextResponse.json(
    { attachment: result.attachment, by: user.id },
    { status: 201 },
  );
}

/**
 * GET /api/tickets/[id]/attachments
 * Lista la metadata de los adjuntos visibles para el actor.
 * La RLS ya filtra segun can_read_ticket; si el actor no puede ver
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
