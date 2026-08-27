/**
 * DeskWork Ticketing Core / Fase Block 1.
 * TKT-005 — Finite State Machine de tickets.
 *
 * La matriz refleja EXACTAMENTE la FSM canónica v3 §3.3 (17 totales:
 * 14 válidas + 3 inválidas). NO agregar transiciones nuevas.
 * CERRADO es terminal.
 */

import {
  TERMINAL_TICKET_STATES,
  hasTicketState,
  isTerminalState,
  type TicketActor,
  type TicketSnapshot,
  type TicketState,
  type TransitionResult,
} from "./types";

/** Resultado de la consulta: la transición es válida, inválida o denegada. */
export type TransitionDenialReason =
  | "CERRADO_IS_TERMINAL"
  | "INVALID_TRANSITION"
  | "ACTOR_NOT_AUTHENTICATED"
  | "ACTOR_LACKS_PERMISSION";

/**
 * Firma canónica exigida por el prompt.
 * Devuelve { valid, reason } con razón legible cuando valid=false.
 */
export function canTransition(
  from: TicketState,
  to: TicketState,
  actor: TicketActor,
  ticket: TicketSnapshot,
): TransitionResult {
  if (!hasTicketState(from) || !hasTicketState(to)) {
    return { valid: false, reason: "Estado origen o destino desconocido." };
  }
  if (isTerminalState(from)) {
    return { valid: false, reason: "CERRADO es estado terminal." };
  }
  if (actor.userId === null && actor.kind !== "system") {
    return { valid: false, reason: "Actor no autenticado." };
  }

  const verdict = evaluateTransition(from, to, actor, ticket);
  return verdict;
}

/** Reglas por transición. La lista está cerrada: NO agregar entradas. */
type Rule = (actor: TicketActor, ticket: TicketSnapshot) => TransitionResult;

const REJECT: Rule = () => ({ valid: false, reason: "Transición inválida por FSM." });

