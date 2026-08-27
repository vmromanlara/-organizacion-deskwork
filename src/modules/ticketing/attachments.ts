/**
 * DeskWork Ticketing Core / Fase Block 1.
 * TKT-005 — Helpers para adjuntos.
 *
 * storage_path y sha256 quedan NULL hasta TKT-014 (Storage real).
 * Esta capa sólo valida inputs; no realiza I/O.
 */

import type { TicketAttachment } from "./repository";

export interface AttachmentMetadataInput {
  tenantId: string;
  ticketId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export type AttachmentValidation =
  | { ok: true; metadata: AttachmentMetadataInput }
  | { ok: false; reason: string };

const MAX_SIZE_BYTES = 26_214_400; // 25 MB; mismo límite que el CHECK del schema.
const NAME_MIN = 1;
const NAME_MAX = 255;

export function validateAttachmentMetadata(
  input: AttachmentMetadataInput,
): AttachmentValidation {
  if (input.originalName.length < NAME_MIN || input.originalName.length > NAME_MAX) {
    return {
      ok: false,
      reason: `original_name debe tener entre ${NAME_MIN} y ${NAME_MAX} caracteres.`,
    };
  }
  if (input.mimeType.length < 1 || input.mimeType.length > 200) {
    return { ok: false, reason: "mime_type fuera de rango." };
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_SIZE_BYTES) {
    return { ok: false, reason: `size_bytes debe estar en (0, ${MAX_SIZE_BYTES}].` };
  }
  return { ok: true, metadata: input };
}

/**
 * Construye el path esperado en Supabase Storage (TKT-014) sin tocar I/O.
 * El path sigue la convención `ticket-attachments/{tenant_id}/{ticket_id}/{filename}`.
 */
export function expectedStoragePath(
  tenantId: string,
  ticketId: string,
  originalName: string,
): string {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `ticket-attachments/${tenantId}/${ticketId}/${safeName}`;
}

export function isAttachmentMetadataComplete(
  attachment: Pick<TicketAttachment, "storagePath" | "sha256">,
): boolean {
  return attachment.storagePath !== null && attachment.sha256 !== null;
}
