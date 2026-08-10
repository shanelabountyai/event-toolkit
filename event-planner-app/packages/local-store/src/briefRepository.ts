/**
 * Brief repository — the stable persistence interface every tool in the suite calls.
 *
 * Swap this implementation (e.g. for a REST-backed one) and nothing in `apps/web` changes.
 * `migrateBrief()` runs on EVERY read so older documents are upgraded lazily (FR-9).
 */

import {
  migrateBrief,
  touchBrief,
  type EventBrief,
  type EventType,
  type LessonLearned,
} from "@event-toolkit/schema";
import {
  getDb,
  STORE_BRIEFS,
  STORE_INTAKE_PROGRESS,
  STORE_PACING_CONFIGS,
  STORE_PACING_ENTRIES,
  STORE_PROMO_ASSET_SETS,
  type IntakeProgress,
} from "./db";

/** Load one brief by id, migrated to the current schema version. Returns null if absent. */
export async function getBrief(id: string): Promise<EventBrief | null> {
  const db = await getDb();
  const raw = await db.get(STORE_BRIEFS, id);
  if (!raw) return null;
  return migrateBrief(raw);
}

/** All locally stored briefs, migrated, most-recently-updated first (FR-7). */
export async function listBriefs(): Promise<EventBrief[]> {
  const db = await getDb();
  const rows = await db.getAll(STORE_BRIEFS);
  return rows
    .map((row) => {
      try {
        return migrateBrief(row);
      } catch {
        return null;
      }
    })
    .filter((b): b is EventBrief => b !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/**
 * Persist a brief, bumping its revision counter and `updatedAt` (schema doc: `version`
 * increments on every save). Returns the stored document so callers can keep state in sync.
 */
export async function saveBrief(brief: EventBrief): Promise<EventBrief> {
  const next = touchBrief(brief);
  const db = await getDb();
  await db.put(STORE_BRIEFS, next);
  return next;
}

/** Persist without bumping `version` — used by internal housekeeping (e.g. migration re-saves). */
export async function saveBriefRaw(brief: EventBrief): Promise<EventBrief> {
  const db = await getDb();
  await db.put(STORE_BRIEFS, brief);
  return brief;
}

/**
 * Delete a brief and everything keyed to it — intake progress, and the downstream tools'
 * records. Every tool that stores per-brief data cleans up here rather than leaving orphans
 * behind in its own store.
 */
export async function deleteBrief(id: string): Promise<void> {
  const db = await getDb();
  const pacingRows = await db.getAllFromIndex(STORE_PACING_ENTRIES, "eventBriefId", id);
  const tx = db.transaction(
    [
      STORE_BRIEFS,
      STORE_INTAKE_PROGRESS,
      STORE_PROMO_ASSET_SETS,
      STORE_PACING_ENTRIES,
      STORE_PACING_CONFIGS,
    ],
    "readwrite",
  );
  await tx.objectStore(STORE_BRIEFS).delete(id);
  await tx.objectStore(STORE_INTAKE_PROGRESS).delete(id);
  await tx.objectStore(STORE_PROMO_ASSET_SETS).delete(id);
  const pacing = tx.objectStore(STORE_PACING_ENTRIES);
  for (const row of pacingRows) await pacing.delete(row.id);
  await tx.objectStore(STORE_PACING_CONFIGS).delete(id);
  await tx.done;
}

export interface LessonSuggestion extends LessonLearned {
  /** The brief the lesson came from, for display ("from: Q3 Webinar"). */
  sourceBriefId: string;
  sourceBriefName: string;
  sourceBriefType: EventType;
  /** True when the source brief's type matched the requested type exactly. */
  exactTypeMatch: boolean;
}

/**
 * FR-11 — every `carryForwardLessons` entry across every locally stored brief, filtered to
 * an exact `type` match. Per PRD §12 Q3 the fallback when fewer than 3 exact matches exist
 * is "the most recent 3 lessons regardless of type" (no fuzzy/semantic matching in v1).
 *
 * @param type      Event type of the brief being created.
 * @param excludeBriefId Brief currently being edited (its own lessons are not suggestions).
 */
export async function queryLessons(
  type?: EventType,
  excludeBriefId?: string,
): Promise<LessonSuggestion[]> {
  const briefs = await listBriefs();
  const all: LessonSuggestion[] = [];

  for (const brief of briefs) {
    if (excludeBriefId && brief.id === excludeBriefId) continue;
    for (const lesson of brief.carryForwardLessons ?? []) {
      all.push({
        ...lesson,
        sourceBriefId: brief.id,
        sourceBriefName: brief.name || "Untitled brief",
        sourceBriefType: brief.type,
        exactTypeMatch: type ? brief.type === type : false,
      });
    }
  }

  const byRecency = (a: LessonSuggestion, b: LessonSuggestion) =>
    a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0;

  if (!type) return all.sort(byRecency);

  const exact = all.filter((l) => l.exactTypeMatch).sort(byRecency);
  if (exact.length >= 3) return exact;

  // Fallback: top up with the most recent lessons of any type, keeping exact matches first.
  const seen = new Set(exact.map((l) => l.id));
  const fallback = all
    .filter((l) => !seen.has(l.id))
    .sort(byRecency)
    .slice(0, Math.max(0, 3 - exact.length));

  return [...exact, ...fallback];
}

/* -------------------------------------------------------------------------- */
/* Intake wizard progress (FR-6: resume mid-intake after a tab close)          */
/* -------------------------------------------------------------------------- */

export async function getIntakeProgress(briefId: string): Promise<IntakeProgress | null> {
  const db = await getDb();
  const row = await db.get(STORE_INTAKE_PROGRESS, briefId);
  return row ?? null;
}

export async function saveIntakeProgress(progress: IntakeProgress): Promise<void> {
  const db = await getDb();
  await db.put(STORE_INTAKE_PROGRESS, progress);
}

export async function deleteIntakeProgress(briefId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_INTAKE_PROGRESS, briefId);
}

export type { IntakeProgress };
