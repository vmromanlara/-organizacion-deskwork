import { describe, expect, it } from "vitest";
import {
  ALL_TICKET_PERMISSIONS,
  TICKET_PERMISSIONS,
  isTicketPermission,
} from "./permissions";

describe("Permissions — vocabulario canónico", () => {
  it("declara exactamente 13 permisos de ticket (8 Foundation + 5 TKT-003)", () => {
    expect(ALL_TICKET_PERMISSIONS).toHaveLength(13);
  });

  it("incluye los 5 permisos nuevos de TKT-003", () => {
    expect(TICKET_PERMISSIONS.TICKET_ASSIGNMENT_EXECUTE).toBe(
      "ticket.assignment.execute",
    );
    expect(TICKET_PERMISSIONS.TICKET_COMMENT_CREATE).toBe(
      "ticket.comment.create",
    );
    expect(TICKET_PERMISSIONS.TICKET_ATTACHMENT_CREATE).toBe(
      "ticket.attachment.create",
    );
    expect(TICKET_PERMISSIONS.TICKET_KPIS_READ_INSTITUTION).toBe(
      "ticket.kpis.read.institution",
    );
    expect(TICKET_PERMISSIONS.TICKET_EXECUTE_ASSIGNED).toBe(
      "ticket.execute.assigned",
    );
  });

  it("isTicketPermission acepta códigos válidos", () => {
    expect(isTicketPermission("ticket.create.self")).toBe(true);
    expect(isTicketPermission("ticket.execute.assigned")).toBe(true);
  });

  it("isTicketPermission rechaza códigos no declarados", () => {
    expect(isTicketPermission("ticket.invented")).toBe(false);
    expect(isTicketPermission("membership.create.request")).toBe(false);
  });
});
