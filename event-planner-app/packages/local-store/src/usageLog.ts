/**
 * FR-13 — local, append-only usage event log plus CSV export.
 *
 * This is the only instrumentation mechanism in v1 (no analytics backend). The CSV feeds
 * the three PRD §10 success metrics: time-from-create-to-complete, % of downstream tools
 * launched from a brief, and completeness-at-completion.
 */

import { newId, nowIso } from "@event-toolkit/schema";
import { getDb, STORE_USAGE_EVENTS, type UsageEvent, type UsageEventType } from "./db";

export interface LogEventInput {
  type: UsageEventType;
  briefId?: string;
  briefName?: string;
  details?: Record<string, string | number | null>;
}

/** Append one event. Never throws into the UI — logging must not break a user action. */
export async function logUsageEvent(input: LogEventInput): Promise<UsageEvent | null> {
  const event: UsageEvent = {
    id: newId(),
    timestamp: nowIso(),
    type: input.type,
    ...(input.briefId ? { briefId: input.briefId } : {}),
    ...(input.briefName ? { briefName: input.briefName } : {}),
    ...(input.details ? { details: input.details } : {}),
  };
  try {
    const db = await getDb();
    await db.put(STORE_USAGE_EVENTS, event);
    return event;
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[usage-log] failed to record event", input.type, err);
    }
    return null;
  }
}

/** All logged events, oldest first. */
export async function listUsageEvents(): Promise<UsageEvent[]> {
  const db = await getDb();
  const rows = await db.getAll(STORE_USAGE_EVENTS);
  return rows.sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );
}

export async function clearUsageEvents(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_USAGE_EVENTS);
}

const CSV_COLUMNS = [
  "id",
  "timestamp",
  "eventType",
  "briefId",
  "briefName",
  "detail1Key",
  "detail1Value",
  "detail2Key",
  "detail2Value",
  "details",
] as const;

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Render usage events as a CSV document — one row per action (FR-13). */
export function usageEventsToCsv(events: UsageEvent[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const e of events) {
    const detailEntries = Object.entries(e.details ?? {});
    const [k1, v1] = detailEntries[0] ?? ["", ""];
    const [k2, v2] = detailEntries[1] ?? ["", ""];
    lines.push(
      [
        csvEscape(e.id),
        csvEscape(e.timestamp),
        csvEscape(e.type),
        csvEscape(e.briefId ?? ""),
        csvEscape(e.briefName ?? ""),
        csvEscape(k1),
        csvEscape(v1 as string | number | null),
        csvEscape(k2),
        csvEscape(v2 as string | number | null),
        csvEscape(detailEntries.length > 0 ? JSON.stringify(e.details) : ""),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

/** Convenience: read every event and render the CSV in one call. */
export async function exportUsageLogCsv(): Promise<string> {
  return usageEventsToCsv(await listUsageEvents());
}

export type { UsageEvent, UsageEventType };
