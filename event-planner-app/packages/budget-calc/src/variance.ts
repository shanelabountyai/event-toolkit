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

/** Which way a variance went. A flag alone cannot say, and a badge that guesses gets it wrong. */
export type VarianceDirection = "over" | "under" | "none";

/**
 * The flag *and* its direction for a group of line items.
 *
 * Flagging is deliberately direction-blind — a 23% underspend is a planning miss worth surfacing,
 * exactly like a 23% overspend. **Labelling must not be.** The pill rendered from the flag alone
 * said "Over" on a category that came in $650 under, and on a total that came in $660 under, while
 * the one category genuinely over budget read "On budget". The arithmetic was right the whole
 * time; only the word was wrong, which is the worst kind of wrong on a money screen.
 */
export function aggregateVarianceForLineItems(
  lineItems: BudgetLineItem[],
  settings: Pick<BudgetSettings, "defaultVarianceThresholdPct">,
): { flag: VarianceFlag; direction: VarianceDirection } {
  const flag = worstFlagForLineItems(lineItems, settings);

  // Compare on the same basis each line was judged on, so the direction matches the flag.
  let budgeted = 0;
  let effective = 0;
  for (const item of lineItems) {
    const variance = computeVariance(item, settings);
    budgeted += item.budgetedAmount ?? 0;
    effective +=
      variance.effectiveBasis === "committed"
        ? (item.committedAmount ?? 0)
        : (item.actualAmount ?? 0);
  }

  const delta = roundMoney(effective - budgeted);
  return { flag, direction: delta > 0 ? "over" : delta < 0 ? "under" : "none" };
}
