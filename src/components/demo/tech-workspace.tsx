"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { mockPriorities, mockTicketStates } from "@/mock/deskwork-data";
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
import type { TicketState, TicketPriority } from "@/modules/ticketing/types";

function durationFromMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function getStateLabel(state: TicketState): string {
  return mockTicketStates.find((s) => s.code === state)?.label ?? state;
}

function getStateTone(state: TicketState): string {
  return mockTicketStates.find((s) => s.code === state)?.visualTone ?? "info";
}

function getPriorityTone(priority: TicketPriority): string {
  return mockPriorities.find((p) => p.code === priority)?.visualTone ?? "info";
}

export function LiveTimer({ ticket, compact = false }: { ticket: Ticket; compact?: boolean }) {
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
      {durationFromMs(now - created)}
      {!compact ? <small> total · tenant {ticket.tenantId.slice(0, 8)}…</small> : null}
    </span>
  );
}

// =====================================================================
// TechDashboard
// =====================================================================

export function TechDashboard() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listTickets("assigned");
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error.reason ?? "Error");
        return;
      }
      setTickets(result.data.tickets);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="demo-tech-page">
        <section className="demo-page-heading" aria-labelledby="tech-title">
          <p className="demo-eyebrow">Operación</p>
          <h1 id="tech-title">No pudimos cargar tu cola.</h1>
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
          <p className="demo-eyebrow">Operación</p>
          <h1 id="tech-title">Panel técnico</h1>
          <p>Cola personal · tickets asignados a tu cuenta</p>
        </div>
        <Link className="demo-primary-action" href="/tech/tickets">Ver cola de trabajo</Link>
      </section>
      <section className="demo-summary-grid" aria-label="Resumen técnico">
        <article className="demo-summary-card demo-summary-card-emphasis">
          <p>Activas</p>
          <strong>{active.length}</strong>
          <span>En tu cola</span>
        </article>
        <article className="demo-summary-card">
          <p>En proceso</p>
          <strong>{active.filter((t) => t.state === "EN_PROCESO").length}</strong>
          <span>Atención en curso</span>
        </article>
        <article className="demo-summary-card">
          <p>En riesgo</p>
          <strong>{atRisk.length}</strong>
          <span>Requieren foco</span>
        </article>
        <article className="demo-summary-card">
          <p>Resueltas</p>
          <strong>{assigned.filter((t) => t.state === "RESUELTO" || t.state === "CERRADO").length}</strong>
          <span>En tu historial</span>
        </article>
      </section>
      <section className="demo-tech-focus-card">
        <div>
          <p className="demo-section-label">Siguiente prioridad</p>
          <h2>{active[0]?.title ?? "No hay solicitudes activas"}</h2>
          <p>{active[0] ? `${active[0].id.slice(0, 8)}… · ${active[0].priority}` : "La cola está al día."}</p>
        </div>
        {active[0] ? <Link className="demo-primary-link" href={`/tech/tickets/${active[0].id}`}>Abrir solicitud</Link> : null}
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
        setPhase({ kind: "error", reason: categoriesResult.error.reason ?? "Error", kind_: categoriesResult.error.kind });
        return;
      }
      if (!ticketsResult.ok) {
        setPhase({ kind: "error", reason: ticketsResult.error.reason ?? "Error", kind_: ticketsResult.error.kind });
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
  }, []);

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
            <p className="demo-eyebrow">Operación</p>
            <h1 id="queue-title">Necesitás iniciar sesión con un rol técnico.</h1>
            <p className="demo-page-description">{phase.reason}</p>
          </section>
          <div className="demo-history-card-heading" style={{ padding: "1rem" }}>
            <Link className="demo-primary-link" href="/login?next=/tech/tickets">Iniciar sesión</Link>
          </div>
        </div>
      );
    }
    return (
      <div className="demo-tech-page">
        <section className="demo-page-heading" aria-labelledby="queue-title">
          <p className="demo-eyebrow">Operación</p>
          <h1 id="queue-title">No pudimos cargar la cola.</h1>
          <p className="demo-page-description">{phase.reason}</p>
        </section>
      </div>
    );
  }

  const categoryById = new Map(phase.categories.map((c) => [c.id, c]));

  return (
    <div className="demo-tech-page">
      <section className="demo-page-heading" aria-labelledby="queue-title">
        <p className="demo-eyebrow">Operación</p>
        <h1 id="queue-title">Cola de trabajo</h1>
        <p className="demo-page-description">Tickets visibles en tu tenant · datos desde Supabase real.</p>
      </section>
      <section className="demo-queue-card">
        <div className="demo-queue-heading">
          <div>
            <p className="demo-section-label">Solicitudes</p>
            <h2>{queue.length} en la vista</h2>
          </div>
          <div className="demo-queue-filters">
            <label>Estado
              <select value={stateFilter} onChange={(event) => { setPage(1); setStateFilter(event.target.value as TicketState | "ALL"); }}>
                <option value="ALL">Todos</option>
                {mockTicketStates.map((state) => <option value={state.code} key={state.code}>{state.label}</option>)}
              </select>
            </label>
            <label>Prioridad
              <select value={priorityFilter} onChange={(event) => { setPage(1); setPriorityFilter(event.target.value as TicketPriority | "ALL"); }}>
                <option value="ALL">Todas</option>
                {mockPriorities.map((priority) => <option value={priority.code} key={priority.code}>{priority.code}</option>)}
              </select>
            </label>
            <label>Categoría
              <select value={categoryFilter} onChange={(event) => { setPage(1); setCategoryFilter(event.target.value); }}>
                <option value="ALL">Todas</option>
                {phase.categories.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}
              </select>
            </label>
            <label>Sin asignar
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
                    <th><button className="demo-table-sort" type="button" onClick={() => updateSort("priority")} aria-label={`Ordenar por prioridad ${sortKey === "priority" && sortDirection === "asc" ? "descendente" : "ascendente"}`}>Prioridad <span aria-hidden="true">{sortKey === "priority" ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span></button></th>
                    <th>Solicitud</th>
                    <th>Estado</th>
                    <th>Asignado</th>
                    <th><button className="demo-table-sort" type="button" onClick={() => updateSort("updatedAt")} aria-label={`Ordenar por actualización ${sortKey === "updatedAt" && sortDirection === "asc" ? "descendente" : "ascendente"}`}>Actualizada <span aria-hidden="true">{sortKey === "updatedAt" ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span></button></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTickets.map((ticket) => {
                    const category = categoryById.get(ticket.categoryId);
                    return (
                      <tr key={ticket.id}>
                        <td><span className={`demo-priority-marker demo-priority-marker-${getPriorityTone(ticket.priority)}`}>{ticket.priority}</span></td>
                        <td><Link href={`/tech/tickets/${ticket.id}`}><strong>{ticket.title}</strong><span>{ticket.id.slice(0, 8)}… · {category?.label ?? "(sin categoría)"}</span></Link></td>
                        <td><span className={`demo-state-pill demo-state-pill-${getStateTone(ticket.state)}`}><span />{getStateLabel(ticket.state)}</span></td>
                        <td>{ticket.assignedTo ? ticket.assignedTo.slice(0, 8) + "…" : "Sin asignar"}</td>
                        <td>
                          <time dateTime={ticket.updatedAt}>
                            {new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" }).format(new Date(ticket.updatedAt))}
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
            <nav className="demo-pagination" aria-label="Paginación de solicitudes">
              <span>Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, queue.length)} de {queue.length}</span>
              <div>
                <button className="demo-secondary-button" type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</button>
                <span aria-live="polite">Página {page} de {pageCount}</span>
                <button className="demo-secondary-button" type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
              </div>
            </nav>
          </>
        ) : (
          <DemoEmptyState
            title="No hay tickets que coincidan con los filtros."
            description="Ajustá los filtros o esperá nuevas solicitudes."
          />
        )}
      </section>
    </div>
  );
}

// =====================================================================
// TechTicketDetail
// =====================================================================

const operations: readonly { state: TicketState; label: string }[] = [
  { state: "EN_PROCESO", label: "Iniciar atención" },
  { state: "ESPERANDO_USUARIO", label: "Esperando usuario" },
  { state: "ESCALADO", label: "Escalar" },
  { state: "RESUELTO", label: "Resolver" },
  { state: "CERRADO", label: "Cerrar" },
];

type TechDetailPhase =
  | { kind: "loading" }
  | { kind: "error"; reason: string; kind_: ClientApiError["kind"]; status?: number }
  | { kind: "ready"; ticket: Ticket; categoryLabel: string; members: TenantMember[] };

export function TechTicketDetail({ ticketId }: { ticketId: string }) {
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
          reason: ticketResult.error.reason ?? "Error",
          kind_: ticketResult.error.kind,
          status: ticketResult.error.kind === "http" ? ticketResult.error.status : undefined,
        });
        return;
      }
      const categoryLabel = categoriesResult.ok
        ? categoriesResult.data.categories.find((c) => c.id === ticketResult.data.ticket.categoryId)?.label ?? "(sin categoría)"
        : "(sin categoría)";
      const members = membersResult.ok ? membersResult.data.members : [];
      setPhase({ kind: "ready", ticket: ticketResult.data.ticket, categoryLabel, members });
      setAssigneeId(ticketResult.data.ticket.assignedTo ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  async function applyAssign(target: string) {
    if (assigning) return;
    setAssigning(true);
    setAssignError(undefined);
    const result = await assignTicket(ticketId, target);
    setAssigning(false);
    if (!result.ok) {
      setAssignError(result.error.reason ?? "Error al asignar");
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
      setTransitionError(result.error.reason ?? "Error");
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
          <h1>Solicitud no disponible</h1>
          <p>El identificador no corresponde a un ticket visible para tu cuenta.</p>
          <Link className="demo-primary-link" href="/tech/tickets">Volver a la cola</Link>
        </div>
      );
    }
    if (phase.kind_ === "forbidden") {
      return (
        <div className="demo-page">
          <h1>No autorizado</h1>
          <p>{phase.reason}</p>
          <Link className="demo-primary-link" href="/login?next=/tech/tickets">Iniciar sesión</Link>
        </div>
      );
    }
    return (
      <div className="demo-page">
        <h1>Error cargando la solicitud</h1>
        <p>{phase.reason}</p>
        <Link className="demo-primary-link" href="/tech/tickets">Volver a la cola</Link>
      </div>
    );
  }

  const ticket = phase.ticket;
  return (
    <div className="demo-tech-page">
      <Link className="demo-back-link" href="/tech/tickets">← Volver a la cola</Link>
      <section className="demo-ticket-detail-heading" aria-labelledby="tech-ticket-title">
        <div>
          <p className="demo-eyebrow">{ticket.id.slice(0, 8)}… · Operación técnica</p>
          <h1 id="tech-ticket-title">{ticket.title}</h1>
          <p>{ticket.description}</p>
        </div>
        <div className="demo-ticket-detail-badges">
          <span className={`demo-priority-marker demo-priority-marker-${getPriorityTone(ticket.priority)}`}>{ticket.priority}</span>
          <span className={`demo-state-pill demo-state-pill-${getStateTone(ticket.state)}`}><span />{getStateLabel(ticket.state)}</span>
        </div>
      </section>
      <section className="demo-tech-detail-grid">
        <article className="demo-ticket-detail-card">
          <p className="demo-section-label">Atención</p>
          <LiveTimer ticket={ticket} />
          <dl className="demo-ticket-facts">
            <div><dt>Categoría</dt><dd>{phase.categoryLabel}</dd></div>
            <div><dt>Tenant</dt><dd>{ticket.tenantId.slice(0, 8)}…</dd></div>
            <div><dt>Asignado</dt><dd>{ticket.assignedTo ? ticket.assignedTo.slice(0, 8) + "…" : "Sin asignar"}</dd></div>
            <div><dt>SLA</dt><dd>{ticket.slaStatus}</dd></div>
          </dl>
          <div className="demo-assign-block">
            <label htmlFor="assign-select">Reasignar a</label>
            <div className="demo-assign-controls">
              <select
                id="assign-select"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                disabled={assigning}
              >
                <option value="">Sin asignar</option>
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
                {assigning ? "Asignando…" : "Aplicar"}
              </button>
            </div>
            {assignError ? <p className="demo-form-error" role="alert">{assignError}</p> : null}
          </div>
        </article>
        <article className="demo-ticket-detail-card">
          <p className="demo-section-label">Acciones</p>
          <h2>Cambiar estado</h2>
          <p className="demo-action-copy">Cada acción invoca <code>POST /api/tickets/{ticket.id.slice(0, 8)}…/transitions</code> y persiste en Supabase real.</p>
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
                {pending === operation.state ? "Aplicando…" : operation.label}
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
