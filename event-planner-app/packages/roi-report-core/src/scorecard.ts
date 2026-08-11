// packages/roi-report-core/src/scorecard.ts
//
// The repeat/change/kill call. Transparency is the requirement: every dimension carries its
// raw value, the exact bands applied and its verdict, so nobody is ever shown a colour with
// no explanation. A missing input is `insufficient_data` — never a silent zero, and never a
// penalty for data the planner simply hasn't got yet.
//
// Note the deliberate choice, per the PRD: pipeline dollars drive this, not closed/won. The
// report is produced ~30 days after an event; most B2B cycles are longer than that, so won
// revenue is captured and displayed but not weighted.

import type { EventBrief } from "@event-toolkit/schema";
import type {
  CostSummary,
  PipelineSummary,
  Scorecard,
  ScorecardDimension,
  ScorecardVerdict,
  SurveySummary,
} from "./types";
import type { BudgetActualsSummary } from "@event-toolkit/budget-calc";

/** The five bands, in one place rather than scattered as magic numbers. */
export const SCORECARD_THRESHOLDS = {
  roiRatio: { green: 3.0, yellow: 1.0 },
  sourcedCoverage: { green: 1.0, yellow: 0.25 },
  nps: { green: 30, yellow: 0 },
  /** Lower is better — these are absolute variance percentages. */
  budgetDiscipline: { green: 10, yellow: 25 },
  successMetricsHitRate: { green: 75, yellow: 40 },
  /** Minimum scored survey responses before NPS is trusted. */
  minNpsResponses: 5,
  /** Below this many scoreable dimensions, no recommendation is made. */
  minScoreableDimensions: 2,
  recommendation: { repeat: 0.75, change: 0.4 },
} as const;

function verdictFor(value: number, green: number, yellow: number): ScorecardVerdict {
  if (value >= green) return "green";
  if (value >= yellow) return "yellow";
  return "red";
}

/** Lower-is-better bands, used by budget discipline. */
function inverseVerdictFor(value: number, green: number, yellow: number): ScorecardVerdict {
  if (value <= green) return "green";
  if (value <= yellow) return "yellow";
  return "red";
}

const POINTS: Record<ScorecardVerdict, number | null> = {
  green: 2,
  yellow: 1,
  red: 0,
  insufficient_data: null,
};

function dimension(
  id: ScorecardDimension["id"],
  label: string,
  verdict: ScorecardVerdict,
  rawValue: number | null,
  thresholdsApplied: string,
): ScorecardDimension {
  return { id, label, verdict, rawValue, thresholdsApplied, points: POINTS[verdict] };
}

export interface ScorecardInputs {
  budgetSummary: BudgetActualsSummary | null;
  pipelineSummary: PipelineSummary | null;
  surveySummary: SurveySummary | null;
  costSummary: CostSummary;
  successMetrics: EventBrief["successMetrics"];
}

