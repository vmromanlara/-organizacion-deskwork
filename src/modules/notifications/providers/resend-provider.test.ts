/**
 * Tests TKT-026 Phase 1: ResendProvider.
 *
 * Cubre los 10 casos del contrato de Phase 1:
 *   PROVIDER-01  Configuración válida (constructor happy path)
 *   PROVIDER-02  API key ausente
 *   PROVIDER-03  From ausente/inválido
 *   PROVIDER-04  Payload correctamente transformado a Resend
 *   PROVIDER-05  Provider success (2xx + data)
 *   PROVIDER-06  Provider 4xx (validation_error / invalid_from_address)
 *   PROVIDER-07  Provider 5xx (internal_server_error)
 *   PROVIDER-08  Network/timeout error
 *   PROVIDER-09  Idempotency key basada en notification_outbox.id
 *   PROVIDER-10  No exposición de secretos en errores retornados
 *
 * Estrategia de mocking: `vi.mock("resend")` para inyectar un stub de
 * la clase `Resend` sin hacer red. El stub expone una función
 * `getSendMock()` que permite a los tests programar la respuesta y
 * capturar los argumentos de `emails.send()`.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { EmailMessage } from "../provider";

// =====================================================================
// Mock del SDK Resend (vi.mock se eleva antes de los imports)
// =====================================================================

type SendArgs = [
  payload: Record<string, unknown>,
  options: Record<string, unknown> | undefined,
];

const sendMock = vi.fn<(..._args: SendArgs) => Promise<unknown>>();

// `vi.fn()` envuelve la clase para que siga siendo constructible Y mantenga
// `mock.calls` accesible para los asserts.
const ctorSpy = vi.fn();
class MockResend {
  emails = { send: sendMock };
  constructor(...args: unknown[]) {
    ctorSpy(...args);
  }
}

vi.mock("resend", () => ({
  Resend: MockResend,
}));

// Importar DESPUÉS de vi.mock para que tome el stub.
const { ResendProvider } = await import("./resend-provider");

// =====================================================================
// Helpers
// =====================================================================

function baseMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    to: "recipient@example.test",
    subject: "DeskWork — Test",
    body: "Hola,\n\nEste es un mensaje de prueba.\n\n— DeskWork",
    notificationType: "ticket.assigned",
    outboxId: "00000000-0000-0000-0000-000000000abc",
    ...overrides,
  };
}

beforeEach(() => {
  sendMock.mockReset();
  ctorSpy.mockClear();
  // Por defecto: respuesta exitosa. Cada test puede sobreescribir.
  sendMock.mockResolvedValue({
    data: { id: "resend-id-default" },
    error: null,
    headers: null,
  });
});

const VALID_API_KEY = "re_test_1234567890abcdef";
const VALID_FROM = "DeskWork <noreply@deskwork.test>";

// =====================================================================
// PROVIDER-01..03: Configuración / validación
// =====================================================================

describe("ResendProvider — configuración (PROVIDER-01..03)", () => {
  it("PROVIDER-01: acepta configuración válida", () => {
    const provider = new ResendProvider({ apiKey: VALID_API_KEY, from: VALID_FROM });
    expect(provider.name).toBe("resend");
    expect(ctorSpy).toHaveBeenCalledTimes(1);
    // El constructor del SDK debe recibir la apiKey y los options.
    const [keyArg, optsArg] = ctorSpy.mock.calls[0];
    expect(keyArg).toBe(VALID_API_KEY);
    expect(optsArg).toEqual({ baseUrl: undefined, userAgent: undefined });
  });

  it("PROVIDER-02: rechaza apiKey ausente o vacía", () => {
    expect(() => new ResendProvider({ apiKey: "", from: VALID_FROM })).toThrow(
      /apiKey is required/i,
    );
    expect(() => new ResendProvider({ apiKey: "   ", from: VALID_FROM })).toThrow(
      /apiKey is required/i,
    );
    expect(
      () => new ResendProvider({ apiKey: undefined as unknown as string, from: VALID_FROM }),
    ).toThrow(/apiKey is required/i);
  });

  it("PROVIDER-03: rechaza 'from' ausente o inválido", () => {
    expect(() => new ResendProvider({ apiKey: VALID_API_KEY, from: "" })).toThrow(
      /'from' inválido/i,
    );
    expect(() => new ResendProvider({ apiKey: VALID_API_KEY, from: "no-es-email" })).toThrow(
      /'from' inválido/i,
    );
    expect(() => new ResendProvider({ apiKey: VALID_API_KEY, from: "a@b" })).toThrow(
      /'from' inválido/i,
    );
    // El formato "Name <email@dominio>" sí es válido.
    expect(
      () => new ResendProvider({ apiKey: VALID_API_KEY, from: "Soporte <soporte@deskwork.test>" }),
    ).not.toThrow();
  });
});

// =====================================================================
// PROVIDER-04: transformación de payload
// =====================================================================

describe("ResendProvider — payload (PROVIDER-04, PROVIDER-09)", () => {
  it("PROVIDER-04: transforma EmailMessage al contrato del SDK Resend", async () => {
    const provider = new ResendProvider({ apiKey: VALID_API_KEY, from: VALID_FROM });
    const msg = baseMessage();
    await provider.send(msg);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [payload, options] = sendMock.mock.calls[0] as unknown as SendArgs;
    expect(payload).toMatchObject({
      from: VALID_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    // `tags` para correlación de triage en logs Resend.
    expect(payload.tags).toEqual([
      { name: "notification_type", value: msg.notificationType },
    ]);
    expect(options).toBeDefined();
  });

  it("PROVIDER-09: propaga outboxId como idempotencyKey (NO event_id)", async () => {
    const provider = new ResendProvider({ apiKey: VALID_API_KEY, from: VALID_FROM });
    const outboxId = "11111111-2222-3333-4444-555555555555";
    await provider.send(baseMessage({ outboxId }));

    const [, options] = sendMock.mock.calls[0] as unknown as SendArgs;
    expect(options?.idempotencyKey).toBe(outboxId);
  });
});

// =====================================================================
// PROVIDER-05..07: respuestas del provider
// =====================================================================

describe("ResendProvider — respuestas (PROVIDER-05..07)", () => {
  it("PROVIDER-05: 2xx con data -> EmailResult.ok=true con providerMessageId", async () => {
    sendMock.mockResolvedValueOnce({
      data: { id: "abc-123" },
      error: null,
      headers: null,
    });
    const provider = new ResendProvider({ apiKey: VALID_API_KEY, from: VALID_FROM });
    const result = await provider.send(baseMessage());
    expect(result).toEqual({ ok: true, providerMessageId: "abc-123" });
  });

  it("PROVIDER-06: 4xx (validation_error) -> EmailResult.ok=false sin filtrar apiKey", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "from is invalid",
        statusCode: 422,
        name: "validation_error",
      },
      headers: null,
    });
    const provider = new ResendProvider({ apiKey: VALID_API_KEY, from: VALID_FROM });
    const result = await provider.send(baseMessage());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toMatch(/validation_error/);
    expect(result.error).toMatch(/422/);
    // La apiKey NO debe aparecer en el error retornado.
    expect(result.error).not.toContain(VALID_API_KEY);
  });

  it("PROVIDER-07: 5xx (internal_server_error) -> EmailResult.ok=false", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "upstream down",
        statusCode: 500,
        name: "internal_server_error",
      },
      headers: null,
    });
    const provider = new ResendProvider({ apiKey: VALID_API_KEY, from: VALID_FROM });
    const result = await provider.send(baseMessage());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toMatch(/internal_server_error/);
    expect(result.error).toMatch(/500/);
  });
});

// =====================================================================
// PROVIDER-08: network/timeout
// =====================================================================

describe("ResendProvider — errores no controlados (PROVIDER-08)", () => {
  it("PROVIDER-08: excepción del SDK (timeout/red) -> EmailResult.ok=false sin filtrar apiKey", async () => {
    sendMock.mockRejectedValueOnce(new TypeError("fetch failed: ECONNRESET"));
    const provider = new ResendProvider({ apiKey: VALID_API_KEY, from: VALID_FROM });
    const result = await provider.send(baseMessage());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toMatch(/network error/);
    expect(result.error).toMatch(/ECONNRESET/);
  });
});

// =====================================================================
// PROVIDER-10: no exposición de secretos
// =====================================================================

describe("ResendProvider — seguridad (PROVIDER-10)", () => {
  it("PROVIDER-10: redacta la apiKey si el SDK la filtra en un error", async () => {
    // Simulamos un mensaje de error contaminado (p.ej. un TypeError cuyo
    // stack trace contiene el header Authorization con la apiKey).
    const leaked = new Error(
      `fetch failed: 401 Unauthorized — Authorization: Bearer ${VALID_API_KEY}`,
    );
    sendMock.mockRejectedValueOnce(leaked);
    const provider = new ResendProvider({ apiKey: VALID_API_KEY, from: VALID_FROM });
    const result = await provider.send(baseMessage());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    // El error retornado NO debe contener la apiKey.
    expect(result.error).not.toContain(VALID_API_KEY);
    expect(result.error).not.toContain("re_test_1234567890abcdef");
    // Verificamos que la parte re_XXXXX fue redactada.
    expect(result.error).toMatch(/re_\*+REDACTED/);
  });

  it("PROVIDER-10b: la apiKey nunca aparece en respuestas exitosas ni en el contrato", async () => {
    sendMock.mockResolvedValueOnce({
      data: { id: "msg-id" },
      error: null,
      headers: null,
    });
    const provider = new ResendProvider({ apiKey: VALID_API_KEY, from: VALID_FROM });
    const result = await provider.send(baseMessage());
    expect(result.ok).toBe(true);
    // providerMessageId no debe contener la apiKey.
    if (result.ok) {
      expect(result.providerMessageId).not.toContain(VALID_API_KEY);
    }
  });
});
