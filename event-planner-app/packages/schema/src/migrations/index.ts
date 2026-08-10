/**
 * Schema migrations (FR-9).
 *
 * `local-store` runs `migrateBrief()` on EVERY read (`getBrief`, `listBriefs`), so when the
 * schema later moves to 1.1.0+ / 2.0.0 there is already a real hook to add migration steps
 * into without touching a single call site in `apps/web`.
 *
 * At v1 this is a defensive passthrough: it stamps a missing `schemaVersion`, back-fills
 * collections that a hand-authored or older document may omit, and normalises row `id`s.
 * It never throws on unknown fields — per the versioning policy, readers must tolerate
 * fields they do not recognise.
 */

import { CURRENT_SCHEMA_VERSION } from "../event-brief";
import type { EventBrief } from "../event-brief";
import { newId, nowIso } from "../ids";

/** A single ordered migration step, applied when `from` matches the document's version. */
export interface MigrationStep {
  from: string;
  to: string;
  apply: (brief: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Ordered migration chain. Empty at 1.0.0 — add steps here (e.g. `migrate_1_0_to_1_1`) as
 * the schema evolves; `migrateBrief` walks the chain in order.
 */
export const MIGRATIONS: MigrationStep[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Ensure every row in a list-of-objects has a stable id. */
function withIds<T extends { id?: string }>(rows: T[]): T[] {
  return rows.map((row) =>
    isRecord(row) && typeof row.id === "string" && row.id.length > 0
      ? row
      : ({ ...(row as object), id: newId() } as T),
  );
}

/**
 * Bring any stored/imported brief document up to `CURRENT_SCHEMA_VERSION`.
 * Throws only if the input is not an object at all.
 */
export function migrateBrief(input: unknown): EventBrief {
  if (!isRecord(input)) {
    throw new Error("migrateBrief: expected a brief object");
  }

  let doc: Record<string, unknown> = { ...input };
  let version = asString(doc.schemaVersion, "1.0.0");

  for (const step of MIGRATIONS) {
    if (step.from === version) {
      doc = step.apply(doc);
      version = step.to;
    }
  }

  const goals = isRecord(doc.goals) ? doc.goals : {};
  const audience = isRecord(doc.audience) ? doc.audience : {};
  const budget = isRecord(doc.budget) ? doc.budget : {};
  const dates = isRecord(doc.dates) ? doc.dates : {};
  const format = isRecord(doc.format) ? doc.format : {};
  const timeline = isRecord(doc.timeline) ? doc.timeline : {};
  const constraints = isRecord(doc.constraints) ? doc.constraints : {};
  const now = nowIso();

  const migrated: EventBrief = {
    ...(doc as object),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: asString(doc.id) || newId(),
    name: asString(doc.name),
    type: (["conference", "webinar", "trade_show", "custom"] as const).includes(
      doc.type as never,
    )
      ? (doc.type as EventBrief["type"])
      : "custom",
    status: doc.status === "complete" ? "complete" : "draft",
    version: typeof doc.version === "number" && doc.version >= 1 ? doc.version : 1,
    createdAt: asString(doc.createdAt) || now,
    updatedAt: asString(doc.updatedAt) || asString(doc.createdAt) || now,
    goals: {
      ...goals,
      primaryObjective: asString(goals.primaryObjective),
      objectives: asArray<string>(goals.objectives),
      businessJustification: asString(goals.businessJustification),
    },
    audience: {
      ...audience,
      description: asString(audience.description),
      targetPersonas: asArray(audience.targetPersonas),
      segments: asArray<string>(audience.segments),
    },
    budget: {
      ...budget,
      currency: asString(budget.currency, "USD") || "USD",
      allocations: withIds(asArray(budget.allocations)),
    },
    dates: {
      ...dates,
      timezone: asString(dates.timezone, "UTC") || "UTC",
      eventStartDate: asString(dates.eventStartDate),
      eventEndDate: asString(dates.eventEndDate) || asString(dates.eventStartDate),
    },
    format: {
      ...format,
      deliveryMode: (["in_person", "virtual", "hybrid"] as const).includes(
        format.deliveryMode as never,
      )
        ? (format.deliveryMode as EventBrief["format"]["deliveryMode"])
        : "in_person",
      venueOrPlatform: isRecord(format.venueOrPlatform) ? format.venueOrPlatform : {},
    },
    stakeholders: withIds(asArray(doc.stakeholders)),
    successMetrics: withIds(asArray(doc.successMetrics)),
    riskRegister: withIds(asArray(doc.riskRegister)),
    timeline: { milestones: withIds(asArray(timeline.milestones)) },
    constraints: {
      ...constraints,
      items: asArray<string>(constraints.items),
      notes: asString(constraints.notes),
    },
    carryForwardLessons: withIds(asArray(doc.carryForwardLessons)),
    exportHistory: withIds(asArray(doc.exportHistory)),
  };

  return migrated;
}

export { CURRENT_SCHEMA_VERSION };
