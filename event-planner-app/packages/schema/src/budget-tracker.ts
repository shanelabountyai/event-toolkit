// packages/schema/src/budget-tracker.ts
//
// PRD 4 (Budget Builder & Tracker) types. Purely additive — `event-brief.ts` is frozen for
// v1, so line items live here as siblings keyed by `eventBriefId` rather than as new fields
// on `EventBrief`.
//
// The one place this tool writes back into the brief is `budget.allocations[].actualAmount`
// (FR-9), through the existing `saveBrief`.

import type { FormatMode } from "./event-brief";

/** Fixed taxonomy: 8 standard categories plus `other`. Deliberately not planner-editable. */
export type BudgetLineItemCategory =
  | "venue"
  | "av"
  | "f_and_b"
  | "travel"
  | "promo"
  | "staffing"
  | "swag"
  | "contingency"
  | "other";

export type LineItemStatus = "planned" | "committed" | "invoiced" | "paid";
export type LineItemSource = "manual" | "csv_import" | "xlsx_import";

export interface BudgetLineItem {
  id: string;
  /** FK to `EventBrief.id`. No enforced referential integrity. */
  eventBriefId: string;
  category: BudgetLineItemCategory;
  lineItemName: string;
  vendor?: string;
  budgetedAmount: number;
  committedAmount: number;
  actualAmount: number;
  /** Per-line override; null means use `BudgetSettings.defaultVarianceThresholdPct`. */
  varianceThresholdPct: number | null;
  status: LineItemStatus;
  notes?: string;
  source: LineItemSource;
  createdAt: string;
  updatedAt: string;
}

export interface ReforecastEvent {
  id: string;
  triggeredAt: string;
  triggerReason: string;
  briefVersionAtTrigger: number;
  action: "reforecasted" | "dismissed";
  totalBudgetedBefore?: number;
  totalBudgetedAfter?: number;
}

/** The brief-scope fields watched for reforecast triggers, as of the last time we looked. */
export interface ScopeSnapshot {
  estimatedSize?: number;
  eventStartDate: string;
  eventEndDate: string;
  deliveryMode: FormatMode;
  venueCapacity?: number;
  totalBudget?: number;
}

export interface BudgetSettings {
  eventBriefId: string;
  /** Snapshot of `EventBrief.budget.currency` at generation time. Single currency, no FX. */
  currency: string;
  defaultVarianceThresholdPct: number;
  lastSeenBriefVersion: number;
  lastSeenScopeSnapshot: ScopeSnapshot;
  reforecastHistory: ReforecastEvent[];
  reconciledAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Labels and orderings                                                        */
/* -------------------------------------------------------------------------- */

export const BUDGET_CATEGORY_LABELS: Record<BudgetLineItemCategory, string> = {
  venue: "Venue",
  av: "AV",
  f_and_b: "F&B",
  travel: "Travel",
  promo: "Promo",
  staffing: "Staffing",
  swag: "Swag",
  contingency: "Contingency",
  other: "Other",
};

/** Display order for every category section, table and export sheet. */
export const BUDGET_CATEGORIES: BudgetLineItemCategory[] = [
  "venue",
  "av",
  "f_and_b",
  "travel",
  "promo",
  "staffing",
  "swag",
  "contingency",
  "other",
];

export const LINE_ITEM_STATUS_LABELS: Record<LineItemStatus, string> = {
  planned: "Planned",
  committed: "Committed",
  invoiced: "Invoiced",
  paid: "Paid",
};

export const LINE_ITEM_STATUSES: LineItemStatus[] = ["planned", "committed", "invoiced", "paid"];

/** Documented default: 10% amber, 20% (2×) red. Editable per event and per line item. */
export const DEFAULT_VARIANCE_THRESHOLD_PCT = 10;

/** Documented default: a 15% swing in headcount or capacity is worth a reforecast prompt. */
export const REFORECAST_SIZE_CHANGE_PCT = 15;
