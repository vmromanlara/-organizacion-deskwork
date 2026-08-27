import { describe, expect, it } from "vitest";
import {
  INVALID_TRANSITIONS,
  VALID_TRANSITIONS,
  canTransition,
} from "./state-machine";
import type { TicketActor, TicketSnapshot } from "./types";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER_REQ = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_AGENT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER_LEAD = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const USER_DIRECTOR = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function baseTicket(overrides: Partial<TicketSnapshot> = {}): TicketSnapshot {
  return {
    id: "99999999-9999-9999-9999-999999999999",
    tenantId: TENANT,
    requesterId: USER_REQ,
    assignedTo: null,
    state: "ABIERTO",
    priority: "P3",
    areaId: null,
    teamId: null,
    createdAt: "2026-08-27T00:00:00Z",
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    slaStatus: "on_track",
    ...overrides,
  };
}

function actor(
  kind: TicketActor["kind"],
  userId: string | null = USER_REQ,
  functionalRole: string | null = null,
): TicketActor {
  return { userId, functionalRole, kind };
}

describe("FSM v3 — Terminal", () => {
  it("rechaza cualquier transición desde CERRADO", () => {
    const ticket = baseTicket({ state: "CERRADO" });
    for (const target of [
      "ABIERTO",
      "EN_PROCESO",
      "ESPERANDO_USUARIO",
      "ESCALADO",
      "RESUELTO",
    ] as const) {
      const result = canTransition("CERRADO", target, actor("director", USER_DIRECTOR), ticket);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/terminal/i);
    }
  });
});

describe("FSM v3 — Transiciones inválidas explícitas", () => {
  it("ABIERTO → ESPERANDO_USUARIO es inválida", () => {
    const ticket = baseTicket();
    const result = canTransition(
      "ABIERTO",
      "ESPERANDO_USUARIO",
      actor("technical_lead", USER_LEAD),
      ticket,
    );
    expect(result.valid).toBe(false);
  });
  it("ABIERTO → RESUELTO es inválida", () => {
    const ticket = baseTicket();
    const result = canTransition(
      "ABIERTO",
      "RESUELTO",
      actor("technical_lead", USER_LEAD),
      ticket,
    );
    expect(result.valid).toBe(false);
  });
  it("ESPERANDO_USUARIO → RESUELTO es inválida", () => {
    const ticket = baseTicket({ state: "ESPERANDO_USUARIO" });
    const result = canTransition(
      "ESPERANDO_USUARIO",
      "RESUELTO",
      actor("technical_lead", USER_LEAD),
      ticket,
    );
    expect(result.valid).toBe(false);
  });
  it("declara exactamente 3 transiciones inválidas", () => {
    expect(INVALID_TRANSITIONS).toHaveLength(3);
  });
});

describe("FSM v3 — Transiciones válidas por rol", () => {
  it("declara exactamente 14 transiciones válidas", () => {
    expect(VALID_TRANSITIONS).toHaveLength(14);
  });

  it("ABIERTO → EN_PROCESO requiere asignado", () => {
    const sinAsignar = baseTicket({ state: "ABIERTO", assignedTo: null });
    const r1 = canTransition(
      "ABIERTO",
      "EN_PROCESO",
      actor("agent", USER_AGENT),
      sinAsignar,
    );
    expect(r1.valid).toBe(false);

    const asignado = baseTicket({
      state: "ABIERTO",
      assignedTo: USER_AGENT,
    });
    const r2 = canTransition(
      "ABIERTO",
      "EN_PROCESO",
      actor("agent", USER_AGENT),
      asignado,
    );
    expect(r2.valid).toBe(true);
  });

  it("ABIERTO → CERRADO: requester propio y lead/director", () => {
    const ticket = baseTicket({ state: "ABIERTO" });
    const rReq = canTransition("ABIERTO", "CERRADO", actor("requester", USER_REQ), ticket);
    expect(rReq.valid).toBe(true);
    const rLead = canTransition(
      "ABIERTO",
      "CERRADO",
      actor("technical_lead", USER_LEAD),
      ticket,
    );
    expect(rLead.valid).toBe(true);
  });

  it("EN_PROCESO → RESUELTO: agente asignado puede", () => {
    const ticket = baseTicket({ state: "EN_PROCESO", assignedTo: USER_AGENT });
    const r = canTransition(
      "EN_PROCESO",
      "RESUELTO",
      actor("agent", USER_AGENT),
      ticket,
    );
    expect(r.valid).toBe(true);
  });

  it("EN_PROCESO → CERRADO: solo lead/director", () => {
    const ticket = baseTicket({ state: "EN_PROCESO", assignedTo: USER_AGENT });
    const rAgent = canTransition(
      "EN_PROCESO",
      "CERRADO",
      actor("agent", USER_AGENT),
      ticket,
    );
    expect(rAgent.valid).toBe(false);
    const rLead = canTransition(
      "EN_PROCESO",
      "CERRADO",
      actor("technical_lead", USER_LEAD),
      ticket,
    );
    expect(rLead.valid).toBe(true);
  });

  it("RESUELTO → CERRADO: system auto y lead/director", () => {
    const ticket = baseTicket({ state: "RESUELTO" });
    const rSystem = canTransition(
      "RESUELTO",
      "CERRADO",
      actor("system", null),
      ticket,
    );
    expect(rSystem.valid).toBe(true);
    const rLead = canTransition(
      "RESUELTO",
      "CERRADO",
      actor("technical_lead", USER_LEAD),
      ticket,
    );
    expect(rLead.valid).toBe(true);
  });

  it("ESPERANDO_USUARIO → EN_PROCESO: agente asignado retoma; requester confirma vía comment", () => {
    const ticket = baseTicket({
      state: "ESPERANDO_USUARIO",
      assignedTo: USER_AGENT,
    });
    const rAgent = canTransition(
      "ESPERANDO_USUARIO",
      "EN_PROCESO",
      actor("agent", USER_AGENT),
      ticket,
    );
    expect(rAgent.valid).toBe(true);

    const rReq = canTransition(
      "ESPERANDO_USUARIO",
      "EN_PROCESO",
      actor("requester", USER_REQ),
      ticket,
    );
    expect(rReq.valid).toBe(false);
    expect(rReq.reason).toMatch(/confirma/i);
  });
});

describe("FSM v3 — Actor no autenticado", () => {
  it("rechaza toda transición si userId es null", () => {
    const ticket = baseTicket();
    const r = canTransition("ABIERTO", "CERRADO", actor("system", null), ticket);
    expect(r.valid).toBe(false);
  });
});

describe("FSM v3 — Conteo total (14 + 3)", () => {
  it("total declarado: 17 transiciones", () => {
    expect(VALID_TRANSITIONS.length + INVALID_TRANSITIONS.length).toBe(17);
  });
});
