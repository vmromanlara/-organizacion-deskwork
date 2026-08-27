/**
 * DeskWork Ticketing Core / Fase Block 1 — Remediación.
 * TKT-005 — Finite State Machine de tickets.
 *
 * La matriz refleja EXACTAMENTE la FSM canónica v3 §3.3 (17 totales:
 * 14 válidas + 3 inválidas). NO agregar transiciones nuevas.
 * CERRADO es terminal.
 *
 * Remediación 2026-08-27: distinción explícita entre SOLICITAR y EJECUTAR.
 * El spec v3 §3.3 establece que ciertas transiciones (e.g. EN_PROCESO → ESCALADO)
 * admiten que un agente SOLICITE pero sólo lead/director EJECUTA. Esta distinción
 * es ahora explícita en el return type `TransitionCapability`.
 */

import {
  TERMINAL_TICKET_STATES,
  hasTicketState,
  isTerminalState,
  type TicketActor,
  type TicketSnapshot,
  type TicketState,
} from "./types";

/**
 * Capacidad del actor respecto a una transición.
 * - `canRequest`: el actor puede pedir la transición (queda en pending).
 * - `canExecute`: el actor puede aplicar la transición (cambia el estado).
 * - `valid`: alias semántico de canExecute. Una transición se considera
 *   aplicable sólo si el actor la puede ejecutar.
 */
export interface TransitionCapability {
  valid: boolean;
  canRequest: boolean;
  canExecute: boolean;
  reason: string | null;
}

export type TransitionResult = TransitionCapability;

/** Resultado de la consulta: la transición es válida, inválida o denegada. */
export type TransitionDenialReason =
  | "CERRADO_IS_TERMINAL"
  | "INVALID_TRANSITION"
  | "ACTOR_NOT_AUTHENTICATED"
  | "ACTOR_LACKS_PERMISSION";

/**
 * Firma canónica exigida por el spec.
 * Devuelve { valid, canRequest, canExecute, reason } con razón legible
 * cuando valid=false. Mantiene compatibilidad con callers que sólo
 * inspeccionan `.valid` (alias de canExecute).
 */
export function canTransition(
  from: TicketState,
  to: TicketState,
  actor: TicketActor,
  ticket: TicketSnapshot,
): TransitionResult {
  if (!hasTicketState(from) || !hasTicketState(to)) {
    return {
      valid: false,
      canRequest: false,
      canExecute: false,
      reason: "Estado origen o destino desconocido.",
    };
  }
  if (isTerminalState(from)) {
    return {
      valid: false,
      canRequest: false,
      canExecute: false,
      reason: "CERRADO es estado terminal.",
    };
  }
  if (actor.userId === null && actor.kind !== "system") {
    return {
      valid: false,
      canRequest: false,
      canExecute: false,
      reason: "Actor no autenticado.",
    };
  }

  return evaluateTransition(from, to, actor, ticket);
}

/** Helper para construir capability uniforme. */
function allow(): TransitionCapability {
  return { valid: true, canRequest: true, canExecute: true, reason: null };
}
function requestOnly(reason: string): TransitionCapability {
  return { valid: false, canRequest: true, canExecute: false, reason };
}
function deny(reason: string): TransitionCapability {
  return { valid: false, canRequest: false, canExecute: false, reason };
}

/** Reglas por transición. La lista está cerrada: NO agregar entradas. */
type Rule = (actor: TicketActor, ticket: TicketSnapshot) => TransitionCapability;

const REJECT: Rule = () => deny("Transición inválida por FSM.");

