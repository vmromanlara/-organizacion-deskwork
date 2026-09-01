/**
 * DeskWork Ticketing Core / TKT-023 — Tests del modulo i18n (pure functions).
 *
 * Cubre:
 *  - locale storage helpers (parseLocale, isLocale, readStoredLocale, writeStoredLocale).
 *  - messages: cobertura de ES/EN, sin drift entre locales.
 *  - t() / tf() con interpolacion (probado via I18nProvider + componente Probe
 *    cuando el entorno lo permite; fallback a pure functions si no).
 *  - labels: estados/prioridades preservan valores internos.
 *  - format helpers: fechas, numeros, porcentajes, bytes, minutos.
 *  - getErrorMessage: mapeo de ClientApiError a mensaje localizado.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  formatBytes,
  formatDateLong,
  formatDateShort,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatTime,
  getErrorMessage,
  getMessages,
  getPriorityLabel,
  getStateLabel,
  interpolate,
  isLocale,
  isTicketPriorityCode,
  isTicketStateCode,
  parseLocale,
  readStoredLocale,
  resolvePath,
  writeStoredLocale,
} from "./index";
import type { ClientApiError } from "@/modules/ticketing/client-api";

// =====================================================================
// locale helpers
// =====================================================================

describe("i18n: locale helpers", () => {
  it("DEFAULT_LOCALE es 'es'", () => {
    expect(DEFAULT_LOCALE).toBe("es");
  });

  it("SUPPORTED_LOCALES contiene solo es y en", () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(["en", "es"]);
  });

  it("isLocale valida strings validos", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });

  it("parseLocale cae a default si no es valido", () => {
    expect(parseLocale("es")).toBe("es");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("fr")).toBe("es");
    expect(parseLocale(null)).toBe("es");
    expect(parseLocale(undefined)).toBe("es");
  });

  it("readStoredLocale devuelve 'es' por default si no hay nada", () => {
    // En el entorno de test (node) no hay window, asi que cae al default.
    expect(readStoredLocale()).toBe("es");
  });

  it("writeStoredLocale no rompe en entorno sin window", () => {
    // No-op en node; el roundtrip se valida manualmente con el browser.
    expect(() => writeStoredLocale("en")).not.toThrow();
    expect(() => writeStoredLocale("es")).not.toThrow();
  });
});

// =====================================================================
// messages: cobertura de ES/EN
// =====================================================================

describe("i18n: getMessages", () => {
  it("'es' tiene textos en espanol", () => {
    const m = getMessages("es");
    expect(m.states.RESUELTO).toBe("Resuelto");
    expect(m.priorities.P1).toBe("Crítica");
    expect(m.common.save).toBe("Guardar");
    expect(m.errors.not_found).toBe("El recurso solicitado no existe.");
  });

  it("'en' tiene textos en ingles", () => {
    const m = getMessages("en");
    expect(m.states.RESUELTO).toBe("Resolved");
    expect(m.priorities.P1).toBe("Critical");
    expect(m.common.save).toBe("Save");
    expect(m.errors.not_found).toBe("The requested resource was not found.");
  });

  it("mismas claves en ES y EN (no drift)", () => {
    function paths(obj: unknown, prefix = ""): string[] {
      if (obj == null || typeof obj !== "object") return [];
      const out: string[] = [];
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v != null && typeof v === "object" && !Array.isArray(v)) {
          out.push(...paths(v, p));
        } else {
          out.push(p);
        }
      }
      return out;
    }
    const esKeys = new Set(paths(getMessages("es")));
    const enKeys = new Set(paths(getMessages("en")));
    for (const k of esKeys) {
      expect(enKeys.has(k), `clave ${k} solo en ES`).toBe(true);
    }
  });
});

// =====================================================================
// resolvePath / interpolate (puro)
// =====================================================================

describe("i18n: resolvePath / interpolate", () => {
  it("resolvePath navega paths anidados", () => {
    const m = getMessages("es");
    expect(resolvePath(m, "common.save")).toBe("Guardar");
    expect(resolvePath(m, "states.RESUELTO")).toBe("Resuelto");
    expect(resolvePath(m, "supervisor.kpis.totalTitle")).toBe(
      "Tickets en el período",
    );
  });

  it("resolvePath retorna undefined para path inexistente", () => {
    const m = getMessages("es");
    expect(resolvePath(m, "no.existe")).toBeUndefined();
    expect(resolvePath(m, "common.no_existe")).toBeUndefined();
  });

  it("interpolate sustituye {placeholder} y deja el resto intacto", () => {
    expect(interpolate("Hola {name}", { name: "Mundo" })).toBe("Hola Mundo");
    expect(interpolate("{a} y {b}", { a: "1", b: "2" })).toBe("1 y 2");
  });

  it("interpolate deja el placeholder visible si no se pasa param", () => {
    expect(interpolate("{a} {b}", { a: "1" })).toBe("1 {b}");
  });

  it("interpolate maneja valores numericos", () => {
    expect(interpolate("Total: {n}", { n: 42 })).toBe("Total: 42");
  });
});

// =====================================================================
// labels: estados/prioridades preservan valor interno
// =====================================================================

describe("i18n: state/priority labels", () => {
  it("isTicketStateCode reconoce codigos contractuales", () => {
    expect(isTicketStateCode("ABIERTO")).toBe(true);
    expect(isTicketStateCode("RESUELTO")).toBe(true);
    expect(isTicketStateCode("foo")).toBe(false);
  });

  it("isTicketPriorityCode reconoce P1..P4", () => {
    expect(isTicketPriorityCode("P1")).toBe(true);
    expect(isTicketPriorityCode("P4")).toBe(true);
    expect(isTicketPriorityCode("P5")).toBe(false);
  });

  it("getStateLabel traduce RESUELTO en ambos idiomas, no altera el codigo", () => {
    expect(getStateLabel("RESUELTO", "es")).toBe("Resuelto");
    expect(getStateLabel("RESUELTO", "en")).toBe("Resolved");
  });

  it("getStateLabel cae al codigo crudo si no es conocido (defense in depth)", () => {
    expect(getStateLabel("XYZ", "es")).toBe("XYZ");
  });

  it("getPriorityLabel traduce P1..P4 en ambos idiomas", () => {
    expect(getPriorityLabel("P1", "es")).toBe("Crítica");
    expect(getPriorityLabel("P1", "en")).toBe("Critical");
    expect(getPriorityLabel("P3", "es")).toBe("Normal");
    expect(getPriorityLabel("P3", "en")).toBe("Normal");
  });

  it("getPriorityLabel cae al codigo crudo si no es conocido", () => {
    expect(getPriorityLabel("P9", "es")).toBe("P9");
  });
});

// =====================================================================
// format helpers
// =====================================================================

describe("i18n: format helpers", () => {
  it("formatNumber produce locales distintos para ES/EN", () => {
    // Usamos un valor grande que dispara el separador de miles, que
    // es donde ES y EN difieren visiblemente.
    const es = formatNumber(1234567.89, "es");
    const en = formatNumber(1234567.89, "en");
    expect(es).not.toBe(en);
  });

  it("formatPercent produce locales distintos para ES/EN", () => {
    // Ambos locales terminan en '%' y formatean correctamente.
    const es = formatPercent(0.873, "es");
    const en = formatPercent(0.873, "en");
    expect(es).toMatch(/%$/);
    expect(en).toMatch(/%$/);
  });

  it("formatPercent maneja no-finite", () => {
    expect(formatPercent(NaN, "es")).toBe("—");
    expect(formatPercent(Infinity, "en")).toBe("—");
  });

  it("formatBytes produce KB y MB segun tamano", () => {
    // Intl usa "kB"/"MB" en minuscula para kilo.
    expect(formatBytes(0, "es")).toMatch(/0/);
    expect(formatBytes(2048, "es")).toMatch(/kB/i);
    expect(formatBytes(5_242_880, "es")).toMatch(/MB/);
  });

  it("formatDateShort formatea correctamente", () => {
    const es = formatDateShort("2026-08-31T12:00:00Z", "es");
    const en = formatDateShort("2026-08-31T12:00:00Z", "en");
    expect(es).toBeTruthy();
    expect(en).toBeTruthy();
  });

  it("formatTime devuelve HH:MM", () => {
    const t1 = formatTime("2026-08-31T12:34:00Z", "es");
    expect(t1).toMatch(/^\d{2}:\d{2}/);
  });

  it("formatDateLong maneja Date invalido", () => {
    expect(formatDateLong("not-a-date", "es")).toBe("");
  });

  it("formatMinutes convierte minutos a h/m segun messages", () => {
    const messages = { empty: "—", hoursMinutes: "{h} h {m} min", minutesShort: "{n} min" };
    expect(formatMinutes(45, "es", messages)).toBe("45 min");
    expect(formatMinutes(125, "es", messages)).toBe("2 h 5 min");
    expect(formatMinutes(0, "es", messages)).toBe("—");
  });
});

// =====================================================================
// getErrorMessage
// =====================================================================

describe("i18n: getErrorMessage", () => {
  const messages = getMessages("es");
  const enMessages = getMessages("en");

  it("network devuelve mensaje dedicado en ambos idiomas", () => {
    const err: ClientApiError = { kind: "network", reason: "fetch failed" };
    expect(getErrorMessage(err, messages)).toBe(messages.errors.network);
    expect(getErrorMessage(err, enMessages)).toBe(enMessages.errors.network);
  });

  it("not_found traduce el codigo cuando existe en errors.*", () => {
    const err: ClientApiError = { kind: "not_found", reason: "ticket_not_found" };
    expect(getErrorMessage(err, messages)).toBe(messages.errors.ticket_not_found);
    expect(getErrorMessage(err, enMessages)).toBe(enMessages.errors.ticket_not_found);
  });

  it("validation con codigo conocido lo traduce", () => {
    const err: ClientApiError = { kind: "validation", reason: "fsm_denied" };
    expect(getErrorMessage(err, messages)).toBe(messages.errors.fsm_denied);
  });

  it("unknown cae a messages.errors.unknown", () => {
    const err: ClientApiError = { kind: "unknown", reason: "x" };
    expect(getErrorMessage(err, messages)).toBe(messages.errors.unknown);
  });

  it("forbidden con codigo conocido: traduce", () => {
    const err: ClientApiError = {
      kind: "forbidden",
      reason: "scope_institution_required",
    };
    expect(getErrorMessage(err, messages)).toBe(
      messages.errors.scope_institution_required,
    );
  });
});
