/**
 * DeskWork Ticketing Core / TKT-UI Block 1.
 * (demo) /dashboard — server component con datos reales del requester.
 *
 * Reemplaza la versión MOCK previa (que hardcodeaba
 * `DEMO_REQUESTER_ID = "user-valentina-morales"`) por una lectura directa
 * del requester autenticado vía Supabase Auth + repository.
 *
 * El layout/maqueta (clases CSS, copy, cards, lista) se conserva idéntico
 * para no introducir cambios visuales. Solo cambia el origen de los datos.
 *
 * Datos reales:
 *   - Identidad del requester (auth.uid + profiles.display_name)
 *   - Listado de tickets del requester (repo.listTicketsByRequester)
 *   - Conteos: total / activas / en proceso / resueltas
 *
 * Tone maps y labels:
 *   - TONE_BY_STATE / TONE_BY_PRIORITY: declarados inline, derivan
 *     la clase CSS visual a partir de los códigos contractuales del DB.
 *   - getStateLabel del módulo @/i18n/labels: usa "es" como locale
 *     por defecto (este componente server-side no tiene acceso al
 *     contexto de i18n del cliente; el locale del usuario se aplica
 *     en componentes client-side).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getStateLabel as getI18nStateLabel } from "@/i18n/labels";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { createSupabaseTicketRepository } from "@/modules/ticketing/supabase-repository";
import type { Ticket } from "@/modules/ticketing/repository";
import type { TicketPriority, TicketState } from "@/modules/ticketing/types";

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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  }).format(new Date(value));
}

function getPriorityTone(priority: TicketPriority): string {
  return TONE_BY_PRIORITY[priority] ?? "info";
}

function getStateTone(state: TicketState): string {
  return TONE_BY_STATE[state] ?? "info";
}

function getStateLabel(state: TicketState): string {
  return getI18nStateLabel(state, "es");
}

function firstName(displayName: string | null, email: string | null): string {
  const source = displayName?.trim() || email?.split("@")[0] || "allí";
  return source.split(/[\s.]/)[0] || source;
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Sin sesión → login con retorno seguro. El shell de (demo) no protege
  // la ruta (lo hace el middleware en /app/*), pero el dashboard sólo tiene
  // sentido con identidad real.
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  // Perfil: el display_name del requester. Es opcional (algunas
  // migraciones antiguas pueden no tener profile); caemos al email.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  // Tickets del requester. RLS filtra a sus tickets visibles
  // (can_read_ticket). Sin filtros para obtener el set completo.
  const repo = createSupabaseTicketRepository(supabase);
  const tickets: Ticket[] = await repo.listTicketsByRequester(user.id, {});

  const requesterName = firstName(profile?.display_name ?? null, user.email ?? null);
  const totalTickets = tickets.length;
  const activeTickets = tickets.filter(
    (t) => t.state !== "RESUELTO" && t.state !== "CERRADO",
  );
  const resolvedTickets = tickets.filter(
    (t) => t.state === "RESUELTO" || t.state === "CERRADO",
  );
  const inProgressTickets = tickets.filter((t) => t.state === "EN_PROCESO");

  const recent = [...tickets]
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  return (
    <div className="demo-dashboard">
      <section className="demo-dashboard-hero" aria-labelledby="dashboard-title">
        <div>
          <p className="demo-eyebrow">Solicitudes</p>
          <h1 id="dashboard-title">Hola, {requesterName}.</h1>
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
          <strong>{totalTickets}</strong>
          <span>Historial disponible</span>
        </article>
        <article className="demo-summary-card demo-summary-card-emphasis">
          <p>Activas</p>
          <strong>{activeTickets.length}</strong>
          <span>Requieren seguimiento</span>
        </article>
        <article className="demo-summary-card">
          <p>En proceso</p>
          <strong>{inProgressTickets.length}</strong>
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
          <span>{totalTickets} registradas</span>
        </div>

        {recent.length === 0 ? (
          <div className="demo-ticket-list" role="list">
            <p className="demo-empty-message">
              Aún no tienes solicitudes registradas. Crea la primera con el botón
              <strong> Crear solicitud</strong>.
            </p>
          </div>
        ) : (
          <div className="demo-ticket-list" role="list">
            {recent.map((ticket) => (
              <Link
                className="demo-ticket-row"
                href={`/tickets/${ticket.id}`}
                key={ticket.id}
                role="listitem"
              >
                <div className="demo-ticket-identification">
                  <span
                    className={`demo-priority-marker demo-priority-marker-${getPriorityTone(ticket.priority)}`}
                    aria-label={`Prioridad ${ticket.priority}`}
                  >
                    {ticket.priority}
                  </span>
                  <div>
                    <h3>{ticket.title}</h3>
                    <p>
                      {ticket.id.slice(0, 8)}… · {ticket.state}
                    </p>
                  </div>
                </div>
                <div className="demo-ticket-row-meta">
                  <span
                    className={`demo-state-pill demo-state-pill-${getStateTone(ticket.state)}`}
                  >
                    <span aria-hidden="true" />
                    {getStateLabel(ticket.state)}
                  </span>
                  <time dateTime={ticket.updatedAt}>
                    Actualizado {formatDate(ticket.updatedAt)}
                  </time>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
