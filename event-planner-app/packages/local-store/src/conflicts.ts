// packages/local-store/src/conflicts.ts
//
// PRD 9 FR-9 — conflicts, kept until somebody decides.
//
// The product's standing refusal applies here as it does in PRD 2's regeneration, PRD 5's dedupe
// and PRD 7's write-back: **ambiguity is surfaced, never auto-resolved.** When two people edit the
// same thing, the software does not know which one was right, and picking silently is how an
// afternoon's work disappears with nobody aware it happened.

import { getStoreContext } from "./context";
import { getDb, STORE_CONFLICTS, type StoredConflict } from "./db";
import { enqueue } from "./outbox";
import { withRemoteApply } from "./capture";

export interface IncomingConflict {
  kind: string;
  documentId: string;
  resolution: "conflict" | "server_wins";
  mine: unknown;
  theirs: unknown;
  theirVersion: number;
  theirUpdatedAt: string;
}

export async function recordConflicts(conflicts: IncomingConflict[]): Promise<void> {
  const { workspaceId } = getStoreContext();
  if (!workspaceId || conflicts.length === 0) return;

  const db = await getDb();
  for (const conflict of conflicts) {
    // Keyed by document, so a repeatedly retried edit produces one open question rather than a
    // growing pile of identical ones.
    await db.put(STORE_CONFLICTS, {
      id: `${conflict.kind}:${conflict.documentId}`,
      workspaceId,
      detectedAt: new Date().toISOString(),
      ...conflict,
    });
  }
}

export async function listConflicts(): Promise<StoredConflict[]> {
  const { workspaceId, mode } = getStoreContext();
  if (mode !== "workspace" || !workspaceId) return [];
  const db = await getDb();
  return db.getAllFromIndex(STORE_CONFLICTS, "workspaceId", workspaceId);
}

export async function conflictCount(): Promise<number> {
  return (await listConflicts()).length;
}

/**
 * Keep the server's version.
 *
 * Applied through `withRemoteApply` so it is not queued back as a fresh edit — this is accepting
 * somebody else's work, not making a new change.
 */
export async function keepTheirs(id: string): Promise<void> {
  const db = await getDb();
  const conflict = await db.get(STORE_CONFLICTS, id);
  if (!conflict) return;

  await withRemoteApply(async () => {
    if (conflict.theirs === null || conflict.resolution === "server_wins") {
      // server_wins means the record was deleted. Accepting that means deleting it here too.
      await db.delete(conflict.kind as never, conflict.documentId as never);
    } else {
      await db.put(conflict.kind as never, conflict.theirs as never);
    }
  });

  await db.delete(STORE_CONFLICTS, id);
}

/**
 * Keep this device's version and overwrite the server's.
 *
 * Re-queued against the server's *current* version, which is what makes the next push succeed
 * rather than conflicting again with the same stale base. The other person's edit is genuinely
 * overwritten — that is the choice being made, and the UI says so.
 */
export async function keepMine(id: string): Promise<void> {
  const db = await getDb();
  const conflict = await db.get(STORE_CONFLICTS, id);
  if (!conflict) return;

  if (conflict.resolution !== "server_wins") {
    await enqueue({
      kind: conflict.kind,
      documentId: conflict.documentId,
      document: conflict.mine,
      baseVersion: conflict.theirVersion,
    });
  }

  await db.delete(STORE_CONFLICTS, id);
}

export async function dismissConflict(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_CONFLICTS, id);
}
