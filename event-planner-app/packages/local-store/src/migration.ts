// packages/local-store/src/migration.ts
//
// PRD 8 FR-9 — moving a planner's existing local data into a workspace.
//
// The reading half. It produces exactly what would be uploaded and a preview of it, and uploads
// nothing: FR-9 requires the planner sees what moves before it moves, and that the local copy is
// retained until they dismiss it. Somebody with two years of events in a browser is entitled to
// know what a button labelled "move my data" is about to do.
//
// **Idempotent by construction.** Every record keeps the id it already has, and the server's
// unique index on (workspaceId, kind, documentId) turns a second run into an upsert onto the same
// rows rather than a second copy of everything. Running it twice is a no-op, not a duplicate — a
// property that matters because the failure mode of a migration is a half-finished one that
// somebody retries.

import { explodePack, SYNC_KINDS, type ExplodedRecord } from "@event-toolkit/sync-engine";
import { getStoreContext, setStoreContext, type StoreContext } from "./context";
import {
  getDb,
  resetDbConnection,
  STORE_BRIEFS,
  STORE_LOGISTICS_PACKS,
} from "./db";

/**
 * Stores that are deliberately *not* migrated.
 *
 * Both are about this device rather than about the event: where the intake wizard was left off in
 * this browser, and this browser's own usage diagnostics. Uploading them would put one device's
 * scroll position into a shared workspace and mean nothing to anybody else in it.
 */
export const DEVICE_LOCAL_STORES = ["intakeProgress", "usageEvents", "outbox"];

export interface MigrationPreview {
  /** Per-kind counts, for the "here is what moves" table. */
  counts: { kind: string; count: number }[];
  total: number;
  /** Event names, so the banner can say "3 events saved in this browser" and name them. */
  events: { id: string; name: string }[];
}

export interface CollectedData {
  records: ExplodedRecord[];
  preview: MigrationPreview;
}

/**
 * Read the whole local database into sync records.
 *
 * Forces local mode for the duration, whatever the caller had set. The migration reads the
 * *unnamespaced* database — the one built up before any account existed — and reading it through
 * a workspace context would quietly collect the wrong data, or nothing at all, which is the kind
 * of bug that only shows up as "the migration said zero events".
 */
export async function collectLocalRecords(): Promise<CollectedData> {
  const previous: StoreContext = getStoreContext();
  setStoreContext({ mode: "local" });
  resetDbConnection();

  try {
    const db = await getDb();
    const records: ExplodedRecord[] = [];

    for (const name of db.objectStoreNames) {
      if (DEVICE_LOCAL_STORES.includes(name)) continue;

      const rows = await db.getAll(name as never);
      if (rows.length === 0) continue;

      if (name === STORE_LOGISTICS_PACKS) {
        // The one store that does not map one-to-one: a pack becomes its scalars plus one record
        // per item, so it syncs at the granularity PRD 9 needs.
        for (const pack of rows) records.push(...explodePack(pack as never));
        continue;
      }

      // The key path the store was created with, rather than a second hard-coded list of which
      // store keys on what. Two lists disagree eventually; this one cannot.
      const keyPath = db.transaction(name as never).store.keyPath;
      const key = Array.isArray(keyPath) ? keyPath[0] : (keyPath as string);

      for (const row of rows) {
        const documentId = (row as Record<string, unknown>)[key];
        if (typeof documentId !== "string") continue;
        records.push({ kind: name, documentId, document: row });
      }
    }

    const briefs = (await db.getAll(STORE_BRIEFS)) as { id: string; name: string }[];

    const counts = new Map<string, number>();
    for (const record of records) counts.set(record.kind, (counts.get(record.kind) ?? 0) + 1);

    return {
      records,
      preview: {
        counts: [...counts].map(([kind, count]) => ({ kind, count })).sort((a, b) => a.kind.localeCompare(b.kind)),
        total: records.length,
        events: briefs.map((b) => ({ id: b.id, name: b.name })),
      },
    };
  } finally {
    setStoreContext(previous);
    resetDbConnection();
  }
}

/**
 * Records this build has no sync kind for.
 *
 * Should always be empty. If it is not, a store exists that the migration would upload under a
 * kind the server, the PII registry and the conflict classifier all know nothing about — so the
 * migration refuses rather than uploading data that is then invisible to every privacy operation.
 */
export function unknownKinds(records: ExplodedRecord[]): string[] {
  const known = new Set(SYNC_KINDS.map((k) => k.kind));
  return [...new Set(records.map((r) => r.kind))].filter((k) => !known.has(k));
}