export function computeScorecard(inputs: ScorecardInputs): Scorecard {
  const { budgetSummary, pipelineSummary, surveySummary, successMetrics } = inputs;
  const totalActual = budgetSummary?.totalActual ?? null;
  const hasSpend = totalActual !== null && totalActual > 0;
  const dimensions: ScorecardDimension[] = [];

  /* 1 — ROI ratio ---------------------------------------------------------- */
  const roiBands = `green ≥${SCORECARD_THRESHOLDS.roiRatio.green.toFixed(1)}x, yellow ${SCORECARD_THRESHOLDS.roiRatio.yellow.toFixed(1)}–${SCORECARD_THRESHOLDS.roiRatio.green.toFixed(1)}x, red <${SCORECARD_THRESHOLDS.roiRatio.yellow.toFixed(1)}x`;
  if (!hasSpend || !pipelineSummary) {
    dimensions.push(
      dimension("roi_ratio", "Pipeline return on spend", "insufficient_data", null, roiBands),
    );
  } else {
    const ratio = (pipelineSummary.sourcedAmount + pipelineSummary.influencedAmount) / totalActual!;
    dimensions.push(
      dimension(
        "roi_ratio",
        "Pipeline return on spend",
        verdictFor(ratio, SCORECARD_THRESHOLDS.roiRatio.green, SCORECARD_THRESHOLDS.roiRatio.yellow),
        Math.round(ratio * 100) / 100,
        roiBands,
      ),
    );
  }

  /* 2 — Sourced coverage --------------------------------------------------- */
  const coverageBands = `green ≥${SCORECARD_THRESHOLDS.sourcedCoverage.green.toFixed(2)}x spend, yellow ${SCORECARD_THRESHOLDS.sourcedCoverage.yellow.toFixed(2)}–${SCORECARD_THRESHOLDS.sourcedCoverage.green.toFixed(2)}x, red <${SCORECARD_THRESHOLDS.sourcedCoverage.yellow.toFixed(2)}x`;
  if (!hasSpend || !pipelineSummary) {
    dimensions.push(
      dimension("sourced_coverage", "Sourced pipeline vs spend", "insufficient_data", null, coverageBands),
    );
  } else {
    const coverage = pipelineSummary.sourcedAmount / totalActual!;
    dimensions.push(
      dimension(
        "sourced_coverage",
        "Sourced pipeline vs spend",
        verdictFor(coverage, SCORECARD_THRESHOLDS.sourcedCoverage.green, SCORECARD_THRESHOLDS.sourcedCoverage.yellow),
        Math.round(coverage * 100) / 100,
        coverageBands,
      ),
    );
  }

  /* 3 — NPS ---------------------------------------------------------------- */
  const npsBands = `green ≥${SCORECARD_THRESHOLDS.nps.green}, yellow ${SCORECARD_THRESHOLDS.nps.yellow}–${SCORECARD_THRESHOLDS.nps.green}, red <${SCORECARD_THRESHOLDS.nps.yellow}; needs ≥${SCORECARD_THRESHOLDS.minNpsResponses} scored responses`;
  if (!surveySummary || surveySummary.npsScore === null || surveySummary.npsSmallSample) {
    dimensions.push(dimension("nps", "Attendee sentiment (NPS)", "insufficient_data", surveySummary?.npsScore ?? null, npsBands));
  } else {
    dimensions.push(
      dimension(
        "nps",
        "Attendee sentiment (NPS)",
        verdictFor(surveySummary.npsScore, SCORECARD_THRESHOLDS.nps.green, SCORECARD_THRESHOLDS.nps.yellow),
        surveySummary.npsScore,
        npsBands,
      ),
    );
  }

  /* 4 — Budget discipline --------------------------------------------------- */
  const disciplineBands = `green ≤${SCORECARD_THRESHOLDS.budgetDiscipline.green}% variance, yellow ${SCORECARD_THRESHOLDS.budgetDiscipline.green}–${SCORECARD_THRESHOLDS.budgetDiscipline.yellow}%, red >${SCORECARD_THRESHOLDS.budgetDiscipline.yellow}%; needs a reconciled budget`;
  // An unreconciled budget is missing data, not bad discipline.
  if (!budgetSummary?.varianceAtClose.isFinal || budgetSummary.varianceAtClose.variancePct === null) {
    dimensions.push(dimension("budget_discipline", "Budget discipline", "insufficient_data", null, disciplineBands));
  } else {
    const variance = Math.abs(budgetSummary.varianceAtClose.variancePct);
    dimensions.push(
      dimension(
        "budget_discipline",
        "Budget discipline",
        inverseVerdictFor(variance, SCORECARD_THRESHOLDS.budgetDiscipline.green, SCORECARD_THRESHOLDS.budgetDiscipline.yellow),
        Math.round(variance * 10) / 10,
        disciplineBands,
      ),
    );
  }

  /* 5 — Success metrics hit rate -------------------------------------------- */
  const hitBands = `green ≥${SCORECARD_THRESHOLDS.successMetricsHitRate.green}% of metrics hit, yellow ${SCORECARD_THRESHOLDS.successMetricsHitRate.yellow}–${SCORECARD_THRESHOLDS.successMetricsHitRate.green}%, red <${SCORECARD_THRESHOLDS.successMetricsHitRate.yellow}%`;
  const withActuals = (successMetrics ?? []).filter(
    (metric) => metric.actual !== null && metric.actual !== undefined,
  );
  if (withActuals.length === 0) {
    dimensions.push(dimension("success_metrics_hit_rate", "Success metrics hit", "insufficient_data", null, hitBands));
  } else {
    const hit = withActuals.filter((metric) => (metric.actual ?? 0) >= metric.target).length;
    const rate = (hit / withActuals.length) * 100;
    dimensions.push(
      dimension(
        "success_metrics_hit_rate",
        "Success metrics hit",
        verdictFor(rate, SCORECARD_THRESHOLDS.successMetricsHitRate.green, SCORECARD_THRESHOLDS.successMetricsHitRate.yellow),
        Math.round(rate),
        hitBands,
      ),
    );
  }

  /* Roll-up ----------------------------------------------------------------- */
  const scoreable = dimensions.filter((d) => d.points !== null);
  const totalPoints = scoreable.reduce((sum, d) => sum + (d.points ?? 0), 0);
  const maxPossiblePoints = scoreable.length * 2;
  const scorePct = scoreable.length > 0 ? totalPoints / maxPossiblePoints : null;

  const recommendation: Scorecard["recommendation"] =
    scoreable.length < SCORECARD_THRESHOLDS.minScoreableDimensions
      ? "insufficient_data"
      : scorePct! >= SCORECARD_THRESHOLDS.recommendation.repeat
        ? "repeat"
        : scorePct! >= SCORECARD_THRESHOLDS.recommendation.change
          ? "change"
          : "kill";

  return {
    dimensions,
    scoreableDimensionCount: scoreable.length,
    totalPoints,
    maxPossiblePoints,
    scorePct: scorePct === null ? null : Math.round(scorePct * 100) / 100,
    recommendation,
    recommendationRationale: buildRationale(recommendation, dimensions, scorePct),
  };
}

