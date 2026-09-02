/**
 * DeskWork Ticketing Core / TKT-019.
 * Repository del outbox sobre Supabase.
 *
 * Las mutaciones del outbox (claim/complete) pasan por las funciones
 * SECURITY DEFINER `claim_pending_notifications` y `complete_notification`.
 * El SELECT pasa por RLS (tenant members). La app layer NO inserta
 * directamente — los INSERTs se hacen exclusivamente vía el trigger
 * `ticket_events_after_insert_notify` en la misma transacción que la
 * mutación crítica.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationRow,
  NotificationStatus,
  NotificationType,
} from "./types.ts";

interface OutboxRow {
  id: string;
  tenant_id: string;
  ticket_id: string;
  event_id: string;
  notification_type: string;
  recipient_user_id: string;
  recipient_email_snapshot: string;
  payload: Record<string, unknown>;
  status: string;
  attempt_count: number;
  claim_id: string | null;
  claim_expires_at: string | null;
  available_at: string;
  created_at: string;
  processed_at: string | null;
  last_error: string | null;
}

function toNotification(row: OutboxRow): NotificationRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ticketId: row.ticket_id,
    eventId: row.event_id,
    notificationType: row.notification_type as NotificationType,
    recipientUserId: row.recipient_user_id,
    recipientEmailSnapshot: row.recipient_email_snapshot,
    payload: row.payload as unknown as NotificationRow["payload"],
    status: row.status as NotificationStatus,
    attemptCount: row.attempt_count,
    claimId: row.claim_id,
    claimExpiresAt: row.claim_expires_at,
    availableAt: row.available_at,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    lastError: row.last_error,
  };
}

/** Error tipado del repository. */
export type NotificationRepoError =
  | { kind: "validation"; reason: string }
  | { kind: "forbidden"; reason: string }
  | { kind: "not_found"; reason: string }
  | { kind: "db_error"; reason: string };

export type ClaimResult =
  | { ok: true; notifications: NotificationRow[] }
  | { ok: false; error: NotificationRepoError };

export type CompleteResult =
  | { ok: true; notification: NotificationRow }
  | { ok: false; error: NotificationRepoError };

/**
 * Reclama hasta `limit` notificaciones pendientes (o con lease expirado)
 * vía la SECURITY DEFINER `claim_pending_notifications`.
 */
export async function claimPendingNotifications(
  supabase: SupabaseClient,
  limit: number,
  leaseSeconds = 60,
): Promise<ClaimResult> {
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    return {
      ok: false,
      error: {
        kind: "validation",
        reason: "limit debe ser entero entre 1 y 1000.",
      },
    };
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 0) {
    return {
      ok: false,
      error: {
        kind: "validation",
        reason: "leaseSeconds debe ser entero >= 0.",
      },
    };
  }

  const { data, error } = await supabase.rpc("claim_pending_notifications", {
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });

  if (error) {
    const code = error.code ?? "";
    if (
      code === "42501" ||
      /not authorized|authentication required/i.test(error.message)
    ) {
      return { ok: false, error: { kind: "forbidden", reason: error.message } };
    }
    return {
      ok: false,
      error: { kind: "db_error", reason: error.message },
    };
  }

  return {
    ok: true,
    notifications: ((data as OutboxRow[] | null) ?? []).map(toNotification),
  };
}

/**
 * Cierra una notificación reclamada: 'sent' o 'failed'.
 * SECURITY DEFINER valida claim_id y estado processing.
 */
export async function completeNotification(
  supabase: SupabaseClient,
  notificationId: string,
  claimId: string,
  status: "sent" | "failed",
  errorMessage: string | null = null,
): Promise<CompleteResult> {
  if (status !== "sent" && status !== "failed") {
    return {
      ok: false,
      error: {
        kind: "validation",
        reason: "status debe ser 'sent' o 'failed'.",
      },
    };
  }

  const { data, error } = await supabase.rpc("complete_notification", {
    p_notification_id: notificationId,
    p_claim_id: claimId,
    p_status: status,
    p_error: errorMessage,
  });

  if (error) {
    const code = error.code ?? "";
    if (code === "P0002" || /not found/i.test(error.message)) {
      return { ok: false, error: { kind: "not_found", reason: error.message } };
    }
    if (
      code === "42501" ||
      /claim_id mismatch|not authorized|authentication required/i.test(
        error.message,
      )
    ) {
      return { ok: false, error: { kind: "forbidden", reason: error.message } };
    }
    if (
      code === "P0001" ||
      /must be sent or failed|not in processing/i.test(error.message)
    ) {
      return {
        ok: false,
        error: { kind: "validation", reason: error.message },
      };
    }
    return {
      ok: false,
      error: { kind: "db_error", reason: error.message },
    };
  }

  if (!data) {
    return {
      ok: false,
      error: { kind: "db_error", reason: "RPC returned null" },
    };
  }
  return { ok: true, notification: toNotification(data as OutboxRow) };
}

/**
 * Lista notificaciones del tenant actual. Pasa por RLS (sólo miembros
 * del tenant ven sus filas). Útil para debugging/dashboard futuro;
 * NO es consumido por el dispatcher.
 */
export async function listNotificationsByTenant(
  supabase: SupabaseClient,
  filters: {
    status?: NotificationStatus;
    limit?: number;
  } = {},
): Promise<NotificationRow[]> {
  let q = supabase
    .from("notification_outbox")
    .select(
      "id, tenant_id, ticket_id, event_id, notification_type, recipient_user_id, recipient_email_snapshot, payload, status, attempt_count, claim_id, claim_expires_at, available_at, created_at, processed_at, last_error",
    )
    .order("created_at", { ascending: false });
  if (filters.status) {
    q = q.eq("status", filters.status);
  }
  q = q.limit(Math.max(1, Math.min(filters.limit ?? 100, 500)));
  const { data, error } = await q;
  if (error) {
    throw new Error(`listNotificationsByTenant: ${error.message}`);
  }
  return ((data as OutboxRow[] | null) ?? []).map(toNotification);
}
