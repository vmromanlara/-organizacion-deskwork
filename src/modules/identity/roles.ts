export const FUNCTIONAL_ROLES = [
  "technical_lead",
  "director",
  "supervisor",
  "administrative",
  "operator",
] as const;

export const AUTHORIZATION_SCOPES = ["institution", "department", "team", "self"] as const;

export type FunctionalRole = (typeof FUNCTIONAL_ROLES)[number];
export type AuthorizationScope = (typeof AUTHORIZATION_SCOPES)[number];

export const FUNCTIONAL_ROLE_DEFAULT_SCOPE: Record<FunctionalRole, AuthorizationScope> = {
  technical_lead: "institution",
  director: "institution",
  supervisor: "department",
  administrative: "self",
  operator: "self",
};

// This is a shared vocabulary for UI and server validation. PostgreSQL is the
// authorization authority; the same codes are seeded in the Foundation migration.
export const PERMISSIONS = {
  DIRECTORY_READ_SELF: "directory.read.self",
  DIRECTORY_READ_SCOPE: "directory.read.scope",
  DIRECTORY_READ_INSTITUTION: "directory.read.institution",
  MEMBERSHIP_CREATE_REQUEST: "membership.create.request",
  MEMBERSHIP_DEACTIVATE_REQUEST: "membership.deactivate.request",
  MEMBERSHIP_MANAGE_EXECUTE: "membership.manage.execute",
  SCOPE_MANAGE_EXECUTE: "scope.manage.execute",
  TENANT_MANAGE_EXECUTE: "tenant.manage.execute",
  TENANT_ADMIN_GRANT_EXECUTE: "tenant_admin.grant.execute",
  TICKET_STATUS_REQUEST: "ticket.status.request",
  TICKET_STATUS_EXECUTE: "ticket.status.execute",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const FUNCTIONAL_ROLE_PERMISSIONS: Record<FunctionalRole, readonly string[]> = {
  technical_lead: [
    PERMISSIONS.DIRECTORY_READ_INSTITUTION,
    PERMISSIONS.MEMBERSHIP_MANAGE_EXECUTE,
    PERMISSIONS.SCOPE_MANAGE_EXECUTE,
    PERMISSIONS.TICKET_STATUS_EXECUTE,
  ],
  director: [
    PERMISSIONS.DIRECTORY_READ_INSTITUTION,
    PERMISSIONS.MEMBERSHIP_CREATE_REQUEST,
    PERMISSIONS.MEMBERSHIP_DEACTIVATE_REQUEST,
    PERMISSIONS.TICKET_STATUS_EXECUTE,
  ],
  supervisor: [
    PERMISSIONS.DIRECTORY_READ_SCOPE,
    PERMISSIONS.MEMBERSHIP_CREATE_REQUEST,
    PERMISSIONS.MEMBERSHIP_DEACTIVATE_REQUEST,
    PERMISSIONS.TICKET_STATUS_REQUEST,
  ],
  administrative: [PERMISSIONS.DIRECTORY_READ_SELF],
  operator: [PERMISSIONS.DIRECTORY_READ_SELF],
};

export function hasFunctionalRole(role: string): role is FunctionalRole {
  return FUNCTIONAL_ROLES.some((candidate) => candidate === role);
}

export function hasAuthorizationScope(scope: string): scope is AuthorizationScope {
  return AUTHORIZATION_SCOPES.some((candidate) => candidate === scope);
}
