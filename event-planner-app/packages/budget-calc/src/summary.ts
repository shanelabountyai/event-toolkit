// packages/budget-calc/src/summary.ts
//
// FR-13 — THE ROI SEAM.
//
// PRD 6 (Post-Event ROI Report) imports `computeBudgetActualsSummary` from this package and
// calls it directly — no API, no serialization boundary. Two constraints follow:
//   1. It stays a PURE function. No IndexedDB reads in here; callers fetch line items and
//      settings through `budgetRepository` and pass them in, so PRD 6 can run it against
//      fixture data with no browser.
//   2. Its exported shape is a contract. Adding fields is fine; renaming or changing the
//      meaning of one silently breaks a tool that isn't built yet.

import {
  BUDGET_CATEGORIES,
  nowIso,
  type BudgetLineItem,
  type BudgetLineItemCategory,
  type BudgetSettings,
  type EventBrief,
} from "@event-toolkit/schema";
import { roundMoney } from "./variance";

export interface CategorySpend {
  category: BudgetLineItemCategory;
  budgeted: number;
  committed: number;
  actual: number;
  varianceAmount: number;
  variancePct: number | null;
}

export interface BudgetActualsSummary {
  eventBriefId: string;
  currency: string;
  generatedAt: string;
  totalBudgeted: number;
  totalCommitted: number;
  totalActual: number;
  varianceAmount: number;
  variancePct: number | null;
  spendByCategory: CategorySpend[];
  varianceAtClose: {
    /** True once the planner has explicitly marked the budget reconciled. */
    isFinal: boolean;
    varianceAmount: number;
    variancePct: number | null;
    reconciledAt: string | null;
  };
  lineItemCount: number;
  /** Share of line items that have any actual recorded, 0-100. */
  reconciledLineItemPct: number;
}

function sum(items: BudgetLineItem[], field: keyof BudgetLineItem): number {
  return roundMoney(
    items.reduce((total, item) => {
      const value = item[field];
      return total + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0),
  );
}

/**
 * Roll line items up into the totals and per-category breakdown PRD 6 reports on.
 *
 * Every category in the fixed taxonomy is present in `spendByCategory`, including the ones
 * with nothing in them — a consumer charting spend shouldn't have to guess whether a missing
 * category means zero or means "not modelled".
 */
export function computeBudgetActualsSummary(
  lineItems: BudgetLineItem[],
  budgetSettings: BudgetSettings,
  brief: Pick<EventBrief, "id" | "budget">,
): BudgetActualsSummary {
  const items = lineItems ?? [];

  const totalBudgeted = sum(items, "budgetedAmount");
  const totalCommitted = sum(items, "committedAmount");
  const totalActual = sum(items, "actualAmount");
  const varianceAmount = roundMoney(totalActual - totalBudgeted);
  const variancePct = totalBudgeted === 0 ? null : (varianceAmount / totalBudgeted) * 100;

  const spendByCategory: CategorySpend[] = BUDGET_CATEGORIES.map((category) => {
    const inCategory = items.filter((item) => item.category === category);
    const budgeted = sum(inCategory, "budgetedAmount");
    const committed = sum(inCategory, "committedAmount");
    const actual = sum(inCategory, "actualAmount");
    const categoryVariance = roundMoney(actual - budgeted);
    return {
      category,
      budgeted,
      committed,
      actual,
      varianceAmount: categoryVariance,
      variancePct: budgeted === 0 ? null : (categoryVariance / budgeted) * 100,
    };
  });

  const withActuals = items.filter((item) => (item.actualAmount ?? 0) > 0).length;

  return {
    eventBriefId: brief.id,
    // The budget's own currency snapshot wins; the brief is the fallback for older records.
    currency: budgetSettings.currency || brief.budget?.currency || "USD",
    generatedAt: nowIso(),
    totalBudgeted,
    totalCommitted,
    totalActual,
    varianceAmount,
    variancePct,
    spendByCategory,
    varianceAtClose: {
      isFinal: Boolean(budgetSettings.reconciledAt),
      varianceAmount,
      variancePct,
      reconciledAt: budgetSettings.reconciledAt ?? null,
    },
    lineItemCount: items.length,
    reconciledLineItemPct: items.length === 0 ? 0 : Math.round((withActuals / items.length) * 100),
  };
}

/**
 * FR-9 — category actual totals in the shape the brief's `budget.allocations[]` wants.
 * Only categories with a nonzero actual are returned; the caller creates or updates the
 * matching allocation and never touches `plannedAmount`.
 */
export function categoryActualTotals(
  lineItems: BudgetLineItem[],
): Array<{ category: BudgetLineItemCategory; actual: number }> {
  return BUDGET_CATEGORIES.map((category) => ({
    category,
    actual: sum(
      lineItems.filter((item) => item.category === category),
      "actualAmount",
    ),
  })).filter((entry) => entry.actual !== 0);
}
