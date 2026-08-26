"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { getMockUser, mockCategories } from "@/mock/deskwork-data";
import { DemoLoadingState } from "./demo-feedback-state";
import { useDemoState } from "./demo-state";

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

function getCategoryLabel(categoryId: string): string {
  return mockCategories.find((category) => category.id === categoryId)?.label ?? "Sin categoría";
}

export function NewTicketForm() {
  const requester = getMockUser(DEMO_REQUESTER_ID);
  const { createTicket, isHydrated } = useDemoState();
  const [step, setStep] = useState<FormStep>(1);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentName, setAttachmentName] = useState<string>();
  const [error, setError] = useState<string>();
  const [createdTicketId, setCreatedTicketId] = useState<string>();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (hasMounted.current) stepHeadingRef.current?.focus();
    else hasMounted.current = true;
  }, [step]);

  if (!isHydrated) return <DemoLoadingState />;

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
    if (description.trim().length < 10) {
      setError("Describe la solicitud con al menos 10 caracteres.");
      return;
    }

    moveTo(4);
  }

  function submitRequest() {
    setCreatedTicketId(createTicket({ categoryId, description, requesterId: DEMO_REQUESTER_ID }));
    moveTo(6);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) moveTo(2);
    if (step === 2) continueFromCategory();
    if (step === 3) continueFromDescription();
    if (step === 4) moveTo(5);
    if (step === 5) submitRequest();
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
                {mockCategories.map((category) => (
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
                    <small>{category.description}</small>
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
                maxLength={600}
                placeholder="Ejemplo: No puedo acceder a la carpeta compartida desde esta mañana."
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setError(undefined);
                }}
              />
              <p id="request-description-hint">{description.length}/600 caracteres · No incluyas contraseñas ni datos sensibles.</p>
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
              <small>En esta maqueta el archivo no se carga ni se guarda.</small>
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
            <div className="demo-request-actions">
              <button className="demo-secondary-button" type="button" onClick={() => moveTo(4)}>Volver</button>
              <button className="demo-primary-button" type="submit">Enviar solicitud</button>
            </div>
          </div>
        ) : null}

        {step === 6 ? (
          <div className="demo-request-step demo-request-confirmation">
            <div>
              <p className="demo-section-label">Paso 6 de 6</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>Solicitud simulada registrada</h2>
              <p>Generamos el identificador local <strong>{createdTicketId}</strong> para completar el recorrido de la maqueta.</p>
            </div>
            <div className="demo-confirmation-note">
              <p>Esta interacción no creó un ticket real ni envió archivos o datos a Foundation.</p>
            </div>
            {createdTicketId ? <div className="demo-request-actions"><Link className="demo-secondary-link" href="/tickets">Ver mi historial</Link><Link className="demo-primary-link" href={`/tech/tickets/${createdTicketId}`}>Abrir en cola técnica</Link></div> : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
