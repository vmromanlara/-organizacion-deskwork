"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createComment, listComments } from "@/modules/ticketing/client-api";
import type { ClientApiError } from "@/modules/ticketing/client-api";
import type { TicketComment } from "@/modules/ticketing/repository";

const BODY_MAX = 10000;
const BODY_MIN = 1;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date(value));
}

type CommentsPhase =
  | { kind: "loading" }
  | { kind: "error"; reason: string; kind_: ClientApiError["kind"] }
  | { kind: "ready"; comments: TicketComment[] };

interface CommentsThreadProps {
  ticketId: string;
  /** Si true, muestra el toggle para comentarios internos (solo roles técnicos). */
  allowInternal?: boolean;
}

export function CommentsThread({ ticketId, allowInternal = false }: CommentsThreadProps) {
  const [phase, setPhase] = useState<CommentsPhase>({ kind: "loading" });
  const [draft, setDraft] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listComments(ticketId);
      if (cancelled) return;
      if (!result.ok) {
        setPhase({ kind: "error", reason: result.error.reason ?? "Error", kind_: result.error.kind });
        return;
      }
      setPhase({ kind: "ready", comments: result.data.comments });
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const body = draft.trim();
    if (body.length < BODY_MIN || body.length > BODY_MAX) {
      setSubmitError(`El comentario debe tener entre ${BODY_MIN} y ${BODY_MAX} caracteres.`);
      return;
    }
    setSubmitting(true);
    setSubmitError(undefined);
    const result = await createComment(ticketId, {
      body,
      isInternal: allowInternal ? isInternal : false,
    });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error.reason ?? "Error al enviar el comentario.");
      return;
    }
    setDraft("");
    setIsInternal(false);
    setPhase((current) => (current.kind === "ready"
      ? { kind: "ready", comments: [...current.comments, result.data.comment] }
      : current));
  }

  if (phase.kind === "loading") {
    return (
      <section className="demo-ticket-history-card" aria-label="Comentarios">
        <p className="demo-section-label">Comentarios</p>
        <p>Cargando…</p>
      </section>
    );
  }

  if (phase.kind === "error") {
    if (phase.kind_ === "forbidden") {
      return (
        <section className="demo-ticket-history-card" aria-label="Comentarios">
          <p className="demo-section-label">Comentarios</p>
          <p className="demo-form-error" role="alert">No autorizado: {phase.reason}</p>
        </section>
      );
    }
    return (
      <section className="demo-ticket-history-card" aria-label="Comentarios">
        <p className="demo-section-label">Comentarios</p>
        <p className="demo-form-error" role="alert">No pudimos cargar los comentarios: {phase.reason}</p>
      </section>
    );
  }

  const comments = phase.comments;
  return (
    <section className="demo-ticket-history-card" aria-labelledby="ticket-comments-title">
      <div className="demo-ticket-history-heading">
        <div>
          <p className="demo-section-label">Comentarios</p>
          <h2 id="ticket-comments-title">Conversación</h2>
        </div>
        <span>{comments.length} mensajes</span>
      </div>

      {comments.length ? (
        <ol className="demo-ticket-history-list">
          {comments.map((comment) => (
            <li key={comment.id} className={comment.isInternal ? "demo-ticket-history-item-internal" : undefined}>
              <span aria-hidden="true" />
              <div>
                <p>{comment.body}</p>
                <time dateTime={comment.createdAt}>
                  {formatDate(comment.createdAt)} · {comment.authorId.slice(0, 8)}…
                  {comment.isInternal ? " · nota interna" : ""}
                </time>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="demo-ticket-history-empty">Aún no hay comentarios en este ticket.</div>
      )}

      <form className="demo-comment-form" onSubmit={handleSubmit} aria-label="Agregar comentario">
        <label htmlFor="comment-body">Agregar comentario</label>
        <textarea
          id="comment-body"
          maxLength={BODY_MAX}
          placeholder="Escribe aquí tu comentario o solicitud de cambio de estado."
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setSubmitError(undefined);
          }}
          disabled={submitting}
        />
        <p className="demo-comment-counter">{draft.length}/{BODY_MAX} caracteres</p>
        {allowInternal ? (
          <label className="demo-comment-internal-toggle">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(event) => setIsInternal(event.target.checked)}
              disabled={submitting}
            />
            <span>Nota interna (sólo equipo técnico)</span>
          </label>
        ) : null}
        {submitError ? <p className="demo-form-error" role="alert">{submitError}</p> : null}
        <div className="demo-request-actions">
          <button
            type="submit"
            className="demo-primary-button"
            disabled={submitting || draft.trim().length === 0}
          >
            {submitting ? "Enviando…" : "Enviar comentario"}
          </button>
        </div>
      </form>
    </section>
  );
}
