type DemoPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  route: string;
};

export function DemoPage({ eyebrow, title, description, route }: DemoPageProps) {
  return (
    <div className="demo-page">
      <section className="demo-page-heading" aria-labelledby="demo-page-title">
        <p className="demo-eyebrow">{eyebrow}</p>
        <h1 id="demo-page-title">{title}</h1>
        <p className="demo-page-description">{description}</p>
      </section>

      <section className="demo-route-card" aria-label="Estado de la ruta">
        <div>
          <p className="demo-route-label">Ruta activa</p>
          <code>{route}</code>
        </div>
        <span className="demo-route-status">
          <span aria-hidden="true" />
          Disponible
        </span>
      </section>

      <section className="demo-content-scaffold" aria-label="Contenido en preparación">
        <div className="demo-content-scaffold-head">
          <div>
            <p className="demo-content-scaffold-label">D1 · Shell y navegación</p>
            <h2>La estructura está lista.</h2>
          </div>
          <span className="demo-content-scaffold-count">01</span>
        </div>
        <p>
          Esta ruta forma parte de la maqueta. El contenido operativo se incorpora con datos mock locales en el siguiente hito.
        </p>
        <div className="demo-content-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    </div>
  );
}
