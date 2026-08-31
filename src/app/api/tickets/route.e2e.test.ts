/**
 * Tests TKT-009: e2e del handler POST /api/tickets (Mockup→Real).
 *
 * Mockeamos:
 *   - @/shared/supabase/server (auth + memberships)
 *   - @/modules/ticketing/supabase-repository (applyCreateTicket)
 *
 * Validamos que el handler:
 *   1) rechaza sin auth -> 401
 *   2) rechaza body no-JSON -> 400
 *   3) rechaza payload inválido (UUIDs, longitudes) -> 400
 *   4) rechaza sin membresía activa -> 403
 *   5) rechaza tenantId del body ≠ tenant del actor -> 400
 *   6) en éxito: 201 + applyCreateTicket llamado con payload normalizado
 *   7) errores del SECURITY DEFINER: validación -> 400, forbidden -> 403,
 *      db_error -> 500
 *
 * No ejecuta la SECURITY DEFINER real (eso está cubierto por pgTAP
 * en `tickets_create.sql`).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Ticket } from "@/modules/ticketing/repository";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "99999999-9999-9999-9999-999999999999";
const CATEGORY = "22222222-2222-2222-2222-222222222222";
const USER_REQ = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockApplyCreateTicket = vi.fn();

vi.mock("@/shared/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock("@/modules/ticketing/supabase-repository", async () => {
  const actual = await vi.importActual<typeof import("@/modules/ticketing/supabase-repository")>(
    "@/modules/ticketing/supabase-repository",
  );
  return {
    ...actual,
    applyCreateTicket: (...args: unknown[]) =>
      mockApplyCreateTicket(...args) as ReturnType<typeof actual.applyCreateTicket>,
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

// Importar DESPUÉS de los mocks.
import { POST } from "./route";

function makeRequest(body: unknown): import("next/server").NextRequest {
  return new Request("http://localhost/api/tickets", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function setupUser(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
    error: null,
  });
}

function setupMemberships(tenantId: string | null) {
  // mockFrom(".from()") chainable. Devuelve un objeto con .select.eq.limit
  // que en el route se encadena.
  mockFrom.mockImplementation(() => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: async () => ({
        data: tenantId ? [{ tenant_id: tenantId }] : [],
        error: null,
      }),
    };
    return chain;
  });
}

function setupRpcResult(
  result:
    | { ok: true; ticket: Ticket }
    | { ok: false; error: { kind: string; reason?: string } },
) {
  mockApplyCreateTicket.mockResolvedValue(result);
}

const validBody = {
  categoryId: CATEGORY,
  title: "No puedo acceder a la carpeta compartida",
  description:
    "El acceso fue solicitado para el cierre mensual y aparece denegado desde ayer.",
};

const expectedTicket: Ticket = {
  id: "tk-created-1",
  tenantId: TENANT,
  requesterId: USER_REQ,
  categoryId: CATEGORY,
  priority: "P3",
  state: "ABIERTO",
  title: validBody.title,
  description: validBody.description,
  assignedTo: null,
  areaId: null,
  teamId: null,
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  slaStatus: "on_track",
  createdAt: "2026-08-31T12:00:00Z",
  updatedAt: "2026-08-31T12:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TKT-009 — POST /api/tickets (e2e con mocks)", () => {
  it("retorna 401 si no hay usuario autenticado", async () => {
    setupUser(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("authentication_required");
  });

  it("retorna 400 si el body no es JSON válido", async () => {
    setupUser(USER_REQ);
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });

  it("retorna 400 si categoryId no es UUID", async () => {
    setupUser(USER_REQ);
    const res = await POST(
      makeRequest({ ...validBody, categoryId: "no-uuid" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_category_id");
  });

  it("retorna 400 si title es demasiado corto", async () => {
    setupUser(USER_REQ);
    const res = await POST(makeRequest({ ...validBody, title: "cuer" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_title_length");
  });

  it("retorna 400 si title es demasiado largo", async () => {
    setupUser(USER_REQ);
    const res = await POST(
      makeRequest({ ...validBody, title: "x".repeat(201) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_title_length");
  });

  it("retorna 400 si description es demasiado corta", async () => {
    setupUser(USER_REQ);
    const res = await POST(
      makeRequest({ ...validBody, description: "corto" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_description_length");
  });

  it("retorna 400 si description tiene 9 chars (< 10)", async () => {
    setupUser(USER_REQ);
    const res = await POST(
      makeRequest({ ...validBody, description: "123456789" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_description_length");
  });

  it("retorna 400 si description es demasiado larga", async () => {
    setupUser(USER_REQ);
    const res = await POST(
      makeRequest({ ...validBody, description: "x".repeat(5001) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_description_length");
  });

  it("retorna 400 si areaId no es UUID", async () => {
    setupUser(USER_REQ);
    const res = await POST(
      makeRequest({ ...validBody, areaId: "no-uuid" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_area_id");
  });

  it("retorna 400 si teamId no es UUID", async () => {
    setupUser(USER_REQ);
    const res = await POST(
      makeRequest({ ...validBody, teamId: "no-uuid" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_team_id");
  });

  it("retorna 403 si el actor no tiene membresía activa", async () => {
    setupUser(USER_REQ);
    setupMemberships(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("no_active_membership");
  });

  it("retorna 400 si tenantId del body no coincide con el del actor", async () => {
    setupUser(USER_REQ);
    setupMemberships(TENANT);
    const res = await POST(
      makeRequest({ ...validBody, tenantId: OTHER_TENANT }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("tenant_mismatch");
  });

  it("happy path: retorna 201 y llama applyCreateTicket con payload normalizado", async () => {
    setupUser(USER_REQ);
    setupMemberships(TENANT);
    setupRpcResult({ ok: true, ticket: expectedTicket });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket.id).toBe("tk-created-1");
    expect(body.ticket.state).toBe("ABIERTO");
    expect(body.by).toBe(USER_REQ);

    expect(mockApplyCreateTicket).toHaveBeenCalledTimes(1);
    const callArgs = mockApplyCreateTicket.mock.calls[0];
    // callArgs = [supabase, input]
    expect(callArgs[1]).toEqual({
      tenantId: TENANT,
      categoryId: CATEGORY,
      title: validBody.title,
      description: validBody.description,
      areaId: null,
      teamId: null,
    });
  });

  it("happy path con areaId y teamId: pasa al applyCreateTicket", async () => {
    setupUser(USER_REQ);
    setupMemberships(TENANT);
    setupRpcResult({
      ok: true,
      ticket: { ...expectedTicket, id: "tk-2" },
    });

    const res = await POST(
      makeRequest({
        ...validBody,
        areaId: "33333333-3333-3333-3333-333333333333",
        teamId: "44444444-4444-4444-4444-444444444444",
      }),
    );
    expect(res.status).toBe(201);
    const callArgs = mockApplyCreateTicket.mock.calls[0];
    expect(callArgs[1].areaId).toBe("33333333-3333-3333-3333-333333333333");
    expect(callArgs[1].teamId).toBe("44444444-4444-4444-4444-444444444444");
  });

  it("error de validación del SECURITY DEFINER -> 400", async () => {
    setupUser(USER_REQ);
    setupMemberships(TENANT);
    setupRpcResult({
      ok: false,
      error: { kind: "validation", reason: "category is not active" },
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation");
    expect(body.reason).toMatch(/category is not active/);
  });

  it("error forbidden del SECURITY DEFINER -> 403", async () => {
    setupUser(USER_REQ);
    setupMemberships(TENANT);
    setupRpcResult({
      ok: false,
      error: {
        kind: "forbidden",
        reason: "actor not authorized to create tickets in this tenant",
      },
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("error db_error del SECURITY DEFINER -> 500", async () => {
    setupUser(USER_REQ);
    setupMemberships(TENANT);
    setupRpcResult({
      ok: false,
      error: { kind: "db_error", reason: "connection lost" },
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("db_error");
  });
});
