"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  mockTicketHistory,
  mockTickets,
  type MockTicket,
  type MockTicketEvent,
  type MockTicketState,
} from "@/mock/deskwork-data";

const DEMO_STATE_STORAGE_KEY = "deskwork.demo-state.v1";
const DEMO_STATE_VERSION = 1;

type DemoState = {
  isHydrated: boolean;
  tickets: readonly MockTicket[];
  events: readonly MockTicketEvent[];
  createTicket: (input: { categoryId: string; description: string; requesterId: string }) => string;
  changeTicketState: (ticketId: string, nextState: MockTicketState) => void;
};

type PersistedDemoState = {
  version: number;
  tickets: readonly MockTicket[];
  events: readonly MockTicketEvent[];
};

const DemoStateContext = createContext<DemoState | undefined>(undefined);

const stateLabels: Record<MockTicketState, string> = {
  ABIERTO: "La solicitud quedó abierta.",
  EN_PROCESO: "La atención de la solicitud comenzó.",
  ESPERANDO_USUARIO: "La solicitud espera información de la persona solicitante.",
  ESCALADO: "La solicitud fue escalada para continuar la atención.",
  RESUELTO: "La solución fue aplicada y registrada.",
  CERRADO: "La solicitud fue cerrada.",
};

function fixtureState(): PersistedDemoState {
  return { version: DEMO_STATE_VERSION, tickets: mockTickets, events: mockTicketHistory };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTicket(value: unknown): value is MockTicket {
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

function isTicketEvent(value: unknown): value is MockTicketEvent {
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
    if (!rawState) return fixtureState();
    const candidate: unknown = JSON.parse(rawState);
    if (!isRecord(candidate) || candidate.version !== DEMO_STATE_VERSION || !Array.isArray(candidate.tickets) || !Array.isArray(candidate.events)) return fixtureState();
    if (!candidate.tickets.every(isTicket) || !candidate.events.every(isTicketEvent)) return fixtureState();
    return { version: DEMO_STATE_VERSION, tickets: candidate.tickets, events: candidate.events };
  } catch {
    return fixtureState();
  }
}

function persistState(tickets: readonly MockTicket[], events: readonly MockTicketEvent[]) {
  try {
    window.localStorage.setItem(DEMO_STATE_STORAGE_KEY, JSON.stringify({ version: DEMO_STATE_VERSION, tickets, events } satisfies PersistedDemoState));
  } catch {
    // La maqueta sigue operativa en memoria si el navegador impide el almacenamiento local.
  }
}

export function DemoStateProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<readonly MockTicket[]>(mockTickets);
  const [events, setEvents] = useState<readonly MockTicketEvent[]>(mockTicketHistory);
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
      const ticket: MockTicket = {
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
      const event: MockTicketEvent = { id: `${ticketId}-created-${occurredAt}`, ticketId, type: "created", actorId: requesterId, occurredAt, summary: "Solicitud registrada desde la maqueta." };
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
      const event: MockTicketEvent = {
        id: `${ticketId}-${nextState}-${occurredAt}`,
        ticketId,
        type: nextState === "RESUELTO" ? "resolved" : nextState === "CERRADO" ? "closed" : "state_changed",
        actorId: "user-carmen-vidal",
        occurredAt,
        summary: stateLabels[nextState],
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
