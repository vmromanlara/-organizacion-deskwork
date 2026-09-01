"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createComment, listComments } from "@/modules/ticketing/client-api";
import type { ClientApiError } from "@/modules/ticketing/client-api";
import type { TicketComment } from "@/modules/ticketing/repository";
import {
  formatDateTime,
  getErrorMessage,
  useI18n,
} from "@/i18n";

const BODY_MAX = 10000;
const BODY_MIN = 1;

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
  const { t, locale, messages } = useI18n();
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
        setPhase({
          kind: "error",
          reason: getErrorMessage(result.error, messages),
          kind_: result.error.kind,
        });
        return;
      }
      setPhase({ kind: "ready", comments: result.data.comments });
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const body = draft.trim();
    if (body.length < BODY_MIN || body.length > BODY_MAX) {
      setSubmitError(
        t("comments.errorBody")
          .replace("{min}", String(BODY_MIN))
          .replace("{max}", String(BODY_MAX)),
      );
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
      setSubmitError(getErrorMessage(result.error, messages));
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
      <section className="demo-ticket-history-card" aria-label={t("comments.title")}>
        <p className="demo-section-label">{t("comments.title")}</p>
        <p>{t("common.loading")}</p>
      </section>
    );
  }

  if (phase.kind === "error") {
    if (phase.kind_ === "forbidden") {
      return (
        <section className="demo-ticket-history-card" aria-label={t("comments.title")}>
          <p className="demo-section-label">{t("comments.title")}</p>
          <p className="demo-form-error" role="alert">
            {t("comments.errorForbidden")}: {phase.reason}
          </p>
        </section>
      );
    }
    return (
      <section className="demo-ticket-history-card" aria-label={t("comments.title")}>
        <p className="demo-section-label">{t("comments.title")}</p>
        <p className="demo-form-error" role="alert">
          {t("comments.errorPrefix")} {phase.reason}
        </p>
      </section>
    );
  }

  const comments = phase.comments;
  return (
    <section className="demo-ticket-history-card" aria-labelledby="ticket-comments-title">
      <div className="demo-ticket-history-heading">
        <div>
          <p className="demo-section-label">{t("comments.title")}</p>
          <h2 id="ticket-comments-title">{t("comments.threadTitle")}</h2>
        </div>
        <span>{t("comments.count").replace("{count}", String(comments.length))}</span>
      </div>

      {comments.length ? (
        <ol className="demo-ticket-history-list">
          {comments.map((comment) => (
            <li key={comment.id} className={comment.isInternal ? "demo-ticket-history-item-internal" : undefined}>
              <span aria-hidden="true" />
              <div>
                <p>{comment.body}</p>
                <time dateTime={comment.createdAt}>
                  {formatDateTime(comment.createdAt, locale)} · {comment.authorId.slice(0, 8)}…
                  {comment.isInternal ? ` · ${t("comments.internalTag")}` : ""}
                </time>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="demo-ticket-history-empty">{t("comments.empty")}</div>
      )}

      <form className="demo-comment-form" onSubmit={handleSubmit} aria-label={t("comments.addLabel")}>
        <label htmlFor="comment-body">{t("comments.addLabel")}</label>
        <textarea
          id="comment-body"
          maxLength={BODY_MAX}
          placeholder={t("comments.placeholder")}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setSubmitError(undefined);
          }}
          disabled={submitting}
        />
        <p className="demo-comment-counter">
          {t("comments.charCounter")
            .replace("{n}", String(draft.length))
            .replace("{max}", String(BODY_MAX))}
        </p>
        {allowInternal ? (
          <label className="demo-comment-internal-toggle">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(event) => setIsInternal(event.target.checked)}
              disabled={submitting}
            />
            <span>{t("comments.internalToggle")}</span>
          </label>
        ) : null}
        {submitError ? <p className="demo-form-error" role="alert">{submitError}</p> : null}
        <div className="demo-request-actions">
          <button
            type="submit"
            className="demo-primary-button"
            disabled={submitting || draft.trim().length === 0}
          >
            {submitting ? t("comments.submitting") : t("comments.submit")}
          </button>
        </div>
      </form>
    </section>
  );
}
