// packages/budget-calc/src/variance.ts
//
// The variance formula, in one place. Money paths get exact, documented arithmetic rather
// than whatever a component happens to compute inline.

import type {
  BudgetLineItem,
  BudgetSettings,
} from "@event-toolkit/schema";

export type VarianceFlag = "none" | "amber" | "red";

export interface LineItemVariance {
  actualVarianceAmount: number;
  /** Null when there is nothing to divide by (budgeted is 0). */
  actualVariancePct: number | null;
  committedVarianceAmount: number;
  committedVariancePct: number | null;
  /**
   * Actuals win once any exist; otherwise commitments stand in. This is the early-warning
   * signal — a line item can flag before a single invoice lands.
   */
  effectiveVariancePct: number | null;
  /** Whether the effective figure came from actuals or commitments. */
  effectiveBasis: "actual" | "committed" | null;
  threshold: number;
  flag: VarianceFlag;
  /** True for the always-red case: money spent or committed against a zero budget. */
  isUnbudgeted: boolean;
}

/**
 * Round to whole cents. Repeated float addition of currency drifts (0.1 + 0.2), and these
 * numbers end up in a finance export, so every derived total is snapped back to 2dp.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

export function computeVariance(
  lineItem: BudgetLineItem,
  settings: Pick<BudgetSettings, "defaultVarianceThresholdPct">,
): LineItemVariance {
  const budgeted = lineItem.budgetedAmount ?? 0;
  const committed = lineItem.committedAmount ?? 0;
  const actual = lineItem.actualAmount ?? 0;

  const actualVarianceAmount = roundMoney(actual - budgeted);
  const committedVarianceAmount = roundMoney(committed - budgeted);
  const actualVariancePct = pct(actualVarianceAmount, budgeted);
  const committedVariancePct = pct(committedVarianceAmount, budgeted);

  const effectiveBasis: LineItemVariance["effectiveBasis"] =
    actual > 0 ? "actual" : committed > 0 ? "committed" : null;
  const effectiveVariancePct =
    effectiveBasis === "actual"
      ? actualVariancePct
      : effectiveBasis === "committed"
        ? committedVariancePct
        : null;

  const threshold = lineItem.varianceThresholdPct ?? settings.defaultVarianceThresholdPct;
  const isUnbudgeted = budgeted === 0 && (committed > 0 || actual > 0);

  const flag: VarianceFlag = isUnbudgeted
    ? "red" // unbudgeted spend is always red, whatever the percentage would have been
    : effectiveVariancePct === null
      ? "none"
      : Math.abs(effectiveVariancePct) >= threshold * 2
        ? "red"
        : Math.abs(effectiveVariancePct) >= threshold
          ? "amber"
          : "none";

  return {
    actualVarianceAmount,
    actualVariancePct,
    committedVarianceAmount,
    committedVariancePct,
    effectiveVariancePct,
    effectiveBasis,
    threshold,
    flag,
    isUnbudgeted,
  };
}

const FLAG_RANK: Record<VarianceFlag, number> = { none: 0, amber: 1, red: 2 };

/** The worst flag across a set — what the category header and grand total row show. */
export function worstFlag(flags: VarianceFlag[]): VarianceFlag {
  return flags.reduce<VarianceFlag>(
    (worst, flag) => (FLAG_RANK[flag] > FLAG_RANK[worst] ? flag : worst),
    "none",
  );
}

export function worstFlagForLineItems(
  lineItems: BudgetLineItem[],
  settings: Pick<BudgetSettings, "defaultVarianceThresholdPct">,
): VarianceFlag {
  return worstFlag(lineItems.map((item) => computeVariance(item, settings).flag));
}