/**
 * The rationale is generated from the dimensions, not written per branch — a "change" verdict
 * has to name what to change, or it is just a colour with extra steps.
 */
function buildRationale(
  recommendation: Scorecard["recommendation"],
  dimensions: ScorecardDimension[],
  scorePct: number | null,
): string {
  const weak = dimensions.filter((d) => d.verdict === "red");
  const watch = dimensions.filter((d) => d.verdict === "yellow");
  const strong = dimensions.filter((d) => d.verdict === "green");
  const missing = dimensions.filter((d) => d.verdict === "insufficient_data");
  const pct = scorePct === null ? null : Math.round(scorePct * 100);
  const list = (items: ScorecardDimension[]) => items.map((d) => d.label.toLowerCase()).join(", ");

  if (recommendation === "insufficient_data") {
    return `Only ${dimensions.length - missing.length} of ${dimensions.length} dimensions could be scored${
      missing.length > 0 ? ` — still missing ${list(missing)}` : ""
    }. Add the missing data before drawing a conclusion.`;
  }

  const parts: string[] = [`Scored ${pct}% across ${dimensions.length - missing.length} of ${dimensions.length} dimensions.`];

  if (recommendation === "repeat") {
    parts.push(`Strong on ${list(strong)}.`);
    if (watch.length > 0) parts.push(`Worth watching: ${list(watch)}.`);
  } else if (recommendation === "change") {
    const toFix = [...weak, ...watch];
    parts.push(`What to change: ${list(toFix)}.`);
    if (strong.length > 0) parts.push(`Keep what is working: ${list(strong)}.`);
  } else {
    parts.push(`Underperforming on ${list(weak.length > 0 ? weak : watch)}.`);
    if (strong.length > 0) parts.push(`The only bright spot is ${list(strong)}.`);
  }

  if (missing.length > 0) {
    parts.push(`Not scored for lack of data: ${list(missing)}.`);
  }

  return parts.join(" ");
}
