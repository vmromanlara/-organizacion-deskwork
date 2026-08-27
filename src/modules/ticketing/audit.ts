/**
 * DeskWork Ticketing Core / Fase Block 1.
 * TKT-005 — Helpers de auditoría.
 *
 * Estos helpers son wrappers delgados sobre public.write_audit_log (Foundation).
 * No reinventan el contrato: sólo formatean payloads para que coincidan con
 * el shape que espera la función SECURITY DEFINER.
 */

export interface AuditEventInput {
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  result?: "success" | "denied" | "failure";
  origin?: string;
  correlationId?: string | null;
  reason?: string | null;
}

export const AUDIT_RESULT_VALUES = ["success", "denied", "failure"] as const;
export type AuditResult = (typeof AUDIT_RESULT_VALUES)[number];

const ACTION_MIN = 3;
const ACTION_MAX = 120;
const RESOURCE_TYPE_MIN = 3;
const RESOURCE_TYPE_MAX = 80;

export function validateAuditAction(action: string): boolean {
  return action.length >= ACTION_MIN && action.length <= ACTION_MAX;
}

export function validateAuditResourceType(resourceType: string): boolean {
  return (
    resourceType.length >= RESOURCE_TYPE_MIN &&
    resourceType.length <= RESOURCE_TYPE_MAX
  );
}

export function isAuditResult(value: string): value is AuditResult {
  return (AUDIT_RESULT_VALUES as readonly string[]).includes(value);
}