const RULES: Record<string, Rule> = {
  // 1. ABIERTO → EN_PROCESO (válida)
  "ABIERTO->EN_PROCESO": (actor, ticket) => {
    if (!ticket.assignedTo) {
      return { valid: false, reason: "Ticket no asignado." };
    }
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return { valid: true, reason: null };
    }
    if (actor.kind === "agent") {
      return { valid: false, reason: "Agente no es el asignado." };
    }
    if (actor.kind === "supervisor" || actor.kind === "technical_lead" || actor.kind === "director") {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Actor no autorizado para iniciar trabajo." };
  },
  // 2. ABIERTO → ESPERANDO_USUARIO (INVÁLIDA)
  "ABIERTO->ESPERANDO_USUARIO": REJECT,
  // 3. ABIERTO → ESCALADO (válida)
  "ABIERTO->ESCALADO": (actor) => {
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return { valid: true, reason: null };
    }
    if (actor.kind === "agent") {
      return { valid: false, reason: "Agente no puede escalar sin asignar." };
    }
    return { valid: false, reason: "Actor no autorizado para escalar." };
  },
  // 4. ABIERTO → RESUELTO (INVÁLIDA)
  "ABIERTO->RESUELTO": REJECT,
  // 5. ABIERTO → CERRADO (caso especial: cancelación rápida)
  "ABIERTO->CERRADO": (actor, ticket) => {
    if (actor.kind === "requester" && ticket.requesterId === actor.userId) {
      return { valid: true, reason: null };
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Actor no autorizado para cierre temprano." };
  },
  // 6. EN_PROCESO → ESPERANDO_USUARIO
  "EN_PROCESO->ESPERANDO_USUARIO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return { valid: true, reason: null };
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return { valid: true, reason: null };
    }
    if (actor.kind === "supervisor") {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Actor no autorizado para marcar espera." };
  },
  // 7. EN_PROCESO → ESCALADO
  "EN_PROCESO->ESCALADO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return { valid: true, reason: null };
    }
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Actor no autorizado para escalar." };
  },
  // 8. EN_PROCESO → RESUELTO
  "EN_PROCESO->RESUELTO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return { valid: true, reason: null };
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return { valid: true, reason: null };
    }
    if (actor.kind === "supervisor") {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Actor no autorizado para resolver." };
  },
  // 9. EN_PROCESO → CERRADO (cancelación tardía)
  "EN_PROCESO->CERRADO": (actor) => {
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Actor no autorizado para cancelación tardía." };
  },
  // 10. EN_PROCESO → ABIERTO (reapertura técnica)
  "EN_PROCESO->ABIERTO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return { valid: true, reason: null };
    }
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Actor no autorizado para reabrir." };
  },
  // 11. ESPERANDO_USUARIO → EN_PROCESO (retoma)
  "ESPERANDO_USUARIO->EN_PROCESO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return { valid: true, reason: null };
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return { valid: true, reason: null };
    }
    if (actor.kind === "requester" && ticket.requesterId === actor.userId) {
      // El requester expresa la respuesta vía CONFIRMAR (comment), pero la transición
      // la ejecuta el agente/lead/director. Aquí sólo se documenta la regla.
      return { valid: false, reason: "Requester confirma vía comentario, no ejecuta." };
    }
    return { valid: false, reason: "Actor no autorizado para retomar." };
  },
  // 12. ESPERANDO_USUARIO → RESUELTO (INVÁLIDA)
  "ESPERANDO_USUARIO->RESUELTO": REJECT,
  // 13. ESPERANDO_USUARIO → CERRADO (desistimiento)
  "ESPERANDO_USUARIO->CERRADO": (actor, ticket) => {
    if (actor.kind === "requester" && ticket.requesterId === actor.userId) {
      return { valid: true, reason: null };
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Actor no autorizado para cerrar por desistimiento." };
  },
  // 14. ESCALADO → EN_PROCESO (retoma post-escalación)
  "ESCALADO->EN_PROCESO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return { valid: true, reason: null };
    }
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Actor no autorizado para retomar." };
  },
  // 15. ESCALADO → RESUELTO
  "ESCALADO->RESUELTO": (actor, ticket) => {
    if (actor.kind === "agent" && ticket.assignedTo === actor.userId) {
      return { valid: true, reason: null };
    }
    if (
      actor.kind === "supervisor" ||
      actor.kind === "technical_lead" ||
      actor.kind === "director"
    ) {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Actor no autorizado para resolver post-escalación." };
  },
  // 16. RESUELTO → CERRADO (confirmación o auto-cierre)
  "RESUELTO->CERRADO": (actor) => {
    if (actor.kind === "system") {
      return { valid: true, reason: null };
    }
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return { valid: true, reason: null };
    }
    if (actor.kind === "requester") {
      // El requester confirma vía comment; el cierre lo ejecuta lead/director o system.
      return { valid: false, reason: "Requester confirma vía comentario, no ejecuta." };
    }
    return { valid: false, reason: "Actor no autorizado para cierre." };
  },
  // 17. RESUELTO → EN_PROCESO (reapertura por objeción)
  "RESUELTO->EN_PROCESO": (actor) => {
    if (actor.kind === "technical_lead" || actor.kind === "director") {
      return { valid: true, reason: null };
    }
    if (actor.kind === "supervisor") {
      return { valid: true, reason: null };
    }
    return { valid: false, reason: "Reapertura por objeción requiere ejecutor autorizado." };
  },
};

function evaluateTransition(
  from: TicketState,
  to: TicketState,
  actor: TicketActor,
  ticket: TicketSnapshot,
): TransitionResult {
  if (isTerminalState(to)) {
    // Permitir si la regla lo permite; la regla decide.
  }
  const key = `${from}->${to}`;
  const rule = RULES[key];
  if (!rule) {
    return { valid: false, reason: `Transición no declarada: ${key}.` };
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

export { TERMINAL_TICKET_STATES };
