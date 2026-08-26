import Link from "next/link";
import {
  getMockUser,
  mockCategories,
  mockPriorities,
  mockTickets,
  mockTicketStates,
  type MockTicket,
} from "@/mock/deskwork-data";

const DEMO_REQUESTER_ID = "user-valentina-morales";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

function getCategoryLabel(categoryId: string): string {
  return mockCategories.find((category) => category.id === categoryId)?.label ?? "Sin categoría";
}

function getPriority(ticket: MockTicket) {
  return mockPriorities.find((priority) => priority.code === ticket.priority);
}

function getState(ticket: MockTicket) {
  return mockTicketStates.find((state) => state.code === ticket.state);
}

export default function DashboardPage() {
  const requester = getMockUser(DEMO_REQUESTER_ID);
  const requesterTickets = [...mockTickets]
    .filter((ticket) => ticket.requesterId === DEMO_REQUESTER_ID)
    .sort((first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime());
  const activeTickets = requesterTickets.filter((ticket) => ticket.state !== "RESUELTO" && ticket.state !== "CERRADO");
  const resolvedTickets = requesterTickets.filter((ticket) => ticket.state === "RESUELTO" || ticket.state === "CERRADO");

  return (
    <div className="demo-dashboard">
      <section className="demo-dashboard-hero" aria-labelledby="dashboard-title">
        <div>
          <p className="demo-eyebrow">Solicitudes</p>
          <h1 id="dashboard-title">Hola, {requester?.name.split(" ")[0] ?? "Valentina"}.</h1>
          <p>Revisa tus solicitudes o registra una nueva necesidad de soporte.</p>
        </div>
        <Link className="demo-primary-action" href="/tickets/new">
          <span aria-hidden="true">+</span>
          Crear solicitud
        </Link>
      </section>

      <section className="demo-summary-grid" aria-label="Resumen de solicitudes">
        <article className="demo-summary-card">
          <p>Solicitudes totales</p>
          <strong>{requesterTickets.length}</strong>
          <span>Historial disponible</span>
        </article>
        <article className="demo-summary-card demo-summary-card-emphasis">
          <p>Activas</p>
          <strong>{activeTickets.length}</strong>
          <span>Requieren seguimiento</span>
        </article>
        <article className="demo-summary-card">
          <p>En proceso</p>
          <strong>{requesterTickets.filter((ticket) => ticket.state === "EN_PROCESO").length}</strong>
          <span>Atendidas por soporte</span>
        </article>
        <article className="demo-summary-card">
          <p>Resueltas</p>
          <strong>{resolvedTickets.length}</strong>
          <span>En tu historial</span>
        </article>
      </section>

      <section className="demo-ticket-list-card" aria-labelledby="recent-tickets-title">
        <div className="demo-ticket-list-heading">
          <div>
            <p className="demo-section-label">Seguimiento</p>
            <h2 id="recent-tickets-title">Tus últimas solicitudes</h2>
          </div>
          <span>{requesterTickets.length} registradas</span>
        </div>

        <div className="demo-ticket-list" role="list">
          {requesterTickets.map((ticket) => {
            const priority = getPriority(ticket);
            const state = getState(ticket);

            return (
              <Link className="demo-ticket-row" href={`/tickets/${ticket.id}`} key={ticket.id} role="listitem">
                <div className="demo-ticket-identification">
                  <span className={`demo-priority-marker demo-priority-marker-${priority?.visualTone ?? "info"}`} aria-label={`Prioridad ${ticket.priority}`}>
                    {ticket.priority}
                  </span>
                  <div>
                    <h3>{ticket.title}</h3>
                    <p>{ticket.id} · {getCategoryLabel(ticket.categoryId)}</p>
                  </div>
                </div>
                <div className="demo-ticket-row-meta">
                  <span className={`demo-state-pill demo-state-pill-${state?.visualTone ?? "info"}`}>
                    <span aria-hidden="true" />
                    {state?.label ?? ticket.state}
                  </span>
                  <time dateTime={ticket.updatedAt}>Actualizado {formatDate(ticket.updatedAt)}</time>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
