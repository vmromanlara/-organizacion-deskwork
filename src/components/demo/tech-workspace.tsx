"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DemoEmptyState, DemoLoadingState } from "./demo-feedback-state";
import { CommentsThread } from "./comments-thread";
import { AttachmentsList } from "./attachments-list";
import {
  assignTicket,
  getTicket,
  listTicketCategories,
  listTickets,
  listTenantMembers,
  transitionTicket,
  type TenantMember,
} from "@/modules/ticketing/client-api";
import type { ClientApiError } from "@/modules/ticketing/client-api";
import type { Ticket, TicketCategory } from "@/modules/ticketing/repository";
import {
  TICKET_STATES,
  TICKET_PRIORITIES,
  type TicketState,
  type TicketPriority,
} from "@/modules/ticketing/types";
import {
  formatDateShort,
  formatDateTime,
  formatMinutes,
  getErrorMessage,
  getStateLabel,
  useI18n,
} from "@/i18n";

/**
 * Tone maps (CSS class suffix) por estado y prioridad.
 *
 * Inlined aquí en lugar de importarse de `@/mock/deskwork-data` para
 * que el módulo técnico no dependa de fixtures MOCK. Los valores son
 * los mismos que el módulo mock tenía; si se renombran las clases CSS,
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

function durationFromMs(ms: number, locale: "es" | "en", messages: { empty: string; hoursMinutes: string; minutesShort: string }): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 1) {
    return messages.minutesShort.replace("{n}", "0");
  }
  return formatMinutes(totalMinutes, locale, messages);
}

function getStateTone(state: TicketState): string {
  return TONE_BY_STATE[state] ?? "info";
}

function getPriorityTone(priority: TicketPriority): string {
  return TONE_BY_PRIORITY[priority] ?? "info";
}

export function LiveTimer({ ticket, compact = false }: { ticket: Ticket; compact?: boolean }) {
  const { locale, messages } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const created = new Date(ticket.createdAt).getTime();
  return (
    <span className={`demo-live-timer ${compact ? "demo-live-timer-compact" : ""}`}>
      <svg aria-hidden="true" className="demo-clock-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3.25 2" />
      </svg>
      {durationFromMs(now - created, locale, messages.time)}
      {!compact ? <small> · tenant {ticket.tenantId.slice(0, 8)}…</small> : null}
    </span>
  );
}

// =====================================================================
// TechDashboard
// =====================================================================

export function TechDashboard() {
  const { t, messages } = useI18n();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listTickets("assigned");
      if (cancelled) return;
      if (!result.ok) {
        setError(getErrorMessage(result.error, messages));
        return;
      }
      setTickets(result.data.tickets);
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  if (error) {
    return (
      <div className="demo-tech-page">
        <section className="demo-page-heading" aria-labelledby="tech-title">
          <p className="demo-eyebrow">{t("nav.sectionOperations")}</p>
          <h1 id="tech-title">{t("tech.queue.empty")}</h1>
          <p>{error}</p>
        </section>
      </div>
    );
  }
  if (!tickets) return <DemoLoadingState />;

  const assigned = tickets;
  const active = assigned.filter((t) => t.state !== "RESUELTO" && t.state !== "CERRADO");
  const atRisk = active.filter((t) => t.slaStatus === "at_risk" || t.slaStatus === "overdue");

  return (
    <div className="demo-tech-page">
      <section className="demo-dashboard-hero" aria-labelledby="tech-title">
        <div>
          <p className="demo-eyebrow">{t("nav.sectionOperations")}</p>
          <h1 id="tech-title">{t("tech.dashboard.title")}</h1>
          <p>{t("tech.dashboard.subtitle")}</p>
        </div>
        <Link className="demo-primary-action" href="/tech/tickets">{t("tech.queue.title")}</Link>
      </section>
      <section className="demo-summary-grid" aria-label={t("tech.dashboard.title")}>
        <article className="demo-summary-card demo-summary-card-emphasis">
          <p>{t("tech.dashboard.inProgress")}</p>
          <strong>{active.length}</strong>
          <span>{t("tech.dashboard.assignedToMe")}</span>
        </article>
        <article className="demo-summary-card">
          <p>{t("tech.dashboard.inProgress")}</p>
          <strong>{active.filter((t) => t.state === "EN_PROCESO").length}</strong>
          <span>{t("tech.dashboard.inProgress")}</span>
        </article>
        <article className="demo-summary-card">
          <p>{t("tech.dashboard.escalated")}</p>
          <strong>{atRisk.length}</strong>
          <span>{t("tech.dashboard.awaitingUser")}</span>
        </article>
        <article className="demo-summary-card">
          <p>{t("tech.dashboard.resolved")}</p>
          <strong>{assigned.filter((t) => t.state === "RESUELTO" || t.state === "CERRADO").length}</strong>
          <span>{t("tech.dashboard.closed")}</span>
        </article>
      </section>
      <section className="demo-tech-focus-card">
        <div>
          <p className="demo-section-label">{t("tech.dashboard.inProgress")}</p>
          <h2>{active[0]?.title ?? t("tech.dashboard.noAssigned")}</h2>
          <p>{active[0] ? `${active[0].id.slice(0, 8)}… · ${active[0].priority}` : t("tech.dashboard.noAssigned")}</p>
        </div>
        {active[0] ? <Link className="demo-primary-link" href={`/tech/tickets/${active[0].id}`}>{t("requester.history.openTicket")}</Link> : null}
      </section>
    </div>
  );
}

// =====================================================================
// TechQueue
// =====================================================================

type QueuePhase =
  | { kind: "loading" }
  | { kind: "error"; reason: string; kind_: ClientApiError["kind"] }
  | { kind: "ready"; tickets: Ticket[]; categories: TicketCategory[] };

export function TechQueue() {
  const { t, locale, messages } = useI18n();
  const [phase, setPhase] = useState<QueuePhase>({ kind: "loading" });
  const [stateFilter, setStateFilter] = useState<TicketState | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<"priority" | "updatedAt">("priority");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [categoriesResult, ticketsResult] = await Promise.all([
        listTicketCategories(),
        listTickets("tenant"),
      ]);
      if (cancelled) return;
      if (!categoriesResult.ok) {
        setPhase({ kind: "error", reason: getErrorMessage(categoriesResult.error, messages), kind_: categoriesResult.error.kind });
        return;
      }
      if (!ticketsResult.ok) {
        setPhase({ kind: "error", reason: getErrorMessage(ticketsResult.error, messages), kind_: ticketsResult.error.kind });
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

  const queue = useMemo(() => {
    if (phase.kind !== "ready") return [];
    return phase.tickets.filter((t) => (
      (stateFilter === "ALL" || t.state === stateFilter)
      && (priorityFilter === "ALL" || t.priority === priorityFilter)
      && (categoryFilter === "ALL" || t.categoryId === categoryFilter)
      && (!unassignedOnly || !t.assignedTo)
    )).sort((a, b) => {
      const comparison = sortKey === "priority" ? a.priority.localeCompare(b.priority) : new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [phase, stateFilter, priorityFilter, categoryFilter, unassignedOnly, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(queue.length / pageSize));
  const visibleTickets = queue.slice((page - 1) * pageSize, page * pageSize);

  function updateSort(nextKey: "priority" | "updatedAt") {
    setPage(1);
    if (sortKey === nextKey) setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else { setSortKey(nextKey); setSortDirection("asc"); }
  }

  if (phase.kind === "loading") return <DemoLoadingState />;
  if (phase.kind === "error") {
    if (phase.kind_ === "forbidden") {
      return (
        <div className="demo-tech-page">
          <section className="demo-page-heading" aria-labelledby="queue-title">
            <p className="demo-eyebrow">{t("nav.sectionOperations")}</p>
            <h1 id="queue-title">{t("errors.authentication_required")}</h1>
            <p className="demo-page-description">{phase.reason}</p>
          </section>
          <div className="demo-history-card-heading" style={{ padding: "1rem" }}>
            <Link className="demo-primary-link" href="/login?next=/tech/tickets">
              {t("common.open")} — {t("shell.brand")}
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="demo-tech-page">
        <section className="demo-page-heading" aria-labelledby="queue-title">
          <p className="demo-eyebrow">{t("nav.sectionOperations")}</p>
          <h1 id="queue-title">{t("tech.queue.empty")}</h1>
          <p className="demo-page-description">{phase.reason}</p>
        </section>
      </div>
    );
  }

  const categoryById = new Map(phase.categories.map((c) => [c.id, c]));

  return (
    <div className="demo-tech-page">
      <section className="demo-page-heading" aria-labelledby="queue-title">
        <p className="demo-eyebrow">{t("nav.sectionOperations")}</p>
        <h1 id="queue-title">{t("tech.queue.title")}</h1>
        <p className="demo-page-description">{t("tech.queue.subtitle")}</p>
      </section>
      <section className="demo-queue-card">
        <div className="demo-queue-heading">
          <div>
            <p className="demo-section-label">{t("tech.queue.title")}</p>
            <h2>{queue.length} {t("tech.queue.title").toLowerCase()}</h2>
          </div>
          <div className="demo-queue-filters">
            <label>{t("requester.detail.statusLabel")}
              <select value={stateFilter} onChange={(event) => { setPage(1); setStateFilter(event.target.value as TicketState | "ALL"); }}>
                <option value="ALL">{t("common.all")}</option>
                {TICKET_STATES.map((state) => (
                  <option value={state} key={state}>
                    {getStateLabel(state, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>{t("requester.detail.priorityLabel")}
              <select value={priorityFilter} onChange={(event) => { setPage(1); setPriorityFilter(event.target.value as TicketPriority | "ALL"); }}>
                <option value="ALL">{t("common.all")}</option>
                {TICKET_PRIORITIES.map((priority) => <option value={priority} key={priority}>{priority}</option>)}
              </select>
            </label>
            <label>{t("requester.detail.categoryLabel")}
              <select value={categoryFilter} onChange={(event) => { setPage(1); setCategoryFilter(event.target.value); }}>
                <option value="ALL">{t("common.all")}</option>
                {phase.categories.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}
              </select>
            </label>
            <label>{t("tech.queue.filterUnassigned")}
              <input
                type="checkbox"
                checked={unassignedOnly}
                onChange={(event) => { setPage(1); setUnassignedOnly(event.target.checked); }}
              />
            </label>
          </div>
        </div>
        {queue.length ? (
          <>
            <div className="demo-queue-table-wrap">
              <table className="demo-queue-table">
                <thead>
                  <tr>
                    <th>
                      <button
                        className="demo-table-sort"
                        type="button"
                        onClick={() => updateSort("priority")}
                        aria-label={t("requester.detail.priorityLabel")}
                      >
                        {t("requester.detail.priorityLabel")} <span aria-hidden="true">{sortKey === "priority" ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span>
                      </button>
                    </th>
                    <th>{t("requester.detail.title")}</th>
                    <th>{t("requester.detail.statusLabel")}</th>
                    <th>{t("requester.detail.assignedToLabel")}</th>
                    <th>
                      <button
                        className="demo-table-sort"
                        type="button"
                        onClick={() => updateSort("updatedAt")}
                        aria-label={t("requester.detail.createdAtLabel")}
                      >
                        {t("requester.detail.createdAtLabel")} <span aria-hidden="true">{sortKey === "updatedAt" ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTickets.map((ticket) => {
                    const category = categoryById.get(ticket.categoryId);
                    return (
                      <tr key={ticket.id}>
                        <td><span className={`demo-priority-marker demo-priority-marker-${getPriorityTone(ticket.priority)}`}>{ticket.priority}</span></td>
                        <td><Link href={`/tech/tickets/${ticket.id}`}><strong>{ticket.title}</strong><span>{ticket.id.slice(0, 8)}… · {category?.label ?? t("common.none")}</span></Link></td>
                        <td><span className={`demo-state-pill demo-state-pill-${getStateTone(ticket.state)}`}><span />{getStateLabel(ticket.state, locale)}</span></td>
                        <td>{ticket.assignedTo ? ticket.assignedTo.slice(0, 8) + "…" : t("requester.detail.noAssignee")}</td>
                        <td>
                          <time dateTime={ticket.updatedAt}>
                            {formatDateShort(ticket.updatedAt, locale)}
                            <br />
                            <LiveTimer ticket={ticket} compact />
                          </time>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <nav className="demo-pagination" aria-label={t("tech.queue.title")}>
              <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, queue.length)} / {queue.length}</span>
              <div>
                <button className="demo-secondary-button" type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>←</button>
                <span aria-live="polite">{page} / {pageCount}</span>
                <button className="demo-secondary-button" type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>→</button>
              </div>
            </nav>
          </>
        ) : (
          <DemoEmptyState
            title={t("tech.queue.empty")}
            description={t("tech.queue.empty")}
          />
        )}
      </section>
    </div>
  );
}

// =====================================================================
// TechTicketDetail
// =====================================================================

type TechDetailPhase =
  | { kind: "loading" }
  | { kind: "error"; reason: string; kind_: ClientApiError["kind"]; status?: number }
  | { kind: "ready"; ticket: Ticket; categoryLabel: string; members: TenantMember[] };

export function TechTicketDetail({ ticketId }: { ticketId: string }) {
  const { t, locale, messages } = useI18n();
  const [phase, setPhase] = useState<TechDetailPhase>({ kind: "loading" });
  const [pending, setPending] = useState<TicketState | null>(null);
  const [transitionError, setTransitionError] = useState<string>();
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [categoriesResult, membersResult, ticketResult] = await Promise.all([
        listTicketCategories(),
        listTenantMembers(),
        getTicket(ticketId),
      ]);
      if (cancelled) return;
      if (!ticketResult.ok) {
        setPhase({
          kind: "error",
          reason: getErrorMessage(ticketResult.error, messages),
          kind_: ticketResult.error.kind,
          status: ticketResult.error.kind === "http" ? ticketResult.error.status : undefined,
        });
        return;
      }
      const categoryLabel = categoriesResult.ok
        ? categoriesResult.data.categories.find((c) => c.id === ticketResult.data.ticket.categoryId)?.label ?? t("common.none")
        : t("common.none");
      const members = membersResult.ok ? membersResult.data.members : [];
      setPhase({ kind: "ready", ticket: ticketResult.data.ticket, categoryLabel, members });
      setAssigneeId(ticketResult.data.ticket.assignedTo ?? "");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const operations: ReadonlyArray<{ state: TicketState; label: string }> = [
    { state: "EN_PROCESO", label: t("states.EN_PROCESO") },
    { state: "ESPERANDO_USUARIO", label: t("states.ESPERANDO_USUARIO") },
    { state: "ESCALADO", label: t("states.ESCALADO") },
    { state: "RESUELTO", label: t("states.RESUELTO") },
    { state: "CERRADO", label: t("states.CERRADO") },
  ];

  async function applyAssign(target: string) {
    if (assigning) return;
    setAssigning(true);
    setAssignError(undefined);
    const result = await assignTicket(ticketId, target);
    setAssigning(false);
    if (!result.ok) {
      setAssignError(getErrorMessage(result.error, messages));
      return;
    }
    setPhase((current) => (current.kind === "ready"
      ? { ...current, ticket: { ...current.ticket, assignedTo: target } }
      : current));
  }

  async function applyTransition(target: TicketState) {
    if (pending) return;
    setPending(target);
    setTransitionError(undefined);
    const result = await transitionTicket(ticketId, target);
    setPending(null);
    if (!result.ok) {
      setTransitionError(getErrorMessage(result.error, messages));
      return;
    }
    setPhase((current) => (current.kind === "ready"
      ? { ...current, ticket: result.data.ticket }
      : current));
  }

  if (phase.kind === "loading") return <DemoLoadingState />;

  if (phase.kind === "error") {
    if (phase.kind_ === "not_found" || phase.status === 404) {
      return (
        <div className="demo-page">
          <h1>{t("errors.ticket_not_found")}</h1>
          <p>{phase.reason}</p>
          <Link className="demo-primary-link" href="/tech/tickets">{t("tech.detail.back")}</Link>
        </div>
      );
    }
    if (phase.kind_ === "forbidden") {
      return (
        <div className="demo-page">
          <h1>{t("errors.authentication_required")}</h1>
          <p>{phase.reason}</p>
          <Link className="demo-primary-link" href="/login?next=/tech/tickets">{t("common.open")} — {t("shell.brand")}</Link>
        </div>
      );
    }
    return (
      <div className="demo-page">
        <h1>{t("tech.detail.errorPrefix")}</h1>
        <p>{phase.reason}</p>
        <Link className="demo-primary-link" href="/tech/tickets">{t("tech.detail.back")}</Link>
      </div>
    );
  }

  const ticket = phase.ticket;
  return (
    <div className="demo-tech-page">
      <Link className="demo-back-link" href="/tech/tickets">← {t("tech.detail.back")}</Link>
      <section className="demo-ticket-detail-heading" aria-labelledby="tech-ticket-title">
        <div>
          <p className="demo-eyebrow">{ticket.id.slice(0, 8)}… · {t("nav.sectionOperations")}</p>
          <h1 id="tech-ticket-title">{ticket.title}</h1>
          <p>{ticket.description}</p>
        </div>
        <div className="demo-ticket-detail-badges">
          <span className={`demo-priority-marker demo-priority-marker-${getPriorityTone(ticket.priority)}`}>{ticket.priority}</span>
          <span className={`demo-state-pill demo-state-pill-${getStateTone(ticket.state)}`}><span />{getStateLabel(ticket.state, locale)}</span>
        </div>
      </section>
      <section className="demo-tech-detail-grid">
        <article className="demo-ticket-detail-card">
          <p className="demo-section-label">{t("requester.detail.assignedToLabel")}</p>
          <LiveTimer ticket={ticket} />
          <dl className="demo-ticket-facts">
            <div><dt>{t("requester.detail.categoryLabel")}</dt><dd>{phase.categoryLabel}</dd></div>
            <div><dt>Tenant</dt><dd>{ticket.tenantId.slice(0, 8)}…</dd></div>
            <div><dt>Solicitante</dt><dd><code>{ticket.requesterId.slice(0, 8)}…</code></dd></div>
            <div><dt>{t("requester.detail.assignedToLabel")}</dt><dd>{ticket.assignedTo ? ticket.assignedTo.slice(0, 8) + "…" : t("requester.detail.noAssignee")}</dd></div>
            <div><dt>{t("requester.detail.createdAtLabel")}</dt><dd><time dateTime={ticket.createdAt}>{formatDateTime(ticket.createdAt, locale)}</time></dd></div>
            <div><dt>Actualizado</dt><dd><time dateTime={ticket.updatedAt}>{formatDateTime(ticket.updatedAt, locale)}</time></dd></div>
            <div><dt>SLA</dt><dd>{ticket.slaStatus}</dd></div>
          </dl>
          <div className="demo-assign-block">
            <label htmlFor="assign-select">{t("tech.detail.reassign")}</label>
            <div className="demo-assign-controls">
              <select
                id="assign-select"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                disabled={assigning}
              >
                <option value="">{t("requester.detail.noAssignee")}</option>
                {phase.members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.user_id.slice(0, 8)}… · {member.functional_role}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="demo-secondary-button"
                disabled={assigning || !assigneeId || assigneeId === ticket.assignedTo}
                onClick={() => void applyAssign(assigneeId)}
              >
                {assigning ? t("tech.detail.assigning") : t("tech.detail.assignAction")}
              </button>
            </div>
            {assignError ? <p className="demo-form-error" role="alert">{assignError}</p> : null}
          </div>
        </article>
        <article className="demo-ticket-detail-card">
          <p className="demo-section-label">{t("tech.detail.transitionSection")}</p>
          <h2>{t("tech.detail.transitionSection")}</h2>
          <p className="demo-action-copy">POST /api/tickets/{ticket.id.slice(0, 8)}…/transitions</p>
          {transitionError ? <p className="demo-form-error" role="alert">{transitionError}</p> : null}
          <div className="demo-status-actions">
            {operations.map((operation) => (
              <button
                className={ticket.state === operation.state ? "demo-status-action-active" : "demo-status-action"}
                disabled={ticket.state === operation.state || pending !== null}
                key={operation.state}
                type="button"
                onClick={() => void applyTransition(operation.state)}
              >
                {pending === operation.state ? t("tech.detail.transitioning") : operation.label}
              </button>
            ))}
          </div>
        </article>
      </section>
      <CommentsThread ticketId={ticket.id} allowInternal={true} />
      <AttachmentsList ticketId={ticket.id} tenantId={ticket.tenantId} />
    </div>
  );
}
