/**
 * SupervisorForbidden — TKT-027 Remediation (DEFECT-UAT-NN3).
 *
 * Server component que se renderiza cuando el actor no tiene institution
 * scope. NO invoca el RPC compute_ticket_kpis. Es un componente de
 * presentación puro: no tiene estado ni efectos.
 *
 * Mensaje:
 *   - En español directo, sin alarmismo.
 *   - Indica qué scope se requiere.
 *   - Sugiere alternativas: usar /dashboard, o pedir a un lead/director
 *     que comparta los KPIs.
 *   - NO expone detalles internos (códigos de error, nombres de funciones).
 */

export type SupervisorForbiddenReason = "no_membership" | "no_institution_scope";

interface SupervisorForbiddenProps {
  reason: SupervisorForbiddenReason;
}

export function SupervisorForbidden({ reason }: SupervisorForbiddenProps) {
  const heading =
    reason === "no_membership"
      ? "No tienes una membresía activa en este espacio."
      : "La consola del supervisor requiere alcance institucional.";
  const detail =
    reason === "no_membership"
      ? "Pide a un administrador que active tu membresía para acceder a la consola."
      : "Tu rol actual (supervisor departamental, administrativo, operador o técnico) no incluye el alcance institucional necesario. El dashboard con KPIs agregados es responsabilidad del lead técnico o director.";
  const alternative = "Mientras tanto, puedes usar la consola de operación personal desde el panel.";

  return (
    <div className="demo-supervisor-page">
      <section className="demo-dashboard-hero" aria-labelledby="supervisor-forbidden-title">
        <div>
          <p className="demo-eyebrow">Consola del supervisor</p>
          <h1 id="supervisor-forbidden-title">{heading}</h1>
          <p>{detail}</p>
        </div>
        <span className="demo-local-badge">Acceso restringido</span>
      </section>
      <section className="demo-supervisor-card" role="region" aria-label="Detalle de acceso">
        <p className="demo-section-label">Qué puedes hacer</p>
        <p>{alternative}</p>
        <div className="demo-request-actions" style={{ marginTop: "1rem" }}>
          <a className="demo-secondary-button" href="/dashboard">
            Ir a mi panel
          </a>
        </div>
      </section>
    </div>
  );
}
