// packages/local-store/src/outbox.ts
//
// PRD 9 FR-2 — every mutation applies locally *and* appends a durable outbox entry.
//
// Durable is the whole word. The entry is in IndexedDB before the function returns, so killing
// the tab mid-write loses nothing: the queue is still there on next launch. An in-memory queue
// would pass every test written against a page that never closes and lose a day of event-floor
// edits the first time a phone browser is backgrounded and reaped.
//
// **Local-only mode has no outbox.** Nothing to push to, so nothing is queued and no storage is
// spent — FR-13 keeps that mode free of every trace of sync.

import { getDb, STORE_OUTBOX } from "./db";
import { getStoreContext } from "./context";

export interface OutboxEntry {
  id: string;
  workspaceId: string;
  kind: string;
  documentId: string;
  /** null = delete (tombstone). */
  document: unknown | null;
  /** The version this edit was made against; the server rejects it if stale. */
  baseVersion: number;
  userId: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface EnqueueInput {
  kind: string;
  documentId: string;
  document: unknown | null;
  baseVersion: number;
}

/**
 * Queue a mutation.
 *
 * Returns null in local mode — a caller does not need to branch on the mode, which is what keeps
 * the seven tools ignorant of sync's existence.
 */
export async function enqueue(input: EnqueueInput): Promise<OutboxEntry | null> {
  const ctx = getStoreContext();
  if (ctx.mode !== "workspace" || !ctx.workspaceId) return null;

  const db = await getDb();

  // Collapse repeated edits to the same document into one pending entry. A planner dragging a
  // session's start time produces a mutation per keystroke; pushing forty of them wastes the
  // battery of the phone that is on the event floor and tells the server nothing the last one
  // does not. Keep the earliest baseVersion — that is the version the *first* unsynced edit was
  // made against, and it is what the server must check to notice a colleague got there first.
  const pending = await db.getAllFromIndex(STORE_OUTBOX, "documentId", input.documentId);
  const existing = pending.find((e) => e.kind === input.kind && e.workspaceId === ctx.workspaceId);

  const entry: OutboxEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    workspaceId: ctx.workspaceId,
    kind: input.kind,
    documentId: input.documentId,
    document: input.document,
    baseVersion: existing?.baseVersion ?? input.baseVersion,
    userId: ctx.userId ?? "",
    queuedAt: existing?.queuedAt ?? new Date().toISOString(),
    // A coalesced edit starts its retry count over: it is new work, not the failed work.
    attempts: 0,
  };

  await db.put(STORE_OUTBOX, entry);
  return entry;
}

/**
 * Everything waiting, oldest first.
 *
 * Order matters: a document created and then edited must reach the server in that order, or the
 * edit arrives for a record that does not exist yet.
 */
export async function listPending(): Promise<OutboxEntry[]> {
  const ctx = getStoreContext();
  if (ctx.mode !== "workspace" || !ctx.workspaceId) return [];

  const db = await getDb();
  const all = await db.getAll(STORE_OUTBOX);
  return all
    .filter((e) => e.workspaceId === ctx.workspaceId)
    .sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : a.queuedAt > b.queuedAt ? 1 : 0));
}

/** Called once the server has accepted the mutation. */
export async function markSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(STORE_OUTBOX, "readwrite");
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

/**
 * Called when a push fails.
 *
 * The entry stays queued. A failed push is a network that will come back, not work to discard —
 * and discarding it is indistinguishable, from the planner's side, from the app losing their
 * edit.
 */
export async function markFailed(id: string, error: string): Promise<void> {
  const db = await getDb();
  const entry = await db.get(STORE_OUTBOX, id);
  if (!entry) return;
  await db.put(STORE_OUTBOX, { ...entry, attempts: entry.attempts + 1, lastError: error });
}

/** FR-14: a record with a pending entry is never evicted from the local cache. */
export async function hasPendingWrites(documentId: string): Promise<boolean> {
  const ctx = getStoreContext();
  if (ctx.mode !== "workspace") return false;
  const db = await getDb();
  const pending = await db.getAllFromIndex(STORE_OUTBOX, "documentId", documentId);
  return pending.some((e) => e.workspaceId === ctx.workspaceId);
}

export async function pendingCount(): Promise<number> {
  return (await listPending()).length;
}

/** Sign-out and workspace-removal cleanup. */
export async function clearOutbox(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_OUTBOX);
}
