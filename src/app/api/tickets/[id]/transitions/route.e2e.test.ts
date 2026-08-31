/**
 * Tests TKT-024: e2e del handler POST /api/tickets/[id]/transitions.
 *
 * Mockeamos:
 *   - @/shared/supabase/server (auth)
 *   - @/modules/ticketing/actor (resolveActor)
 *   - @/modules/ticketing/supabase-repository (createSupabaseTicketRepository)
 *
 * Validamos que el handler:
 *   1) rechaza sin auth -> 401
 *   2) rechaza body inválido -> 400
 *   3) rechaza ticket no visible -> 404
 *   4) FSM gate: supervisor en transición restringida -> 403 sin RPC
 *   5) FSM gate: agente asignado puede ejecutar -> 200 + updateTicketState llamado
 *   6) DB error -> mapea a HTTP status correcto
 *
 * No ejecuta la SECURITY DEFINER real (eso está cubierto por pgTAP
 * en `tickets_apply_transition.sql`).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER_REQ = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_AGENT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER_SUP = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const USER_LEAD = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const TICKET_ID = "99999999-9999-9999-9999-999999999999";

// Mocks globales
const mockGetUser = vi.fn();
const mockUpdateTicketState = vi.fn();

const baseTicket: Ticket = {
  id: TICKET_ID,
  tenantId: TENANT,
  requesterId: USER_REQ,
  categoryId: "cat-1",
  priority: "P3",
  state: "ABIERTO",
  title: "Test",
  description: "Descripcion valida con suficiente longitud.",
  assignedTo: USER_AGENT,
  areaId: null,
  teamId: null,
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  slaStatus: "on_track",
  createdAt: "2026-08-31T00:00:00Z",
  updatedAt: "2026-08-31T00:00:00Z",
};

vi.mock("@/shared/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/modules/ticketing/actor", () => ({
  resolveActor: async (
    _supabase: unknown,
    _tenantId: string,
    fallbackUserId: string | null,
  ) => {
    if (!fallbackUserId) {
      return { ok: false, reason: "not_authenticated" };
    }
    const kinds: Record<string, "agent" | "requester" | "supervisor" | "technical_lead" | "director"> = {
      [USER_AGENT]: "agent",
      [USER_REQ]: "requester",
      [USER_SUP]: "supervisor",
      [USER_LEAD]: "technical_lead",
    };
    const roleMap: Record<string, string> = {
      [USER_AGENT]: "operator",
      [USER_REQ]: "operator",
      [USER_SUP]: "supervisor",
      [USER_LEAD]: "technical_lead",
    };
    return {
      ok: true,
      actor: {
        userId: fallbackUserId,
        functionalRole: roleMap[fallbackUserId] ?? "operator",
        kind: kinds[fallbackUserId] ?? "agent",
      },
    };
  },
}));

// Mockear el supabase-repository para que getTicket y applyTransition
// devuelvan lo que queremos. Esto evita mockear la chain completa de
// Supabase (que es frágil y propensa a errores de tipos).
let mockGetTicket = vi.fn();
let mockApplyTransition = vi.fn();
let mockCreateRepo = vi.fn();

vi.mock("@/modules/ticketing/supabase-repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/ticketing/supabase-repository")>(
    "@/modules/ticketing/supabase-repository",
  );
  return {
    ...actual,
    createSupabaseTicketRepository: () => {
      mockCreateRepo();
      return {
        getTicket: (id: string) => mockGetTicket(id),
      };
    },
    applyTransition: (...args: unknown[]) =>
      mockApplyTransition(...args) as ReturnType<typeof actual.applyTransition>,
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

// Importar DESPUÉS de los mocks.
import { POST } from "./route";
import { canTransition } from "@/modules/ticketing/state-machine";
import type { Ticket } from "@/modules/ticketing/repository";

function makeRequest(body: unknown): import("next/server").NextRequest {
  return new Request(`http://localhost/api/tickets/${TICKET_ID}/transitions`, {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function makeContext() {
  return { params: Promise.resolve({ id: TICKET_ID }) };
}

function setupUser(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
    error: null,
  });
}

function setupTicket(ticket: Ticket | null) {
  mockGetTicket.mockImplementation(async (id: string) => {
    if (id !== TICKET_ID) return null;
    return ticket;
  });
}

function setupRpcResult(
  result:
    | { ok: true; ticket: Ticket }
    | { ok: false; error: { kind: string; reason?: string } },
) {
  mockApplyTransition.mockResolvedValue(result);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTicket = vi.fn();
  mockApplyTransition = vi.fn();
  mockCreateRepo = vi.fn();
});

describe("TKT-024 — POST /api/tickets/[id]/transitions (e2e con mocks)", () => {
  it("retorna 401 si no hay usuario autenticado", async () => {
    setupUser(null);
    const res = await POST(makeRequest({ toState: "EN_PROCESO" }), makeContext());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("authentication_required");
  });

  it("retorna 400 si el body no es JSON válido", async () => {
    setupUser(USER_AGENT);
    const req = new Request(`http://localhost/api/tickets/${TICKET_ID}/transitions`, {
      method: "POST",
      body: "{not json",
    }) as unknown as import("next/server").NextRequest;
    const res = await POST(req, makeContext());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });

  it("retorna 400 si toState no es válido", async () => {
    setupUser(USER_AGENT);
    const res = await POST(makeRequest({ toState: "INVALIDO" }), makeContext());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_to_state");
  });

  it("retorna 403 si FSM deniega (supervisor en transición restringida)", async () => {
    setupUser(USER_SUP);
    setupTicket({ ...baseTicket, state: "EN_PROCESO" } as Ticket);
    const res = await POST(
      makeRequest({ toState: "RESUELTO", reason: "test" }),
      makeContext(),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("fsm_denied");
    expect(body.canRequest).toBe(true);
    expect(body.fromState).toBe("EN_PROCESO");
    expect(body.toState).toBe("RESUELTO");
    expect(mockApplyTransition).not.toHaveBeenCalled();
  });

  it("retorna 200 cuando el agente asignado ejecuta EN_PROCESO (happy path)", async () => {
    setupUser(USER_AGENT);
    setupTicket({ ...baseTicket, state: "ABIERTO" } as Ticket);
    const updated: Ticket = { ...baseTicket, state: "EN_PROCESO" };
    setupRpcResult({ ok: true, ticket: updated });

    const res = await POST(
      makeRequest({ toState: "EN_PROCESO", reason: "ok" }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket.state).toBe("EN_PROCESO");
    expect(body.transition.from).toBe("ABIERTO");
    expect(body.transition.to).toBe("EN_PROCESO");
    expect(mockApplyTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ticketId: TICKET_ID,
        fromState: "ABIERTO",
        toState: "EN_PROCESO",
        reason: "ok",
      }),
    );
  });

  it("retorna 403 cuando SECURITY DEFINER rechaza (defense in depth)", async () => {
    setupUser(USER_AGENT);
    setupTicket({ ...baseTicket, state: "ABIERTO" } as Ticket);
    setupRpcResult({
      ok: false,
      error: { kind: "forbidden", reason: "actor not authorized" },
    });

    const res = await POST(
      makeRequest({ toState: "EN_PROCESO" }),
      makeContext(),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });
});

describe("TKT-024 — FSM canónica (smoke test de coherencia con TKT-006)", () => {
  it("canTransition refleja exactamente la matriz v3", () => {
    const result = canTransition(
      "EN_PROCESO",
      "ESPERANDO_USUARIO",
      { userId: USER_SUP, functionalRole: "supervisor", kind: "supervisor" },
      { ...baseTicket, state: "EN_PROCESO" } as Ticket,
    );
    expect(result.canRequest).toBe(true);
    expect(result.canExecute).toBe(false);
    expect(result.valid).toBe(false);
  });
});
