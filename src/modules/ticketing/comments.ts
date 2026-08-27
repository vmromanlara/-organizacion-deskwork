/**
 * DeskWork Ticketing Core / Fase Block 1.
 * TKT-005 — Helpers para comentarios.
 * La ventana de edición de 5 minutos se valida en API, no en DB.
 */

import type { TicketComment } from "./repository";

const BODY_MIN = 1;
const BODY_MAX = 10000;
const EDIT_WINDOW_MS = 5 * 60 * 1000;

export interface CommentInput {
  tenantId: string;
  ticketId: string;
  authorId: string;
  body: string;
  isInternal?: boolean;
}

export type CommentValidation =
  | { ok: true; input: Required<CommentInput> }
  | { ok: false; reason: string };

export function validateCommentInput(input: CommentInput): CommentValidation {
  if (input.body.length < BODY_MIN || input.body.length > BODY_MAX) {
    return {
      ok: false,
      reason: `El cuerpo del comentario debe tener entre ${BODY_MIN} y ${BODY_MAX} caracteres.`,
    };
  }
  return {
    ok: true,
    input: {
      tenantId: input.tenantId,
      ticketId: input.ticketId,
      authorId: input.authorId,
      body: input.body,
      isInternal: input.isInternal ?? false,
    },
  };
}

export function canEditComment(
  comment: Pick<TicketComment, "authorId" | "createdAt">,
  actorId: string,
  now: Date = new Date(),
): boolean {
  if (comment.authorId !== actorId) return false;
  const created = new Date(comment.createdAt).getTime();
  return now.getTime() - created <= EDIT_WINDOW_MS;
}
