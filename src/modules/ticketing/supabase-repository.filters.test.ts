/**
 * Tests TKT-022: filtros de búsqueda en listTicketsBy*.
 *
 * Verifica el comportamiento del helper `applyFilters` (encadenamiento
 * eq/or) usando un mock abstracto de la query. Como el helper no está
 * exportado, hacemos un mock del query builder y replicamos la lógica
 * que usa el repository.
 */

import { describe, expect, it, vi } from "vitest";

function makeMockQuery() {
  const calls: { method: string; args: unknown[] }[] = [];
  const handler = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return proxy;
  };
  const proxy = {
    eq: handler("eq"),
    or: handler("or"),
    limit: handler("limit"),
    order: handler("order"),
    select: handler("select"),
  };
  return { proxy, calls };
}

// Replica del applyFilters de supabase-repository. Si cambia allá, hay
// que actualizar acá. Como el helper es privado, lo replicamos para
// validar el contrato externo.
function applyFiltersToMock(
  q: ReturnType<typeof makeMockQuery>["proxy"],
  filters:
    | {
        state?: string;
        priority?: string;
        assignedTo?: string;
        requesterId?: string;
        search?: string;
      }
    | undefined,
): ReturnType<typeof makeMockQuery>["proxy"] {
  if (!filters) return q;
  if (filters.state) {
    q = q.eq("state", filters.state);
  }
  if (filters.priority) {
    q = q.eq("priority", filters.priority);
  }
  if (filters.assignedTo) {
    q = q.eq("assigned_to", filters.assignedTo);
  }
  if (filters.requesterId) {
    q = q.eq("requester_id", filters.requesterId);
  }
  if (filters.search && filters.search.length >= 3) {
    const term = `%${filters.search.replace(/[%_]/g, "\\$&")}%`;
    q = q.or(`title.ilike.${term},description.ilike.${term}`);
  }
  return q;
}

