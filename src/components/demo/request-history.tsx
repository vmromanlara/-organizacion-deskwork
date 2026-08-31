"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { mockPriorities, mockTicketStates } from "@/mock/deskwork-data";
import { DemoEmptyState, DemoLoadingState } from "./demo-feedback-state";
import { listTicketCategories, listTickets } from "@/modules/ticketing/client-api";
import type { ClientApiError } from "@/modules/ticketing/client-api";
import type { Ticket, TicketCategory } from "@/modules/ticketing/repository";
import type { TicketState, TicketPriority } from "@/modules/ticketing/types";

function date(value: string) {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" }).format(new Date(value));
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

type Phase =
  | { kind: "loading" }
  | { kind: "error"; reason: string; kind_: ClientApiError["kind"] }
  | { kind: "ready"; tickets: Ticket[]; categories: TicketCategory[] };

export function RequestHistory() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [categoriesResult, ticketsResult] = await Promise.all([
        listTicketCategories(),
        listTickets("mine"),
      ]);
      if (cancelled) return;
      if (!categoriesResult.ok) {
        setPhase({ kind: "error", reason: categoriesResult.error.reason ?? "Error cargando categorías", kind_: categoriesResult.error.kind });
        return;
      }
      if (!ticketsResult.ok) {
        setPhase({ kind: "error", reason: ticketsResult.error.reason ?? "Error cargando tickets", kind_: ticketsResult.error.kind });
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

  if (phase.kind === "loading") {
    return <DemoLoadingState />;
  }

  if (phase.kind === "error") {
    if (phase.kind_ === "forbidden") {
      return (
        <div className="demo-history-page">
          <section className="demo-page-heading" aria-labelledby="history-title">
            <p className="demo-eyebrow">Solicitudes</p>
            <h1 id="history-title">Necesitás iniciar sesión.</h1>
            <p className="demo-page-description">{phase.reason}</p>
          </section>
          <div className="demo-history-card-heading" style={{ padding: "1rem" }}>
            <Link className="demo-primary-link" href="/login?next=/tickets">Iniciar sesión</Link>
          </div>
        </div>
      );
    }
    return (
      <div className="demo-history-page">
        <section className="demo-page-heading" aria-labelledby="history-title">
          <p className="demo-eyebrow">Solicitudes</p>
          <h1 id="history-title">No pudimos cargar tu historial.</h1>
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
        <p className="demo-eyebrow">Solicitudes</p>
        <h1 id="history-title">Mi historial</h1>
        <p className="demo-page-description">Solicitudes registradas en DeskWork para tu cuenta.</p>
      </section>
      <section className="demo-history-card" aria-label="Historial de solicitudes">
        <div className="demo-history-card-heading">
          <div>
            <p className="demo-section-label">Historial</p>
            <h2>{tickets.length} solicitudes registradas</h2>
          </div>
          <Link className="demo-primary-link" href="/tickets/new">Crear solicitud</Link>
        </div>
        {tickets.length ? (
          <div className="demo-history-table-wrap">
            <table className="demo-history-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Solicitud</th>
                  <th>Estado</th>
                  <th>Actualizada</th>
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
                          <span>{ticket.id.slice(0, 8)}… · {category?.label ?? "(sin categoría)"}</span>
                        </Link>
                      </td>
                      <td>
                        <span className={`demo-state-pill demo-state-pill-${getStateTone(ticket.state)}`}>
                          <span />{getStateLabel(ticket.state)}
                        </span>
                      </td>
                      <td>
                        <time dateTime={ticket.updatedAt}>{date(ticket.updatedAt)}</time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <DemoEmptyState
            title="Aún no tienes solicitudes."
            description="Cuando registres una solicitud, podrás revisar aquí su estado y seguimiento."
            actionHref="/tickets/new"
            actionLabel="Crear solicitud"
          />
        )}
      </section>
    </div>
  );
}
