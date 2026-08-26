import { describe, expect, it } from "vitest";
import {
  MOCK_PRIORITY_CODES,
  MOCK_TICKET_STATES,
  getMockTicketHistory,
  mockCategories,
  mockKpiSeries,
  mockKpiSummary,
  mockTechnicians,
  mockTicketHistory,
  mockTickets,
  mockUsers,
} from "./deskwork-data";

describe("DeskWork local mock data", () => {
  it("keeps the approved category, priority, and state catalogues available to the demo", () => {
    expect(mockCategories).toHaveLength(9);
    expect(MOCK_PRIORITY_CODES).toEqual(["P1", "P2", "P3", "P4"]);
    expect(MOCK_TICKET_STATES).toEqual([
      "ABIERTO",
      "EN_PROCESO",
      "ESPERANDO_USUARIO",
      "ESCALADO",
      "RESUELTO",
      "CERRADO",
    ]);
  });

  it("provides a realistic local set of users, technicians, and tickets with valid references", () => {
    const userIds = new Set<string>(mockUsers.map((user) => user.id));
    const technicianIds = new Set<string>(mockTechnicians.map((technician) => technician.userId));
    const categoryIds = new Set<string>(mockCategories.map((category) => category.id));

    expect(mockUsers).toHaveLength(9);
    expect(mockTechnicians).toHaveLength(3);
    expect(mockTickets).toHaveLength(18);

    for (const ticket of mockTickets) {
      expect(userIds.has(ticket.requesterId)).toBe(true);
      expect(categoryIds.has(ticket.categoryId)).toBe(true);
      expect(ticket.technicianId === undefined || technicianIds.has(ticket.technicianId)).toBe(true);
    }
  });

  it("keeps a traceable local history for every ticket", () => {
    expect(mockTicketHistory.length).toBeGreaterThan(mockTickets.length);

    for (const ticket of mockTickets) {
      const history = getMockTicketHistory(ticket.id);
      expect(history[0]).toMatchObject({ ticketId: ticket.id, type: "created", toState: "ABIERTO" });
    }
  });

  it("exposes thirty temporal KPI buckets and a summary derived from the local fixture", () => {
    expect(mockKpiSeries).toHaveLength(30);
    expect(mockKpiSummary.periodStart).toBe("2026-07-27");
    expect(mockKpiSummary.periodEnd).toBe("2026-08-25");
    expect(mockKpiSummary.requestsReceived).toBeGreaterThan(mockKpiSummary.requestsResolved);
    expect(mockKpiSummary.overdue).toBeGreaterThan(0);
    expect(mockKpiSummary.refreshedAt).toBe("2026-08-25T12:00:00.000Z");
  });
});
