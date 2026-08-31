"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { getMockUser } from "@/mock/deskwork-data";
import { DemoLoadingState } from "./demo-feedback-state";
import {
  createTicket,
  listTicketCategories,
  type ClientResult,
} from "@/modules/ticketing/client-api";
import type { TicketCategory } from "@/modules/ticketing/repository";

const DEMO_REQUESTER_ID = "user-valentina-morales";

const formSteps = [
  { id: 1, label: "Identificación" },
  { id: 2, label: "Categoría" },
  { id: 3, label: "Descripción" },
  { id: 4, label: "Adjunto" },
  { id: 5, label: "Revisión" },
  { id: 6, label: "Confirmación" },
] as const;

type FormStep = (typeof formSteps)[number]["id"];

const TITLE_MAX = 200;
const TITLE_MIN = 5;
const DESC_MAX = 5000;
const DESC_MIN = 10;

/**
 * Deriva un title a partir del description: primera oración/linea,
 * truncado a TITLE_MAX, con fallback si la descripción no produce un
 * segmento útil.
 */
function deriveTitle(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return "Nueva solicitud";
  const firstSegment = trimmed.split(/[.!?\n]/)[0]?.trim() ?? "";
  if (firstSegment.length >= TITLE_MIN) {
    return firstSegment.slice(0, TITLE_MAX);
  }
  // Si la primera oración es muy corta, usamos la descripción completa
  // truncada al primer TITLE_MAX y garantizamos el mínimo repitiendo.
  const base = trimmed.slice(0, TITLE_MAX);
  return base.length >= TITLE_MIN
    ? base
    : base.padEnd(TITLE_MIN, ".").slice(0, TITLE_MAX);
}

type Phase =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; reason: string };