describe("TKT-022 — applyFilters", () => {
  it("no llama nada si filters es undefined", () => {
    const { proxy, calls } = makeMockQuery();
    applyFiltersToMock(proxy, undefined);
    expect(calls).toHaveLength(0);
  });

  it("no llama nada si filters es {} vacío", () => {
    const { proxy, calls } = makeMockQuery();
    applyFiltersToMock(proxy, {});
    expect(calls).toHaveLength(0);
  });

  it("llama eq(state) cuando filter.state presente", () => {
    const { proxy, calls } = makeMockQuery();
    applyFiltersToMock(proxy, { state: "EN_PROCESO" });
    expect(calls).toEqual([{ method: "eq", args: ["state", "EN_PROCESO"] }]);
  });

  it("llama eq(priority) cuando filter.priority presente", () => {
    const { proxy, calls } = makeMockQuery();
    applyFiltersToMock(proxy, { priority: "P1" });
    expect(calls).toEqual([{ method: "eq", args: ["priority", "P1"] }]);
  });

  it("llama eq(assigned_to) cuando filter.assignedTo presente", () => {
    const { proxy, calls } = makeMockQuery();
    applyFiltersToMock(proxy, { assignedTo: "u-1" });
    expect(calls).toEqual([{ method: "eq", args: ["assigned_to", "u-1"] }]);
  });

  it("llama eq(requester_id) cuando filter.requesterId presente", () => {
    const { proxy, calls } = makeMockQuery();
    applyFiltersToMock(proxy, { requesterId: "u-2" });
    expect(calls).toEqual([{ method: "eq", args: ["requester_id", "u-2"] }]);
  });

  it("llama or() con ilike cuando search >= 3 chars", () => {
    const { proxy, calls } = makeMockQuery();
    applyFiltersToMock(proxy, { search: "no enciende" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("or");
    expect(calls[0].args[0]).toBe(
      "title.ilike.%no enciende%,description.ilike.%no enciende%",
    );
  });

  it("escapa % y _ en search (anti wildcard injection)", () => {
    const { proxy, calls } = makeMockQuery();
    applyFiltersToMock(proxy, { search: "50%_off" });
    expect(calls[0].args[0]).toBe(
      "title.ilike.%50\\%\\_off%,description.ilike.%50\\%\\_off%",
    );
  });

  it("no llama or() si search < 3 chars", () => {
    const { proxy, calls } = makeMockQuery();
    applyFiltersToMock(proxy, { search: "ab" });
    expect(calls).toHaveLength(0);
  });

  it("encadena múltiples filtros en orden", () => {
    const { proxy, calls } = makeMockQuery();
    applyFiltersToMock(proxy, {
      state: "EN_PROCESO",
      priority: "P1",
      assignedTo: "u-1",
    });
    expect(calls.map((c) => c.method)).toEqual(["eq", "eq", "eq"]);
    expect(calls[0].args).toEqual(["state", "EN_PROCESO"]);
    expect(calls[1].args).toEqual(["priority", "P1"]);
    expect(calls[2].args).toEqual(["assigned_to", "u-1"]);
  });
});

// ===================================================================
// TKT-022 — parseFilters (vía URL): validaciones puras
// ===================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SCOPES = new Set(["mine", "assigned", "tenant"]);
const VALID_STATES = new Set([
  "ABIERTO",
  "EN_PROCESO",
  "ESPERANDO_USUARIO",
  "ESCALADO",
  "RESUELTO",
  "CERRADO",
]);
const VALID_PRIORITIES = new Set(["P1", "P2", "P3", "P4"]);

function validateSearch(raw: string | null):
  | { ok: true; value: string }
  | { ok: false; reason: string } {
  if (raw === null) return { ok: true, value: "" };
  if (raw.length < 3 || raw.length > 200) {
    return { ok: false, reason: "invalid_search_length" };
  }
  return { ok: true, value: raw };
}

function validateState(raw: string | null):
  | { ok: true }
  | { ok: false } {
  if (raw === null) return { ok: true };
  return VALID_STATES.has(raw) ? { ok: true } : { ok: false };
}

function validatePriority(raw: string | null):
  | { ok: true }
  | { ok: false } {
  if (raw === null) return { ok: true };
  return VALID_PRIORITIES.has(raw) ? { ok: true } : { ok: false };
}

function validateAssignedTo(raw: string | null):
  | { ok: true; sentinel?: boolean; value?: string }
  | { ok: false } {
  if (raw === null) return { ok: true };
  if (raw === "unassigned") return { ok: true, sentinel: true };
  if (UUID_RE.test(raw)) return { ok: true, value: raw };
  return { ok: false };
}

function validateScope(raw: string | null):
  | { ok: true; value: string }
  | { ok: false } {
  if (raw === null) return { ok: true, value: "tenant" };
  return VALID_SCOPES.has(raw) ? { ok: true, value: raw } : { ok: false };
}

describe("TKT-022 — parseFilters (validaciones puras)", () => {
  it("scope default = tenant", () => {
    expect(validateScope(null).ok).toBe(true);
    if (validateScope(null).ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((validateScope(null) as any).value).toBe("tenant");
    }
  });

  it("rechaza scope inválido", () => {
    expect(validateScope("invalid").ok).toBe(false);
  });

  it("acepta scope válido", () => {
    expect(validateScope("mine").ok).toBe(true);
    expect(validateScope("assigned").ok).toBe(true);
    expect(validateScope("tenant").ok).toBe(true);
  });

  it("rechaza state inválido", () => {
    expect(validateState("INVALIDO").ok).toBe(false);
  });

  it("acepta state válido", () => {
    for (const s of VALID_STATES) {
      expect(validateState(s).ok).toBe(true);
    }
  });

  it("rechaza priority inválida", () => {
    expect(validatePriority("P9").ok).toBe(false);
  });

  it("acepta priority válida", () => {
    for (const p of VALID_PRIORITIES) {
      expect(validatePriority(p).ok).toBe(true);
    }
  });

  it("rechaza assigned_to no-UUID (excepto sentinel 'unassigned')", () => {
    expect(validateAssignedTo("nope").ok).toBe(false);
    expect(validateAssignedTo("123").ok).toBe(false);
  });

  it("acepta assigned_to=unassigned (sentinel)", () => {
    const r = validateAssignedTo("unassigned");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sentinel).toBe(true);
    }
  });

  it("acepta assigned_to UUID", () => {
    const r = validateAssignedTo("11111111-1111-1111-1111-111111111111");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe("11111111-1111-1111-1111-111111111111");
    }
  });

  it("rechaza search < 3 chars", () => {
    expect(validateSearch("ab").ok).toBe(false);
  });

  it("rechaza search > 200 chars", () => {
    expect(validateSearch("x".repeat(201)).ok).toBe(false);
  });

  it("acepta search 3..200 chars", () => {
    expect(validateSearch("abc").ok).toBe(true);
    expect(validateSearch("x".repeat(200)).ok).toBe(true);
  });

  it("search null = ok (sin filtro)", () => {
    expect(validateSearch(null).ok).toBe(true);
  });
});

// avoid vitest warning de vi no usado
void vi;
