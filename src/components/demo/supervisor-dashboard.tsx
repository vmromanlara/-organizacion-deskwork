"use client";

import { useEffect, useState } from "react";
import { getTicketKpis } from "@/modules/ticketing/client-api";
import type { KpisResponse } from "@/modules/ticketing/client-api";

type VisualTone = "info" | "warning" | "danger" | "success" | "neutral";

const STATE_META: Record<
  string,
  { label: string; visualTone: VisualTone; order: number }
> = {
  ABIERTO: { label: "Abierto", visualTone: "info", order: 1 },
  EN_PROCESO: { label: "En proceso", visualTone: "warning", order: 2 },
  ESPERANDO_USUARIO: {
    label: "Esperando usuario",
    visualTone: "warning",
    order: 3,
  },
  ESCALADO: { label: "Escalado", visualTone: "danger", order: 4 },
  RESUELTO: { label: "Resuelto", visualTone: "success", order: 5 },
  CERRADO: { label: "Cerrado", visualTone: "neutral", order: 6 },
};

const PRIORITY_META: Record<
  string,
  { label: string; visualTone: VisualTone; order: number }
> = {
  P1: { label: "Crítica", visualTone: "danger", order: 1 },
  P2: { label: "Alta", visualTone: "warning", order: 2 },
  P3: { label: "Normal", visualTone: "info", order: 3 },
  P4: { label: "Baja", visualTone: "success", order: 4 },
};

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-CL", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const minutes = Math.round(value);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function formatShortDate(iso: string): string {
  // Espera "YYYY-MM-DD".
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

type KpiPhase =
  | { kind: "loading" }
  | { kind: "error"; reason: string }
  | { kind: "ready"; data: KpisResponse; refreshedAt: string };

const DEFAULT_PERIOD_DAYS = 30;

