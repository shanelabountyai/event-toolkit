/**
 * Logistics pack repository (PRD 3) — mirrors `briefRepository`'s shape.
 *
 * `migrateLogisticsPack()` runs on EVERY read (FR-15), same discipline as `migrateBrief()`.
 */

import { nowIso } from "@event-toolkit/schema";
import {
  createLogisticsPackFromBrief,
  migrateLogisticsPack,
  type LogisticsPack,
} from "@event-toolkit/logistics";
import type { EventBrief } from "@event-toolkit/schema";
import { getDb, STORE_LOGISTICS_PACKS } from "./db";

export async function getPack(id: string): Promise<LogisticsPack | null> {
  const db = await getDb();
  const raw = await db.get(STORE_LOGISTICS_PACKS, id);
  return raw ? migrateLogisticsPack(raw) : null;
}

export async function getPackByBriefId(briefId: string): Promise<LogisticsPack | null> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_LOGISTICS_PACKS, "eventBriefId", briefId);
  if (rows.length === 0) return null;
  // Oldest wins if a duplicate ever slipped in, so the planner keeps working in the pack
  // they have been filling rather than silently switching to an empty newer one.
  const oldest = [...rows].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
  return migrateLogisticsPack(oldest);
}

export async function listPacks(): Promise<LogisticsPack[]> {
  const db = await getDb();
  const rows = await db.getAll(STORE_LOGISTICS_PACKS);
  return rows
    .map((row) => {
      try {
        return migrateLogisticsPack(row);
      } catch {
        return null;
      }
    })
    .filter((p): p is LogisticsPack => p !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Persist a pack, bumping its revision counter and `updatedAt` (FR-12). */
export async function savePack(pack: LogisticsPack): Promise<LogisticsPack> {
  const next: LogisticsPack = { ...pack, version: pack.version + 1, updatedAt: nowIso() };
  const db = await getDb();
  await db.put(STORE_LOGISTICS_PACKS, next);
  return next;
}

export async function deletePack(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_LOGISTICS_PACKS, id);
}

/**
 * FR-1 — the entry point behind the brief view's "Logistics Pack" link. Returns the existing
 * pack for a brief, or seeds and stores a new one from that brief.
 */
export async function findOrCreatePackForBrief(brief: EventBrief): Promise<LogisticsPack> {
  const existing = await getPackByBriefId(brief.id);
  if (existing) return existing;
  const created = createLogisticsPackFromBrief(brief);
  const db = await getDb();
  await db.put(STORE_LOGISTICS_PACKS, created);
  return created;
}

/** Remove every pack attached to a brief. Called when the brief itself is deleted. */
export async function deletePacksForBrief(briefId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_LOGISTICS_PACKS, "eventBriefId", briefId);
  const tx = db.transaction(STORE_LOGISTICS_PACKS, "readwrite");
  for (const row of rows) await tx.store.delete(row.id);
  await tx.done;
}
