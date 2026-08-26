"use client";

export function DemoErrorState({ reset }: { reset: () => void }) {
  return (
    <section className="demo-feedback-state demo-feedback-state-error" aria-labelledby="demo-error-title" role="alert">
      <span aria-hidden="true" className="demo-feedback-state-mark">!</span>
      <div>
        <p className="demo-section-label">Vista local</p>
        <h1 id="demo-error-title">No pudimos cargar esta vista.</h1>
        <p>La información de la maqueta no se modificó. Puedes intentarlo otra vez.</p>
      </div>
      <button className="demo-primary-button" type="button" onClick={reset}>Reintentar</button>
    </section>
  );
}
