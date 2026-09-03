"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DemoEmptyState, DemoLoadingState } from "./demo-feedback-state";
import { listTicketCategories, listTickets } from "@/modules/ticketing/client-api";
import type { ClientApiError } from "@/modules/ticketing/client-api";
import type { Ticket, TicketCategory } from "@/modules/ticketing/repository";
import type { TicketState, TicketPriority } from "@/modules/ticketing/types";
import {
  formatDateLong,
  getErrorMessage,
  getStateLabel,
  useI18n,
} from "@/i18n";

/**
 * Tone maps (CSS class suffix) por estado y prioridad.
 *
 * Inlined aquí en lugar de importarse de `@/mock/deskwork-data` para
 * que la lista de tickets del requester no dependa de fixtures MOCK.
 * Los valores son los mismos que el módulo mock tenía.
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
  | { kind: "error"; reason: string; kind_: ClientApiError["kind"] }
  | { kind: "ready"; tickets: Ticket[]; categories: TicketCategory[] };

export function RequestHistory() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const { t, locale, messages } = useI18n();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [categoriesResult, ticketsResult] = await Promise.all([
        listTicketCategories(),
        listTickets("mine"),
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
      if (!ticketsResult.ok) {
        setPhase({
          kind: "error",
          reason: getErrorMessage(ticketsResult.error, messages),
          kind_: ticketsResult.error.kind,
        });
        return;
      }
      setPhase({
        kind: "ready",
        tickets: ticketsResult.data.tickets,
        categories: categoriesResult.data.categories,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  if (phase.kind === "loading") {
    return <DemoLoadingState />;
  }

  if (phase.kind === "error") {
    if (phase.kind_ === "forbidden") {
      return (
        <div className="demo-history-page">
          <section className="demo-page-heading" aria-labelledby="history-title">
            <p className="demo-eyebrow">{t("nav.sectionRequests")}</p>
            <h1 id="history-title">{t("errors.authentication_required")}</h1>
            <p className="demo-page-description">{phase.reason}</p>
          </section>
          <div className="demo-history-card-heading" style={{ padding: "1rem" }}>
            <Link className="demo-primary-link" href="/login?next=/tickets">
              {t("common.open")} — {t("shell.brand")}
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="demo-history-page">
        <section className="demo-page-heading" aria-labelledby="history-title">
          <p className="demo-eyebrow">{t("nav.sectionRequests")}</p>
          <h1 id="history-title">{t("requester.history.errorPrefix")}</h1>
          <p className="demo-page-description">{phase.reason}</p>
        </section>
      </div>
    );
  }

  const tickets = phase.tickets;
  const categoryById = new Map(phase.categories.map((c) => [c.id, c]));

  return (
    <div className="demo-history-page">
      <section className="demo-page-heading" aria-labelledby="history-title">
        <p className="demo-eyebrow">{t("nav.sectionRequests")}</p>
        <h1 id="history-title">{t("requester.history.title")}</h1>
      </section>
      <section className="demo-history-card" aria-label={t("requester.history.title")}>
        <div className="demo-history-card-heading">
          <div>
            <p className="demo-section-label">{t("requester.history.title")}</p>
            <h2>{tickets.length} {t("requester.history.title").toLowerCase()}</h2>
          </div>
          <Link className="demo-primary-link" href="/tickets/new">
            {t("requester.history.newTicketCta")}
          </Link>
        </div>
        {tickets.length ? (
          <div className="demo-history-table-wrap">
            <table className="demo-history-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("requester.detail.title")}</th>
                  <th>{t("requester.detail.statusLabel")}</th>
                  <th>{t("requester.detail.createdAtLabel")}</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const category = categoryById.get(ticket.categoryId);
                  return (
                    <tr key={ticket.id}>
                      <td>
                        <span className={`demo-priority-marker demo-priority-marker-${getPriorityTone(ticket.priority)}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td>
                        <Link href={`/tickets/${ticket.id}`}>
                          <strong>{ticket.title}</strong>
                          <span>
                            {ticket.id.slice(0, 8)}… · {category?.label ?? t("common.none")}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className={`demo-state-pill demo-state-pill-${getStateTone(ticket.state)}`}>
                          <span />{getStateLabel(ticket.state, locale)}
                        </span>
                      </td>
                      <td>
                        <time dateTime={ticket.updatedAt}>{formatDateLong(ticket.updatedAt, locale)}</time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <DemoEmptyState
            title={t("requester.history.empty")}
            description={t("requester.history.empty")}
            actionHref="/tickets/new"
            actionLabel={t("requester.history.newTicketCta")}
          />
        )}
      </section>
    </div>
  );
}
