/**
 * Tests TKT-019: dispatcher + repository + provider.
 *
 * Cubre:
 *  - claimPendingNotifications: mocks de rpc + from()
 *  - completeNotification: mocks de rpc + error mapping
 *  - dispatchBatch: orquestación, claim -> send -> complete
 *  - InMemoryProvider: éxito, fallo programado, exception
 *  - renderTemplate: subject/body por notification_type
 *  - skipped: sin claim_id (race)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimPendingNotifications,
  completeNotification,
} from "./repository";
import { dispatchBatch } from "./dispatcher";
import { renderTemplate } from "./templates";
import { InMemoryProvider } from "./providers/in-memory-provider";
import type { NotificationRow } from "./types";

// =====================================================================
// Mocks de Supabase (chainable rpc + from)
// =====================================================================

type RpcResult =
  | { data: unknown; error: null }
  | { data: null; error: { code?: string; message: string } };

function makeMockSupabase() {
  const rpc = vi.fn<() => Promise<RpcResult>>();
  const mock = { rpc } as unknown as SupabaseClient;
  return { mock, rpc };
}

// =====================================================================
// Helpers
// =====================================================================

function baseNotification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "n-1",
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

function resolvedNotification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return baseNotification({
    status: "sent",
    processedAt: "2026-08-31T12:01:00Z",
    lastError: null,
    ...overrides,
  });
}

function failedNotification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return baseNotification({
    status: "failed",
    processedAt: "2026-08-31T12:01:00Z",
    lastError: "smtp timeout",
    attemptCount: 1,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================================
// claimPendingNotifications
// =====================================================================

describe("claimPendingNotifications (TKT-019)", () => {
  it("rechaza limit <= 0 SIN llamar rpc", async () => {
    const { mock, rpc } = makeMockSupabase();
    const result = await claimPendingNotifications(mock, 0, 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechaza limit > 1000 SIN llamar rpc", async () => {
    const { mock, rpc } = makeMockSupabase();
    const result = await claimPendingNotifications(mock, 5000, 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechaza leaseSeconds negativo SIN llamar rpc", async () => {
    const { mock, rpc } = makeMockSupabase();
    const result = await claimPendingNotifications(mock, 10, -1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("mapea error 42501 a kind=forbidden", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not authorized" },
    });
    const result = await claimPendingNotifications(mock, 10, 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("forbidden");
    }
  });

  it("mapea error desconocido a kind=db_error", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "XX999", message: "rare" },
    });
    const result = await claimPendingNotifications(mock, 10, 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("db_error");
    }
  });

  it("en éxito: rpc llamado con p_limit y p_lease_seconds", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({
      data: [
        {
          id: "n-1",
          tenant_id: "t-1",
          ticket_id: "tk-1",
          event_id: "ev-1",
          notification_type: "ticket.assigned",
          recipient_user_id: "u-1",
          recipient_email_snapshot: "u@e.test",
          payload: { ticket_id: "tk-1", ticket_title: "T" },
          status: "processing",
          attempt_count: 0,
          claim_id: "claim-1",
          claim_expires_at: "2026-08-31T13:00:00Z",
          available_at: "2026-08-31T12:00:00Z",
          created_at: "2026-08-31T12:00:00Z",
          processed_at: null,
          last_error: null,
        },
      ],
      error: null,
    });
    const result = await claimPendingNotifications(mock, 25, 90);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]?.claimId).toBe("claim-1");
    }
    expect(rpc).toHaveBeenCalledWith("claim_pending_notifications", {
      p_limit: 25,
      p_lease_seconds: 90,
    });
  });

  it("en éxito con 0 filas: ok=true, notifications=[]", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({ data: [], error: null });
    const result = await claimPendingNotifications(mock, 10, 60);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notifications).toHaveLength(0);
    }
  });
});

// =====================================================================
// completeNotification
// =====================================================================

describe("completeNotification (TKT-019)", () => {
  it("rechaza status distinto de sent/failed SIN llamar rpc", async () => {
    const { mock, rpc } = makeMockSupabase();
    const result = await completeNotification(
      mock,
      "n-1",
      "claim-1",
      "bogus" as never,
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("mapea P0002 (not found) a kind=not_found", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "notification not found" },
    });
    const result = await completeNotification(mock, "n-1", "claim-1", "sent", null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not_found");
    }
  });

  it("mapea 42501 (claim_id mismatch) a kind=forbidden", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "claim_id mismatch" },
    });
    const result = await completeNotification(mock, "n-1", "claim-1", "sent", null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("forbidden");
    }
  });

  it("mapea P0001 (must be sent or failed) a kind=validation", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "p_status must be sent or failed",
      },
    });
    const result = await completeNotification(mock, "n-1", "claim-1", "sent", null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
    }
  });

  it("mapea error desconocido a kind=db_error", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "XX999", message: "rare" },
    });
    const result = await completeNotification(mock, "n-1", "claim-1", "sent", null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("db_error");
    }
  });

  it("en éxito: rpc llamado con status sent y p_error=null", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({
      data: {
        id: "n-1",
        tenant_id: "t-1",
        ticket_id: "tk-1",
        event_id: "ev-1",
        notification_type: "ticket.assigned",
        recipient_user_id: "u-1",
        recipient_email_snapshot: "u@e.test",
        payload: { ticket_id: "tk-1", ticket_title: "T" },
        status: "sent",
        attempt_count: 0,
        claim_id: null,
        claim_expires_at: null,
        available_at: "2026-08-31T12:00:00Z",
        created_at: "2026-08-31T12:00:00Z",
        processed_at: "2026-08-31T12:01:00Z",
        last_error: null,
      },
      error: null,
    });
    const result = await completeNotification(mock, "n-1", "claim-1", "sent", null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notification.status).toBe("sent");
    }
    expect(rpc).toHaveBeenCalledWith("complete_notification", {
      p_notification_id: "n-1",
      p_claim_id: "claim-1",
      p_status: "sent",
      p_error: null,
    });
  });

  it("en éxito con status failed: pasa el error message", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({
      data: {
        id: "n-1",
        tenant_id: "t-1",
        ticket_id: "tk-1",
        event_id: "ev-1",
        notification_type: "ticket.assigned",
        recipient_user_id: "u-1",
        recipient_email_snapshot: "u@e.test",
        payload: { ticket_id: "tk-1", ticket_title: "T" },
        status: "failed",
        attempt_count: 1,
        claim_id: null,
        claim_expires_at: null,
        available_at: "2026-08-31T12:30:00Z",
        created_at: "2026-08-31T12:00:00Z",
        processed_at: "2026-08-31T12:01:00Z",
        last_error: "smtp timeout",
      },
      error: null,
    });
    await completeNotification(mock, "n-1", "claim-1", "failed", "smtp timeout");
    expect(rpc).toHaveBeenCalledWith("complete_notification", {
      p_notification_id: "n-1",
      p_claim_id: "claim-1",
      p_status: "failed",
      p_error: "smtp timeout",
    });
  });
});

// =====================================================================
// renderTemplate
// =====================================================================

describe("renderTemplate (TKT-019)", () => {
  it("render ticket.assigned con subject identificable", () => {
    const out = renderTemplate(
      baseNotification({ notificationType: "ticket.assigned" }),
    );
    expect(out.subject).toMatch(/Ticket asignado/);
    expect(out.body).toContain("Test ticket");
    expect(out.body).toContain("tk-1");
  });

  it("render ticket.state_changed_to_resolved con subject identificable", () => {
    const out = renderTemplate(
      baseNotification({
        notificationType: "ticket.state_changed_to_resolved",
        payload: {
          ticket_id: "tk-2",
          ticket_title: "Carpeta compartida",
          from_state: "EN_PROCESO",
          to_state: "RESUELTO",
        },
      }),
    );
    expect(out.subject).toMatch(/Tu ticket fue resuelto/);
    expect(out.body).toContain("Carpeta compartida");
    expect(out.body).toContain("RESUELTO");
  });
});

// =====================================================================
// InMemoryProvider
// =====================================================================

describe("InMemoryProvider (TKT-019)", () => {
  it("registra cada send() exitoso", async () => {
    const p = new InMemoryProvider();
    const r1 = await p.send({
      to: "a@e.test",
      subject: "s1",
      body: "b1",
      notificationType: "ticket.assigned",
      outboxId: "n-1",
    });
    const r2 = await p.send({
      to: "b@e.test",
      subject: "s2",
      body: "b2",
      notificationType: "ticket.assigned",
      outboxId: "n-2",
    });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(p.sent).toHaveLength(2);
    expect(p.sent[0]?.to).toBe("a@e.test");
    expect(p.sent[1]?.outboxId).toBe("n-2");
  });

  it("falla en los calls programados", async () => {
    const p = new InMemoryProvider({ failAtCalls: [2], failureMessage: "boom" });
    const r1 = await p.send({
      to: "a@e.test",
      subject: "s",
      body: "b",
      notificationType: "ticket.assigned",
      outboxId: "n-1",
    });
    const r2 = await p.send({
      to: "b@e.test",
      subject: "s",
      body: "b",
      notificationType: "ticket.assigned",
      outboxId: "n-2",
    });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error).toBe("boom");
    }
    expect(p.sent).toHaveLength(1);
  });
});

// =====================================================================
// dispatchBatch (orquestación)
// =====================================================================

describe("dispatchBatch (TKT-019)", () => {
  it("happy path: claimed=1, sent=1, failed=0", async () => {
    const { mock, rpc } = makeMockSupabase();
    let call = 0;
    rpc.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        // claim
        return {
          data: [
            {
              id: "n-1",
              tenant_id: "t-1",
              ticket_id: "tk-1",
              event_id: "ev-1",
              notification_type: "ticket.assigned",
              recipient_user_id: "u-1",
              recipient_email_snapshot: "u@e.test",
              payload: { ticket_id: "tk-1", ticket_title: "T" },
              status: "processing",
              attempt_count: 0,
              claim_id: "claim-1",
              claim_expires_at: "2026-08-31T13:00:00Z",
              available_at: "2026-08-31T12:00:00Z",
              created_at: "2026-08-31T12:00:00Z",
              processed_at: null,
              last_error: null,
            },
          ],
          error: null,
        };
      }
      // complete -> sent
      return {
        data: {
          id: "n-1",
          tenant_id: "t-1",
          ticket_id: "tk-1",
          event_id: "ev-1",
          notification_type: "ticket.assigned",
          recipient_user_id: "u-1",
          recipient_email_snapshot: "u@e.test",
          payload: { ticket_id: "tk-1", ticket_title: "T" },
          status: "sent",
          attempt_count: 0,
          claim_id: null,
          claim_expires_at: null,
          available_at: "2026-08-31T12:00:00Z",
          created_at: "2026-08-31T12:00:00Z",
          processed_at: "2026-08-31T12:01:00Z",
          last_error: null,
        },
        error: null,
      };
    });
    const provider = new InMemoryProvider();
    const result = await dispatchBatch({ supabase: mock, provider });
    expect(result.claimed).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(provider.sent).toHaveLength(1);
  });

  it("provider falla: failed=1, last_error registrado", async () => {
    const { mock, rpc } = makeMockSupabase();
    let call = 0;
    rpc.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return {
          data: [
            {
              id: "n-1",
              tenant_id: "t-1",
              ticket_id: "tk-1",
              event_id: "ev-1",
              notification_type: "ticket.assigned",
              recipient_user_id: "u-1",
              recipient_email_snapshot: "u@e.test",
              payload: { ticket_id: "tk-1", ticket_title: "T" },
              status: "processing",
              attempt_count: 0,
              claim_id: "claim-1",
              claim_expires_at: "2026-08-31T13:00:00Z",
              available_at: "2026-08-31T12:00:00Z",
              created_at: "2026-08-31T12:00:00Z",
              processed_at: null,
              last_error: null,
            },
          ],
          error: null,
        };
      }
      // complete -> failed
      return {
        data: {
          id: "n-1",
          tenant_id: "t-1",
          ticket_id: "tk-1",
          event_id: "ev-1",
          notification_type: "ticket.assigned",
          recipient_user_id: "u-1",
          recipient_email_snapshot: "u@e.test",
          payload: { ticket_id: "tk-1", ticket_title: "T" },
          status: "failed",
          attempt_count: 1,
          claim_id: null,
          claim_expires_at: null,
          available_at: "2026-08-31T12:30:00Z",
          created_at: "2026-08-31T12:00:00Z",
          processed_at: "2026-08-31T12:01:00Z",
          last_error: "smtp down",
        },
        error: null,
      };
    });
    const provider = new InMemoryProvider({ failAtCalls: [1], failureMessage: "smtp down" });
    const result = await dispatchBatch({ supabase: mock, provider });
    expect(result.claimed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.notificationId).toBe("n-1");
    expect(result.errors[0]?.error).toBe("smtp down");
  });

  it("provider throws exception: failed=1, registra error de excepción", async () => {
    const { mock, rpc } = makeMockSupabase();
    let call = 0;
    rpc.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return {
          data: [
            {
              id: "n-1",
              tenant_id: "t-1",
              ticket_id: "tk-1",
              event_id: "ev-1",
              notification_type: "ticket.assigned",
              recipient_user_id: "u-1",
              recipient_email_snapshot: "u@e.test",
              payload: { ticket_id: "tk-1", ticket_title: "T" },
              status: "processing",
              attempt_count: 0,
              claim_id: "claim-1",
              claim_expires_at: "2026-08-31T13:00:00Z",
              available_at: "2026-08-31T12:00:00Z",
              created_at: "2026-08-31T12:00:00Z",
              processed_at: null,
              last_error: null,
            },
          ],
          error: null,
        };
      }
      return {
        data: {
          id: "n-1",
          tenant_id: "t-1",
          ticket_id: "tk-1",
          event_id: "ev-1",
          notification_type: "ticket.assigned",
          recipient_user_id: "u-1",
          recipient_email_snapshot: "u@e.test",
          payload: { ticket_id: "tk-1", ticket_title: "T" },
          status: "failed",
          attempt_count: 1,
          claim_id: null,
          claim_expires_at: null,
          available_at: "2026-08-31T12:30:00Z",
          created_at: "2026-08-31T12:00:00Z",
          processed_at: "2026-08-31T12:01:00Z",
          last_error: "provider threw: boom",
        },
        error: null,
      };
    });
    const provider: import("./provider").EmailProvider = {
      name: "throwing",
      send: async () => {
        throw new Error("boom");
      },
    };
    const result = await dispatchBatch({ supabase: mock, provider });
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.error).toMatch(/provider threw/);
  });

  it("claim falla: claimed=0, errors contiene la razón", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "XX999", message: "db down" },
    });
    const provider = new InMemoryProvider();
    const result = await dispatchBatch({ supabase: mock, provider });
    expect(result.claimed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.notificationId).toBe("(claim)");
    expect(result.errors[0]?.error).toContain("db down");
  });

  it("outbox vacío: claimed=0, sent=0, failed=0", async () => {
    const { mock, rpc } = makeMockSupabase();
    rpc.mockResolvedValue({ data: [], error: null });
    const provider = new InMemoryProvider();
    const result = await dispatchBatch({ supabase: mock, provider });
    expect(result.claimed).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(provider.sent).toHaveLength(0);
  });

  it("multi-batch: 3 notificaciones -> 2 sent + 1 failed", async () => {
    const { mock, rpc } = makeMockSupabase();
    let call = 0;
    rpc.mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return {
          data: [
            {
              id: "n-1",
              tenant_id: "t-1",
              ticket_id: "tk-1",
              event_id: "ev-1",
              notification_type: "ticket.assigned",
              recipient_user_id: "u-1",
              recipient_email_snapshot: "u1@e.test",
              payload: { ticket_id: "tk-1", ticket_title: "T1" },
              status: "processing",
              attempt_count: 0,
              claim_id: "claim-1",
              claim_expires_at: "2026-08-31T13:00:00Z",
              available_at: "2026-08-31T12:00:00Z",
              created_at: "2026-08-31T12:00:00Z",
              processed_at: null,
              last_error: null,
            },
            {
              id: "n-2",
              tenant_id: "t-1",
              ticket_id: "tk-1",
              event_id: "ev-2",
              notification_type: "ticket.state_changed_to_resolved",
              recipient_user_id: "u-2",
              recipient_email_snapshot: "u2@e.test",
              payload: {
                ticket_id: "tk-1",
                ticket_title: "T1",
                from_state: "EN_PROCESO",
                to_state: "RESUELTO",
              },
              status: "processing",
              attempt_count: 0,
              claim_id: "claim-2",
              claim_expires_at: "2026-08-31T13:00:00Z",
              available_at: "2026-08-31T12:00:00Z",
              created_at: "2026-08-31T12:00:00Z",
              processed_at: null,
              last_error: null,
            },
            {
              id: "n-3",
              tenant_id: "t-1",
              ticket_id: "tk-2",
              event_id: "ev-3",
              notification_type: "ticket.assigned",
              recipient_user_id: "u-3",
              recipient_email_snapshot: "u3@e.test",
              payload: { ticket_id: "tk-2", ticket_title: "T2" },
              status: "processing",
              attempt_count: 0,
              claim_id: "claim-3",
              claim_expires_at: "2026-08-31T13:00:00Z",
              available_at: "2026-08-31T12:00:00Z",
              created_at: "2026-08-31T12:00:00Z",
              processed_at: null,
              last_error: null,
            },
          ],
          error: null,
        };
      }
      if (call === 2) {
        return {
          data: {
            id: "n-1",
            tenant_id: "t-1",
            ticket_id: "tk-1",
            event_id: "ev-1",
            notification_type: "ticket.assigned",
            recipient_user_id: "u-1",
            recipient_email_snapshot: "u1@e.test",
            payload: { ticket_id: "tk-1", ticket_title: "T1" },
            status: "sent",
            attempt_count: 0,
            claim_id: null,
            claim_expires_at: null,
            available_at: "2026-08-31T12:00:00Z",
            created_at: "2026-08-31T12:00:00Z",
            processed_at: "2026-08-31T12:01:00Z",
            last_error: null,
          },
          error: null,
        };
      }
      if (call === 3) {
        return {
          data: {
            id: "n-2",
            tenant_id: "t-1",
            ticket_id: "tk-1",
            event_id: "ev-2",
            notification_type: "ticket.state_changed_to_resolved",
            recipient_user_id: "u-2",
            recipient_email_snapshot: "u2@e.test",
            payload: {
              ticket_id: "tk-1",
              ticket_title: "T1",
              from_state: "EN_PROCESO",
              to_state: "RESUELTO",
            },
            status: "sent",
            attempt_count: 0,
            claim_id: null,
            claim_expires_at: null,
            available_at: "2026-08-31T12:00:00Z",
            created_at: "2026-08-31T12:00:00Z",
            processed_at: "2026-08-31T12:01:00Z",
            last_error: null,
          },
          error: null,
        };
      }
      return {
        data: {
          id: "n-3",
          tenant_id: "t-1",
          ticket_id: "tk-2",
          event_id: "ev-3",
          notification_type: "ticket.assigned",
          recipient_user_id: "u-3",
          recipient_email_snapshot: "u3@e.test",
          payload: { ticket_id: "tk-2", ticket_title: "T2" },
          status: "failed",
          attempt_count: 1,
          claim_id: null,
          claim_expires_at: null,
          available_at: "2026-08-31T12:30:00Z",
          created_at: "2026-08-31T12:00:00Z",
          processed_at: "2026-08-31T12:01:00Z",
          last_error: "boom",
        },
        error: null,
      };
    });
    const provider = new InMemoryProvider({ failAtCalls: [3], failureMessage: "boom" });
    const result = await dispatchBatch({ supabase: mock, provider });
    expect(result.claimed).toBe(3);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(provider.sent).toHaveLength(2);
  });
});

// Suppress unused-import warning for helpers kept for future direct test usage.
void resolvedNotification;
void failedNotification;
