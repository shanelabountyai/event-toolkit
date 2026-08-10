/**
 * Budget repository (PRD 4).
 *
 * Line items keyed by their own id and indexed on `eventBriefId`; one settings record per
 * brief. The actuals roll-up (FR-9) also lives here, because it is the one place this tool
 * writes back into the brief and it must go through `saveBrief` like any other brief edit.
 */

import {
  DEFAULT_VARIANCE_THRESHOLD_PCT,
  newId,
  nowIso,
  type BudgetLineItem,
  type BudgetSettings,
  type EventBrief,
} from "@event-toolkit/schema";
import {
  buildInitialLineItems,
  categoryActualTotals,
  categoryForAllocationName,
  seedLineItemsForEventType,
  snapshotScope,
} from "@event-toolkit/budget-calc";
import { BUDGET_CATEGORY_LABELS } from "@event-toolkit/schema";
import { getDb, STORE_BUDGET_LINE_ITEMS, STORE_BUDGET_SETTINGS } from "./db";
import { saveBrief } from "./briefRepository";

export async function getLineItems(briefId: string): Promise<BudgetLineItem[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_BUDGET_LINE_ITEMS, "eventBriefId", briefId);
  // Stable order: creation time, so rows don't jump around as the planner edits amounts.
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

export async function saveLineItem(lineItem: BudgetLineItem): Promise<BudgetLineItem> {
  const next = { ...lineItem, updatedAt: nowIso() };
  const db = await getDb();
  await db.put(STORE_BUDGET_LINE_ITEMS, next);
  return next;
}

export async function saveLineItems(lineItems: BudgetLineItem[]): Promise<BudgetLineItem[]> {
  const timestamp = nowIso();
  const next = lineItems.map((item) => ({ ...item, updatedAt: timestamp }));
  const db = await getDb();
  const tx = db.transaction(STORE_BUDGET_LINE_ITEMS, "readwrite");
  for (const item of next) await tx.store.put(item);
  await tx.done;
  return next;
}

export async function deleteLineItem(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_BUDGET_LINE_ITEMS, id);
}

export async function getBudgetSettings(briefId: string): Promise<BudgetSettings | null> {
  const db = await getDb();
  return (await db.get(STORE_BUDGET_SETTINGS, briefId)) ?? null;
}

export async function saveBudgetSettings(settings: BudgetSettings): Promise<BudgetSettings> {
  const db = await getDb();
  await db.put(STORE_BUDGET_SETTINGS, settings);
  return settings;
}

export interface BudgetBootstrap {
  lineItems: BudgetLineItem[];
  settings: BudgetSettings;
  /** True when this call generated the template — the UI shows its one-time explainer. */
  generated: boolean;
  /** Allocation labels the synonym map couldn't place, filed under Other. */
  unmatched: string[];
}

/**
 * FR-1/FR-2 — the first-open path: seed the event-type template, fold in the brief's own
 * allocations, and store settings. Idempotent; opening the budget again returns what's there
 * rather than regenerating or duplicating.
 */
export async function findOrCreateBudget(brief: EventBrief): Promise<BudgetBootstrap> {
  const existingSettings = await getBudgetSettings(brief.id);
  if (existingSettings) {
    return {
      lineItems: await getLineItems(brief.id),
      settings: existingSettings,
      generated: false,
      unmatched: [],
    };
  }

  const seeded = seedLineItemsForEventType(brief.id, brief.type);
  const { lineItems, unmatched } = buildInitialLineItems(brief, seeded);

  const settings: BudgetSettings = {
    eventBriefId: brief.id,
    currency: brief.budget?.currency || "USD",
    defaultVarianceThresholdPct: DEFAULT_VARIANCE_THRESHOLD_PCT,
    lastSeenBriefVersion: brief.version,
    lastSeenScopeSnapshot: snapshotScope(brief),
    reforecastHistory: [],
    reconciledAt: null,
  };

  const db = await getDb();
  const tx = db.transaction([STORE_BUDGET_LINE_ITEMS, STORE_BUDGET_SETTINGS], "readwrite");
  const store = tx.objectStore(STORE_BUDGET_LINE_ITEMS);
  for (const item of lineItems) await store.put(item);
  await tx.objectStore(STORE_BUDGET_SETTINGS).put(settings);
  await tx.done;

  return { lineItems: await getLineItems(brief.id), settings, generated: true, unmatched };
}

/**
 * FR-9 — push category actual totals into `EventBrief.budget.allocations[].actualAmount`.
 *
 * Matches an existing allocation by its reconciled category so a planner's own wording
 * ("Catering") receives the F&B total rather than gaining a duplicate row. `plannedAmount` is
 * never touched — this tool does not own it. Returns the saved brief, whose `version` has
 * bumped exactly as it would from any other edit.
 */
export async function syncActualsToBrief(
  brief: EventBrief,
  lineItems: BudgetLineItem[],
): Promise<EventBrief> {
  const totals = categoryActualTotals(lineItems);
  const allocations = [...(brief.budget?.allocations ?? [])];

  for (const { category, actual } of totals) {
    const index = allocations.findIndex(
      (allocation) => categoryForAllocationName(allocation.category ?? "") === category,
    );
    if (index >= 0) {
      allocations[index] = { ...allocations[index], actualAmount: actual };
    } else {
      allocations.push({
        id: newId(),
        category: BUDGET_CATEGORY_LABELS[category as keyof typeof BUDGET_CATEGORY_LABELS] ?? category,
        plannedAmount: 0,
        actualAmount: actual,
        notes: "Created by the Budget Builder from line-item actuals.",
      });
    }
  }

  return saveBrief({ ...brief, budget: { ...brief.budget, allocations } });
}

/** Remove every budget record for a brief. Called when the brief itself is deleted. */
export async function deleteBudgetForBrief(briefId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_BUDGET_LINE_ITEMS, "eventBriefId", briefId);
  const tx = db.transaction([STORE_BUDGET_LINE_ITEMS, STORE_BUDGET_SETTINGS], "readwrite");
  const store = tx.objectStore(STORE_BUDGET_LINE_ITEMS);
  for (const row of rows) await store.delete(row.id);
  await tx.objectStore(STORE_BUDGET_SETTINGS).delete(briefId);
  await tx.done;
}
