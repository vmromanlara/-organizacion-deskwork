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
import {
  getErrorMessage,
  useI18n,
} from "@/i18n";

const DEMO_REQUESTER_ID = "user-valentina-morales";

type FormStep = 1 | 2 | 3 | 4 | 5 | 6;

const TITLE_MAX = 200;
const TITLE_MIN = 5;
const DESC_MAX = 5000;
const DESC_MIN = 10;

function deriveTitle(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return "Nueva solicitud";
  const firstSegment = trimmed.split(/[.!?\n]/)[0]?.trim() ?? "";
  if (firstSegment.length >= TITLE_MIN) {
    return firstSegment.slice(0, TITLE_MAX);
  }
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
  const { t, messages } = useI18n();
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result: ClientResult<{ categories: TicketCategory[] }> =
        await listTicketCategories();
      if (cancelled) return;
      if (!result.ok) {
        setPhase({ kind: "error", reason: getErrorMessage(result.error, messages) });
        return;
      }
      setCategories(result.data.categories);
      setPhase({ kind: "ready" });
    })();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  if (phase.kind === "loading") {
    return <DemoLoadingState />;
  }

  if (phase.kind === "error") {
    return (
      <div className="demo-request-flow">
        <section className="demo-request-heading" aria-labelledby="request-title">
          <p className="demo-eyebrow">{t("nav.newTicket")}</p>
          <h1 id="request-title">{t("errors.unknown")}</h1>
          <p className="demo-form-error" role="alert">
            {phase.reason}
          </p>
        </section>
        <div className="demo-request-actions">
          <Link className="demo-primary-link" href="/login?next=/tickets/new">
            {t("common.open")} — {t("shell.brand")}
          </Link>
        </div>
      </div>
    );
  }

  const formSteps: { id: FormStep; label: string }[] = [
    { id: 1, label: t("requester.newTicket.steps.identification") },
    { id: 2, label: t("requester.newTicket.steps.category") },
    { id: 3, label: t("requester.newTicket.steps.description") },
    { id: 4, label: t("requester.newTicket.steps.attachment") },
    { id: 5, label: t("requester.newTicket.steps.review") },
    { id: 6, label: t("requester.newTicket.steps.confirmation") },
  ];

  function getCategoryLabel(id: string): string {
    return categories.find((category) => category.id === id)?.label ?? t("common.none");
  }

  function moveTo(nextStep: FormStep) {
    setError(undefined);
    setStep(nextStep);
  }

  function continueFromCategory() {
    if (!categoryId) {
      setError(t("requester.newTicket.errorCategory"));
      return;
    }
    moveTo(3);
  }

  function continueFromDescription() {
    if (description.trim().length < DESC_MIN) {
      setError(t("requester.newTicket.errorDescription"));
      return;
    }
    if (description.length > DESC_MAX) {
      setError(t("errors.validation"));
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
      setSubmitError(getErrorMessage(result.error, messages));
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
        <p className="demo-eyebrow">{t("nav.newTicket")}</p>
        <h1 id="request-title">{t("requester.newTicket.title")}</h1>
        <p>{t("requester.newTicket.intro")}</p>
      </section>

      <ol className="demo-request-progress" aria-label={t("requester.newTicket.title")}>
        {formSteps.map((formStep) => (
          <li
            className={
              formStep.id === step
                ? "demo-request-progress-current"
                : formStep.id < step
                  ? "demo-request-progress-complete"
                  : ""
            }
            key={formStep.id}
          >
            <span aria-hidden="true">{formStep.id}</span>
            <span>{formStep.label}</span>
          </li>
        ))}
      </ol>

      <form
        className="demo-request-card"
        aria-labelledby="request-title"
        noValidate
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
      >
        {step === 1 ? (
          <div className="demo-request-step">
            <div>
              <p className="demo-section-label">{t("requester.newTicket.title")}</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>{t("common.open")}</h2>
              <p>{t("requester.newTicket.intro")}</p>
            </div>
            <dl className="demo-identity-card">
              <div><dt>Nombre</dt><dd>{requester?.name ?? "Valentina Morales"}</dd></div>
              <div><dt>Cargo</dt><dd>{requester?.title ?? "Analista de remuneraciones"}</dd></div>
              <div><dt>Área</dt><dd>{requester?.department ?? "Finanzas"}</dd></div>
              <div><dt>Correo</dt><dd>{requester?.email ?? "valentina.morales@demo.deskwork.local"}</dd></div>
            </dl>
            <div className="demo-request-actions">
              <button className="demo-primary-button" type="submit">{t("common.open")}</button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="demo-request-step">
            <div>
              <p className="demo-section-label">{t("requester.newTicket.stepCategory")}</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>{t("requester.newTicket.categoryLabel")}</h2>
              <p>{t("requester.newTicket.categoryPlaceholder")}</p>
            </div>
            <fieldset
              className="demo-category-fieldset"
              aria-describedby={error ? "request-form-error" : undefined}
            >
              <legend>{t("requester.newTicket.categoryLabel")}</legend>
              <div className="demo-category-grid">
                {categories.map((category) => (
                  <label
                    className={`demo-category-option ${categoryId === category.id ? "demo-category-option-selected" : ""}`}
                    htmlFor={`request-category-${category.id}`}
                    key={category.id}
                  >
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
              <button className="demo-secondary-button" type="button" onClick={() => moveTo(1)}>{t("common.back")}</button>
              <button className="demo-primary-button" type="submit">{t("common.open")}</button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="demo-request-step">
            <div>
              <p className="demo-section-label">{t("requester.newTicket.stepDescription")}</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>{t("requester.newTicket.descriptionLabel")}</h2>
              <p>{t("requester.newTicket.descriptionPlaceholder")}</p>
            </div>
            <div className="demo-description-field">
              <label htmlFor="request-description">{t("requester.newTicket.descriptionLabel")}</label>
              <textarea
                id="request-description"
                aria-describedby={error ? "request-description-hint request-form-error" : "request-description-hint"}
                aria-invalid={Boolean(error)}
                maxLength={DESC_MAX}
                placeholder={t("requester.newTicket.descriptionPlaceholder")}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setError(undefined);
                }}
              />
              <p id="request-description-hint">
                {description.length}/{DESC_MAX} {t("common.optional")}
              </p>
            </div>
            {error ? <p className="demo-form-error" id="request-form-error" role="alert">{error}</p> : null}
            <div className="demo-request-actions">
              <button className="demo-secondary-button" type="button" onClick={() => moveTo(2)}>{t("common.back")}</button>
              <button className="demo-primary-button" type="submit">{t("common.open")}</button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="demo-request-step">
            <div>
              <p className="demo-section-label">{t("requester.newTicket.stepAttachment")}</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>{t("requester.newTicket.attachmentLabel")}</h2>
              <p>{t("requester.newTicket.attachmentHelper")}</p>
            </div>
            <div className="demo-attachment-field">
              <label htmlFor="request-attachment">{t("requester.newTicket.attachmentLabel")}</label>
              <input
                accept="image/*"
                id="request-attachment"
                type="file"
                onChange={(event) => setAttachmentName(event.currentTarget.files?.[0]?.name)}
              />
              <p>{attachmentName ? attachmentName : t("common.none")}</p>
            </div>
            <div className="demo-request-actions">
              <button className="demo-secondary-button" type="button" onClick={() => moveTo(3)}>{t("common.back")}</button>
              <button className="demo-primary-button" type="submit">{t("common.open")}</button>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="demo-request-step">
            <div>
              <p className="demo-section-label">{t("requester.newTicket.title")}</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>{t("requester.newTicket.submit")}</h2>
            </div>
            <dl className="demo-request-review">
              <div><dt>{t("requester.newTicket.categoryLabel")}</dt><dd>{getCategoryLabel(categoryId)}</dd></div>
              <div><dt>{t("requester.newTicket.descriptionLabel")}</dt><dd>{description}</dd></div>
              <div><dt>{t("requester.newTicket.attachmentLabel")}</dt><dd>{attachmentName ?? t("common.none")}</dd></div>
            </dl>
            {submitError ? <p className="demo-form-error" role="alert">{submitError}</p> : null}
            <div className="demo-request-actions">
              <button className="demo-secondary-button" type="button" onClick={() => moveTo(4)} disabled={submitting}>{t("common.back")}</button>
              <button className="demo-primary-button" type="submit" disabled={submitting}>
                {submitting ? t("requester.newTicket.sending") : t("requester.newTicket.submit")}
              </button>
            </div>
          </div>
        ) : null}

        {step === 6 ? (
          <div className="demo-request-step demo-request-confirmation">
            <div>
              <p className="demo-section-label">{t("requester.newTicket.title")}</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>{t("requester.newTicket.created")}</h2>
              <p><strong>{createdTicketId}</strong></p>
            </div>
            <div className="demo-confirmation-note">
              <p>{t("requester.newTicket.created")}</p>
            </div>
            {createdTicketId ? (
              <div className="demo-request-actions">
                <Link className="demo-secondary-link" href="/tickets">{t("requester.history.title")}</Link>
                <Link className="demo-primary-link" href={`/tickets/${createdTicketId}`}>{t("requester.history.openTicket")}</Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
