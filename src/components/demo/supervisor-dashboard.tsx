"use client";

import { useEffect, useState } from "react";
import { getTicketKpis } from "@/modules/ticketing/client-api";
import type { KpisResponse } from "@/modules/ticketing/client-api";
import {
  formatMinutes,
  formatPercent,
  formatTime,
  getErrorMessage,
  getStateLabel,
  getPriorityLabel,
  useI18n,
  type Locale,
} from "@/i18n";

/**
 * Bloque 6 de TKT-UI (auditoría): este componente ya estaba conectado al
 * backend real en commits previos a la serie de bloques. No se requieren
 * cambios funcionales para TKT-026. La única edición de este commit es
 * este comentario para dejar registro de la auditoría y los contratos
 * que ya cumple:
 *
 *   - KPIs: `getTicketKpis(periodDays)` -> GET /api/tickets/kpis -> RPC
 *     `compute_ticket_kpis` (SECURITY DEFINER; requiere institution scope).
 *
 *   - Identidad: implícita por cookies SSR; el backend resuelve el
 *     tenant/actor desde `auth.uid()` + memberships.
 *
 *   - RLS: el RPC valida scope institucional y cross-tenant; no se
 *     exponen datos fuera del tenant del supervisor.
 *
 *   - Estados: `loading` (DemoLoadingState), `error` (con retry), y
 *     `ready` con datos reales de `KpisResponse` (totals, byState,
 *     byPriority, operationalAverages, dailyTrend, period, generatedAt).
 *
 *   - Constantes locales `STATE_TONES`/`PRIORITY_TONES`/orders: son
 *     mapas de presentación (estado -> clase CSS / orden visual), no
 *     datos MOCK. Usan los códigos contractuales del DB.
 */

type VisualTone = "info" | "warning" | "danger" | "success" | "neutral";

const STATE_TONES: Record<string, VisualTone> = {
  ABIERTO: "info",
  EN_PROCESO: "warning",
  ESPERANDO_USUARIO: "warning",
  ESCALADO: "danger",
  RESUELTO: "success",
  CERRADO: "neutral",
};

const STATE_ORDER: Record<string, number> = {
  ABIERTO: 1,
  EN_PROCESO: 2,
  ESPERANDO_USUARIO: 3,
  ESCALADO: 4,
  RESUELTO: 5,
  CERRADO: 6,
};

const PRIORITY_TONES: Record<string, VisualTone> = {
  P1: "danger",
  P2: "warning",
  P3: "info",
  P4: "success",
};

