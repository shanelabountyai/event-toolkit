// packages/postmortem-core/src/retro.ts
//
// PRD 7 (Post-Mortem Generator) types — the tool that closes the suite's loop. It reads the
// issue log (PRD 3), budget variance (PRD 4) and the ROI scorecard (PRD 6), and writes
// lessons into `EventBrief.carryForwardLessons`, which PRD 1's intake already reads.
//
// Nothing here writes to a LogisticsPack, a budget or an ROI report.

import type { LessonDisposition, LessonLearned } from "@event-toolkit/schema";
import type { IssueLogEntry } from "@event-toolkit/logistics";
import type { BudgetActualsSummary, CategorySpend } from "@event-toolkit/budget-calc";
import type { ScorecardDimension } from "@event-toolkit/roi-report-core";

export const CURRENT_RETRO_SCHEMA_VERSION = "1.0.0";

/** Documented defaults, pending validation — kept as constants so they are a one-line change. */
export const RETRO_PROMPT_DELAY_DAYS = 3;
export const RETRO_PROMPT_ESCALATION_DAYS = 14;

export type RetroStatus = "draft" | "completed";
export type RetroLessonSourceType = "issue_log" | "budget_variance" | "roi_scorecard" | "manual";

export interface RetroLesson extends LessonLearned {
  /** Required here, though optional on the canonical type — a retro lesson has a verdict. */
  disposition: LessonDisposition;
  sourceType: RetroLessonSourceType;
  /** Retro-local traceability. Deliberately NOT written to the brief. */
  sourceRef?: string;
  /** Planner-controlled. Retro-local; not part of the canonical LessonLearned shape. */
  carryForward: boolean;
  /** Set once written to the brief — what makes re-completing a retro idempotent. */
  writtenLessonId?: string;
}

export interface IngestedIssueLogSummary {
  available: boolean;
  logisticsPackId: string | null;
  totalIssues: number;
  bySeverity: { low: number; medium: number; high: number };
  openAtIngestion: number;
  entries: IssueLogEntry[];
}

export interface IngestedBudgetVarianceSummary {
  available: boolean;
  totalBudgeted: number;
  totalActual: number;
  variancePct: number | null;
  /** Top 3 by absolute variance percentage. */
  worstCategoryVariances: CategorySpend[];
  varianceAtClose: BudgetActualsSummary["varianceAtClose"] | null;
}

export interface IngestedRoiScorecardSummary {
  available: boolean;
  roiReportId: string | null;
  reportStatus: "draft" | "final" | null;
  recommendation: "repeat" | "change" | "kill" | "insufficient_data" | null;
  recommendationRationale: string | null;
  scorePct: number | null;
  dimensions: ScorecardDimension[];
  npsScore: number | null;
}

export interface SuccessMetricAdjustment {
  metricId: string;
  metricName: string;
  previousActual: number | null;
  adjustedActual: number;
  /** Required — a correction with no stated reason is indistinguishable from a mistake. */
  reason: string;
  adjustedAt: string;
}

export interface RetroDocument {
  schemaVersion: string;
  id: string;
  eventBriefId: string;
  eventName: string;
  status: RetroStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  version: number;
  ingestedIssueLogSummary: IngestedIssueLogSummary;
  ingestedBudgetVarianceSummary: IngestedBudgetVarianceSummary;
  ingestedRoiScorecardSummary: IngestedRoiScorecardSummary;
  lessons: RetroLesson[];
  notes?: string;
  successMetricAdjustments: SuccessMetricAdjustment[];
}

/* -------------------------------------------------------------------------- */
/* Labels — the exact definitions the UI must use                              */
/* -------------------------------------------------------------------------- */

export const DISPOSITION_LABELS: Record<LessonDisposition, string> = {
  repeat: "Repeat",
  fix: "Fix",
  drop: "Drop",
};

export const DISPOSITION_DEFINITIONS: Record<LessonDisposition, string> = {
  repeat: "This worked. Keep doing it exactly as-is.",
  fix: "Worth keeping, but something specific about execution needs to change (vendor, timing, budget line).",
  drop: "Don't repeat this in its current form. Structural problem, not a tuning problem.",
};

export const DISPOSITIONS: LessonDisposition[] = ["repeat", "fix", "drop"];

export const SOURCE_TYPE_LABELS: Record<RetroLessonSourceType, string> = {
  issue_log: "From the issue log",
  budget_variance: "From budget variance",
  roi_scorecard: "From the ROI scorecard",
  manual: "Added by hand",
};

export const EMPTY_ISSUE_LOG: IngestedIssueLogSummary = {
  available: false,
  logisticsPackId: null,
  totalIssues: 0,
  bySeverity: { low: 0, medium: 0, high: 0 },
  openAtIngestion: 0,
  entries: [],
};

export const EMPTY_BUDGET_VARIANCE: IngestedBudgetVarianceSummary = {
  available: false,
  totalBudgeted: 0,
  totalActual: 0,
  variancePct: null,
  worstCategoryVariances: [],
  varianceAtClose: null,
};

export const EMPTY_ROI_SCORECARD: IngestedRoiScorecardSummary = {
  available: false,
  roiReportId: null,
  reportStatus: null,
  recommendation: null,
  recommendationRationale: null,
  scorePct: null,
  dimensions: [],
  npsScore: null,
};
