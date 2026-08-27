import { describe, expect, it } from "vitest";
import {
  INVALID_TRANSITIONS,
  VALID_TRANSITIONS,
  canExecuteTransition,
  canRequestTransition,
  canTransition,
} from "./state-machine";
import type { TicketActor, TicketSnapshot } from "./types";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER_REQ = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_AGENT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USER_LEAD = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const USER_DIRECTOR = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const USER_SUP = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

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
      expect(result.canRequest).toBe(false);
      expect(result.canExecute).toBe(false);
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
    expect(result.canRequest).toBe(false);
    expect(result.canExecute).toBe(false);
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

describe("FSM v3 — Transiciones operativas (canExecute=true para el actor correcto)", () => {
  it("declara exactamente 14 transiciones válidas", () => {
    expect(VALID_TRANSITIONS).toHaveLength(14);
  });

  it("ABIERTO → EN_PROCESO: agente asignado ejecuta", () => {
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
    expect(r2.canExecute).toBe(true);
  });

  it("EN_PROCESO → RESUELTO: agente asignado ejecuta", () => {
    const ticket = baseTicket({ state: "EN_PROCESO", assignedTo: USER_AGENT });
    const r = canTransition(
      "EN_PROCESO",
      "RESUELTO",
      actor("agent", USER_AGENT),
      ticket,
    );
    expect(r.valid).toBe(true);
    expect(r.canExecute).toBe(true);
  });

  it("EN_PROCESO → CERRADO: solo lead/director (no agente, no supervisor)", () => {
    const ticket = baseTicket({ state: "EN_PROCESO", assignedTo: USER_AGENT });
    expect(
      canTransition("EN_PROCESO", "CERRADO", actor("agent", USER_AGENT), ticket).valid,
    ).toBe(false);
    expect(
      canTransition(
        "EN_PROCESO",
        "CERRADO",
        actor("supervisor", USER_SUP),
        ticket,
      ).valid,
    ).toBe(false);
    expect(
      canTransition(
        "EN_PROCESO",
        "CERRADO",
        actor("technical_lead", USER_LEAD),
        ticket,
      ).valid,
    ).toBe(true);
    expect(
      canTransition(
        "EN_PROCESO",
        "CERRADO",
        actor("director", USER_DIRECTOR),
        ticket,
      ).valid,
    ).toBe(true);
  });

  it("ESCALADO → EN_PROCESO: agente asignado retoma", () => {
    const ticket = baseTicket({ state: "ESCALADO", assignedTo: USER_AGENT });
    const r = canTransition(
      "ESCALADO",
      "EN_PROCESO",
      actor("agent", USER_AGENT),
      ticket,
    );
    expect(r.valid).toBe(true);
  });

  it("RESUELTO → CERRADO: system auto y lead/director ejecutan", () => {
    const ticket = baseTicket({ state: "RESUELTO" });
    expect(
      canTransition("RESUELTO", "CERRADO", actor("system", null), ticket).valid,
    ).toBe(true);
    expect(
      canTransition(
        "RESUELTO",
        "CERRADO",
        actor("technical_lead", USER_LEAD),
        ticket,
      ).valid,
    ).toBe(true);
  });
});