const RULES: Record<string, Rule> = {
  // 1. ABIERTO → EN_PROCESO (válida) — operativa, ambos roles pueden ejecutar.
  "ABIERTO->EN_PROCESO": (actor, ticket) => {
    if (!ticket.assignedTo) {
      return deny("Ticket no asignado.");
    }
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return allow();
    }
    if (actor.kind === "agent") {
      return deny("Agente no es el asignado.");
    }
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return allow();
    }
    return deny("Actor no autorizado para iniciar trabajo.");
  },
  // 2. ABIERTO → ESPERANDO_USUARIO (INVÁLIDA)
  "ABIERTO->ESPERANDO_USUARIO": REJECT,
  // 3. ABIERTO → ESCALADO (válida) — agente puede solicitar; lead/director ejecutan.
  "ABIERTO->ESCALADO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      // Agente puede solicitar escalación (vía comment), pero no ejecutar.
      return requestOnly("Agente puede solicitar escalación; ejecución por lead/director.");
    }
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return allow();
    }
    if (actor.kind === "agent") {
      return deny("Agente no asignado no puede escalar.");
    }
    return deny("Actor no autorizado para escalar.");
  },
  // 4. ABIERTO → RESUELTO (INVÁLIDA)
  "ABIERTO->RESUELTO": REJECT,
  // 5. ABIERTO → CERRADO (caso especial: cancelación rápida).
  //    Requester puede solicitar (vía comment o acción directa), pero
  //    sólo lead/director ejecutan el cierre inmediato.
  "ABIERTO->CERRADO": (actor, ticket) => {
    if (actor.kind === "requester" && ticket.requesterId === actor.userId) {
      return requestOnly(
        "Requester puede solicitar cancelación; ejecución por lead/director.",
      );
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return allow();
    }
    return deny("Actor no autorizado para cierre temprano.");
  },
  // 6. EN_PROCESO → ESPERANDO_USUARIO (válida) — operativa.
  "EN_PROCESO->ESPERANDO_USUARIO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return allow();
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return allow();
    }
    if (actor.kind === "supervisor") {
      return allow();
    }
    return deny("Actor no autorizado para marcar espera.");
  },
  // 7. EN_PROCESO → ESCALADO — agente puede solicitar; supervisor/lead/director ejecutan.
  "EN_PROCESO->ESCALADO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return requestOnly(
        "Agente puede solicitar escalación; ejecución por lead/director.",
      );
    }
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return allow();
    }
    return deny("Actor no autorizado para escalar.");
  },
  // 8. EN_PROCESO → RESUELTO — operativa.
  "EN_PROCESO->RESUELTO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return allow();
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return allow();
    }
    if (actor.kind === "supervisor") {
      return allow();
    }
    return deny("Actor no autorizado para resolver.");
  },
  // 9. EN_PROCESO → CERRADO — caso especial: solo lead/director.
  "EN_PROCESO->CERRADO": (actor) => {
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return allow();
    }
    return deny("Actor no autorizado para cancelación tardía.");
  },
  // 10. EN_PROCESO → ABIERTO — agente puede solicitar; supervisor/lead/director ejecutan.
  "EN_PROCESO->ABIERTO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return requestOnly(
        "Agente puede solicitar reapertura; ejecución por lead/director.",
      );
    }
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return allow();
    }
    return deny("Actor no autorizado para reabrir.");
  },
  // 11. ESPERANDO_USUARIO → EN_PROCESO — operativa.
  "ESPERANDO_USUARIO->EN_PROCESO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return allow();
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return allow();
    }
    if (actor.kind === "requester" && ticket.requesterId === actor.userId) {
      // El requester expresa la respuesta vía CONFIRMAR (comment), pero la
      // transición la ejecuta el agente/lead/director. Aquí sólo documentamos
      // que el requester no puede ejecutar directamente.
      return requestOnly(
        "Requester confirma vía comentario; ejecución por agente/lead/director.",
      );
    }
    return deny("Actor no autorizado para retomar.");
  },
  // 12. ESPERANDO_USUARIO → RESUELTO (INVÁLIDA)
  "ESPERANDO_USUARIO->RESUELTO": REJECT,
  // 13. ESPERANDO_USUARIO → CERRADO (desistimiento) — requester puede
  //    solicitar, lead/director ejecutan.
  "ESPERANDO_USUARIO->CERRADO": (actor, ticket) => {
    if (actor.kind === "requester" && ticket.requesterId === actor.userId) {
      return requestOnly(
        "Requester puede solicitar cierre por desistimiento; ejecución por lead/director.",
      );
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return allow();
    }
    return deny("Actor no autorizado para cerrar por desistimiento.");
  },
  // 14. ESCALADO → EN_PROCESO (retoma post-escalación) — operativa.
  "ESCALADO->EN_PROCESO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return allow();
    }
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return allow();
    }
    return deny("Actor no autorizado para retomar.");
  },
  // 15. ESCALADO → RESUELTO — operativa.
  "ESCALADO->RESUELTO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return allow();
    }
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return allow();
    }
    return deny("Actor no autorizado para resolver post-escalación.");
  },
  // 16. RESUELTO → CERRADO — requester puede solicitar, system/lead/director ejecutan.
  "RESUELTO->CERRADO": (actor) => {
    if (actor.kind === "system") {
      return allow();
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return allow();
    }
    if (actor.kind === "requester") {
      return requestOnly(
        "Requester confirma vía comentario; cierre lo ejecuta system/lead/director.",
      );
    }
    return deny("Actor no autorizado para cierre.");
  },
  // 17. RESUELTO → EN_PROCESO (reapertura por objeción) — requester puede
  //    solicitar, supervisor/lead/director ejecutan.
  "RESUELTO->EN_PROCESO": (actor) => {
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return allow();
    }
    if (actor.kind === "supervisor") {
      return allow();
    }
    if (actor.kind === "requester") {
      return requestOnly(
        "Requester puede solicitar reapertura por objeción; ejecución por lead/director.",
      );
    }
    return deny("Reapertura por objeción requiere ejecutor autorizado.");
  },
};

