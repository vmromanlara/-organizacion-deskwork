"use client";

import { useEffect, useRef, useState } from "react";
import {
  getAttachmentUrl,
  listAttachments,
  uploadAttachment,
} from "@/modules/ticketing/client-api";
import type { TicketAttachment } from "@/modules/ticketing/repository";
import {
  formatBytes,
  formatDateTime,
  getErrorMessage,
  useI18n,
  type Locale,
} from "@/i18n";

const MAX_SIZE = 26_214_400; // 25 MB; mismo límite que el CHECK del schema.
const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp|svg\+xml)|application\/pdf|text\/plain)$/i;

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
  const { t, locale, messages } = useI18n();
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
          reason: getErrorMessage(result.error, messages),
        });
        return;
      }
      setPhase({ kind: "ready", attachments: result.data.attachments });
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, messages]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size <= 0) {
      setUpload({ kind: "error", reason: t("attachments.errorEmpty") });
      event.target.value = "";
      return;
    }
    if (file.size > MAX_SIZE) {
      setUpload({
        kind: "error",
        reason: t("attachments.errorTooLarge").replace("{size}", formatBytes(file.size, locale as Locale)),
      });
      event.target.value = "";
      return;
    }
    if (file.type && !ALLOWED_MIME.test(file.type)) {
      setUpload({
        kind: "error",
        reason: t("attachments.errorType").replace("{type}", file.type),
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
        reason: getErrorMessage(result.error, messages),
      });
    }
    event.target.value = "";
  }

  async function handleDownload(att: TicketAttachment) {
    if (!att.storagePath) {
      setDownloadError(t("attachments.errorLegacy"));
      return;
    }
    setDownloadError(null);
    setDownloadingId(att.id);
    const result = await getAttachmentUrl(ticketId, att.id, 300);
    setDownloadingId(null);
    if (!result.ok) {
      setDownloadError(getErrorMessage(result.error, messages));
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  if (phase.kind === "loading") {
    return (
      <section className="demo-ticket-history-card" aria-label={t("attachments.title")}>
        <p className="demo-section-label">{t("attachments.title")}</p>
        <p>{t("common.loading")}</p>
      </section>
    );
  }

  if (phase.kind === "error") {
    return (
      <section className="demo-ticket-history-card" aria-label={t("attachments.title")}>
        <p className="demo-section-label">{t("attachments.title")}</p>
        <p className="demo-form-error" role="alert">{phase.reason}</p>
      </section>
    );
  }

  const attachments = phase.attachments;
  const isUploading = upload.kind === "uploading";

  return (
    <section className="demo-ticket-history-card" aria-labelledby="ticket-attachments-title">
      <div className="demo-ticket-history-heading">
        <div>
          <p className="demo-section-label">{t("attachments.title")}</p>
          <h2 id="ticket-attachments-title">{t("attachments.title")}</h2>
        </div>
        <span>{t("attachments.count").replace("{count}", String(attachments.length))}</span>
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
                    ({att.mimeType}, {formatBytes(att.sizeBytes, locale as Locale)})
                  </small>
                </p>
                <time dateTime={att.createdAt}>
                  {formatDateTime(att.createdAt, locale)} · {att.uploadedBy.slice(0, 8)}…
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
                    aria-label={t("attachments.downloadAria").replace("{name}", att.originalName)}
                  >
                    {downloadingId === att.id
                      ? t("attachments.downloading")
                      : att.storagePath
                        ? t("common.open")
                        : t("attachments.noFile")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="demo-ticket-history-empty">{t("attachments.empty")}</div>
      )}

      {downloadError ? (
        <p className="demo-form-error" role="alert">
          {downloadError}
        </p>
      ) : null}

      <div className="demo-comment-form" aria-label={t("attachments.pickFile")}>
        <p className="demo-comment-note">{t("attachments.storageLabel")}</p>
        <label htmlFor="att-file">{t("attachments.pickFile")}</label>
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
          <p className="demo-comment-note">
            {t("attachments.uploading").replace("{name}", upload.fileName)}
          </p>
        ) : null}
        {upload.kind === "error" ? (
          <p className="demo-form-error" role="alert">
            {upload.reason}
          </p>
        ) : null}
      </div>

      <p className="demo-comment-note" aria-label={t("attachments.tenantLabel")}>
        {t("attachments.tenantLabel")}: <code>{tenantId}</code>
      </p>
    </section>
  );
}
