"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DemoLoadingState } from "./demo-feedback-state";
import { getTicket, listTicketCategories } from "@/modules/ticketing/client-api";
import type { Ticket, TicketCategory } from "@/modules/ticketing/repository";
import type { TicketState, TicketPriority } from "@/modules/ticketing/types";
import { CommentsThread } from "./comments-thread";
import { AttachmentsList } from "./attachments-list";
import {
  formatDateTime,
  getErrorMessage,
  getStateLabel,
  useI18n,
} from "@/i18n";

/**
 * Tone maps (CSS class suffix) por estado y prioridad.
 *
 * Inlined aquí en lugar de importarse de `@/mock/deskwork-data` para que
 * la página de detalle no dependa de fixtures MOCK. Los valores son los
 * mismos que el módulo mock tenía; si se renombran las clases CSS,
 * actualizar aquí.
 */
const TONE_BY_STATE: Record<TicketState, string> = {
  ABIERTO: "info",
  EN_PROCESO: "warning",
  ESPERANDO_USUARIO: "warning",
  ESCALADO: "danger",
  RESUELTO: "success",
  CERRADO: "success",
};

const TONE_BY_PRIORITY: Record<TicketPriority, string> = {
  P1: "danger",
  P2: "warning",
  P3: "info",
  P4: "success",
};

function getStateTone(state: TicketState): string {
  return TONE_BY_STATE[state] ?? "info";
}

function getPriorityTone(priority: TicketPriority): string {
  return TONE_BY_PRIORITY[priority] ?? "info";
}

type Phase =
  | { kind: "loading" }
  | { kind: "error"; reason: string; kind_: string; status?: number }
  | { kind: "ready"; ticket: Ticket; categories: TicketCategory[] };

export function RequesterTicketDetail({ ticketId }: { ticketId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const { t, locale, messages } = useI18n();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [categoriesResult, ticketResult] = await Promise.all([
        listTicketCategories(),
        getTicket(ticketId),
      ]);
      if (cancelled) return;
      if (!categoriesResult.ok) {
        setPhase({
          kind: "error",
          reason: getErrorMessage(categoriesResult.error, messages),
          kind_: categoriesResult.error.kind,
        });
        return;
      }
      if (!ticketResult.ok) {
        setPhase({
          kind: "error",
          reason: getErrorMessage(ticketResult.error, messages),
          kind_: ticketResult.error.kind,
          status: ticketResult.error.kind === "http" ? ticketResult.error.status : undefined,
        });
        return;
      }
      setPhase({
        kind: "ready",
        ticket: ticketResult.data.ticket,
        categories: categoriesResult.data.categories,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, messages]);

  if (phase.kind === "loading") return <DemoLoadingState />;

  if (phase.kind === "error") {
    if (phase.kind_ === "not_found" || phase.status === 404) {
      return (
        <div className="demo-page">
          <section className="demo-page-heading" aria-labelledby="ticket-not-found-title">
            <p className="demo-eyebrow">{t("nav.sectionRequests")}</p>
            <h1 id="ticket-not-found-title">{t("errors.ticket_not_found")}</h1>
            <p className="demo-page-description">{phase.reason}</p>
          </section>
          <Link className="demo-primary-link demo-ticket-not-found-action" href="/tickets">
            {t("requester.detail.back")}
          </Link>
        </div>
      );
    }
    if (phase.kind_ === "forbidden") {
      return (
        <div className="demo-page">
          <section className="demo-page-heading" aria-labelledby="ticket-forbidden-title">
            <p className="demo-eyebrow">{t("nav.sectionRequests")}</p>
            <h1 id="ticket-forbidden-title">{t("errors.authentication_required")}</h1>
            <p className="demo-page-description">{phase.reason}</p>
          </section>
          <Link className="demo-primary-link demo-ticket-not-found-action" href="/login">
            {t("common.open")} — {t("shell.brand")}
          </Link>
        </div>
      );
    }
    return (
      <div className="demo-page">
        <section className="demo-page-heading" aria-labelledby="ticket-error-title">
          <p className="demo-eyebrow">{t("nav.sectionRequests")}</p>
          <h1 id="ticket-error-title">{t("requester.detail.errorPrefix")}</h1>
          <p className="demo-page-description">{phase.reason}</p>
        </section>
        <Link className="demo-primary-link demo-ticket-not-found-action" href="/tickets">
          {t("requester.detail.back")}
        </Link>
      </div>
    );
  }

  const ticket = phase.ticket;
  const category = phase.categories.find((c) => c.id === ticket.categoryId);
  const stateLabel = getStateLabel(ticket.state, locale);
  const stateTone = getStateTone(ticket.state);
  const priorityTone = getPriorityTone(ticket.priority);

  return (
    <div className="demo-ticket-detail">
      <section className="demo-ticket-detail-heading" aria-labelledby="ticket-title">
        <div>
          <p className="demo-eyebrow">
            {ticket.id.slice(0, 8)}… · {t("nav.sectionRequests")}
          </p>
          <h1 id="ticket-title">{ticket.title}</h1>
          <p>{ticket.description || t("requester.detail.noDescription")}</p>
        </div>
        <div className="demo-ticket-detail-badges">
          <span
            className={`demo-priority-marker demo-priority-marker-${priorityTone}`}
            aria-label={`${t("requester.detail.priorityLabel")} ${ticket.priority}`}
          >
            {ticket.priority}
          </span>
          <span className={`demo-state-pill demo-state-pill-${stateTone}`}>
            <span aria-hidden="true" />{stateLabel}
          </span>
        </div>
      </section>

      <section className="demo-ticket-detail-grid" aria-label={t("requester.detail.statusLabel")}>
        <article className="demo-ticket-detail-card">
          <p className="demo-section-label">{t("requester.detail.statusLabel")}</p>
          <dl className="demo-ticket-facts">
            <div>
              <dt>{t("requester.detail.categoryLabel")}</dt>
              <dd>{category?.label ?? t("common.none")}</dd>
            </div>
            <div>
              <dt>ID</dt>
              <dd>{ticket.id}</dd>
            </div>
            <div>
              <dt>Solicitante</dt>
              <dd>
                <code>{ticket.requesterId.slice(0, 8)}…</code>
              </dd>
            </div>
            <div>
              <dt>{t("requester.detail.statusLabel")}</dt>
              <dd>{stateLabel}</dd>
            </div>
            <div>
              <dt>{t("requester.detail.createdAtLabel")}</dt>
              <dd>
                <time dateTime={ticket.createdAt}>
                  {formatDateTime(ticket.createdAt, locale)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Actualizado</dt>
              <dd>
                <time dateTime={ticket.updatedAt}>
                  {formatDateTime(ticket.updatedAt, locale)}
                </time>
              </dd>
            </div>
            {category?.description ? (
              <div>
                <dt>{t("requester.detail.categoryLabel")}</dt>
                <dd>{category.description}</dd>
              </div>
            ) : null}
          </dl>
        </article>
        <article className="demo-ticket-detail-card demo-timer-card">
          <p className="demo-section-label">{t("requester.detail.assignedToLabel")}</p>
          <strong>
            {ticket.assignedTo ? t("requester.detail.assignedToLabel") : t("requester.detail.noAssignee")}
          </strong>
          <span>{ticket.assignedTo ?? "—"}</span>
        </article>
      </section>

      <CommentsThread ticketId={ticket.id} allowInternal={false} />
      <AttachmentsList ticketId={ticket.id} tenantId={ticket.tenantId} />
    </div>
  );
}
