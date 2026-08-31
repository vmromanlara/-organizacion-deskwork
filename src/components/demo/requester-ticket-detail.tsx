"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { mockPriorities, mockTicketStates } from "@/mock/deskwork-data";
import { DemoLoadingState } from "./demo-feedback-state";
import { getTicket, listTicketCategories } from "@/modules/ticketing/client-api";
import type { Ticket, TicketCategory } from "@/modules/ticketing/repository";
import type { TicketState, TicketPriority } from "@/modules/ticketing/types";
import { CommentsThread } from "./comments-thread";
import { AttachmentsList } from "./attachments-list";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date(value));
}

function getCategoryLabel(categories: TicketCategory[], categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.label ?? "(sin categoría)";
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
  | { kind: "error"; reason: string; kind_: string; status?: number }
  | { kind: "ready"; ticket: Ticket; categories: TicketCategory[] };

export function RequesterTicketDetail({ ticketId }: { ticketId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [categoriesResult, ticketResult] = await Promise.all([
        listTicketCategories(),
        getTicket(ticketId),
      ]);
      if (cancelled) return;
      if (!categoriesResult.ok) {
        setPhase({ kind: "error", reason: categoriesResult.error.reason ?? "Error", kind_: categoriesResult.error.kind });
        return;
      }
      if (!ticketResult.ok) {
        setPhase({
          kind: "error",
          reason: ticketResult.error.reason ?? "Error",
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
  }, [ticketId]);

  if (phase.kind === "loading") return <DemoLoadingState />;

  if (phase.kind === "error") {
    if (phase.kind_ === "not_found" || phase.status === 404) {
      return (
        <div className="demo-page">
          <section className="demo-page-heading" aria-labelledby="ticket-not-found-title">
            <p className="demo-eyebrow">Solicitud</p>
            <h1 id="ticket-not-found-title">No encontramos esta solicitud.</h1>
            <p className="demo-page-description">El identificador no corresponde a una solicitud visible en tu cuenta o ya no existe.</p>
          </section>
          <Link className="demo-primary-link demo-ticket-not-found-action" href="/tickets">Volver a mi historial</Link>
        </div>
      );
    }
    if (phase.kind_ === "forbidden") {
      return (
        <div className="demo-page">
          <section className="demo-page-heading" aria-labelledby="ticket-forbidden-title">
            <p className="demo-eyebrow">Solicitud</p>
            <h1 id="ticket-forbidden-title">Necesitás iniciar sesión.</h1>
            <p className="demo-page-description">{phase.reason}</p>
          </section>
          <Link className="demo-primary-link demo-ticket-not-found-action" href="/login">Iniciar sesión</Link>
        </div>
      );
    }
    return (
      <div className="demo-page">
        <section className="demo-page-heading" aria-labelledby="ticket-error-title">
          <p className="demo-eyebrow">Solicitud</p>
          <h1 id="ticket-error-title">No pudimos cargar esta solicitud.</h1>
          <p className="demo-page-description">{phase.reason}</p>
        </section>
        <Link className="demo-primary-link demo-ticket-not-found-action" href="/tickets">Volver a mi historial</Link>
      </div>
    );
  }

  const ticket = phase.ticket;
  const category = phase.categories.find((c) => c.id === ticket.categoryId);
  const stateLabel = getStateLabel(ticket.state);
  const stateTone = getStateTone(ticket.state);
  const priorityTone = getPriorityTone(ticket.priority);

  return (
    <div className="demo-ticket-detail">
      <section className="demo-ticket-detail-heading" aria-labelledby="ticket-title">
        <div>
          <p className="demo-eyebrow">{ticket.id.slice(0, 8)}… · Solicitud</p>
          <h1 id="ticket-title">{ticket.title}</h1>
          <p>{ticket.description}</p>
        </div>
        <div className="demo-ticket-detail-badges">
          <span className={`demo-priority-marker demo-priority-marker-${priorityTone}`} aria-label={`Prioridad ${ticket.priority}`}>
            {ticket.priority}
          </span>
          <span className={`demo-state-pill demo-state-pill-${stateTone}`}>
            <span aria-hidden="true" />{stateLabel}
          </span>
        </div>
      </section>

      <section className="demo-ticket-detail-grid" aria-label="Información de la solicitud">
        <article className="demo-ticket-detail-card">
          <p className="demo-section-label">Contexto</p>
          <dl className="demo-ticket-facts">
            <div><dt>Categoría</dt><dd>{getCategoryLabel(phase.categories, ticket.categoryId)}</dd></div>
            <div><dt>ID</dt><dd>{ticket.id}</dd></div>
            <div><dt>Estado</dt><dd>{stateLabel}</dd></div>
            <div><dt>Creada</dt><dd><time dateTime={ticket.createdAt}>{formatDate(ticket.createdAt)}</time></dd></div>
            <div><dt>Última actualización</dt><dd><time dateTime={ticket.updatedAt}>{formatDate(ticket.updatedAt)}</time></dd></div>
            {category?.description ? <div><dt>Descripción categoría</dt><dd>{category.description}</dd></div> : null}
          </dl>
        </article>
        <article className="demo-ticket-detail-card demo-timer-card">
          <p className="demo-section-label">Asignación</p>
          <strong>{ticket.assignedTo ? "Asignado" : "Sin asignar"}</strong>
          <span>{ticket.assignedTo ?? "Pendiente de asignación por el equipo técnico."}</span>
        </article>
      </section>

      <section className="demo-ticket-history-card" aria-labelledby="ticket-meta-title">
        <div className="demo-ticket-history-heading">
          <div>
            <p className="demo-section-label">Trazabilidad</p>
            <h2 id="ticket-meta-title">Datos persistidos</h2>
          </div>
          <span>Tenant {ticket.tenantId.slice(0, 8)}…</span>
        </div>
        <ol className="demo-ticket-history-list">
          <li>
            <span aria-hidden="true" />
            <div>
              <p>Esta solicitud se recupera directamente desde Supabase mediante <code>GET /api/tickets/{ticket.id}</code>.</p>
              <time>priority={ticket.priority} · state={ticket.state} · sla_status={ticket.slaStatus}</time>
            </div>
          </li>
          <li>
            <span aria-hidden="true" />
            <div>
              <p>El cambio de prioridad contractual queda pendiente hasta que PO defina TKT-007. La asignación y transición están operativas mediante <code>POST /api/tickets/{ticket.id}/assignments</code> y <code>/transitions</code>.</p>
              <time>Foundation 3A + Ticketing Core (TKT-006/009/010/012/013/014/019)</time>
            </div>
          </li>
        </ol>
      </section>

      <CommentsThread ticketId={ticket.id} allowInternal={false} />
      <AttachmentsList ticketId={ticket.id} tenantId={ticket.tenantId} />
    </div>
  );
}