export function NewTicketForm() {
  const requester = getMockUser(DEMO_REQUESTER_ID);
  const [step, setStep] = useState<FormStep>(1);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentName, setAttachmentName] = useState<string>();
  const [error, setError] = useState<string>();
  const [createdTicketId, setCreatedTicketId] = useState<string>();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (hasMounted.current) stepHeadingRef.current?.focus();
    else hasMounted.current = true;
  }, [step]);

  // Carga inicial: categorías reales del backend.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result: ClientResult<{ categories: TicketCategory[] }> =
        await listTicketCategories();
      if (cancelled) return;
      if (!result.ok) {
        const reason = describeError(result.error);
        setPhase({ kind: "error", reason });
        return;
      }
      setCategories(result.data.categories);
      setPhase({ kind: "ready" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase.kind === "loading") {
    return <DemoLoadingState />;
  }

  if (phase.kind === "error") {
    return (
      <div className="demo-request-flow">
        <section className="demo-request-heading" aria-labelledby="request-title">
          <p className="demo-eyebrow">Nueva solicitud</p>
          <h1 id="request-title">No pudimos cargar las categorías.</h1>
          <p className="demo-form-error" role="alert">
            {phase.reason}
          </p>
          <p>
            Para crear una solicitud real necesitás una sesión activa y
            pertenecer a un tenant con categorías sembradas.
          </p>
        </section>
        <div className="demo-request-actions">
          <Link className="demo-primary-link" href="/login?next=/tickets/new">
            Iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  function getCategoryLabel(id: string): string {
    return categories.find((category) => category.id === id)?.label ?? "Sin categoría";
  }

  function moveTo(nextStep: FormStep) {
    setError(undefined);
    setStep(nextStep);
  }

  function continueFromCategory() {
    if (!categoryId) {
      setError("Selecciona una categoría para continuar.");
      return;
    }
    moveTo(3);
  }

  function continueFromDescription() {
    if (description.trim().length < DESC_MIN) {
      setError(`Describe la solicitud con al menos ${DESC_MIN} caracteres.`);
      return;
    }
    if (description.length > DESC_MAX) {
      setError(`La descripción no puede superar ${DESC_MAX} caracteres.`);
      return;
    }
    moveTo(4);
  }

  async function submitRequest() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(undefined);
    setError(undefined);

    const title = deriveTitle(description);
    const result = await createTicket({
      categoryId,
      title,
      description: description.trim(),
    });

    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(describeError(result.error));
      return;
    }
    setCreatedTicketId(result.data.ticket.id);
    moveTo(6);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) moveTo(2);
    else if (step === 2) continueFromCategory();
    else if (step === 3) continueFromDescription();
    else if (step === 4) moveTo(5);
    else if (step === 5) void submitRequest();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    const target = event.target;
    const isTextArea = target instanceof HTMLTextAreaElement;
    const isFileInput = target instanceof HTMLInputElement && target.type === "file";
    const isSecondaryButton = target instanceof HTMLButtonElement && target.type === "button";
    if (event.key !== "Enter" || isTextArea || isFileInput || isSecondaryButton || step === 6) return;

    event.preventDefault();
    event.currentTarget.requestSubmit();
  }

  return (
    <div className="demo-request-flow">
      <section className="demo-request-heading" aria-labelledby="request-title">
        <p className="demo-eyebrow">Nueva solicitud</p>
        <h1 id="request-title">Cuéntanos qué necesitas.</h1>
        <p>Completa seis pasos simples. DeskWork define la prioridad y la atención según el contexto.</p>
      </section>

      <ol className="demo-request-progress" aria-label="Progreso de la solicitud">
        {formSteps.map((formStep) => (
          <li className={formStep.id === step ? "demo-request-progress-current" : formStep.id < step ? "demo-request-progress-complete" : ""} key={formStep.id}>
            <span aria-hidden="true">{formStep.id}</span>
            <span>{formStep.label}</span>
          </li>
        ))}
      </ol>

      <form className="demo-request-card" aria-labelledby="request-title" noValidate onKeyDown={handleKeyDown} onSubmit={handleSubmit}>
        {step === 1 ? (
          <div className="demo-request-step">
            <div>
              <p className="demo-section-label">Paso 1 de 6</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>Confirma tu identificación</h2>
              <p>Usaremos estos datos para asociar y dar seguimiento a tu solicitud.</p>
            </div>
            <dl className="demo-identity-card">
              <div><dt>Nombre</dt><dd>{requester?.name ?? "Valentina Morales"}</dd></div>
              <div><dt>Cargo</dt><dd>{requester?.title ?? "Analista de remuneraciones"}</dd></div>
              <div><dt>Área</dt><dd>{requester?.department ?? "Finanzas"}</dd></div>
              <div><dt>Correo</dt><dd>{requester?.email ?? "valentina.morales@demo.deskwork.local"}</dd></div>
            </dl>
            <div className="demo-request-actions">
              <button className="demo-primary-button" type="submit">Continuar</button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="demo-request-step">
            <div>
              <p className="demo-section-label">Paso 2 de 6</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>Elige una categoría</h2>
              <p>Selecciona la opción que mejor describe tu necesidad. Podremos ajustarla durante la atención.</p>
            </div>
            <fieldset className="demo-category-fieldset" aria-describedby={error ? "request-form-error" : undefined}>
              <legend>Tipo de solicitud</legend>
              <div className="demo-category-grid">
                {categories.map((category) => (
                  <label className={`demo-category-option ${categoryId === category.id ? "demo-category-option-selected" : ""}`} htmlFor={`request-category-${category.id}`} key={category.id}>
                    <input
                      checked={categoryId === category.id}
                      id={`request-category-${category.id}`}
                      name="category"
                      type="radio"
                      value={category.id}
                      onChange={() => {
                        setCategoryId(category.id);
                        setError(undefined);
                      }}
                    />
                    <span>{category.label}</span>
                    {category.description ? <small>{category.description}</small> : null}
                  </label>
                ))}
              </div>
            </fieldset>
            {error ? <p className="demo-form-error" id="request-form-error" role="alert">{error}</p> : null}
            <div className="demo-request-actions">
              <button className="demo-secondary-button" type="button" onClick={() => moveTo(1)}>Volver</button>
              <button className="demo-primary-button" type="submit">Continuar</button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="demo-request-step">
            <div>
              <p className="demo-section-label">Paso 3 de 6</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>Describe lo que ocurre</h2>
              <p>Indica qué necesitas, qué estabas intentando hacer y cualquier detalle que ayude a resolverlo.</p>
            </div>
            <div className="demo-description-field">
              <label htmlFor="request-description">Descripción de la solicitud</label>
              <textarea
                id="request-description"
                aria-describedby={error ? "request-description-hint request-form-error" : "request-description-hint"}
                aria-invalid={Boolean(error)}
                maxLength={DESC_MAX}
                placeholder="Ejemplo: No puedo acceder a la carpeta compartida desde esta mañana."
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setError(undefined);
                }}
              />
              <p id="request-description-hint">{description.length}/{DESC_MAX} caracteres · No incluyas contraseñas ni datos sensibles.</p>
            </div>
            {error ? <p className="demo-form-error" id="request-form-error" role="alert">{error}</p> : null}
            <div className="demo-request-actions">
              <button className="demo-secondary-button" type="button" onClick={() => moveTo(2)}>Volver</button>
              <button className="demo-primary-button" type="submit">Continuar</button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="demo-request-step">
            <div>
              <p className="demo-section-label">Paso 4 de 6</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>Adjunta una imagen si ayuda</h2>
              <p>Es opcional. Una captura puede dar contexto, pero nunca incluyas contraseñas ni información confidencial.</p>
            </div>
            <div className="demo-attachment-field">
              <label htmlFor="request-attachment">Seleccionar una imagen</label>
              <input
                accept="image/*"
                id="request-attachment"
                type="file"
                onChange={(event) => setAttachmentName(event.currentTarget.files?.[0]?.name)}
              />
              <p>{attachmentName ? `Archivo seleccionado: ${attachmentName}` : "No has seleccionado ningún archivo."}</p>
              <small>En esta versión los adjuntos se registrarán con metadata básica; la subida del binario a Storage se conectará en una iteración posterior.</small>
            </div>
            <div className="demo-request-actions">
              <button className="demo-secondary-button" type="button" onClick={() => moveTo(3)}>Volver</button>
              <button className="demo-primary-button" type="submit">Continuar</button>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="demo-request-step">
            <div>
              <p className="demo-section-label">Paso 5 de 6</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>Revisa antes de enviar</h2>
              <p>La prioridad, el técnico y el tiempo de atención los define DeskWork; no debes asignarlos manualmente.</p>
            </div>
            <dl className="demo-request-review">
              <div><dt>Solicitante</dt><dd>{requester?.name ?? "Valentina Morales"}</dd></div>
              <div><dt>Categoría</dt><dd>{getCategoryLabel(categoryId)}</dd></div>
              <div><dt>Descripción</dt><dd>{description}</dd></div>
              <div><dt>Adjunto</dt><dd>{attachmentName ?? "Sin archivo"}</dd></div>
            </dl>
            {submitError ? <p className="demo-form-error" role="alert">{submitError}</p> : null}
            <div className="demo-request-actions">
              <button className="demo-secondary-button" type="button" onClick={() => moveTo(4)} disabled={submitting}>Volver</button>
              <button className="demo-primary-button" type="submit" disabled={submitting}>{submitting ? "Enviando…" : "Enviar solicitud"}</button>
            </div>
          </div>
        ) : null}

        {step === 6 ? (
          <div className="demo-request-step demo-request-confirmation">
            <div>
              <p className="demo-section-label">Paso 6 de 6</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>Solicitud registrada en DeskWork</h2>
              <p>Identificador real: <strong>{createdTicketId}</strong>. La solicitud ya está visible para tu equipo técnico.</p>
            </div>
            <div className="demo-confirmation-note">
              <p>Esta acción persistió en Supabase real mediante <code>POST /api/tickets</code> y disparó el evento <code>created</code> en el outbox de notificaciones.</p>
            </div>
            {createdTicketId ? <div className="demo-request-actions"><Link className="demo-secondary-link" href="/tickets">Ver mi historial</Link><Link className="demo-primary-link" href={`/tickets/${createdTicketId}`}>Abrir ticket</Link></div> : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}

function describeError(error: import("@/modules/ticketing/client-api").ClientApiError): string {
  switch (error.kind) {
    case "forbidden":
      return `No autorizado: ${error.reason}. Si ves este mensaje, iniciá sesión con un usuario que pertenezca a un tenant activo.`;
    case "not_found":
      return `Recurso no encontrado: ${error.reason}.`;
    case "validation":
      return `Datos inválidos: ${error.reason}.`;
    case "conflict":
      return `Conflicto: ${error.reason}.`;
    case "network":
      return `No se pudo conectar con el backend (${error.reason}). Reintentá en unos segundos.`;
    case "http":
      return `Error HTTP ${error.status}: ${error.reason}.`;
    case "unknown":
      return `Error desconocido: ${error.reason}.`;
    default: {
      const exhaustiveCheck: never = error;
      void exhaustiveCheck;
      return "Error desconocido.";
    }
  }
}
