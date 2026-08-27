import { describe, expect, it } from "vitest";
import { __STUB_DISCLAIMER, calculatePriorityStub } from "./priority";

describe("Priority stub (TEMPORARY DEVELOPMENT FALLBACK)", () => {
  it("declara explícitamente el disclaimer", () => {
    expect(__STUB_DISCLAIMER).toContain("NOT PRODUCT POLICY");
  });

  it("asigna P1 a accesos/cuenta/correo", () => {
    expect(calculatePriorityStub("accesos")).toBe("P1");
    expect(calculatePriorityStub("cuenta")).toBe("P1");
    expect(calculatePriorityStub("correo")).toBe("P1");
  });

  it("asigna P2 a computador/software", () => {
    expect(calculatePriorityStub("computador")).toBe("P2");
    expect(calculatePriorityStub("software")).toBe("P2");
  });

  it("asigna P3 a internet/impresora/telefonia", () => {
    expect(calculatePriorityStub("internet")).toBe("P3");
    expect(calculatePriorityStub("impresora")).toBe("P3");
    expect(calculatePriorityStub("telefonia")).toBe("P3");
  });

  it("asigna P4 a otro", () => {
    expect(calculatePriorityStub("otro")).toBe("P4");
  });

  it("devuelve P3 por defecto ante slug desconocido", () => {
    expect(calculatePriorityStub("categoria-inexistente")).toBe("P3");
  });
});