export function SupervisorDashboard() {
  const [phase, setPhase] = useState<KpiPhase>({ kind: "loading" });
  const [periodDays] = useState<number>(DEFAULT_PERIOD_DAYS);
  const [refreshTick, setRefreshTick] = useState(0);

  // Carga inicial: NO preservamos estado previo (mostrar loading).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getTicketKpis(periodDays);
      if (cancelled) return;
      if (!result.ok) {
        setPhase({
          kind: "error",
          reason: result.error.reason ?? "Error al cargar KPIs.",
        });
        return;
      }
      setPhase({
        kind: "ready",
        data: result.data,
        refreshedAt: new Date().toISOString(),
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh manual: preservamos los datos visibles.
  useEffect(() => {
    if (refreshTick === 0) return;
    let cancelled = false;
    void (async () => {
      const result = await getTicketKpis(periodDays);
      if (cancelled) return;
      if (!result.ok) {
        setPhase({
          kind: "error",
          reason: result.error.reason ?? "Error al actualizar KPIs.",
        });
        return;
      }
      setPhase({
        kind: "ready",
        data: result.data,
        refreshedAt: new Date().toISOString(),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick, periodDays]);

  if (phase.kind === "loading") {
    return (
      <div className="demo-supervisor-page">
        <section className="demo-dashboard-hero">
          <div>
            <p className="demo-eyebrow">Supervisión</p>
            <h1>Servicio en perspectiva</h1>
            <p>Resumen de operación del área a partir de tickets reales.</p>
          </div>
          <span className="demo-local-badge">Cargando KPIs reales…</span>
        </section>
        <p className="demo-comment-note">Calculando indicadores desde la base de datos…</p>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="demo-supervisor-page">
        <section className="demo-dashboard-hero">
          <div>
            <p className="demo-eyebrow">Supervisión</p>
            <h1>Servicio en perspectiva</h1>
          </div>
          <span className="demo-local-badge">Error</span>
        </section>
        <div
          className="demo-form-error"
          role="alert"
          style={{ maxWidth: 480, margin: "1rem auto" }}
        >
          No pudimos cargar los KPIs: {phase.reason}
        </div>
        <div
          className="demo-request-actions"
          style={{ justifyContent: "center" }}
        >
          <button
            type="button"
            className="demo-secondary-button"
            onClick={() => {
              setRefreshTick((tick) => tick + 1);
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const data = phase.data;
  const stateList = data.totals.byState
    .map((entry) => ({
      code: entry.state,
      label: STATE_META[entry.state]?.label ?? entry.state,
      visualTone: (STATE_META[entry.state]?.visualTone ?? "neutral") as VisualTone,
      count: entry.count,
      order: STATE_META[entry.state]?.order ?? 99,
    }))
    .sort((a, b) => a.order - b.order);

  const priorityList = data.totals.byPriority
    .map((entry) => ({
      code: entry.priority,
      label: PRIORITY_META[entry.priority]?.label ?? entry.priority,
      visualTone: (PRIORITY_META[entry.priority]?.visualTone ??
        "neutral") as VisualTone,
      count: entry.count,
      order: PRIORITY_META[entry.priority]?.order ?? 99,
    }))
    .sort((a, b) => a.order - b.order);

  // Total (incluye CERRADO y RESUELTO) para los porcentajes de la UI.
  const totalTickets = Math.max(data.totals.total, 1);
  // Para los graficos de distribucion mostramos solo tickets "abiertos" (no terminales).
  const activeTotal = Math.max(data.totals.active, 1);
  const maxDaily = Math.max(
    1,
    ...data.dailyTrend.map((entry) => entry.created),
  );

  // SLA: derivado operacional, NO contractual (TKT-008 bloqueado).
  // Calculo simple: % de tickets activos que estan asignados.
  const assignedShare = data.totals.unassigned > 0
    ? (data.totals.active - data.totals.unassigned) / data.totals.active
    : 1;

  const periodStart = data.period.start
    ? formatShortDate(data.period.start)
    : "—";
  const periodEnd = data.period.end ? formatShortDate(data.period.end) : "—";

  const refreshedAt = new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  }).format(new Date(phase.refreshedAt));

  return (
    <div className="demo-supervisor-page">
      <section className="demo-dashboard-hero" aria-labelledby="supervisor-title">
        <div>
          <p className="demo-eyebrow">Supervisión</p>
          <h1 id="supervisor-title">Servicio en perspectiva</h1>
          <p>Resumen de operación del área a partir de tickets reales.</p>
        </div>
        <span
          className="demo-local-badge"
          title={`Actualizado a las ${refreshedAt} (America/Santiago)`}
        >
          Datos reales · {periodStart} — {periodEnd} · {refreshedAt}
        </span>
      </section>

      <section className="demo-summary-grid" aria-label="Indicadores clave">
        <article className="demo-summary-card">
          <p>Tickets en el período</p>
          <strong>{data.totals.total}</strong>
          <span>
            Creados en los últimos {data.period.days} días
            {" "}
            ({(data.dailyTrend.reduce((sum, p) => sum + p.created, 0))} según tendencia diaria)
          </span>
        </article>
        <article className="demo-summary-card demo-summary-card-emphasis">
          <p>Asignación activa</p>
          <strong>{formatPercent(assignedShare)}</strong>
          <span>
            {data.totals.active - data.totals.unassigned}/{data.totals.active}{" "}
            tickets activos asignados ·{" "}
            <em>operacional, no SLA contractual</em>
          </span>
        </article>
        <article className="demo-summary-card">
          <p>Primera respuesta (prom.)</p>
          <strong>
            {formatMinutes(data.operationalAverages.firstResponseMinutes)}
          </strong>
          <span>
            {data.operationalAverages.firstResponseCount} tickets con respuesta
            registrada
          </span>
        </article>
        <article className="demo-summary-card">
          <p>Resolución (prom.)</p>
          <strong>
            {formatMinutes(data.operationalAverages.resolutionMinutes)}
          </strong>
          <span>
            {data.operationalAverages.resolvedCount} tickets resueltos ·{" "}
            <em>operacional, no SLA contractual</em>
          </span>
        </article>
      </section>

      <section className="demo-supervisor-grid">
        <article className="demo-supervisor-card">
          <div className="demo-card-heading">
            <div>
              <p className="demo-section-label">Flujo</p>
              <h2>Solicitudes por estado</h2>
            </div>
            <span>{data.totals.total} totales</span>
          </div>
          <div className="demo-distribution-list">
            {stateList.length === 0 ? (
              <p className="demo-comment-note">
                Sin tickets registrados todavía.
              </p>
            ) : (
              stateList.map((state) => (
                <div key={state.code}>
                  <div>
                    <span
                      className={`demo-state-pill demo-state-pill-${state.visualTone}`}
                    >
                      <span />
                      {state.label}
                    </span>
                    <strong>{state.count}</strong>
                  </div>
                  <span className="demo-distribution-bar">
                    <i
                      style={{
                        width: `${(state.count / totalTickets) * 100}%`,
                      }}
                    />
                  </span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="demo-supervisor-card">
          <div className="demo-card-heading">
            <div>
              <p className="demo-section-label">Prioridad</p>
              <h2>Distribución actual</h2>
            </div>
            <span>
              {
                priorityList.find((priority) => priority.code === "P1")
                  ?.count ?? 0
              }{" "}
              críticas
            </span>
          </div>
          <div className="demo-distribution-list">
            {priorityList.length === 0 ? (
              <p className="demo-comment-note">
                Sin tickets registrados todavía.
              </p>
            ) : (
              priorityList.map((priority) => (
                <div key={priority.code}>
                  <div>
                    <span
                      className={`demo-priority-marker demo-priority-marker-${priority.visualTone}`}
                    >
                      {priority.code}
                    </span>
                    <strong>{priority.count}</strong>
                  </div>
                  <span className="demo-distribution-bar">
                    <i
                      style={{
                        width: `${(priority.count / activeTotal) * 100}%`,
                      }}
                    />
                  </span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="demo-supervisor-card demo-trend-card">
        <div className="demo-card-heading">
          <div>
            <p className="demo-section-label">Tendencia</p>
            <h2>Solicitudes creadas</h2>
          </div>
          <span>
            {periodStart} — {periodEnd}
          </span>
        </div>
        <div
          className="demo-trend-bars"
          aria-label={`Serie diaria de tickets creados (últimos ${data.period.days} días)`}
        >
          {data.dailyTrend.length === 0 ? (
            <p className="demo-comment-note">Sin actividad en el período.</p>
          ) : (
            data.dailyTrend.map((entry) => (
              <span
                key={entry.date}
                title={`${entry.date}: ${entry.created} ticket(s) creado(s)`}
                style={{
                  height: `${(entry.created / maxDaily) * 100}%`,
                }}
              />
            ))
          )}
        </div>
        <div className="demo-trend-legend">
          <span>{periodStart}</span>
          <span>{periodEnd}</span>
        </div>
        <div
          className="demo-request-actions"
          style={{ justifyContent: "flex-end" }}
        >
          <button
            type="button"
            className="demo-secondary-button"
            onClick={() => {
              setRefreshTick((tick) => tick + 1);
            }}
          >
            Actualizar
          </button>
        </div>
        <p className="demo-comment-note">
          Promedios derivados de <code>first_response_at</code> y{" "}
          <code>resolved_at</code> — no contractual. TKT-008 (SLA) pendiente
          de decisión PO.
        </p>
      </section>
    </div>
  );
}
