// apps/web/lib/sync-client.ts
//
// PRD 9 FR-1 to FR-6 — the loop that keeps a device up to date.
//
// Reads and writes never wait on it. Every tool goes on talking to IndexedDB exactly as it did
// before there was a server, and this drains the queue in the background. FR-1 puts it plainly:
// no tool gains a spinner it did not have.

import {
  applyRemoteRecords,
  getSyncState,
  listPending,
  markFailed,
  markSynced,
  recordConflicts,
  saveSyncState,
  type OutboxEntry,
  type RemoteRecord,
} from "@event-toolkit/local-store";

export interface Conflict {
  kind: string;
  documentId: string;
  resolution: "conflict" | "server_wins";
  server: { document: unknown; version: number; updatedAt: string; updatedBy: string | null };
}

export interface SyncOutcome {
  pushed: number;
  pulled: number;
  conflicts: Conflict[];
  rejected: { kind: string; documentId: string; reason: string }[];
  error?: string;
}

const PUSH_BATCH = 500;

/**
 * Push first, then pull.
 *
 * That order matters: pushing first means the pull that follows already contains this device's
 * own writes as the server accepted them, so local state converges in one pass instead of showing
 * a stale value until the next tick.
 */
export async function syncOnce(workspaceId: string): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { pushed: 0, pulled: 0, conflicts: [], rejected: [] };

  try {
    const pending = await listPending();

    for (let i = 0; i < pending.length; i += PUSH_BATCH) {
      const batch = pending.slice(i, i + PUSH_BATCH);
      const response = await fetch("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, mutations: batch }),
      });

      if (!response.ok) {
        // The entries stay queued. A failed push is a network that will come back, not work to
        // discard — and discarding it is indistinguishable, from the planner's side, from the app
        // losing their edit.
        const message = await errorFrom(response);
        for (const entry of batch) await markFailed(entry.id, message);
        return { ...outcome, error: message };
      }

      const result = (await response.json()) as {
        applied: { kind: string; documentId: string }[];
        conflicts: Conflict[];
        rejected: { kind: string; documentId: string; reason: string }[];
      };

      const settled = new Set(
        [...result.applied, ...result.conflicts, ...result.rejected].map(
          (r) => `${r.kind}:${r.documentId}`,
        ),
      );
      // Conflicted and rejected entries leave the queue too. Leaving them would retry forever
      // against a server that has already said no, and the conflict is now the user's to resolve.
      await markSynced(batch.filter((e) => settled.has(`${e.kind}:${e.documentId}`)).map((e) => e.id));

      outcome.pushed += result.applied.length;
      outcome.conflicts.push(...result.conflicts);
      outcome.rejected.push(...result.rejected);

      // Written to IndexedDB, not just returned. A planner who closes the tab must not lose the
      // knowledge that one of their edits never saved.
      await recordConflicts(
        result.conflicts.map((c) => ({
          kind: c.kind,
          documentId: c.documentId,
          resolution: c.resolution,
          mine: batch.find((e) => e.kind === c.kind && e.documentId === c.documentId)?.document ?? null,
          theirs: c.server.document,
          theirVersion: c.server.version,
          theirUpdatedAt: c.server.updatedAt,
        })),
      );
    }

    if (outcome.pushed > 0) await saveSyncState({ lastPushedAt: new Date().toISOString() });

    // Pull, following the cursor until the server says there is no more.
    let cursor = (await getSyncState())?.cursor ?? "0";
    for (let page = 0; page < 50; page += 1) {
      const response = await fetch(
        `/api/sync/pull?workspaceId=${encodeURIComponent(workspaceId)}&since=${encodeURIComponent(cursor)}`,
      );
      if (!response.ok) return { ...outcome, error: await errorFrom(response) };

      const { records, cursor: next, hasMore } = (await response.json()) as {
        records: RemoteRecord[];
        cursor: string;
        hasMore: boolean;
      };

      const applied = await applyRemoteRecords(records);
      outcome.pulled += applied.applied + applied.deleted;
      cursor = next;
      // Saved per page, so an interrupted pull resumes where it stopped rather than starting over.
      await saveSyncState({ cursor, lastPulledAt: new Date().toISOString() });
      if (!hasMore) break;
    }

    return outcome;
  } catch (error) {
    // Offline is the expected case, not an exception. FR-1: the tools keep working either way.
    return { ...outcome, error: error instanceof Error ? error.message : "Sync failed" };
  }
}

async function errorFrom(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed (${response.status})`;
}

export type { OutboxEntry };
