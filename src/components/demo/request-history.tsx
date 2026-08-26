"use client";

import Link from "next/link";
import { getMockUser, mockCategories, mockPriorities, mockTicketStates } from "@/mock/deskwork-data";
import { DemoEmptyState } from "./demo-feedback-state";
import { useDemoState } from "./demo-state";

const requesterId = "user-valentina-morales";

function date(value: string) {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" }).format(new Date(value));
}

export function RequestHistory() {
  const requester = getMockUser(requesterId);
  const { tickets: allTickets } = useDemoState();
  const tickets = allTickets.filter((ticket) => ticket.requesterId === requesterId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return <div className="demo-history-page">
    <section className="demo-page-heading" aria-labelledby="history-title">
      <p className="demo-eyebrow">Solicitudes</p>
      <h1 id="history-title">Mi historial</h1>
      <p className="demo-page-description">Todas las solicitudes asociadas a {requester?.name ?? "la persona solicitante"} en esta demo local.</p>
    </section>
    <section className="demo-history-card" aria-label="Historial de solicitudes">
      <div className="demo-history-card-heading"><div><p className="demo-section-label">Historial</p><h2>{tickets.length} solicitudes registradas</h2></div><Link className="demo-primary-link" href="/tickets/new">Crear solicitud</Link></div>
      {tickets.length ? <div className="demo-history-table-wrap"><table className="demo-history-table"><thead><tr><th>ID</th><th>Solicitud</th><th>Estado</th><th>Actualizada</th></tr></thead><tbody>{tickets.map((ticket) => {
        const category = mockCategories.find((item) => item.id === ticket.categoryId);
        const priority = mockPriorities.find((item) => item.code === ticket.priority);
        const state = mockTicketStates.find((item) => item.code === ticket.state);
        return <tr key={ticket.id}><td><span className={`demo-priority-marker demo-priority-marker-${priority?.visualTone ?? "info"}`}>{ticket.priority}</span></td><td><Link href={`/tickets/${ticket.id}`}><strong>{ticket.title}</strong><span>{ticket.id} · {category?.label}</span></Link></td><td><span className={`demo-state-pill demo-state-pill-${state?.visualTone ?? "info"}`}><span />{state?.label}</span></td><td><time dateTime={ticket.updatedAt}>{date(ticket.updatedAt)}</time></td></tr>;
      })}</tbody></table></div> : <DemoEmptyState title="Aún no tienes solicitudes." description="Cuando registres una solicitud, podrás revisar aquí su estado y seguimiento." actionHref="/tickets/new" actionLabel="Crear solicitud" />}
    </section>
  </div>;
}
