"use client";

import Link from "next/link";
import { getMockUser, mockCategories, mockPriorities, mockTicketStates, type MockTicket } from "@/mock/deskwork-data";
import { DemoLoadingState } from "./demo-feedback-state";
import { useDemoState } from "./demo-state";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date(value));
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "Aún no disponible";
  if (minutes === 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours} h ${remainingMinutes} min` : `${remainingMinutes} min`;
}

function getCategoryLabel(categoryId: string): string {
  return mockCategories.find((category) => category.id === categoryId)?.label ?? "Sin categoría";
}

function getPriority(ticket: MockTicket) {
  return mockPriorities.find((priority) => priority.code === ticket.priority);
}

export function RequesterTicketDetail({ ticketId }: { ticketId: string }) {
  const { events, isHydrated, tickets } = useDemoState();
  if (!isHydrated) return <DemoLoadingState />;
  const ticket = tickets.find((candidate) => candidate.id === ticketId);

  if (!ticket) {
    return <div className="demo-page"><section className="demo-page-heading" aria-labelledby="ticket-not-found-title"><p className="demo-eyebrow">Solicitud</p><h1 id="ticket-not-found-title">No encontramos esta solicitud.</h1><p className="demo-page-description">La ruta no corresponde a una solicitud disponible en los datos mock locales.</p></section><Link className="demo-primary-link demo-ticket-not-found-action" href="/tickets">Volver a mi historial</Link></div>;
  }

  const requester = getMockUser(ticket.requesterId);
  const technician = ticket.technicianId ? getMockUser(ticket.technicianId) : undefined;
  const history = events.filter((event) => event.ticketId === ticket.id).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const priority = getPriority(ticket);
  const state = mockTicketStates.find((definition) => definition.code === ticket.state);
  const hasAttachment = history.some((event) => event.type === "attachment_added");

  return <div className="demo-ticket-detail">
    <section className="demo-ticket-detail-heading" aria-labelledby="ticket-title"><div><p className="demo-eyebrow">{ticket.id} · Solicitud</p><h1 id="ticket-title">{ticket.title}</h1><p>{ticket.description}</p></div><div className="demo-ticket-detail-badges"><span className={`demo-priority-marker demo-priority-marker-${priority?.visualTone ?? "info"}`} aria-label={`Prioridad ${ticket.priority}`}>{ticket.priority}</span><span className={`demo-state-pill demo-state-pill-${state?.visualTone ?? "info"}`}><span aria-hidden="true" />{state?.label ?? ticket.state}</span></div></section>
    <section className="demo-ticket-detail-grid" aria-label="Información de la solicitud"><article className="demo-ticket-detail-card"><p className="demo-section-label">Contexto</p><dl className="demo-ticket-facts"><div><dt>Categoría</dt><dd>{getCategoryLabel(ticket.categoryId)}</dd></div><div><dt>Solicitante</dt><dd>{requester?.name ?? "Usuario no disponible"}</dd></div><div><dt>Área</dt><dd>{requester?.department ?? "No disponible"}</dd></div><div><dt>Técnico</dt><dd>{technician?.name ?? "Sin asignar"}</dd></div><div><dt>Creada</dt><dd><time dateTime={ticket.createdAt}>{formatDate(ticket.createdAt)}</time></dd></div><div><dt>Última actualización</dt><dd><time dateTime={ticket.updatedAt}>{formatDate(ticket.updatedAt)}</time></dd></div></dl></article><article className="demo-ticket-detail-card demo-timer-card"><p className="demo-section-label">Tiempo de atención</p><strong>{formatDuration(ticket.timing.totalMinutes)}</strong><span>Tiempo total desde la creación</span><dl className="demo-timing-breakdown"><div><dt>Primera respuesta</dt><dd>{formatDuration(ticket.timing.firstResponseMinutes)}</dd></div><div><dt>Trabajo efectivo</dt><dd>{formatDuration(ticket.timing.effectiveWorkMinutes)}</dd></div><div><dt>Esperando usuario</dt><dd>{formatDuration(ticket.timing.awaitingUserMinutes)}</dd></div><div><dt>Resolución</dt><dd>{formatDuration(ticket.timing.resolutionMinutes)}</dd></div></dl></article></section>
    <section className="demo-ticket-detail-secondary-grid"><article className="demo-ticket-detail-card"><p className="demo-section-label">Adjuntos</p><h2>{hasAttachment ? "Evidencia disponible" : "Sin adjuntos"}</h2><p>{hasAttachment ? "La maqueta registra una imagen de evidencia asociada a esta solicitud." : "No hay archivos asociados a esta solicitud mock."}</p></article><article className="demo-ticket-detail-card"><p className="demo-section-label">SLA simulado</p><h2>{ticket.timing.slaStatus === "overdue" ? "Vencida" : ticket.timing.slaStatus === "at_risk" ? "En riesgo" : ticket.timing.slaStatus === "met" ? "Cumplida" : "En curso"}</h2><p>Indicador visual local; no existe motor de SLA ni cálculo productivo en esta maqueta.</p></article></section>
    <section className="demo-ticket-history-card" aria-labelledby="ticket-history-title"><div className="demo-ticket-history-heading"><div><p className="demo-section-label">Seguimiento</p><h2 id="ticket-history-title">Historial</h2></div><span>{history.length} eventos</span></div>{history.length ? <ol className="demo-ticket-history-list">{history.map((event) => <li key={event.id}><span aria-hidden="true" /><div><p>{event.summary}</p><time dateTime={event.occurredAt}>{formatDate(event.occurredAt)} · {getMockUser(event.actorId)?.name ?? "Sistema local"}</time></div></li>)}</ol> : <div className="demo-ticket-history-empty">La solicitud simulada aún no tiene eventos adicionales.</div>}</section>
  </div>;
}
