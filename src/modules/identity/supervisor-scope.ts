export type SupervisorScopeGrant =
  | { scope: "department"; areaId: string }
  | { scope: "team"; teamId: string };

export type ScopedRequest = {
  requesterMembershipId: string;
  requesterAreaId: string | null;
  requesterTeamIds: readonly string[];
};

/**
 * Mirrors the explicit scope model used by RLS. Reporting lines are not an
 * authorization shortcut: a supervisor needs an assigned department or team.
 */
export function canSupervisorReadScopedRequest(
  supervisorMembershipId: string,
  scopeGrants: readonly SupervisorScopeGrant[],
  request: ScopedRequest,
): boolean {
  if (request.requesterMembershipId === supervisorMembershipId) {
    return true;
  }

  return scopeGrants.some((grant) => {
    if (grant.scope === "department") {
      return request.requesterAreaId === grant.areaId;
    }

    return request.requesterTeamIds.includes(grant.teamId);
  });
}
