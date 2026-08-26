"use client";

import { mockKpiSeries, mockKpiSummary, mockPriorities, mockTicketStates } from "@/mock/deskwork-data";
import { useDemoState } from "./demo-state";

function percent(value: number) { return new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 0 }).format(value); }
function hours(value: number) {
  const roundedMinutes = Math.round(value);
  return `${Math.floor(roundedMinutes / 60)} h ${roundedMinutes % 60} min`;
}

export function SupervisorDashboard() {
  const { tickets } = useDemoState();
  const byState = mockTicketStates.map((state) => ({ ...state, count: tickets.filter((ticket) => ticket.state === state.code).length }));
  const byPriority = mockPriorities.map((priority) => ({ ...priority, count: tickets.filter((ticket) => ticket.priority === priority.code).length }));
  const totalTickets = tickets.length || 1;
  const maxDailyVolume = Math.max(...mockKpiSeries.map((entry) => entry.requestsReceived));
  return <div className="demo-supervisor-page"><section className="demo-dashboard-hero" aria-labelledby="supervisor-title"><div><p className="demo-eyebrow">Supervisión</p><h1 id="supervisor-title">Servicio en perspectiva</h1><p>Resumen local de operación, carga y cumplimiento para el área.</p></div><span className="demo-local-badge">Datos mock · 30 días</span></section>
    <section className="demo-summary-grid" aria-label="Indicadores clave"><article className="demo-summary-card"><p>Solicitudes recibidas</p><strong>{mockKpiSummary.requestsReceived}</strong><span>Últimos 30 días</span></article><article className="demo-summary-card demo-summary-card-emphasis"><p>SLA cumplido</p><strong>{percent(mockKpiSummary.slaComplianceRate)}</strong><span>Indicador simulado</span></article><article className="demo-summary-card"><p>Primera respuesta</p><strong>{hours(mockKpiSummary.averageFirstResponseMinutes)}</strong><span>Promedio del período</span></article><article className="demo-summary-card"><p>Resolución</p><strong>{hours(mockKpiSummary.averageResolutionMinutes)}</strong><span>Promedio del período</span></article></section>
    <section className="demo-supervisor-grid"><article className="demo-supervisor-card"><div className="demo-card-heading"><div><p className="demo-section-label">Flujo</p><h2>Solicitudes por estado</h2></div><span>{tickets.length} totales</span></div><div className="demo-distribution-list">{byState.map((state) => <div key={state.code}><div><span className={`demo-state-pill demo-state-pill-${state.visualTone}`}><span />{state.label}</span><strong>{state.count}</strong></div><span className="demo-distribution-bar"><i style={{ width: `${(state.count / totalTickets) * 100}%` }} /></span></div>)}</div></article>
      <article className="demo-supervisor-card"><div className="demo-card-heading"><div><p className="demo-section-label">Prioridad</p><h2>Distribución actual</h2></div><span>{tickets.filter((ticket) => ticket.priority === "P1").length} críticas</span></div><div className="demo-distribution-list">{byPriority.map((priority) => <div key={priority.code}><div><span className={`demo-priority-marker demo-priority-marker-${priority.visualTone}`}>{priority.code}</span><strong>{priority.count}</strong></div><span className="demo-distribution-bar"><i style={{ width: `${(priority.count / totalTickets) * 100}%` }} /></span></div>)}</div></article>
    </section>
    <section className="demo-supervisor-card demo-trend-card"><div className="demo-card-heading"><div><p className="demo-section-label">Tendencia</p><h2>Solicitudes recibidas</h2></div><span>{mockKpiSummary.periodStart} — {mockKpiSummary.periodEnd}</span></div><div className="demo-trend-bars" aria-label="Serie de 30 días de solicitudes recibidas">{mockKpiSeries.map((entry) => <span key={entry.date} title={`${entry.date}: ${entry.requestsReceived} solicitudes`} style={{ height: `${(entry.requestsReceived / maxDailyVolume) * 100}%` }} />)}</div><div className="demo-trend-legend"><span>27 jul</span><span>25 ago</span></div></section>
  </div>;
}
