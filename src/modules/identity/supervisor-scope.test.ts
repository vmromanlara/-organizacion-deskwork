import { describe, expect, it } from "vitest";
import { canSupervisorReadScopedRequest } from "./supervisor-scope";

describe("supervisor explicit scope", () => {
  const grants = [
    { scope: "department" as const, areaId: "finance" },
    { scope: "team" as const, teamId: "support-a" },
  ];

  it("permits only self, an assigned department, or an assigned team", () => {
    expect(
      canSupervisorReadScopedRequest("supervisor", grants, {
        requesterMembershipId: "supervisor",
        requesterAreaId: null,
        requesterTeamIds: [],
      }),
    ).toBe(true);
    expect(
      canSupervisorReadScopedRequest("supervisor", grants, {
        requesterMembershipId: "finance-user",
        requesterAreaId: "finance",
        requesterTeamIds: [],
      }),
    ).toBe(true);
    expect(
      canSupervisorReadScopedRequest("supervisor", grants, {
        requesterMembershipId: "team-user",
        requesterAreaId: "operations",
        requesterTeamIds: ["support-a"],
      }),
    ).toBe(true);
    expect(
      canSupervisorReadScopedRequest("supervisor", grants, {
        requesterMembershipId: "outside-user",
        requesterAreaId: "operations",
        requesterTeamIds: ["support-b"],
      }),
    ).toBe(false);
  });
});
