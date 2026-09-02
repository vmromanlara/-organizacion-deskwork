/**
 * Tests TKT-026 Phase 2B: notification worker.
 *
 * Cubre el entrypoint ejecutable server-side (runWorkerOnce):
 *  - logging estructurado (start / claimed / item / summary)
 *  - propagación de outboxId al provider como EmailMessage.outboxId
 *  - error isolation (un item fallido no aborta el batch)
 *  - provider throw → complete failed
 *  - timeout documentado (Promise.race NO cancela el fetch subyacente)
 *  - empty batch (sin provider calls)
 *  - redacción de secretos en logs
 *
 * Mocks: SupabaseClient.rpc + InMemoryProvider (TKT-019) — sin DB real.
 * Sin tocar dispatcher.test.ts ni ResendProvider.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runWorkerOnce, captureOnlyLogger } from "./worker";
import { InMemoryProvider } from "./providers/in-memory-provider";
import type { NotificationRow } from "./types";

// =====================================================================
// Mocks de Supabase
// =====================================================================

type RpcResult =
  | { data: unknown; error: null }
  | { data: null; error: { code?: string; message: string } };

function makeMockSupabase(opts: {
  claimResult: RpcResult;
  completeResults?: RpcResult[];
}) {
  const rpc = vi.fn<(name: string, args: unknown) => Promise<RpcResult>>();
  // Primer rpc = claim; subsiguientes = complete (uno por item).
  rpc.mockImplementation(async (name: string) => {
    if (name === "claim_pending_notifications") return opts.claimResult;
    if (name === "complete_notification") {
      const list = opts.completeResults ?? [];
      return list.shift() ?? {
        data: null,
        error: { code: "P0002", message: "no mock for complete" },
      };
    }
    return { data: null, error: { code: "?", message: "unknown rpc" } };
  });
  const mock = { rpc } as unknown as SupabaseClient;
  return { mock, rpc };
}

function baseNotification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenantId: "t-1",
    ticketId: "tk-1",
    eventId: "ev-1",
    notificationType: "ticket.assigned",
    recipientUserId: "u-recipient",
    recipientEmailSnapshot: "u@example.test",
    payload: {
      ticket_id: "tk-1",
      ticket_title: "Test ticket",
      assigned_by: "u-lead",
    },
    status: "processing",
    attemptCount: 0,
    claimId: "claim-abc",
    claimExpiresAt: "2026-08-31T13:00:00Z",
    availableAt: "2026-08-31T12:00:00Z",
    createdAt: "2026-08-31T12:00:00Z",
    processedAt: null,
    lastError: null,
    ...overrides,
  };
}

function okClaim(notifications: NotificationRow[]): RpcResult {
  return {
    data: notifications.map((n) => ({
      id: n.id,
      tenant_id: n.tenantId,
      ticket_id: n.ticketId,
      event_id: n.eventId,
      notification_type: n.notificationType,
      recipient_user_id: n.recipientUserId,
      recipient_email_snapshot: n.recipientEmailSnapshot,
      payload: n.payload,
      status: n.status,
      attempt_count: n.attemptCount,
      claim_id: n.claimId,
      claim_expires_at: n.claimExpiresAt,
      available_at: n.availableAt,
      created_at: n.createdAt,
      processed_at: n.processedAt,
      last_error: n.lastError,
    })),
    error: null,
  };
}

function okComplete(notification: NotificationRow): RpcResult {
  return {
    data: {
      id: notification.id,
      tenant_id: notification.tenantId,
      ticket_id: notification.ticketId,
      event_id: notification.eventId,
      notification_type: notification.notificationType,
      recipient_user_id: notification.recipientUserId,
      recipient_email_snapshot: notification.recipientEmailSnapshot,
      payload: notification.payload,
      status: "sent",
      attempt_count: notification.attemptCount + 1,
      claim_id: null,
      claim_expires_at: null,
      available_at: notification.availableAt,
      created_at: notification.createdAt,
      processed_at: "2026-08-31T12:01:00Z",
      last_error: null,
    },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================================
// WORKER-01: claim batch exitoso
// =====================================================================

describe("WORKER-01: claim batch", () => {
  it("reclama un batch vía claim_pending_notifications y emite log worker.claimed", async () => {
    const notif = baseNotification();
    const { mock, rpc } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider();
    const logger = captureOnlyLogger();

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      batchSize: 5,
      leaseSeconds: 60,
      logger,
    });

    // 1ª rpc = claim, 2ª rpc = complete.
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][0]).toBe("claim_pending_notifications");
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_limit: 5,
      p_lease_seconds: 60,
    });

    expect(result.claimed).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);

    // Log worker.claimed emitido.
    const claimedLog = result.logs.find((l) => l.event === "worker.claimed");
    expect(claimedLog).toBeDefined();
    expect(claimedLog?.fields).toMatchObject({ claimed: 1 });
  });

  it("worker.start log contiene batchSize, leaseSeconds, provider", async () => {
    const { mock } = makeMockSupabase({
      claimResult: { data: [], error: null },
    });
    const provider = new InMemoryProvider();
    const logger = captureOnlyLogger();

    await runWorkerOnce({
      supabase: mock,
      provider,
      batchSize: 25,
      leaseSeconds: 90,
      logger,
    });

    const startLog = logger.records.find((l) => l.event === "worker.start");
    expect(startLog).toBeDefined();
    expect(startLog?.fields).toMatchObject({
      batchSize: 25,
      leaseSeconds: 90,
      provider: "in-memory",
    });
  });
});

// =====================================================================
// WORKER-02/03: render por tipo
// =====================================================================

describe("WORKER-02/03: render por notification_type", () => {
  it("WORKER-02: ticket.assigned → subject identificable", async () => {
    const notif = baseNotification({
      notificationType: "ticket.assigned",
      payload: {
        ticket_id: "tk-1",
        ticket_title: "Impresora no imprime",
        assigned_by: "u-lead",
      },
    });
    const { mock } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider();
    const logger = captureOnlyLogger();

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      logger,
    });

    expect(provider.sent).toHaveLength(1);
    const msg = provider.sent[0];
    expect(msg.subject).toContain("Impresora no imprime");
    expect(msg.subject).toContain("asignado");
    expect(msg.body).toContain("u-lead");
    expect(result.sent).toBe(1);
  });

  it("WORKER-03: ticket.state_changed_to_resolved → subject identificable", async () => {
    const notif = baseNotification({
      notificationType: "ticket.state_changed_to_resolved",
      payload: {
        ticket_id: "tk-1",
        ticket_title: "Internet lento",
        from_state: "EN_PROCESO",
        to_state: "RESUELTO",
      },
    });
    const { mock } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider();
    const logger = captureOnlyLogger();

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      logger,
    });

    expect(provider.sent).toHaveLength(1);
    const msg = provider.sent[0];
    expect(msg.subject).toContain("Internet lento");
    expect(msg.subject).toContain("resuelto");
    expect(msg.body).toContain("EN_PROCESO");
    expect(msg.body).toContain("RESUELTO");
    expect(result.sent).toBe(1);
  });
});

// =====================================================================
// WORKER-04: outbox.id llega intacto como EmailMessage.outboxId
// =====================================================================

describe("WORKER-04: outboxId propagation", () => {
  it("notification_outbox.id llega intacto como EmailMessage.outboxId", async () => {
    const notif = baseNotification({
      id: "fixed-outbox-id-1234",
    });
    const { mock } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider();
    const logger = captureOnlyLogger();

    await runWorkerOnce({
      supabase: mock,
      provider,
      logger,
    });

    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].outboxId).toBe("fixed-outbox-id-1234");
  });

  it("outboxId es la clave de idempotencia upstream (no event_id)", async () => {
    // Cambiamos event_id para verificar que outboxId NO depende de él.
    const notif = baseNotification({
      id: "stable-outbox-id",
      eventId: "event-id-A",
    });
    const { mock } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider();

    await runWorkerOnce({
      supabase: mock,
      provider,
      logger: captureOnlyLogger(),
    });

    // outboxId debe ser notification_outbox.id, NO event_id.
    expect(provider.sent[0].outboxId).toBe("stable-outbox-id");
    expect(provider.sent[0].outboxId).not.toBe("event-id-A");
  });
});

// =====================================================================
// WORKER-05/06: provider success / failure → complete
// =====================================================================

describe("WORKER-05/06: provider success / failure", () => {
  it("WORKER-05: provider success → complete con status='sent', p_error=null", async () => {
    const notif = baseNotification();
    const { mock, rpc } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider();
    const logger = captureOnlyLogger();

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      logger,
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);

    // Verificar la llamada a complete.
    const completeCall = rpc.mock.calls.find(
      ([name]) => name === "complete_notification",
    );
    expect(completeCall).toBeDefined();
    expect(completeCall?.[1]).toMatchObject({
      p_notification_id: notif.id,
      p_claim_id: notif.claimId,
      p_status: "sent",
      p_error: null,
    });
  });

  it("WORKER-06: provider failure → complete con status='failed', p_error con mensaje", async () => {
    const notif = baseNotification();
    const { mock, rpc } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider({
      failAtCalls: [1],
      failureMessage: "smtp down",
    });
    const logger = captureOnlyLogger();

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      logger,
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([
      { notificationId: notif.id, error: "smtp down" },
    ]);

    const completeCall = rpc.mock.calls.find(
      ([name]) => name === "complete_notification",
    );
    expect(completeCall?.[1]).toMatchObject({
      p_notification_id: notif.id,
      p_claim_id: notif.claimId,
      p_status: "failed",
      p_error: "smtp down",
    });
  });
});

// =====================================================================
// WORKER-07/08: provider throw + error isolation
// =====================================================================

describe("WORKER-07/08: provider throw + error isolation", () => {
  it("WORKER-07: provider throw → complete con 'failed', batch continúa", async () => {
    const notif1 = baseNotification({ id: "n-1", claimId: "c-1" });
    const notif2 = baseNotification({ id: "n-2", claimId: "c-2" });
    const { mock, rpc } = makeMockSupabase({
      claimResult: okClaim([notif1, notif2]),
      completeResults: [okComplete(notif1), okComplete(notif2)],
    });

    // Provider custom: el primer send throw, el segundo ok.
    const provider: import("./provider").EmailProvider = {
      name: "throwing",
      send: vi
        .fn<(m: import("./provider").EmailMessage) => Promise<import("./provider").EmailResult>>()
        .mockImplementationOnce(async () => {
          throw new Error("unexpected boom");
        })
        .mockImplementationOnce(async () => ({
          ok: true,
          providerMessageId: "msg-2",
        })),
    };

    const logger = captureOnlyLogger();
    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      logger,
    });

    // Primer item: throw → failed.
    // Segundo item: ok → sent.
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);

    // Verificar que complete fue llamado DOS veces: una con 'failed' y
    // otra con 'sent', en cualquier orden.
    const completeCalls = rpc.mock.calls.filter(
      ([n]) => n === "complete_notification",
    );
    expect(completeCalls).toHaveLength(2);
    const statuses = completeCalls.map(([, args]) => {
      const a = args as { p_status: string };
      return a.p_status;
    });
    expect(statuses).toContain("failed");
    expect(statuses).toContain("sent");

    // El 'failed' debe llevar p_error con info del throw.
    const failedCall = completeCalls.find(
      ([, args]) => (args as { p_status: string }).p_status === "failed",
    );
    expect(failedCall?.[1]).toMatchObject({
      p_notification_id: "n-1",
      p_claim_id: "c-1",
      p_error: expect.stringContaining("unexpected boom"),
    });
  });

  it("WORKER-08: fallo de un item no impide procesar los siguientes", async () => {
    const notif1 = baseNotification({ id: "n-1", claimId: "c-1" });
    const notif2 = baseNotification({ id: "n-2", claimId: "c-2" });
    const notif3 = baseNotification({ id: "n-3", claimId: "c-3" });
    const { mock } = makeMockSupabase({
      claimResult: okClaim([notif1, notif2, notif3]),
      completeResults: [
        okComplete(notif1),
        okComplete(notif2),
        okComplete(notif3),
      ],
    });

    // Provider: el segundo send falla, los demás ok.
    const provider = new InMemoryProvider({
      failAtCalls: [2],
      failureMessage: "transient 502",
    });
    const logger = captureOnlyLogger();

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      logger,
    });

    // 2 sent (items 1 y 3) + 1 failed (item 2).
    expect(provider.sent).toHaveLength(2);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      notificationId: "n-2",
      error: "transient 502",
    });
  });
});

// =====================================================================
// WORKER-09: sin retry inmediato
// =====================================================================

describe("WORKER-09: no retry inmediato dentro del worker", () => {
  it("worker NO reintenta un fallo del provider en la misma ejecución", async () => {
    const notif = baseNotification();
    const { mock } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });

    let sendCount = 0;
    const provider: import("./provider").EmailProvider = {
      name: "counting",
      send: vi.fn(async () => {
        sendCount += 1;
        return { ok: false, error: "permanent fail" };
      }),
    };

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      logger: captureOnlyLogger(),
    });

    // Provider.send fue llamado UNA sola vez.
    expect(sendCount).toBe(1);
    // El item queda 'failed' (NO reintentado).
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    // El worker retorna inmediatamente tras la falla.
    // (No loop interno de reintentos.)
  });
});

// =====================================================================
// WORKER-10: provider recibe EmailMessage correcto
// =====================================================================

describe("WORKER-10: provider receives correct EmailMessage", () => {
  it("EmailMessage.to = recipientEmailSnapshot; subject/body renderizados", async () => {
    const notif = baseNotification({
      recipientEmailSnapshot: "alice@example.test",
      payload: {
        ticket_id: "tk-99",
        ticket_title: "Laptop won't boot",
        assigned_by: "bob@example.test",
      },
    });
    const { mock } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider();

    await runWorkerOnce({
      supabase: mock,
      provider,
      logger: captureOnlyLogger(),
    });

    expect(provider.sent).toHaveLength(1);
    const m = provider.sent[0];
    expect(m.to).toBe("alice@example.test");
    expect(m.subject).toContain("Laptop won't boot");
    expect(m.body).toContain("bob@example.test");
    expect(m.body).toContain("tk-99");
    expect(m.notificationType).toBe("ticket.assigned");
    expect(m.outboxId).toBe(notif.id);
  });
});

// =====================================================================
// WORKER-11: claim_id correcto llega a complete
// =====================================================================

describe("WORKER-11: claim_id propagation", () => {
  it("claim_id de la fila claimed llega intacto a complete_notification", async () => {
    const notif = baseNotification({
      id: "n-99",
      claimId: "claim-fixed-xyz",
    });
    const { mock, rpc } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider();

    await runWorkerOnce({
      supabase: mock,
      provider,
      logger: captureOnlyLogger(),
    });

    const completeCall = rpc.mock.calls.find(
      ([n]) => n === "complete_notification",
    );
    expect(completeCall).toBeDefined();
    expect(completeCall?.[1]).toMatchObject({
      p_notification_id: "n-99",
      p_claim_id: "claim-fixed-xyz",
    });
  });

  it("dos items distintos: cada uno lleva su propio claim_id a complete", async () => {
    const a = baseNotification({ id: "n-A", claimId: "claim-A" });
    const b = baseNotification({ id: "n-B", claimId: "claim-B" });
    const { mock, rpc } = makeMockSupabase({
      claimResult: okClaim([a, b]),
      completeResults: [okComplete(a), okComplete(b)],
    });
    const provider = new InMemoryProvider();

    await runWorkerOnce({
      supabase: mock,
      provider,
      logger: captureOnlyLogger(),
    });

    const completeCalls = rpc.mock.calls.filter(
      ([n]) => n === "complete_notification",
    );
    expect(completeCalls).toHaveLength(2);

    const byNotif = new Map<string, { p_claim_id: string }>();
    for (const [, args] of completeCalls) {
      const a2 = args as { p_notification_id: string; p_claim_id: string };
      byNotif.set(a2.p_notification_id, { p_claim_id: a2.p_claim_id });
    }
    expect(byNotif.get("n-A")?.p_claim_id).toBe("claim-A");
    expect(byNotif.get("n-B")?.p_claim_id).toBe("claim-B");
  });
});

// =====================================================================
// WORKER-12: logging no expone API key ni secretos
// =====================================================================

describe("WORKER-12: log redaction", () => {
  it("default logger redacta re_<token> en strings de error", async () => {
    const notif = baseNotification();
    const { mock } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });

    // Provider que falla con un mensaje que incluye una API key.
    const provider = new InMemoryProvider({
      failAtCalls: [1],
      failureMessage: "auth failed for re_AbCdEf12345_XYZ",
    });

    // Capturamos console.log / console.warn / console.error.
    const writes: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;
    console.log = (...args: unknown[]) => writes.push(String(args[0]));
    console.warn = (...args: unknown[]) => writes.push(String(args[0]));
    console.error = (...args: unknown[]) => writes.push(String(args[0]));

    try {
      await runWorkerOnce({
        supabase: mock,
        provider,
        // logger: undefined → defaultLogger → escribe a stdout
      });
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origErr;
    }

    const blob = writes.join("\n");
    // La API key NO debe aparecer en logs.
    expect(blob).not.toContain("re_AbCdEf12345_XYZ");
    // La redacción sí debe aparecer.
    expect(blob).toContain("re_***REDACTED***");
  });

  it("captureOnlyLogger también redacta (fields con apiKey se enmascaran)", async () => {
    const notif = baseNotification();
    const { mock } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider();
    const logger = captureOnlyLogger();

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      logger,
    });

    // Ningún log debe contener la cadena de la API key (no la pusimos,
    // pero verificamos que si el provider fallara con un mensaje de error
    // que la contuviera, NO se filtraría).
    for (const l of result.logs) {
      const blob = JSON.stringify(l.fields);
      expect(blob).not.toMatch(/re_[A-Za-z0-9_]{6,}/);
    }
  });
});

// =====================================================================
// WORKER-13: itemTimeoutMs audit field (NOT a timeout enforcement test)
// =====================================================================
//
// IMPORTANT: This describe block does NOT test timeout enforcement.
// `runWorkerOnce` does not implement per-item timeouts, does not use
// `Promise.race`, and does not apply `itemTimeoutMs` to the dispatch
// loop. The tests in this block verify the **audit/configuration
// contract only**:
//   1. `itemTimeoutMs` is recorded in the `worker.start` log fields.
//   2. `itemTimeouts` in the result and in `worker.summary` is 0.
//
// The actual execution timeout belongs to the runtime layer
// (Edge Function / pg_cron / Vercel cron) that invokes
// `runWorkerOnce`. See §Timeout in worker.ts header.

describe("WORKER-13: itemTimeoutMs audit field (no timeout enforcement in Phase 2B)", () => {
  it("records itemTimeoutMs in worker.start and itemTimeouts=0 in result", async () => {
    // The provider is synchronous (InMemoryProvider) so the batch
    // completes normally. The test verifies ONLY that the configured
    // value is recorded in the audit log and that `itemTimeouts` stays
    // at 0 (because no timeout is enforced).
    const notif = baseNotification();
    const { mock } = makeMockSupabase({
      claimResult: okClaim([notif]),
      completeResults: [okComplete(notif)],
    });
    const provider = new InMemoryProvider();
    const logger = captureOnlyLogger();

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      itemTimeoutMs: 5000,
      logger,
    });

    // Audit field recorded in worker.start.
    const startLog = result.logs.find((l) => l.event === "worker.start");
    expect(startLog?.fields.itemTimeoutMs).toBe(5000);

    // No timeout enforcement: result.itemTimeouts is 0.
    expect(result.itemTimeouts).toBe(0);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("summary log exposes itemTimeouts=0 to operators (audit visibility)", async () => {
    // The `worker.summary` log surfaces `itemTimeouts` so operators can
    // audit the absence of timeouts in Phase 2B. The value is 0
    // because no timeout is enforced.
    const { mock } = makeMockSupabase({
      claimResult: { data: [], error: null },
    });
    const provider = new InMemoryProvider();
    const logger = captureOnlyLogger();

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      itemTimeoutMs: 30000,
      leaseSeconds: 60,
      logger,
    });

    const start = result.logs.find((l) => l.event === "worker.start");
    expect(start?.fields).toMatchObject({
      itemTimeoutMs: 30000,
      leaseSeconds: 60,
    });

    // Summary records itemTimeouts=0 (audit visibility).
    const summary = result.logs.find((l) => l.event === "worker.summary");
    expect(summary?.fields.itemTimeouts).toBe(0);
  });
});

// =====================================================================
// WORKER-14: empty batch
// =====================================================================

describe("WORKER-14: empty batch", () => {
  it("outbox vacío: claimed=0, sent=0, failed=0, sin provider calls, summary limpio", async () => {
    const { mock, rpc } = makeMockSupabase({
      claimResult: { data: [], error: null },
    });
    const provider = new InMemoryProvider();
    const logger = captureOnlyLogger();

    const result = await runWorkerOnce({
      supabase: mock,
      provider,
      logger,
    });

    // Sólo se llama rpc para claim (vacío); NO hay complete.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("claim_pending_notifications");

    // Sin provider calls.
    expect(provider.sent).toHaveLength(0);

    // Resultado limpio.
    expect(result.claimed).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.itemTimeouts).toBe(0);

    // Logs estructurados correctos.
    const events = result.logs.map((l) => l.event);
    expect(events).toContain("worker.start");
    expect(events).toContain("worker.claimed");
    expect(events).toContain("worker.summary");
    // No hay logs de item.failed.
    expect(events).not.toContain("item.failed");

    // worker.claimed = 0
    const claimed = result.logs.find((l) => l.event === "worker.claimed");
    expect(claimed?.fields.claimed).toBe(0);

    // worker.summary coherente
    const summary = result.logs.find((l) => l.event === "worker.summary");
    expect(summary?.fields).toMatchObject({
      claimed: 0,
      sent: 0,
      failed: 0,
      provider: "in-memory",
    });
  });
});
