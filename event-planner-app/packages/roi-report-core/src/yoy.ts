// packages/roi-report-core/src/yoy.ts
//
// FR-9 — year-over-year. Only finalized reports are eligible comparators: a draft is a
// work in progress, and comparing this year against half-entered numbers is worse than not
// comparing at all.

import type { EventBrief } from "@event-toolkit/schema";
import type { DeltaFigure, RoiReport, YoyComparison } from "./types";

export interface ComparatorCandidate {
  brief: Pick<EventBrief, "id" | "name" | "type" | "dates">;
  report: RoiReport;
  /** True when it shares the current brief's event type — the auto-suggestion pool. */
  sameType: boolean;
}

/**
 * Finalized reports that could serve as a comparator, most recent first.
 *
 * Same-type events sort ahead, but different-type ones stay in the list — a planner comparing
 * a conference against last year's roadshow is making a deliberate choice, not a mistake.
 */
export function findEligibleComparators(
  currentBrief: Pick<EventBrief, "id" | "type">,
  candidates: ComparatorCandidate[],
): ComparatorCandidate[] {
  return candidates
    .filter((c) => c.brief.id !== currentBrief.id && c.report.status === "final")
    .map((c) => ({ ...c, sameType: c.brief.type === currentBrief.type }))
    .sort((a, b) => {
      if (a.sameType !== b.sameType) return a.sameType ? -1 : 1;
      return (b.brief.dates?.eventStartDate ?? "").localeCompare(a.brief.dates?.eventStartDate ?? "");
    });
}

/** The default suggestion: most recent finalized report of the same event type. */
export function suggestComparator(
  currentBrief: Pick<EventBrief, "id" | "type">,
  candidates: ComparatorCandidate[],
): ComparatorCandidate | null {
  const eligible = findEligibleComparators(currentBrief, candidates);
  return eligible.find((c) => c.sameType) ?? null;
}

function delta(current: number | null, prior: number | null): DeltaFigure {
  const deltaAbsolute = current === null || prior === null ? null : Math.round((current - prior) * 100) / 100;
  // A percentage change against a zero baseline is undefined, not infinite.
  const deltaPct =
    current === null || prior === null || prior === 0
      ? null
      : Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
  return { current, prior, deltaAbsolute, deltaPct };
}

export function computeYoyDeltas(
  current: RoiReport,
  comparator: ComparatorCandidate,
  selectionMode: YoyComparison["selectionMode"],
): YoyComparison {
  const prior = comparator.report;
  return {
    comparatorEventBriefId: comparator.brief.id,
    comparatorEventName: comparator.brief.name || prior.eventName,
    selectionMode,
    deltas: {
      totalActual: delta(current.budgetSummary?.totalActual ?? null, prior.budgetSummary?.totalActual ?? null),
      costPerLead: delta(current.costSummary.costPerLead, prior.costSummary.costPerLead),
      costPerOpportunity: delta(current.costSummary.costPerOpportunity, prior.costSummary.costPerOpportunity),
      sourcedAmount: delta(current.pipelineSummary?.sourcedAmount ?? null, prior.pipelineSummary?.sourcedAmount ?? null),
      influencedAmount: delta(current.pipelineSummary?.influencedAmount ?? null, prior.pipelineSummary?.influencedAmount ?? null),
      npsScore: delta(current.surveySummary?.npsScore ?? null, prior.surveySummary?.npsScore ?? null),
    },
  };
}
