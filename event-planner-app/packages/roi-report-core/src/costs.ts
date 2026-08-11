// packages/roi-report-core/src/costs.ts
//
// FR-8 — cost per outcome. Every figure is null when its input is missing: a missing lead
// count must never render as "$0 per lead", which reads like a triumph rather than a gap.

import type { BudgetActualsSummary } from "@event-toolkit/budget-calc";
import type { CostSummary, PipelineSummary } from "./types";

function perUnit(total: number | null, units: number | null | undefined): number | null {
  if (total === null || total <= 0) return null;
  if (units === null || units === undefined || units <= 0) return null;
  return Math.round((total / units) * 100) / 100;
}

export function computeCostSummary(
  budgetSummary: BudgetActualsSummary | null,
  totalLeads: number | null,
  pipelineSummary: PipelineSummary | null,
  leadSourceMode: CostSummary["leadSourceMode"],
): CostSummary {
  const totalActual = budgetSummary?.totalActual ?? null;
  return {
    costPerLead: perUnit(totalActual, totalLeads),
    costPerMeeting: perUnit(totalActual, pipelineSummary?.meetingsCount ?? null),
    costPerOpportunity: perUnit(totalActual, pipelineSummary?.opportunitiesCount ?? null),
    totalLeads,
    leadSourceMode,
  };
}
