'use client';
import { get, set, del, keys } from 'idb-keyval';

/**
 * Offline-mode queue for the scanner. When a scan POST fails with a network
 * error (volunteer's phone has no signal), we record the admit attempt in
 * IndexedDB and show the volunteer an optimistic-success overlay. When the
 * phone reconnects, the queue is drained: each queued admit is replayed
 * through /api/scan, with the locally-generated client_scan_id serving as
 * the idempotency key.
 *
 * If the server replays an entry as a failure (e.g. the ticket got refunded
 * between the offline admit and the sync), the entry stays in the queue
 * with `reconcile_result` set so the UI can show a "needs review" banner.
 */

export interface QueuedAdmit {
  client_scan_id: string;
  token: string;
  event_at_gate: 'main_event' | 'after_party';
  attempted_at: number;
  holder_name_if_known: string | null;
  /** Set after a sync attempt that returned a non-success — flags it for operator review. */
  reconcile_result?:
    | 'already_used'
    | 'wrong_event'
    | 'refunded'
    | 'voided'
    | 'not_found';
  reconcile_message?: string;
}

const NS = 'phc-scanner-offline/';

function keyFor(id: string): string {
  return `${NS}${id}`;
}

export async function queueOfflineAdmit(item: QueuedAdmit): Promise<void> {
  await set(keyFor(item.client_scan_id), item);
}

export async function getQueuedAdmits(): Promise<QueuedAdmit[]> {
  const allKeys = await keys();
  const ours = allKeys.filter(
    (k): k is string => typeof k === 'string' && k.startsWith(NS),
  );
  const items = await Promise.all(ours.map((k) => get<QueuedAdmit>(k)));
  return items.filter((i): i is QueuedAdmit => Boolean(i));
}

export async function markReconcile(
  client_scan_id: string,
  reconcile_result: NonNullable<QueuedAdmit['reconcile_result']>,
  reconcile_message?: string,
): Promise<void> {
  const existing = await get<QueuedAdmit>(keyFor(client_scan_id));
  if (!existing) return;
  await set(keyFor(client_scan_id), {
    ...existing,
    reconcile_result,
    reconcile_message,
  });
}

export async function removeQueuedAdmit(client_scan_id: string): Promise<void> {
  await del(keyFor(client_scan_id));
}

/** Generate a fresh idempotency key for a new offline admit. */
export function newClientScanId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
