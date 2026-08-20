import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_SCOPES,
  FUNCTIONAL_ROLE_DEFAULT_SCOPE,
  FUNCTIONAL_ROLE_PERMISSIONS,
  FUNCTIONAL_ROLES,
  PERMISSIONS,
  hasAuthorizationScope,
  hasFunctionalRole,
} from "./roles";

describe("Foundation functional authorization catalogue", () => {
  it("models the five approved functional roles independently of tenant_admin", () => {
    expect(FUNCTIONAL_ROLES).toEqual([
      "technical_lead",
      "director",
      "supervisor",
      "administrative",
      "operator",
    ]);
    expect(Object.keys(FUNCTIONAL_ROLE_PERMISSIONS)).not.toContain("tenant_admin");
  });

  it("uses the approved default scopes", () => {
    expect(FUNCTIONAL_ROLE_DEFAULT_SCOPE).toEqual({
      technical_lead: "institution",
      director: "institution",
      supervisor: "department",
      administrative: "self",
      operator: "self",
    });
    expect(AUTHORIZATION_SCOPES).toEqual(["institution", "department", "team", "self"]);
  });

  it("distinguishes request from execution and gives director an explicit status transition", () => {
    expect(PERMISSIONS.MEMBERSHIP_CREATE_REQUEST).not.toBe(PERMISSIONS.MEMBERSHIP_MANAGE_EXECUTE);
    expect(FUNCTIONAL_ROLE_PERMISSIONS.director).toContain(PERMISSIONS.TICKET_STATUS_EXECUTE);
    expect(FUNCTIONAL_ROLE_PERMISSIONS.supervisor).toContain(PERMISSIONS.TICKET_STATUS_REQUEST);
    expect(hasFunctionalRole("tenant_admin")).toBe(false);
    expect(hasAuthorizationScope("self")).toBe(true);
  });
});
