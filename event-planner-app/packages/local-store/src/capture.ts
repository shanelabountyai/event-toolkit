// packages/local-store/src/capture.ts
//
// PRD 9 FR-2 — turning a local write into a queued mutation.
//
// Every repository in this package writes through `db.put` / `db.delete`, and the guarded proxy in
// `db.ts` already sees all of them. So the outbox is filled from that one place, exactly as the
// permission check is. The alternative — remembering to enqueue in sixty repository functions —
// loses a write the first time somebody adds a sixty-first, and a lost write here is a planner's
// edit silently never reaching their colleague.

import { explodePack } from "@event-toolkit/sync-engine";
import { getStoreContext } from "./context";
import { setWriteInterceptor } from "./db";
import { enqueue } from "./outbox";

/**
 * Stores whose writes are never queued.
 *
 * The outbox itself, obviously — queueing the queue is an infinite loop. The other two are
 * per-device state that means nothing to anyone else in the workspace.
 */
export const NOT_SYNCED = new Set(["outbox", "syncState", "conflicts", "usageEvents", "intakeProgress"]);

/**
 * Applying records that came *from* the server must not queue them straight back to it.
 *
 * A module-level flag rather than a parameter threaded through every repository, because the
 * repositories do not know sync exists and this file exists to keep it that way.
 */
let applyingRemote = false;

export function isApplyingRemote(): boolean {
  return applyingRemote;
}

/** Run `fn` with capture suppressed. Always restores, including when `fn` throws. */
export async function withRemoteApply<T>(fn: () => Promise<T>): Promise<T> {
  const previous = applyingRemote;
  applyingRemote = true;
  try {
    return await fn();
  } finally {
    applyingRemote = previous;
  }
}

export interface CapturedMutation {
  kind: string;
  documentId: string;
  document: unknown | null;
  baseVersion: number;
}

/**
 * What a write to `store` should queue, if anything.
 *
 * A logistics pack becomes one mutation per item plus its scalars, because PRD 9 syncs it at
 * sub-document granularity — that is the whole reason two people can work one pack on event day
 * without conflicting over parts they never touched. Every other store is one document, one
 * mutation.
 */
export function captureWrite(store: string, value: unknown): CapturedMutation[] {
  if (shouldSkip(store)) return [];
  if (value === null || typeof value !== "object") return [];

  if (store === "logisticsPacks") {
    const pack = value as { version?: number };
    return explodePack(value as never).map((record) => ({
      kind: record.kind,
      documentId: record.documentId,
      document: record.document,
      // Item records have no version of their own; the pack's is the base they were edited
      // against, which is what the server compares.
      baseVersion: pack.version ?? 1,
    }));
  }

  const document = value as Record<string, unknown>;
  const documentId = document.id ?? document.eventBriefId ?? document.briefId;
  if (typeof documentId !== "string") return [];

  return [
    {
      kind: store,
      documentId,
      document,
      baseVersion: typeof document.version === "number" ? document.version : 1,
    },
  ];
}

/** A deletion is a mutation with a null document — the tombstone the server records. */
export function captureDelete(store: string, key: unknown): CapturedMutation[] {
  if (shouldSkip(store)) return [];
  if (typeof key !== "string") return [];

  // A deleted pack cannot be exploded — it is gone. The scalar tombstone is what propagates, and
  // the server cascades nothing, so item records are tidied by the pack's own delete path.
  return [{ kind: store === "logisticsPacks" ? "logisticsPack" : store, documentId: key, document: null, baseVersion: 1 }];
}

function shouldSkip(store: string): boolean {
  return applyingRemote || NOT_SYNCED.has(store) || getStoreContext().mode !== "workspace";
}


/**
 * Register the interceptor. Importing this module is what turns capture on, and `index.ts` does.
 *
 * The mutation is queued only once the local write has resolved. Queueing first would push an
 * edit to colleagues that this device then failed to make.
 */
setWriteInterceptor((store, method, arg, result) => {
  const captured = method === "delete" ? captureDelete(store, arg) : captureWrite(store, arg);
  if (captured.length === 0) return result;

  return Promise.resolve(result).then(async (value) => {
    for (const mutation of captured) await enqueue(mutation);
    return value;
  });
});
