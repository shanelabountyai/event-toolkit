"use client";

/** FR-4 — the amber/red/unbudgeted flag, rendered consistently everywhere. */

import type { LineItemVariance, VarianceFlag } from "@event-toolkit/budget-calc";
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

export function FlagPill({ flag }: { flag: VarianceFlag }) {
  const label = flag === "red" ? "Over" : flag === "amber" ? "Watch" : "On budget";
  return <Badge tone={TONES[flag]}>{label}</Badge>;
}
