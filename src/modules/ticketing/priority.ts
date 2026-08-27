/* ============================================================
 * TEMPORARY DEVELOPMENT FALLBACK — NOT PRODUCT POLICY
 * ============================================================
 * This stub is a TEMPORARY fallback to unblock development
 * of the MVP (Ticketing Core v0.1). It is NOT the contractual
 * priority rule.
 *
 * The CONTRACTUAL priority rule is BLOCKED on 5 Product Owner
 * decisions (see DESKWORK_TICKETING_CORE_FINAL_SPEC_FREEZE.md §5):
 *   1. Cargo × Category base matrix
 *   2. Categories that inherently force P1
 *   3. Static vs description-analysis-based
 *   4. Technician override allowed?
 *   5. Default priority without membership
 *
 * When the PO responds, TKT-007 replaces this stub.
 * ============================================================ */

import type { TicketPriority } from "./types";

/**
 * Stub determinista. Lee solo el slug de categoría y devuelve una prioridad.
 * NO refleja la regla contractual `cargo + categoría + descripción`.
 */
const PRIORITY_BY_CATEGORY: Record<string, TicketPriority> = {
  accesos: "P1",
  cuenta: "P1",
  correo: "P1",
  computador: "P2",
  software: "P2",
  internet: "P3",
  impresora: "P3",
  telefonia: "P3",
  otro: "P4",
};

const DEFAULT_PRIORITY: TicketPriority = "P3";

export function calculatePriorityStub(categorySlug: string): TicketPriority {
  return PRIORITY_BY_CATEGORY[categorySlug] ?? DEFAULT_PRIORITY;
}

export const __STUB_DISCLAIMER =
  "TEMPORARY DEVELOPMENT FALLBACK — NOT PRODUCT POLICY";