describe("FSM v3 — Distinción SOLICITAR / EJECUTAR (remediación 2026-08-27)", () => {
  it("ABIERTO → ESCALADO: agente asignado SOLICITA pero NO EJECUTA", () => {
    const ticket = baseTicket({ state: "ABIERTO", assignedTo: USER_AGENT });
    const r = canTransition(
      "ABIERTO",
      "ESCALADO",
      actor("agent", USER_AGENT),
      ticket,
    );
    expect(r.canRequest).toBe(true);
    expect(r.canExecute).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/solicita|escalaci/i);
  });

  it("ABIERTO → ESCALADO: lead EJECUTA directamente", () => {
    const ticket = baseTicket({ state: "ABIERTO", assignedTo: USER_AGENT });
    const r = canTransition(
      "ABIERTO",
      "ESCALADO",
      actor("technical_lead", USER_LEAD),
      ticket,
    );
    expect(r.canRequest).toBe(true);
    expect(r.canExecute).toBe(true);
    expect(r.valid).toBe(true);
  });

  it("EN_PROCESO → ESCALADO: agente asignado SOLICITA pero NO EJECUTA", () => {
    const ticket = baseTicket({ state: "EN_PROCESO", assignedTo: USER_AGENT });
    const r = canTransition(
      "EN_PROCESO",
      "ESCALADO",
      actor("agent", USER_AGENT),
      ticket,
    );
    expect(r.canRequest).toBe(true);
    expect(r.canExecute).toBe(false);
    expect(r.valid).toBe(false);
  });

  it("EN_PROCESO → ABIERTO: agente asignado SOLICITA, lead EJECUTA", () => {
    const ticket = baseTicket({ state: "EN_PROCESO", assignedTo: USER_AGENT });
    const rAg = canTransition(
      "EN_PROCESO",
      "ABIERTO",
      actor("agent", USER_AGENT),
      ticket,
    );
    expect(rAg.canRequest).toBe(true);
    expect(rAg.canExecute).toBe(false);

    const rLead = canTransition(
      "EN_PROCESO",
      "ABIERTO",
      actor("technical_lead", USER_LEAD),
      ticket,
    );
    expect(rLead.canRequest).toBe(true);
    expect(rLead.canExecute).toBe(true);
  });

  it("ABIERTO → CERRADO: requester SOLICITA, lead EJECUTA", () => {
    const ticket = baseTicket({ state: "ABIERTO" });
    const rReq = canTransition("ABIERTO", "CERRADO", actor("requester", USER_REQ), ticket);
    expect(rReq.canRequest).toBe(true);
    expect(rReq.canExecute).toBe(false);

    const rLead = canTransition(
      "ABIERTO",
      "CERRADO",
      actor("technical_lead", USER_LEAD),
      ticket,
    );
    expect(rLead.canExecute).toBe(true);
  });

  it("RESUELTO → EN_PROCESO: requester SOLICITA reapertura, lead EJECUTA", () => {
    const ticket = baseTicket({ state: "RESUELTO" });
    const rReq = canTransition(
      "RESUELTO",
      "EN_PROCESO",
      actor("requester", USER_REQ),
      ticket,
    );
    expect(rReq.canRequest).toBe(true);
    expect(rReq.canExecute).toBe(false);

    const rLead = canTransition(
      "RESUELTO",
      "EN_PROCESO",
      actor("technical_lead", USER_LEAD),
      ticket,
    );
    expect(rLead.canExecute).toBe(true);
  });

  it("ESPERANDO_USUARIO → EN_PROCESO: requester SOLICITA retomar, agente EJECUTA", () => {
    const ticket = baseTicket({
      state: "ESPERANDO_USUARIO",
      assignedTo: USER_AGENT,
    });
    const rReq = canTransition(
      "ESPERANDO_USUARIO",
      "EN_PROCESO",
      actor("requester", USER_REQ),
      ticket,
    );
    expect(rReq.canRequest).toBe(true);
    expect(rReq.canExecute).toBe(false);

    const rAg = canTransition(
      "ESPERANDO_USUARIO",
      "EN_PROCESO",
      actor("agent", USER_AGENT),
      ticket,
    );
    expect(rAg.canExecute).toBe(true);
  });
});

describe("FSM v3 — Helpers canRequestTransition / canExecuteTransition", () => {
  it("canRequestTransition refleja canRequest", () => {
    const ticket = baseTicket({ state: "ABIERTO", assignedTo: USER_AGENT });
    expect(
      canRequestTransition(
        "ABIERTO",
        "ESCALADO",
        actor("agent", USER_AGENT),
        ticket,
      ),
    ).toBe(true);
  });
  it("canExecuteTransition refleja canExecute", () => {
    const ticket = baseTicket({ state: "EN_PROCESO", assignedTo: USER_AGENT });
    // Agente puede SOLICITAR pero NO EJECUTAR escalación.
    expect(
      canExecuteTransition(
        "EN_PROCESO",
        "ESCALADO",
        actor("agent", USER_AGENT),
        ticket,
      ),
    ).toBe(false);
    // Lead puede EJECUTAR.
    expect(
      canExecuteTransition(
        "EN_PROCESO",
        "ESCALADO",
        actor("technical_lead", USER_LEAD),
        ticket,
      ),
    ).toBe(true);
  });
});

describe("FSM v3 — Actor no autenticado", () => {
  it("rechaza toda transición si userId es null y kind != system", () => {
    const ticket = baseTicket();
    // system es la única excepción: userId puede ser null.
    // Aquí comprobamos que un agente sin userId es rechazado.
    const r2 = canTransition("ABIERTO", "CERRADO", actor("agent", null), ticket);
    expect(r2.valid).toBe(false);
  });
});

describe("FSM v3 — Conteo total (14 + 3)", () => {
  it("total declarado: 17 transiciones", () => {
    expect(VALID_TRANSITIONS.length + INVALID_TRANSITIONS.length).toBe(17);
  });
});
