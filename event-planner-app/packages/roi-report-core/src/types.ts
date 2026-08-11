// packages/roi-report-core/src/types.ts
//
// PRD 6 (Event ROI & Attribution Report) types.
//
// This tool is a reader. It calls PRD 4's `computeBudgetActualsSummary` and reads PRD 5's
// leads; it writes to neither. The single exception in the whole suite is
// `EventBrief.successMetrics[].actual`, and only through the planner-confirmed finalize flow.

import type { BudgetActualsSummary } from "@event-toolkit/budget-calc";

export type PipelineRecordType = "opportunity" | "meeting";
export type AttributionType = "sourced" | "influenced";
export type PipelineImportSource = "csv_import" | "xlsx_import";

/** Classification result — `outside_window` is a third state, not an attribution type. */
export type AttributionResult = AttributionType | "outside_window";

export interface PipelineOpportunity {
  id: string;
  roiReportId: string;
  /** Required. The dedupe key across re-imports. */
  recordId: string;
  recordType: PipelineRecordType;
  opportunityName?: string;
  contactName?: string;
  /** Informational lead cross-check only — never gates attribution. */
  contactEmail?: string;
  company?: string;
  /** ISO date. Required; drives attribution. */
  createdDate: string;
  amount: number;
  stage?: string;
  isWon?: boolean;
  closeDate?: string;
  importedAttributionType?: AttributionType | null;
  /** Always retained, even when an imported value overrides it, so disagreement stays visible. */
  computedAttributionType: AttributionResult;
  effectiveAttributionType: AttributionResult;
  leadMatchStatus: "matched" | "unmatched" | "not_checked";
  source: PipelineImportSource;
  sourceImportBatchId: string;
  createdAt: string;
  updatedAt: string;
}

export type PipelineField =
  | "recordId"
  | "recordType"
  | "opportunityName"
  | "contactName"
  | "contactEmail"
  | "company"
  | "createdDate"
  | "amount"
  | "stage"
  | "isWon"
  | "closeDate"
  | "attributionType";

export interface MappedColumn<Field extends string> {
  sourceColumn: string;
  targetField: Field | "ignore";
  confidence: "auto" | "manual";
}

export interface PipelineImportBatch {
  id: string;
  roiReportId: string;
  filename: string;
  columnMapping: MappedColumn<PipelineField>[];
  rowCount: number;
  importedAt: string;
}

export interface SurveyResponse {
  id: string;
  roiReportId: string;
  respondentId?: string;
  respondentEmail?: string;
  respondentType?: "attendee" | "speaker" | "sponsor" | "exhibitor" | "other";
  /** 0-10. */
  npsScore?: number | null;
  csatScore?: number | null;
  comment?: string;
  respondedAt?: string;
  sourceImportBatchId: string;
  createdAt: string;
}

export type SurveyField =
  | "respondentId"
  | "respondentEmail"
  | "respondentType"
  | "npsScore"
  | "csatScore"
  | "comment"
  | "respondedAt";

export interface SurveyImportBatch {
  id: string;
  roiReportId: string;
  filename: string;
  columnMapping: MappedColumn<SurveyField>[];
  rowCount: number;
  importedAt: string;
}

export interface AttributionSettings {
  /** "default" in v1 — one row for the whole install. */
  id: string;
  sourcedWindowDays: number;
  influencedWindowDays: number;
  useExplicitAttributionTypeColumn: boolean;
  updatedAt: string;
}

export interface PipelineSummary {
  opportunitiesCount: number;
  meetingsCount: number;
  sourcedCount: number;
  sourcedAmount: number;
  influencedCount: number;
  influencedAmount: number;
  outsideWindowCount: number;
  wonCount: number;
  wonAmount: number;
  leadMatchRatePct: number | null;
}

export interface SurveySummary {
  responseCount: number;
  npsScore: number | null;
  /** True when fewer than 5 responses carried a score — the number is not yet trustworthy. */
  npsSmallSample: boolean;
  csatAverage: number | null;
}

export interface CostSummary {
  costPerLead: number | null;
  costPerMeeting: number | null;
  costPerOpportunity: number | null;
  totalLeads: number | null;
  leadSourceMode: "auto_single_session" | "planner_selected_session" | "manual_entry" | "unavailable";
}

export interface DeltaFigure {
  current: number | null;
  prior: number | null;
  deltaAbsolute: number | null;
  deltaPct: number | null;
}

export interface YoyComparison {
  comparatorEventBriefId: string;
  comparatorEventName: string;
  selectionMode: "auto_suggested" | "planner_selected";
  deltas: {
    totalActual: DeltaFigure;
    costPerLead: DeltaFigure;
    costPerOpportunity: DeltaFigure;
    sourcedAmount: DeltaFigure;
    influencedAmount: DeltaFigure;
    npsScore: DeltaFigure;
  };
}

export type ScorecardVerdict = "green" | "yellow" | "red" | "insufficient_data";

export type ScorecardDimensionId =
  | "roi_ratio"
  | "sourced_coverage"
  | "nps"
  | "budget_discipline"
  | "success_metrics_hit_rate";

export interface ScorecardDimension {
  id: ScorecardDimensionId;
  label: string;
  verdict: ScorecardVerdict;
  rawValue: number | null;
  /** Human-readable band description. The UI must never show a colour without this. */
  thresholdsApplied: string;
  points: number | null;
}

export interface Scorecard {
  dimensions: ScorecardDimension[];
  scoreableDimensionCount: number;
  totalPoints: number;
  maxPossiblePoints: number;
  scorePct: number | null;
  recommendation: "repeat" | "change" | "kill" | "insufficient_data";
  recommendationRationale: string;
}

export interface SuccessMetricWriteBack {
  metricId: string;
  metricName: string;
  matchedField: string;
  valueWritten: number;
  writtenAt: string;
}

export interface RoiReport {
  id: string;
  eventBriefId: string;
  eventName: string;
  status: "draft" | "final";
  finalizedAt: string | null;
  budgetSummary: BudgetActualsSummary | null;
  pipelineSummary: PipelineSummary | null;
  surveySummary: SurveySummary | null;
  costSummary: CostSummary;
  yoyComparison: YoyComparison | null;
  scorecard: Scorecard | null;
  executiveSummaryText: string | null;
  successMetricWriteBacks: SuccessMetricWriteBack[];
  /** Manual lead count, when the planner entered one instead of linking a triage session. */
  manualLeadCount?: number | null;
  /** Triage session the leads were read from, when one was chosen. */
  leadSessionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

export const ATTRIBUTION_LABELS: Record<AttributionResult, string> = {
  sourced: "Sourced",
  influenced: "Influenced",
  outside_window: "Outside attribution window",
};

export const VERDICT_LABELS: Record<ScorecardVerdict, string> = {
  green: "Good",
  yellow: "Watch",
  red: "Poor",
  insufficient_data: "Not enough data",
};

export const RECOMMENDATION_LABELS: Record<Scorecard["recommendation"], string> = {
  repeat: "Repeat",
  change: "Change",
  kill: "Kill",
  insufficient_data: "Not enough data",
};

export const LEAD_SOURCE_MODE_LABELS: Record<CostSummary["leadSourceMode"], string> = {
  auto_single_session: "From the linked triage session",
  planner_selected_session: "From a triage session you chose",
  manual_entry: "Entered manually",
  unavailable: "Not available",
};

export const DEFAULT_ATTRIBUTION_SETTINGS: Omit<AttributionSettings, "updatedAt"> = {
  id: "default",
  sourcedWindowDays: 30,
  influencedWindowDays: 90,
  useExplicitAttributionTypeColumn: true,
};
