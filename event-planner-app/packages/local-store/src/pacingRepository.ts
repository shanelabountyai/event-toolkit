/**
 * Registration pacing repository (PRD 2).
 *
 * Aggregate counts only — a date and a cumulative registration number. There is deliberately
 * no per-registrant record here (handoff §9 non-goal); that belongs to PRD 5.
 */

import {
  newId,
  nowIso,
  parsePacingCsv,
  type CsvRowError,
  type PacingConfig,
  type PacingEntry,
} from "@event-toolkit/schema";
import {
  getDb,
  STORE_PACING_CONFIGS,
  STORE_PACING_ENTRIES,
} from "./db";

/** All entries for one brief, oldest first. */
export async function listEntries(briefId: string): Promise<PacingEntry[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_PACING_ENTRIES, "eventBriefId", briefId);
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Add or replace the entry for a date.
 *
 * Cumulative counts are one-per-date by definition, so re-entering a date corrects it rather
 * than stacking a second point on the same day and making the curve zig-zag.
 */
export async function addEntry(input: {
  eventBriefId: string;
  date: string;
  cumulativeRegistrations: number;
  source?: PacingEntry["source"];
}): Promise<PacingEntry> {
  const existing = await listEntries(input.eventBriefId);
  const sameDate = existing.find((e) => e.date === input.date);

  const entry: PacingEntry = {
    id: sameDate?.id ?? newId(),
    eventBriefId: input.eventBriefId,
    date: input.date,
    cumulativeRegistrations: input.cumulativeRegistrations,
    source: input.source ?? "manual",
    enteredAt: nowIso(),
  };

  const db = await getDb();
  await db.put(STORE_PACING_ENTRIES, entry);
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_PACING_ENTRIES, id);
}

export interface ImportCsvResult {
  imported: PacingEntry[];
  errors: CsvRowError[];
}

/**
 * Import a `date,count` CSV.
 *
 * Partial success by design: every valid row lands, and every rejected row comes back with
 * its line number and reason so the planner can fix the file rather than guess.
 */
export async function importCsv(briefId: string, csvText: string): Promise<ImportCsvResult> {
  const { rows, errors } = parsePacingCsv(csvText);
  const imported: PacingEntry[] = [];
  for (const row of rows) {
    imported.push(
      await addEntry({
        eventBriefId: briefId,
        date: row.date,
        cumulativeRegistrations: row.cumulativeRegistrations,
        source: "csv",
      }),
    );
  }
  return { imported, errors };
}

export const DEFAULT_PACING_CONFIG = (briefId: string): PacingConfig => ({
  eventBriefId: briefId,
  curveStyle: "backloaded_standard",
});

/** Stored config for a brief, or the documented default when the planner hasn't changed it. */
export async function getConfig(briefId: string): Promise<PacingConfig> {
  const db = await getDb();
  const row = await db.get(STORE_PACING_CONFIGS, briefId);
  return row ?? DEFAULT_PACING_CONFIG(briefId);
}

export async function saveConfig(config: PacingConfig): Promise<PacingConfig> {
  const db = await getDb();
  await db.put(STORE_PACING_CONFIGS, config);
  return config;
}

/** Remove every pacing record for a brief. Called when the brief itself is deleted. */
export async function deletePacingData(briefId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_PACING_ENTRIES, "eventBriefId", briefId);
  const tx = db.transaction([STORE_PACING_ENTRIES, STORE_PACING_CONFIGS], "readwrite");
  const entries = tx.objectStore(STORE_PACING_ENTRIES);
  for (const row of rows) await entries.delete(row.id);
  await tx.objectStore(STORE_PACING_CONFIGS).delete(briefId);
  await tx.done;
}
