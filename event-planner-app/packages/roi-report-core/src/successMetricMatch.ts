// packages/roi-report-core/src/successMetricMatch.ts
//
// FR-13 — the suite's data loop closes here: this is the primary writer of
// `EventBrief.successMetrics[].actual`.
//
// Nothing is ever written silently. The matcher only *proposes*; a planner accepts each match
// individually, and unmatched metrics are left alone rather than zeroed.

import type { EventBrief, SuccessMetric } from "@event-toolkit/schema";
import type { CostSummary, PipelineSummary, Scorecard, SurveySummary } from "./types";

export interface MetricMatchInputs {
  pipelineSummary: PipelineSummary | null;
  surveySummary: SurveySummary | null;
  costSummary: CostSummary;
  scorecard: Scorecard | null;
}

export interface MetricMatch {
  metric: SuccessMetric;
  /** Null when nothing matched, or the matched source has no value to offer. */
  matchedField: string | null;
  proposedValue: number | null;
  /** Present when the metric matched a pattern but the underlying value is missing. */
  unavailableReason?: string;
}

/**
 * Patterns, longest first. Order is load-bearing: a metric named "Cost per Lead" must match
 * the cost pattern before the bare "lead" pattern, or it gets the raw lead count written into
 * a cost field — a wrong number that looks entirely plausible in a board deck.
 */
const PATTERNS: Array<{
  pattern: string;
  field: string;
  value: (inputs: MetricMatchInputs) => number | null;
}> = [
  { pattern: "cost per opportunity", field: "Cost per opportunity", value: (i) => i.costSummary.costPerOpportunity },
  { pattern: "cost per meeting", field: "Cost per meeting", value: (i) => i.costSummary.costPerMeeting },
  { pattern: "cost per lead", field: "Cost per lead", value: (i) => i.costSummary.costPerLead },
  {
    pattern: "pipeline",
    field: "Sourced + influenced pipeline",
    value: (i) =>
      i.pipelineSummary ? i.pipelineSummary.sourcedAmount + i.pipelineSummary.influencedAmount : null,
  },
  { pattern: "opportunit", field: "Opportunities created", value: (i) => i.pipelineSummary?.opportunitiesCount ?? null },
  { pattern: "meeting", field: "Meetings booked", value: (i) => i.pipelineSummary?.meetingsCount ?? null },
  { pattern: "revenue", field: "Won revenue", value: (i) => i.pipelineSummary?.wonAmount ?? null },
  { pattern: "won", field: "Won revenue", value: (i) => i.pipelineSummary?.wonAmount ?? null },
  { pattern: "nps", field: "NPS", value: (i) => i.surveySummary?.npsScore ?? null },
  {
    pattern: "roi",
    field: "Pipeline return on spend",
    value: (i) => i.scorecard?.dimensions.find((d) => d.id === "roi_ratio")?.rawValue ?? null,
  },
  { pattern: "lead", field: "Total leads", value: (i) => i.costSummary.totalLeads },
];

/** Propose a value for every metric on the brief. Never writes; the caller confirms first. */
export function matchSuccessMetrics(
  successMetrics: EventBrief["successMetrics"],
  inputs: MetricMatchInputs,
): MetricMatch[] {
  return (successMetrics ?? []).map((metric) => {
    const name = (metric.metric ?? "").toLowerCase();
    const hit = PATTERNS.find((entry) => name.includes(entry.pattern));

    if (!hit) return { metric, matchedField: null, proposedValue: null };

    const value = hit.value(inputs);
    if (value === null) {
      return {
        metric,
        matchedField: hit.field,
        proposedValue: null,
        unavailableReason: `${hit.field} has not been computed yet — import the data it depends on first.`,
      };
    }
    return { metric, matchedField: hit.field, proposedValue: value };
  });
}

/**
 * Apply only the matches the planner accepted.
 *
 * Returns the brief with `successMetrics[].actual` updated. The caller persists it through
 * `saveBrief`, so `version` and `updatedAt` bump exactly as they would for any other edit —
 * this is the one field in the whole EventBrief this tool may write.
 */
export function applyMetricWriteBacks(
  brief: EventBrief,
  accepted: Array<{ metricId: string; value: number }>,
): EventBrief {
  if (accepted.length === 0) return brief;
  const byId = new Map(accepted.map((a) => [a.metricId, a.value]));
  return {
    ...brief,
    successMetrics: brief.successMetrics.map((metric) =>
      byId.has(metric.id) ? { ...metric, actual: byId.get(metric.id)! } : metric,
    ),
  };
}