function evaluateTransition(
  from: TicketState,
  to: TicketState,
  actor: TicketActor,
  ticket: TicketSnapshot,
): TransitionCapability {
  const key = `${from}->${to}`;
  const rule = RULES[key];
  if (!rule) {
    return {
      valid: false,
      canRequest: false,
      canExecute: false,
      reason: `Transición no declarada: ${key}.`,
    };
  }
  return rule(actor, ticket);
}

/** Devuelve la lista cerrada de transiciones declaradas (14). */
export const VALID_TRANSITIONS: ReadonlyArray<{ from: TicketState; to: TicketState }> = [
  { from: "ABIERTO", to: "EN_PROCESO" },
  { from: "ABIERTO", to: "ESCALADO" },
  { from: "ABIERTO", to: "CERRADO" },
  { from: "EN_PROCESO", to: "ESPERANDO_USUARIO" },
  { from: "EN_PROCESO", to: "ESCALADO" },
  { from: "EN_PROCESO", to: "RESUELTO" },
  { from: "EN_PROCESO", to: "CERRADO" },
  { from: "EN_PROCESO", to: "ABIERTO" },
  { from: "ESPERANDO_USUARIO", to: "EN_PROCESO" },
  { from: "ESPERANDO_USUARIO", to: "CERRADO" },
  { from: "ESCALADO", to: "EN_PROCESO" },
  { from: "ESCALADO", to: "RESUELTO" },
  { from: "RESUELTO", to: "CERRADO" },
  { from: "RESUELTO", to: "EN_PROCESO" },
];

/** Transiciones inválidas documentadas (3). */
export const INVALID_TRANSITIONS: ReadonlyArray<{ from: TicketState; to: TicketState; reason: string }> = [
  { from: "ABIERTO", to: "ESPERANDO_USUARIO", reason: "No se puede esperar antes de empezar." },
  { from: "ABIERTO", to: "RESUELTO", reason: "No se puede resolver sin trabajar." },
  { from: "ESPERANDO_USUARIO", to: "RESUELTO", reason: "Debe retomar trabajo antes de resolver." },
];

/**
 * Helper que encapsula la distinción soliciar/ejecutar.
 * Bloque 2 (API) lo usará para separar:
 * - POST /api/tickets/[id]/transitions (request) → si canRequest: crea pending.
 * - POST /api/tickets/[id]/transitions/execute (execute) → si canExecute: aplica.
 */
export function canRequestTransition(
  from: TicketState,
  to: TicketState,
  actor: TicketActor,
  ticket: TicketSnapshot,
): boolean {
  return canTransition(from, to, actor, ticket).canRequest;
}

export function canExecuteTransition(
  from: TicketState,
  to: TicketState,
  actor: TicketActor,
  ticket: TicketSnapshot,
): boolean {
  return canTransition(from, to, actor, ticket).canExecute;
}

export { TERMINAL_TICKET_STATES };
