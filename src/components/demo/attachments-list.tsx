"use client";

import { useEffect, useRef, useState } from "react";
import {
  getAttachmentUrl,
  listAttachments,
  uploadAttachment,
} from "@/modules/ticketing/client-api";
import type { TicketAttachment } from "@/modules/ticketing/repository";

const MAX_SIZE = 26_214_400; // 25 MB; mismo límite que el CHECK del schema.
const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp|svg\+xml)|application\/pdf|text\/plain)$/i;

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

type AttachmentsPhase =
  | { kind: "loading" }
  | { kind: "error"; reason: string }
  | { kind: "ready"; attachments: TicketAttachment[] };

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string }
  | { kind: "error"; reason: string };

interface AttachmentsListProps {
  ticketId: string;
  tenantId: string;
}

export function AttachmentsList({ ticketId, tenantId }: AttachmentsListProps) {
  const [phase, setPhase] = useState<AttachmentsPhase>({ kind: "loading" });
  const [upload, setUpload] = useState<UploadState>({ kind: "idle" });
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listAttachments(ticketId);
      if (cancelled) return;
      if (!result.ok) {
        setPhase({
          kind: "error",
          reason: result.error.reason ?? "Error al cargar adjuntos.",
        });
        return;
      }
      setPhase({ kind: "ready", attachments: result.data.attachments });
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size <= 0) {
      setUpload({ kind: "error", reason: "El archivo está vacío." });
      event.target.value = "";
      return;
    }
    if (file.size > MAX_SIZE) {
      setUpload({
        kind: "error",
        reason: `Archivo demasiado grande (${formatBytes(file.size)} > 25 MB).`,
      });
      event.target.value = "";
      return;
    }
    if (file.type && !ALLOWED_MIME.test(file.type)) {
      setUpload({
        kind: "error",
        reason: `Tipo no permitido: ${file.type}. Permitidos: imagen, PDF, texto.`,
      });
      event.target.value = "";
      return;
    }

    setUpload({ kind: "uploading", fileName: file.name });
    const result = await uploadAttachment(ticketId, file);
    if (result.ok) {
      setUpload({ kind: "idle" });
      setPhase((current) =>
        current.kind === "ready"
          ? {
              kind: "ready",
              attachments: [...current.attachments, result.data.attachment],
            }
          : current,
      );
    } else {
      setUpload({
        kind: "error",
        reason: result.error.reason ?? "Error al subir el archivo.",
      });
    }
    // Reset input para permitir re-subir el mismo archivo después.
    event.target.value = "";
  }

  async function handleDownload(att: TicketAttachment) {
    if (!att.storagePath) {
      setDownloadError(
        "Este adjunto es solo metadata (legacy). Sube el archivo nuevamente.",
      );
      return;
    }
    setDownloadError(null);
    setDownloadingId(att.id);
    const result = await getAttachmentUrl(ticketId, att.id, 300);
    setDownloadingId(null);
    if (!result.ok) {
      setDownloadError(result.error.reason ?? "No se pudo generar la URL de descarga.");
      return;
    }
    // Abrir en nueva pestaña; el browser gatilla la descarga por el header
    // Content-Disposition que Supabase Storage agrega.
    window.open(result.data.url, "_blank", "noopener,noreferrer");
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
        <p className="demo-form-error" role="alert">
          No pudimos cargar los adjuntos: {phase.reason}
        </p>
      </section>
    );
  }

  const attachments = phase.attachments;
  const isUploading = upload.kind === "uploading";

  return (
    <section className="demo-ticket-history-card" aria-labelledby="ticket-attachments-title">
      <div className="demo-ticket-history-heading">
        <div>
          <p className="demo-section-label">Adjuntos</p>
          <h2 id="ticket-attachments-title">Archivos del ticket</h2>
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
                  <small>
                    ({att.mimeType}, {formatBytes(att.sizeBytes)})
                  </small>
                </p>
                <time dateTime={att.createdAt}>
                  {formatDate(att.createdAt)} · {att.uploadedBy.slice(0, 8)}…
                  {att.storagePath ? ` · ${att.storagePath}` : ""}
                </time>
                <div className="demo-request-actions" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="demo-secondary-button"
                    onClick={() => {
                      void handleDownload(att);
                    }}
                    disabled={downloadingId === att.id || !att.storagePath}
                    aria-label={`Descargar ${att.originalName}`}
                  >
                    {downloadingId === att.id
                      ? "Generando URL…"
                      : att.storagePath
                        ? "Descargar"
                        : "Sin archivo"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="demo-ticket-history-empty">Aún no hay adjuntos.</div>
      )}

      {downloadError ? (
        <p className="demo-form-error" role="alert">
          {downloadError}
        </p>
      ) : null}

      <div className="demo-comment-form" aria-label="Subir archivo al ticket">
        <p className="demo-comment-note">
          Sube un archivo real al ticket (imagen, PDF o texto). El binario se
          almacena en Storage privado; la descarga se hace por URL temporal.
        </p>
        <label htmlFor="att-file">Seleccionar archivo</label>
        <input
          ref={fileInputRef}
          id="att-file"
          type="file"
          accept="image/*,application/pdf,text/plain"
          onChange={(event) => {
            void handleFileChange(event);
          }}
          disabled={isUploading}
        />
        {upload.kind === "uploading" ? (
          <p className="demo-comment-note">Subiendo {upload.fileName}…</p>
        ) : null}
        {upload.kind === "error" ? (
          <p className="demo-form-error" role="alert">
            {upload.reason}
          </p>
        ) : null}
      </div>

      <p className="demo-comment-note" aria-label="Tenant del adjunto">
        Tenant: <code>{tenantId}</code>
      </p>
    </section>
  );
}
