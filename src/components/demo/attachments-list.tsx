"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  listAttachments,
  registerAttachment,
} from "@/modules/ticketing/client-api";
import type { ClientApiError } from "@/modules/ticketing/client-api";
import type { TicketAttachment } from "@/modules/ticketing/repository";

const MAX_SIZE = 26_214_400; // 25 MB; mismo límite que el CHECK del schema.
const NAME_MAX = 255;
const MIME_MAX = 200;

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date(value));
}

type AttachmentsPhase =
  | { kind: "loading" }
  | { kind: "error"; reason: string; kind_: ClientApiError["kind"] }
  | { kind: "ready"; attachments: TicketAttachment[] };

interface AttachmentsListProps {
  ticketId: string;
  tenantId: string;
}

export function AttachmentsList({ ticketId, tenantId }: AttachmentsListProps) {
  const [phase, setPhase] = useState<AttachmentsPhase>({ kind: "loading" });
  const [name, setName] = useState("");
  const [mime, setMime] = useState("application/octet-stream");
  const [size, setSize] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listAttachments(ticketId);
      if (cancelled) return;
      if (!result.ok) {
        setPhase({ kind: "error", reason: result.error.reason ?? "Error", kind_: result.error.kind });
        return;
      }
      setPhase({ kind: "ready", attachments: result.data.attachments });
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  function buildStoragePath(originalName: string): string {
    return `ticket-attachments/${tenantId}/${ticketId}/${originalName}`;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (name.length < 1 || name.length > NAME_MAX) {
      setSubmitError(`Nombre entre 1 y ${NAME_MAX} caracteres.`);
      return;
    }
    if (mime.length < 1 || mime.length > MIME_MAX) {
      setSubmitError(`MIME entre 1 y ${MIME_MAX} caracteres.`);
      return;
    }
    if (!Number.isInteger(size) || size <= 0 || size > MAX_SIZE) {
      setSubmitError(`Tamaño inválido (1..${MAX_SIZE} bytes).`);
      return;
    }
    setSubmitting(true);
    setSubmitError(undefined);
    const result = await registerAttachment(ticketId, {
      originalName: name,
      mimeType: mime,
      sizeBytes: size,
      storagePath: buildStoragePath(name),
    });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error.reason ?? "Error al registrar adjunto.");
      return;
    }
    setName("");
    setMime("application/octet-stream");
    setSize(0);
    setPhase((current) => (current.kind === "ready"
      ? { kind: "ready", attachments: [...current.attachments, result.data.attachment] }
      : current));
  }

  if (phase.kind === "loading") {
    return (
      <section className="demo-ticket-history-card" aria-label="Adjuntos">
        <p className="demo-section-label">Adjuntos</p>
        <p>Cargando…</p>
      </section>
    );
  }

  if (phase.kind === "error") {
    return (
      <section className="demo-ticket-history-card" aria-label="Adjuntos">
        <p className="demo-section-label">Adjuntos</p>
        <p className="demo-form-error" role="alert">No pudimos cargar los adjuntos: {phase.reason}</p>
      </section>
    );
  }

  const attachments = phase.attachments;
  return (
    <section className="demo-ticket-history-card" aria-labelledby="ticket-attachments-title">
      <div className="demo-ticket-history-heading">
        <div>
          <p className="demo-section-label">Adjuntos</p>
          <h2 id="ticket-attachments-title">Metadata de archivos</h2>
        </div>
        <span>{attachments.length} archivos</span>
      </div>

      {attachments.length ? (
        <ol className="demo-ticket-history-list">
          {attachments.map((att) => (
            <li key={att.id}>
              <span aria-hidden="true" />
              <div>
                <p>
                  <strong>{att.originalName}</strong>{" "}
                  <small>({att.mimeType}, {formatBytes(att.sizeBytes)})</small>
                </p>
                <time dateTime={att.createdAt}>
                  {formatDate(att.createdAt)} · {att.uploadedBy.slice(0, 8)}…
                  {att.storagePath ? ` · ${att.storagePath}` : ""}
                </time>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="demo-ticket-history-empty">Aún no hay adjuntos registrados.</div>
      )}

      <form className="demo-comment-form" onSubmit={handleSubmit} aria-label="Registrar metadata de adjunto">
        <p className="demo-comment-note">
          TKT-014 v1: sólo se registra metadata. La subida del binario a Storage
          se conectará en una iteración posterior.
        </p>
        <label htmlFor="att-name">Nombre del archivo</label>
        <input
          id="att-name"
          type="text"
          maxLength={NAME_MAX}
          placeholder="captura.png"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSubmitError(undefined);
          }}
          disabled={submitting}
        />
        <label htmlFor="att-mime">MIME</label>
        <input
          id="att-mime"
          type="text"
          maxLength={MIME_MAX}
          placeholder="image/png"
          value={mime}
          onChange={(event) => setMime(event.target.value)}
          disabled={submitting}
        />
        <label htmlFor="att-size">Tamaño (bytes)</label>
        <input
          id="att-size"
          type="number"
          min={1}
          max={MAX_SIZE}
          step={1}
          value={size || ""}
          onChange={(event) => setSize(Number.parseInt(event.target.value, 10) || 0)}
          disabled={submitting}
        />
        {submitError ? <p className="demo-form-error" role="alert">{submitError}</p> : null}
        <div className="demo-request-actions">
          <button
            type="submit"
            className="demo-secondary-button"
            disabled={submitting || name.length === 0 || size === 0}
          >
            {submitting ? "Registrando…" : "Registrar metadata"}
          </button>
        </div>
      </form>
    </section>
  );
}