const PRIORITY_ORDER: Record<string, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

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
  const { t, locale, messages } = useI18n();
  const [phase, setPhase] = useState<KpiPhase>({ kind: "loading" });
  const [periodDays] = useState<number>(DEFAULT_PERIOD_DAYS);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getTicketKpis(periodDays);
      if (cancelled) return;
      if (!result.ok) {
        setPhase({
          kind: "error",
          reason: getErrorMessage(result.error, messages),
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

  useEffect(() => {
    if (refreshTick === 0) return;
    let cancelled = false;
    void (async () => {
      const result = await getTicketKpis(periodDays);
      if (cancelled) return;
      if (!result.ok) {
        setPhase({
          kind: "error",
          reason: getErrorMessage(result.error, messages),
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
  }, [refreshTick, periodDays, messages]);

  if (phase.kind === "loading") {
    return (
      <div className="demo-supervisor-page">
        <section className="demo-dashboard-hero">
          <div>
            <p className="demo-eyebrow">{t("nav.supervisor")}</p>
            <h1>{t("supervisor.title")}</h1>
            <p>{t("supervisor.intro")}</p>
          </div>
          <span className="demo-local-badge">{t("supervisor.badgeLoading")}</span>
        </section>
        <p className="demo-comment-note">{t("supervisor.badgeLoading")}</p>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="demo-supervisor-page">
        <section className="demo-dashboard-hero">
          <div>
            <p className="demo-eyebrow">{t("nav.supervisor")}</p>
            <h1>{t("supervisor.title")}</h1>
          </div>
          <span className="demo-local-badge">{t("supervisor.badgeError")}</span>
        </section>
        <div
          className="demo-form-error"
          role="alert"
          style={{ maxWidth: 480, margin: "1rem auto" }}
        >
          {phase.reason}
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
            {t("supervisor.errorRetry")}
          </button>
        </div>
      </div>
    );
  }

  const data = phase.data;
  const stateList = data.totals.byState
    .map((entry) => ({
      code: entry.state,
      label: getStateLabel(entry.state, locale as Locale),
      visualTone: (STATE_TONES[entry.state] ?? "neutral") as VisualTone,
      count: entry.count,
      order: STATE_ORDER[entry.state] ?? 99,
    }))
    .sort((a, b) => a.order - b.order);

  const priorityList = data.totals.byPriority
    .map((entry) => ({
      code: entry.priority,
      label: getPriorityLabel(entry.priority, locale as Locale),
      visualTone: (PRIORITY_TONES[entry.priority] ?? "neutral") as VisualTone,
      count: entry.count,
      order: PRIORITY_ORDER[entry.priority] ?? 99,
    }))
    .sort((a, b) => a.order - b.order);

  const totalTickets = Math.max(data.totals.total, 1);
  const activeTotal = Math.max(data.totals.active, 1);
  const maxDaily = Math.max(
    1,
    ...data.dailyTrend.map((entry) => entry.created),
  );

  const assignedShare = data.totals.unassigned > 0
    ? (data.totals.active - data.totals.unassigned) / data.totals.active
    : 1;

  const periodStart = data.period.start ? formatShortDate(data.period.start) : "—";
  const periodEnd = data.period.end ? formatShortDate(data.period.end) : "—";

  const refreshedAt = formatTime(phase.refreshedAt, locale as Locale);
  const dailyTotal = data.dailyTrend.reduce((sum, p) => sum + p.created, 0);

  return (
    <div className="demo-supervisor-page">
      <section className="demo-dashboard-hero" aria-labelledby="supervisor-title">
        <div>
          <p className="demo-eyebrow">{t("nav.supervisor")}</p>
          <h1 id="supervisor-title">{t("supervisor.title")}</h1>
          <p>{t("supervisor.intro")}</p>
        </div>
        <span
          className="demo-local-badge"
          title={refreshedAt}
        >
          {t("supervisor.periodBadge")
            .replace("{start}", periodStart)
            .replace("{end}", periodEnd)
            .replace("{time}", refreshedAt)}
        </span>
      </section>

      <section className="demo-summary-grid" aria-label={t("supervisor.title")}>
        <article className="demo-summary-card">
          <p>{t("supervisor.kpis.totalTitle")}</p>
          <strong>{data.totals.total}</strong>
          <span>
            {t("supervisor.kpis.totalSpan")
              .replace("{days}", String(data.period.days))
              .replace("{trend}", String(dailyTotal))}
          </span>
        </article>
        <article className="demo-summary-card demo-summary-card-emphasis">
          <p>{t("supervisor.kpis.assignmentTitle")}</p>
          <strong>{formatPercent(assignedShare, locale as Locale)}</strong>
          <span>
            {t("supervisor.kpis.assignmentSpan")
              .replace("{assigned}", String(data.totals.active - data.totals.unassigned))
              .replace("{active}", String(data.totals.active))
              .replace(
                "{operational}",
                t("supervisor.kpis.assignmentOperational"),
              )}
          </span>
        </article>
        <article className="demo-summary-card">
          <p>{t("supervisor.kpis.firstResponseTitle")}</p>
          <strong>
            {formatMinutes(
              data.operationalAverages.firstResponseMinutes,
              locale as Locale,
              messages.time,
            )}
          </strong>
          <span>
            {t("supervisor.kpis.firstResponseSpan").replace(
              "{count}",
              String(data.operationalAverages.firstResponseCount),
            )}
          </span>
        </article>
        <article className="demo-summary-card">
          <p>{t("supervisor.kpis.resolutionTitle")}</p>
          <strong>
            {formatMinutes(
              data.operationalAverages.resolutionMinutes,
              locale as Locale,
              messages.time,
            )}
          </strong>
          <span>
            {t("supervisor.kpis.resolutionSpan")
              .replace("{count}", String(data.operationalAverages.resolvedCount))
              .replace("{operational}", t("supervisor.kpis.assignmentOperational"))}
          </span>
        </article>
      </section>

      <section className="demo-supervisor-grid">
        <article className="demo-supervisor-card">
          <div className="demo-card-heading">
            <div>
              <p className="demo-section-label">{t("nav.sectionOperations")}</p>
              <h2>{t("supervisor.byState.title")}</h2>
            </div>
            <span>
              {t("supervisor.byState.total").replace(
                "{count}",
                String(data.totals.total),
              )}
            </span>
          </div>
          <div className="demo-distribution-list">
            {stateList.length === 0 ? (
              <p className="demo-comment-note">{t("supervisor.empty")}</p>
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
              <p className="demo-section-label">{t("requester.detail.priorityLabel")}</p>
              <h2>{t("supervisor.byPriority.title")}</h2>
            </div>
            <span>
              {t("supervisor.byPriority.critical").replace(
                "{count}",
                String(priorityList.find((p) => p.code === "P1")?.count ?? 0),
              )}
            </span>
          </div>
          <div className="demo-distribution-list">
            {priorityList.length === 0 ? (
              <p className="demo-comment-note">{t("supervisor.empty")}</p>
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
            <p className="demo-section-label">{t("supervisor.trend.title")}</p>
            <h2>{t("supervisor.trend.title")}</h2>
          </div>
          <span>
            {periodStart} — {periodEnd}
          </span>
        </div>
        <div
          className="demo-trend-bars"
          aria-label={t("supervisor.trend.ariaLabel").replace(
            "{days}",
            String(data.period.days),
          )}
        >
          {data.dailyTrend.length === 0 ? (
            <p className="demo-comment-note">{t("supervisor.trend.noActivity")}</p>
          ) : (
            data.dailyTrend.map((entry) => (
              <span
                key={entry.date}
                title={t("supervisor.trend.tooltip")
                  .replace("{date}", entry.date)
                  .replace("{count}", String(entry.created))}
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
            {t("common.refresh")}
          </button>
        </div>
        <p className="demo-comment-note">
          {t("supervisor.disclaimer")
            .replace("{firstResponseField}", "first_response_at")
            .replace("{resolvedField}", "resolved_at")}
        </p>
      </section>
    </div>
  );
}
