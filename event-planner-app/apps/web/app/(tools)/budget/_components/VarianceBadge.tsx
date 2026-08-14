"use client";

/** FR-4 — the amber/red/unbudgeted flag, rendered consistently everywhere. */

import type { LineItemVariance, VarianceDirection, VarianceFlag } from "@event-toolkit/budget-calc";
import { Badge, type BadgeTone } from "@event-toolkit/ui";

const TONES: Record<VarianceFlag, BadgeTone> = {
  none: "neutral",
  amber: "warning",
  red: "danger",
};

export function VarianceBadge({ variance }: { variance: LineItemVariance }) {
  if (variance.isUnbudgeted) {
    return (
      <Badge tone="danger" title="Money committed or spent against a zero budget">
        Unbudgeted
      </Badge>
    );
  }
  if (variance.flag === "none" || variance.effectiveVariancePct === null) {
    return <Badge tone="neutral">On budget</Badge>;
  }

  const pct = Math.round(variance.effectiveVariancePct);
  return (
    <Badge
      tone={TONES[variance.flag]}
      title={`${Math.abs(pct)}% ${pct > 0 ? "over" : "under"} budget, based on ${
        variance.effectiveBasis === "committed" ? "commitments" : "actuals"
      } against a ${variance.threshold}% threshold`}
    >
      {pct > 0 ? "+" : ""}
      {pct}%{variance.effectiveBasis === "committed" ? " committed" : ""}
    </Badge>
  );
}

/**
 * A flag says how far off; only the direction says which way.
 *
 * Rendering "Over" from the flag alone labelled a category that came in $650 under as overspent,
 * and the one category genuinely over budget as "On budget". `direction` is required rather than
 * optional so a caller cannot reintroduce the guess.
 */
export function FlagPill({
  flag,
  direction,
}: {
  flag: VarianceFlag;
  direction: VarianceDirection;
}) {
  if (flag === "none") return <Badge tone={TONES.none}>On budget</Badge>;

  const way = direction === "under" ? "under" : "over";
  const label = flag === "red" ? (way === "under" ? "Under" : "Over") : `Watch — ${way}`;
  return <Badge tone={TONES[flag]}>{label}</Badge>;
}
