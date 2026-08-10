// packages/budget-calc/src/reforecast.ts
//
// FR-7/FR-8 — detect when the brief's scope has moved enough to be worth revisiting the budget.
//
// Detection is a *field-value diff* against the stored snapshot, not a version comparison.
// This tool's own actuals roll-up bumps `EventBrief.version` too, so trusting the version
// alone would fire on our own writes and, worse, mask a real scope change that landed on the
// same version.

import {
  REFORECAST_SIZE_CHANGE_PCT,
  newId,
  nowIso,
  type BudgetLineItem,
  type BudgetLineItemCategory,
  type EventBrief,
  type ReforecastEvent,
  type ScopeSnapshot,
} from "@event-toolkit/schema";

export interface ReforecastTrigger {
  field: keyof ScopeSnapshot;
  label: string;
  before: string;
  after: string;
  /** Categories most likely to need revisiting because of this change. */
  affectedCategories: BudgetLineItemCategory[];
}

export function snapshotScope(brief: EventBrief): ScopeSnapshot {
  return {
    estimatedSize: brief.audience?.estimatedSize,
    eventStartDate: brief.dates?.eventStartDate ?? "",
    eventEndDate: brief.dates?.eventEndDate ?? "",
    deliveryMode: brief.format?.deliveryMode ?? "in_person",
    venueCapacity: brief.format?.venueOrPlatform?.capacity,
    totalBudget: brief.budget?.totalBudget,
  };
}

/** Relative change, treating a move away from "unset" as significant. */
function percentChange(before: number | undefined, after: number | undefined): number | null {
  if (before === undefined && after === undefined) return null;
  if (before === undefined || after === undefined) return Infinity;
  if (before === 0) return after === 0 ? 0 : Infinity;
  return Math.abs(((after - before) / before) * 100);
}

const show = (value: unknown): string =>
  value === undefined || value === null || value === "" ? "not set" : String(value);

/**
 * Which watched fields have moved since the snapshot. A 15% swing counts for headcount and
 * capacity; any change at all counts for delivery mode, either date, or the total budget.
 */
export function detectReforecastTriggers(
  brief: EventBrief,
  snapshot: ScopeSnapshot,
): ReforecastTrigger[] {
  const current = snapshotScope(brief);
  const triggers: ReforecastTrigger[] = [];

  const sizeChange = percentChange(snapshot.estimatedSize, current.estimatedSize);
  if (sizeChange !== null && sizeChange >= REFORECAST_SIZE_CHANGE_PCT) {
    triggers.push({
      field: "estimatedSize",
      label: "Estimated audience size",
      before: show(snapshot.estimatedSize),
      after: show(current.estimatedSize),
      affectedCategories: ["f_and_b", "swag", "venue", "staffing"],
    });
  }

  const capacityChange = percentChange(snapshot.venueCapacity, current.venueCapacity);
  if (capacityChange !== null && capacityChange >= REFORECAST_SIZE_CHANGE_PCT) {
    triggers.push({
      field: "venueCapacity",
      label: "Venue capacity",
      before: show(snapshot.venueCapacity),
      after: show(current.venueCapacity),
      affectedCategories: ["venue", "f_and_b", "av"],
    });
  }

  if (snapshot.deliveryMode !== current.deliveryMode) {
    triggers.push({
      field: "deliveryMode",
      label: "Delivery mode",
      before: show(snapshot.deliveryMode),
      after: show(current.deliveryMode),
      // A mode switch reshapes nearly everything physical.
      affectedCategories: ["venue", "av", "f_and_b", "travel", "staffing", "swag"],
    });
  }

  if (snapshot.eventStartDate !== current.eventStartDate) {
    triggers.push({
      field: "eventStartDate",
      label: "Event start date",
      before: show(snapshot.eventStartDate),
      after: show(current.eventStartDate),
      affectedCategories: ["venue", "travel", "promo"],
    });
  }

  if (snapshot.eventEndDate !== current.eventEndDate) {
    triggers.push({
      field: "eventEndDate",
      label: "Event end date",
      before: show(snapshot.eventEndDate),
      after: show(current.eventEndDate),
      affectedCategories: ["venue", "travel", "f_and_b", "staffing"],
    });
  }

  if ((snapshot.totalBudget ?? null) !== (current.totalBudget ?? null)) {
    triggers.push({
      field: "totalBudget",
      label: "Total budget on the brief",
      before: show(snapshot.totalBudget),
      after: show(current.totalBudget),
      affectedCategories: ["contingency"],
    });
  }

  return triggers;
}

export function triggerReason(triggers: ReforecastTrigger[]): string {
  return triggers.map((t) => `${t.label}: ${t.before} → ${t.after}`).join("; ");
}

/** Categories worth surfacing first in the reforecast view, deduped across all triggers. */
export function affectedCategories(triggers: ReforecastTrigger[]): BudgetLineItemCategory[] {
  const seen = new Set<BudgetLineItemCategory>();
  for (const trigger of triggers) {
    for (const category of trigger.affectedCategories) seen.add(category);
  }
  return [...seen];
}

export function newReforecastEvent(
  brief: EventBrief,
  triggers: ReforecastTrigger[],
  action: ReforecastEvent["action"],
  totals?: { before: number; after: number },
): ReforecastEvent {
  return {
    id: newId(),
    triggeredAt: nowIso(),
    triggerReason: triggerReason(triggers),
    briefVersionAtTrigger: brief.version,
    action,
    totalBudgetedBefore: totals?.before,
    totalBudgetedAfter: totals?.after,
  };
}

export function totalBudgeted(lineItems: BudgetLineItem[]): number {
  return lineItems.reduce((sum, item) => sum + (item.budgetedAmount ?? 0), 0);
}
