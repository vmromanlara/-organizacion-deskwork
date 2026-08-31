/**
 * DeskWork Ticketing Core / TKT-019.
 * Dispatcher — procesa un batch de notificaciones pendientes.
 *
 * Flujo por mensaje:
 *   1) claim_pending_notifications RPC -> filas 'processing' con claim_id
 *   2) renderTemplate -> { subject, body }
 *   3) provider.send(EmailMessage)
 *   4) provider.ok -> completeNotification('sent', null)
 *      provider.err -> completeNotification('failed', error)
 *
 * Si el provider lanza una excepción inesperada, marcamos failed con
 * mensaje genérico (defense in depth: el dispatcher no rompe el batch).
 *
 * Concurrencia: el lease pattern de la DB garantiza que un mismo
 * notification_outbox row no sea procesado por dos workers simultáneos.
 * El dispatcher aquí NO necesita coordinación adicional: el `for update
 * skip locked` en claim_pending_notifications lo asegura.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimPendingNotifications,
  completeNotification,
} from "./repository";
import { renderTemplate } from "./templates";
import type { EmailMessage, EmailProvider } from "./provider";
import type { NotificationRow } from "./types";

export interface DispatcherOptions {
  supabase: SupabaseClient;
  provider: EmailProvider;
  batchSize?: number;
  leaseSeconds?: number;
}

export interface DispatcherResult {
  claimed: number;
  sent: number;
  failed: number;
  errors: Array<{ notificationId: string; error: string }>;
  durationMs: number;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_LEASE_SECONDS = 60;

export async function dispatchBatch(
  opts: DispatcherOptions,
): Promise<DispatcherResult> {
  const start = Date.now();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const leaseSeconds = opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS;

  const claim = await claimPendingNotifications(
    opts.supabase,
    batchSize,
    leaseSeconds,
  );
  if (!claim.ok) {
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      errors: [
        {
          notificationId: "(claim)",
          error: `claim failed: ${claim.error.kind} ${"reason" in claim.error ? claim.error.reason : ""}`,
        },
      ],
      durationMs: Date.now() - start,
    };
  }

  let sent = 0;
  let failed = 0;
  const errors: DispatcherResult["errors"] = [];

  for (const notification of claim.notifications) {
    const outcome = await dispatchOne(opts.supabase, opts.provider, notification);
    if (outcome.kind === "sent") {
      sent += 1;
    } else if (outcome.kind === "failed") {
      failed += 1;
      errors.push({
        notificationId: notification.id,
        error: outcome.error,
      });
    }
    // 'skipped' no cuenta como sent ni failed.
  }

  return {
    claimed: claim.notifications.length,
    sent,
    failed,
    errors,
    durationMs: Date.now() - start,
  };
}

type DispatchOutcome =
  | { kind: "sent" }
  | { kind: "failed"; error: string }
  | { kind: "skipped" };

async function dispatchOne(
  supabase: SupabaseClient,
  provider: EmailProvider,
  notification: NotificationRow,
): Promise<DispatchOutcome> {
  // Si por alguna razón la fila no tiene claim_id (race condition), la
  // saltamos. El lease expirará y otro worker la retomará.
  if (!notification.claimId) {
    return { kind: "skipped" };
  }

  const { subject, body } = renderTemplate(notification);
  const message: EmailMessage = {
    to: notification.recipientEmailSnapshot,
    subject,
    body,
    notificationType: notification.notificationType,
    outboxId: notification.id,
  };

  let result;
  try {
    result = await provider.send(message);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errorMessage = `provider threw: ${msg}`;
    await completeNotification(
      supabase,
      notification.id,
      notification.claimId,
      "failed",
      errorMessage,
    );
    return { kind: "failed", error: errorMessage };
  }

  if (result.ok) {
    const complete = await completeNotification(
      supabase,
      notification.id,
      notification.claimId,
      "sent",
      null,
    );
    return complete.ok
      ? { kind: "sent" }
      : { kind: "failed", error: "complete_notification failed" };
  }
  const errorMessage = result.error;
  await completeNotification(
    supabase,
    notification.id,
    notification.claimId,
    "failed",
    errorMessage,
  );
  return { kind: "failed", error: errorMessage };
}
