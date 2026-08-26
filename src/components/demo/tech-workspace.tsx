"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMockUser, mockCategories, mockPriorities, mockTechnicians, mockTicketStates, type MockTicket, type MockTicketState } from "@/mock/deskwork-data";
import { DemoEmptyState, DemoLoadingState } from "./demo-feedback-state";
import { useDemoState } from "./demo-state";

const technicianId = "user-carmen-vidal";

function duration(minutes: number) { const hours = Math.floor(minutes / 60); return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`; }
function ticketMetadata(ticket: MockTicket) { return { category: mockCategories.find((item) => item.id === ticket.categoryId), priority: mockPriorities.find((item) => item.code === ticket.priority), state: mockTicketStates.find((item) => item.code === ticket.state), requester: getMockUser(ticket.requesterId), technician: ticket.technicianId ? getMockUser(ticket.technicianId) : undefined }; }
function ClockIcon() { return <svg aria-hidden="true" className="demo-clock-icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.25 2" /></svg>; }

export function LiveTimer({ ticket, compact = false }: { ticket: MockTicket; compact?: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => window.clearInterval(interval); }, []);
  const total = ticket.timing.totalMinutes * 60 + seconds;
  const minutes = Math.floor(total / 60);
  return <span className={`demo-live-timer ${compact ? "demo-live-timer-compact" : ""}`}><ClockIcon />{duration(minutes)}{!compact ? <small> total · trabajo {duration(ticket.timing.effectiveWorkMinutes)} · espera {duration(ticket.timing.awaitingUserMinutes)}</small> : null}</span>;
}

export function TechDashboard() {
  const { tickets } = useDemoState();
  const assigned = tickets.filter((ticket) => ticket.technicianId === technicianId);
  const active = assigned.filter((ticket) => !["RESUELTO", "CERRADO"].includes(ticket.state));
  const atRisk = active.filter((ticket) => ticket.timing.slaStatus === "at_risk" || ticket.timing.slaStatus === "overdue");
  return <div className="demo-tech-page"><section className="demo-dashboard-hero" aria-labelledby="tech-title"><div><p className="demo-eyebrow">Operación</p><h1 id="tech-title">Panel técnico</h1><p>Cola personal de Carmen Vidal · soporte TI</p></div><Link className="demo-primary-action" href="/tech/tickets">Ver cola de trabajo</Link></section>
    <section className="demo-summary-grid" aria-label="Resumen técnico"><article className="demo-summary-card demo-summary-card-emphasis"><p>Activas</p><strong>{active.length}</strong><span>En tu cola</span></article><article className="demo-summary-card"><p>En proceso</p><strong>{active.filter((ticket) => ticket.state === "EN_PROCESO").length}</strong><span>Atención en curso</span></article><article className="demo-summary-card"><p>En riesgo</p><strong>{atRisk.length}</strong><span>Requieren foco</span></article><article className="demo-summary-card"><p>Resueltas</p><strong>{assigned.filter((ticket) => ticket.state === "RESUELTO" || ticket.state === "CERRADO").length}</strong><span>En tu historial</span></article></section>
    <section className="demo-tech-focus-card"><div><p className="demo-section-label">Siguiente prioridad</p><h2>{active[0]?.title ?? "No hay solicitudes activas"}</h2><p>{active[0] ? `${active[0].id} · ${ticketMetadata(active[0]).requester?.name ?? "Solicitante"}` : "La cola está al día."}</p></div>{active[0] ? <Link className="demo-primary-link" href={`/tech/tickets/${active[0].id}`}>Abrir solicitud</Link> : null}</section>
  </div>;
}

export function TechQueue() {
  const { tickets } = useDemoState();
  const [stateFilter, setStateFilter] = useState<MockTicketState | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [technicianFilter, setTechnicianFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<"priority" | "updatedAt">("priority");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const queue = useMemo(() => tickets.filter((ticket) => (
    (stateFilter === "ALL" || ticket.state === stateFilter)
    && (priorityFilter === "ALL" || ticket.priority === priorityFilter)
    && (categoryFilter === "ALL" || ticket.categoryId === categoryFilter)
    && (technicianFilter === "ALL" || (technicianFilter === "UNASSIGNED" ? !ticket.technicianId : ticket.technicianId === technicianFilter))
  )).sort((a, b) => {
    const comparison = sortKey === "priority" ? a.priority.localeCompare(b.priority) : new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    return sortDirection === "asc" ? comparison : -comparison;
  }), [categoryFilter, priorityFilter, sortDirection, sortKey, stateFilter, technicianFilter, tickets]);
  const pageCount = Math.max(1, Math.ceil(queue.length / pageSize));
  const visibleTickets = queue.slice((page - 1) * pageSize, page * pageSize);
  function updateSort(nextKey: "priority" | "updatedAt") {
    setPage(1);
    if (sortKey === nextKey) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortKey(nextKey); setSortDirection("asc"); }
  }
  return <div className="demo-tech-page"><section className="demo-page-heading" aria-labelledby="queue-title"><p className="demo-eyebrow">Operación</p><h1 id="queue-title">Cola de trabajo</h1><p className="demo-page-description">Prioriza, revisa y atiende solicitudes desde datos locales de la maqueta.</p></section>
    <section className="demo-queue-card"><div className="demo-queue-heading"><div><p className="demo-section-label">Solicitudes</p><h2>{queue.length} en la vista</h2></div><div className="demo-queue-filters"><label>Estado<select value={stateFilter} onChange={(event) => { setPage(1); setStateFilter(event.target.value as MockTicketState | "ALL"); }}><option value="ALL">Todos</option>{mockTicketStates.map((state) => <option value={state.code} key={state.code}>{state.label}</option>)}</select></label><label>Prioridad<select value={priorityFilter} onChange={(event) => { setPage(1); setPriorityFilter(event.target.value); }}><option value="ALL">Todas</option>{mockPriorities.map((priority) => <option value={priority.code} key={priority.code}>{priority.code}</option>)}</select></label><label>Categoría<select value={categoryFilter} onChange={(event) => { setPage(1); setCategoryFilter(event.target.value); }}><option value="ALL">Todas</option>{mockCategories.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}</select></label><label>Asignado<select value={technicianFilter} onChange={(event) => { setPage(1); setTechnicianFilter(event.target.value); }}><option value="ALL">Todos</option><option value="UNASSIGNED">Sin asignar</option>{mockTechnicians.map((technician) => <option value={technician.userId} key={technician.userId}>{getMockUser(technician.userId)?.name}</option>)}</select></label></div></div>
      {queue.length ? <><div className="demo-queue-table-wrap"><table className="demo-queue-table"><thead><tr><th><button className="demo-table-sort" type="button" onClick={() => updateSort("priority")} aria-label={`Ordenar por prioridad ${sortKey === "priority" && sortDirection === "asc" ? "descendente" : "ascendente"}`}>Prioridad <span aria-hidden="true">{sortKey === "priority" ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span></button></th><th>Solicitud</th><th>Estado</th><th>Técnico</th><th><button className="demo-table-sort" type="button" onClick={() => updateSort("updatedAt")} aria-label={`Ordenar por actualización ${sortKey === "updatedAt" && sortDirection === "asc" ? "descendente" : "ascendente"}`}>Actualizada <span aria-hidden="true">{sortKey === "updatedAt" ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span></button></th></tr></thead><tbody>{visibleTickets.map((ticket) => { const meta = ticketMetadata(ticket); return <tr key={ticket.id}><td><span className={`demo-priority-marker demo-priority-marker-${meta.priority?.visualTone ?? "info"}`}>{ticket.priority}</span></td><td><Link href={`/tech/tickets/${ticket.id}`}><strong>{ticket.title}</strong><span>{ticket.id} · {meta.category?.label}</span></Link></td><td><span className={`demo-state-pill demo-state-pill-${meta.state?.visualTone ?? "info"}`}><span />{meta.state?.label}</span></td><td>{meta.technician?.name ?? "Sin asignar"}</td><td><time dateTime={ticket.updatedAt}>{new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" }).format(new Date(ticket.updatedAt))}<br /><LiveTimer ticket={ticket} compact /></time></td></tr>; })}</tbody></table></div><nav className="demo-pagination" aria-label="Paginación de solicitudes"><span>Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, queue.length)} de {queue.length}</span><div><button className="demo-secondary-button" type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span aria-live="polite">Página {page} de {pageCount}</span><button className="demo-secondary-button" type="button" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Siguiente</button></div></nav></> : <DemoEmptyState title="No hay solicitudes con estos filtros." description="Prueba con otra combinación de estado, prioridad, categoría o asignación." />}</section>
  </div>;
}

const operations: readonly { state: MockTicketState; label: string }[] = [{ state: "EN_PROCESO", label: "Iniciar atención" }, { state: "ESPERANDO_USUARIO", label: "Esperando usuario" }, { state: "ESCALADO", label: "Escalar" }, { state: "RESUELTO", label: "Resolver" }, { state: "CERRADO", label: "Cerrar" }];

export function TechTicketDetail({ ticketId }: { ticketId: string }) {
  const { isHydrated, tickets, events, changeTicketState } = useDemoState();
  if (!isHydrated) return <DemoLoadingState />;
  const ticket = tickets.find((candidate) => candidate.id === ticketId);
  if (!ticket) return <div className="demo-page"><h1>Solicitud no disponible</h1><Link className="demo-primary-link" href="/tech/tickets">Volver a la cola</Link></div>;
  const meta = ticketMetadata(ticket); const history = [...events].filter((event) => event.ticketId === ticket.id).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return <div className="demo-tech-page"><Link className="demo-back-link" href="/tech/tickets">← Volver a la cola</Link><section className="demo-ticket-detail-heading" aria-labelledby="tech-ticket-title"><div><p className="demo-eyebrow">{ticket.id} · Operación técnica</p><h1 id="tech-ticket-title">{ticket.title}</h1><p>{ticket.description}</p></div><div className="demo-ticket-detail-badges"><span className={`demo-priority-marker demo-priority-marker-${meta.priority?.visualTone ?? "info"}`}>{ticket.priority}</span><span className={`demo-state-pill demo-state-pill-${meta.state?.visualTone ?? "info"}`}><span />{meta.state?.label}</span></div></section>
    <section className="demo-tech-detail-grid"><article className="demo-ticket-detail-card"><p className="demo-section-label">Atención</p><LiveTimer ticket={ticket} /><dl className="demo-ticket-facts"><div><dt>Solicitante</dt><dd>{meta.requester?.name}</dd></div><div><dt>Área</dt><dd>{meta.requester?.department}</dd></div><div><dt>Categoría</dt><dd>{meta.category?.label}</dd></div><div><dt>Técnico</dt><dd>{meta.technician?.name ?? "Sin asignar"}</dd></div></dl></article><article className="demo-ticket-detail-card"><p className="demo-section-label">Acciones locales</p><h2>Cambiar estado</h2><p className="demo-action-copy">Las acciones sólo actualizan el estado en memoria para este recorrido de demo.</p><div className="demo-status-actions">{operations.map((operation) => <button className={ticket.state === operation.state ? "demo-status-action-active" : "demo-status-action"} disabled={ticket.state === operation.state} key={operation.state} type="button" onClick={() => changeTicketState(ticket.id, operation.state)}>{operation.label}</button>)}</div></article></section>
    <section className="demo-ticket-history-card" aria-labelledby="tech-history-title"><div className="demo-ticket-history-heading"><div><p className="demo-section-label">Registro local</p><h2 id="tech-history-title">Historial de atención</h2></div><span>{history.length} eventos</span></div><ol className="demo-ticket-history-list">{history.map((event) => <li key={event.id}><span /><div><p>{event.summary}</p><time dateTime={event.occurredAt}>{new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "America/Santiago" }).format(new Date(event.occurredAt))}</time></div></li>)}</ol></section>
  </div>;
}
