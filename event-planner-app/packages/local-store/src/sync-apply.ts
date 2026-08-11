// packages/local-store/src/sync-apply.ts
//
// PRD 9 FR-3 — writing records pulled from the server into local storage.
//
// Everything here runs inside `withRemoteApply`, so nothing it writes is queued straight back to
// the server. Without that, every pull would push itself and sync would never settle.
//
// The interesting case is the logistics pack. It is stored locally as one document and synced as
// many, so a pull carrying three changed checklist items has to be *merged into* the pack that is
// already here — not used to rebuild it, because a delta does not contain the parts that did not
// change.

import { PACK_ITEM_KINDS, type PackItemKind } from "@event-toolkit/sync-engine";
import { withRemoteApply } from "./capture";
import { getDb, STORE_LOGISTICS_PACKS, STORE_SYNC_STATE, type SyncState } from "./db";
import { getStoreContext } from "./context";

export interface RemoteRecord {
  kind: string;
  documentId: string;
  document: unknown;
  version: number;
  deletedAt: string | null;
}

export interface ApplyResult {
  applied: number;
  deleted: number;
  /** Kinds this build has no local store for — reported rather than silently dropped. */
  unknown: string[];
}

/**
 * Apply a batch of server records locally.
 *
 * A record the caller's role may not hold never arrives here — `pullRecords` filters on the
 * server, so it is never in the payload, never in IndexedDB, and never in a backup of it.
 */
export async function applyRemoteRecords(records: RemoteRecord[]): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, deleted: 0, unknown: [] };
  if (records.length === 0) return result;

  return withRemoteApply(async () => {
    const db = await getDb();
    const packItems: RemoteRecord[] = [];
    const packScalars: RemoteRecord[] = [];

    for (const record of records) {
      if (record.kind === "logisticsPack") {
        packScalars.push(record);
        continue;
      }
      if (record.kind in PACK_ITEM_KINDS) {
        packItems.push(record);
        continue;
      }

      if (!db.objectStoreNames.contains(record.kind as never)) {
        if (!result.unknown.includes(record.kind)) result.unknown.push(record.kind);
        continue;
      }

      if (record.deletedAt) {
        await db.delete(record.kind as never, record.documentId as never);
        result.deleted += 1;
      } else {
        await db.put(record.kind as never, record.document as never);
        result.applied += 1;
      }
    }

    // Packs last, so scalars and items in the same batch land together.
    for (const scalar of packScalars) {
      if (scalar.deletedAt) {
        await db.delete(STORE_LOGISTICS_PACKS, scalar.documentId);
        result.deleted += 1;
        continue;
      }
      const existing = await db.get(STORE_LOGISTICS_PACKS, scalar.documentId);
      await db.put(STORE_LOGISTICS_PACKS, {
        // Existing arrays are kept: a scalar record carries the pack's identity and version, not
        // its contents, and overwriting with empty arrays would delete the whole run of show.
        sessions: [],
        staffAssignments: [],
        shippingItems: [],
        venueChecklist: [],
        contacts: [],
        issueLog: [],
        ...existing,
        ...(scalar.document as object),
      } as never);
      result.applied += 1;
    }

    for (const item of packItems) {
      const packId = (item.document as { packId?: string })?.packId;
      if (!packId) continue;

      const pack = await db.get(STORE_LOGISTICS_PACKS, packId);
      if (!pack) continue; // Its scalar record has not arrived yet; a later pull brings both.

      const field = PACK_ITEM_KINDS[item.kind as PackItemKind];
      const list = [...(((pack as unknown) as Record<string, unknown>)[field] as { id: string }[])];
      const index = list.findIndex((entry) => entry.id === item.documentId);

      if (item.deletedAt) {
        if (index >= 0) {
          list.splice(index, 1);
          result.deleted += 1;
        }
      } else {
        const { packId: _drop, ...document } = item.document as Record<string, unknown>;
        if (index >= 0) list[index] = document as { id: string };
        else list.push(document as { id: string });
        result.applied += 1;
      }

      await db.put(STORE_LOGISTICS_PACKS, { ...(pack as object), [field]: list } as never);
    }

    return result;
  });
}

/* -------------------------------------------------------------------------- */
/* The cursor                                                                  */
/* -------------------------------------------------------------------------- */

export async function getSyncState(): Promise<SyncState | null> {
  const { workspaceId } = getStoreContext();
  if (!workspaceId) return null;
  const db = await getDb();
  return (await db.get(STORE_SYNC_STATE, workspaceId)) ?? null;
}

export async function saveSyncState(patch: Partial<SyncState>): Promise<void> {
  const { workspaceId } = getStoreContext();
  if (!workspaceId) return;
  const db = await getDb();
  const existing = await db.get(STORE_SYNC_STATE, workspaceId);
  await db.put(STORE_SYNC_STATE, {
    workspaceId,
    cursor: "0",
    lastPulledAt: null,
    lastPushedAt: null,
    ...existing,
    ...patch,
  });
}

/** Sign-out and workspace-switch cleanup. */
export async function clearSyncState(): Promise<void> {
  const { workspaceId } = getStoreContext();
  if (!workspaceId) return;
  const db = await getDb();
  await db.delete(STORE_SYNC_STATE, workspaceId);
}
