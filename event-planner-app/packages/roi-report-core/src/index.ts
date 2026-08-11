/**
 * @event-toolkit/roi-report-core — PRD 6 domain logic.
 *
 * Pure TypeScript: attribution classification, cost math, NPS, the scorecard, YoY deltas,
 * success-metric matching and deterministic report rendering.
 *
 * It reads PRD 4's `computeBudgetActualsSummary` and PRD 5's types, and writes to neither
 * tool's data. The only write it enables anywhere is `EventBrief.successMetrics[].actual`,
 * and only through the planner-confirmed finalize flow.
 */

export * from "./types";
export * from "./attribution";
export * from "./csvParser";
export * from "./pipelineMapping";
export * from "./surveyMapping";
export * from "./costs";
export * from "./nps";
export * from "./scorecard";
export * from "./yoy";
export * from "./execSummary";
export * from "./successMetricMatch";
