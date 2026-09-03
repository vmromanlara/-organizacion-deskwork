"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Proveedor de estado del (demo) shell.
 *
 * TKT-UI cleanup final: este componente ya no carga fixtures MOCK desde
 * `@/mock/deskwork-data`. Los tipos y los datos de inicio se definen
 * inline (vacíos) y el localStorage solo retiene estado persistido por
 * el propio usuario en sesiones previas — sin sembrado desde MOCK.
 *
 * Si en el futuro alguna ruta (demo) quiere volver a tener un dataset
 * de maqueta independiente del backend real, debe ser sembrado vía
 * endpoint o seed explícito, no desde MOCK en runtime.
 */

const DEMO_STATE_STORAGE_KEY = "deskwork.demo-state.v1";
const DEMO_STATE_VERSION = 1;

type LocalTiming = {
  firstResponseMinutes: number | null;
  effectiveWorkMinutes: number;
  awaitingUserMinutes: number;
  resolutionMinutes: number | null;
  totalMinutes: number;
  slaStatus: string;
};

type LocalTicket = {
  id: string;
  title: string;
  description: string;
  requesterId: string;
  categoryId: string;
  priority: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  timing: LocalTiming;
};

type LocalTicketEvent = {
  id: string;
  ticketId: string;
  type: string;
  actorId: string;
  occurredAt: string;
  summary: string;
  fromState?: string;
  toState?: string;
};

type LocalTicketState = string;

type DemoState = {
  isHydrated: boolean;
  tickets: readonly LocalTicket[];
  events: readonly LocalTicketEvent[];
  createTicket: (input: { categoryId: string; description: string; requesterId: string }) => string;
  changeTicketState: (ticketId: string, nextState: LocalTicketState) => void;
};

type PersistedDemoState = {
  version: number;
  tickets: readonly LocalTicket[];
  events: readonly LocalTicketEvent[];
};

const DemoStateContext = createContext<DemoState | undefined>(undefined);

function emptyState(): PersistedDemoState {
  return { version: DEMO_STATE_VERSION, tickets: [], events: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTicket(value: unknown): value is LocalTicket {
  if (!isRecord(value) || !isRecord(value.timing)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.description === "string"
    && typeof value.requesterId === "string"
    && typeof value.categoryId === "string"
    && typeof value.priority === "string"
    && typeof value.state === "string"
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && typeof value.timing.totalMinutes === "number";
}

function isTicketEvent(value: unknown): value is LocalTicketEvent {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.ticketId === "string"
    && typeof value.type === "string"
    && typeof value.actorId === "string"
    && typeof value.occurredAt === "string"
    && typeof value.summary === "string";
}

function readPersistedState(): PersistedDemoState {
  try {
    const rawState = window.localStorage.getItem(DEMO_STATE_STORAGE_KEY);
    if (!rawState) return emptyState();
    const candidate: unknown = JSON.parse(rawState);
    if (!isRecord(candidate) || candidate.version !== DEMO_STATE_VERSION || !Array.isArray(candidate.tickets) || !Array.isArray(candidate.events)) return emptyState();
    if (!candidate.tickets.every(isTicket) || !candidate.events.every(isTicketEvent)) return emptyState();
    return { version: DEMO_STATE_VERSION, tickets: candidate.tickets, events: candidate.events };
  } catch {
    return emptyState();
  }
}

function persistState(tickets: readonly LocalTicket[], events: readonly LocalTicketEvent[]) {
  try {
    window.localStorage.setItem(DEMO_STATE_STORAGE_KEY, JSON.stringify({ version: DEMO_STATE_VERSION, tickets, events } satisfies PersistedDemoState));
  } catch {
    // La maqueta sigue operativa en memoria si el navegador impide el almacenamiento local.
  }
}

export function DemoStateProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<readonly LocalTicket[]>([]);
  const [events, setEvents] = useState<readonly LocalTicketEvent[]>([]);
  const [isHydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const persisted = readPersistedState();
      setTickets(persisted.tickets);
      setEvents(persisted.events);
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (isHydrated) persistState(tickets, events);
  }, [events, isHydrated, tickets]);

  const value = useMemo<DemoState>(() => ({
    isHydrated,
    tickets,
    events,
    createTicket({ categoryId, description, requesterId }) {
      const occurredAt = new Date().toISOString();
      const lastId = Math.max(...tickets.map((ticket) => Number(ticket.id.replace("DW-", ""))), 1048);
      const ticketId = `DW-${lastId + 1}`;
      const ticket: LocalTicket = {
        id: ticketId,
        title: description.trim().split(/[.!?\n]/)[0] || "Nueva solicitud",
        description: description.trim(),
        requesterId,
        categoryId,
        priority: "P3",
        state: "ABIERTO",
        createdAt: occurredAt,
        updatedAt: occurredAt,
        timing: { firstResponseMinutes: null, effectiveWorkMinutes: 0, awaitingUserMinutes: 0, resolutionMinutes: null, totalMinutes: 0, slaStatus: "on_track" },
      };
      const event: LocalTicketEvent = { id: `${ticketId}-created-${occurredAt}`, ticketId, type: "created", actorId: requesterId, occurredAt, summary: "Solicitud registrada desde la maqueta." };
      const nextTickets = [ticket, ...tickets];
      const nextEvents = [...events, event];
      setTickets(nextTickets);
      setEvents(nextEvents);
      persistState(nextTickets, nextEvents);
      return ticketId;
    },
    changeTicketState(ticketId, nextState) {
      const occurredAt = new Date().toISOString();
      const ticket = tickets.find((candidate) => candidate.id === ticketId);
      if (!ticket || ticket.state === nextState) return;
      const nextTickets = tickets.map((candidate) => candidate.id === ticketId ? { ...candidate, state: nextState, updatedAt: occurredAt, timing: { ...candidate.timing } } : candidate);
      const event: LocalTicketEvent = {
        id: `${ticketId}-${nextState}-${occurredAt}`,
        ticketId,
        type: nextState === "RESUELTO" ? "resolved" : nextState === "CERRADO" ? "closed" : "state_changed",
        actorId: "user-carmen-vidal",
        occurredAt,
        summary: `Estado actualizado a ${nextState}.`,
        fromState: ticket.state,
        toState: nextState,
      };
      const nextEvents = [...events, event];
      setTickets(nextTickets);
      setEvents(nextEvents);
      persistState(nextTickets, nextEvents);
    },
  }), [events, isHydrated, tickets]);

  return <DemoStateContext.Provider value={value}>{children}</DemoStateContext.Provider>;
}

export function useDemoState(): DemoState {
  const state = useContext(DemoStateContext);
  if (!state) throw new Error("useDemoState must be used inside DemoStateProvider.");
  return state;
}
