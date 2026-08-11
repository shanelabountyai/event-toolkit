/**
 * Retro repository (PRD 7).
 *
 * Ingests from three upstream tools through their own existing read functions, and writes to
 * exactly one place: the brief, via the existing `saveBrief`. Nothing here writes a
 * LogisticsPack, a budget line item or an ROI report.
 */

import { newId, nowIso, type EventBrief } from "@event-toolkit/schema";
import { computeBudgetActualsSummary } from "@event-toolkit/budget-calc";
import {
  CURRENT_RETRO_SCHEMA_VERSION,
  EMPTY_BUDGET_VARIANCE,
  EMPTY_ISSUE_LOG,
  EMPTY_ROI_SCORECARD,
  generateCandidateLessons,
  migrateRetroDocument,
  type IngestedBudgetVarianceSummary,
  type IngestedIssueLogSummary,
  type IngestedRoiScorecardSummary,
  type RetroDocument,
} from "@event-toolkit/postmortem-core";
import { getDb, STORE_RETROS } from "./db";
import { getBudgetSettings, getLineItems } from "./budgetRepository";
import { getPackByBriefId } from "./logisticsRepository";
import { getReportByBriefId } from "./roiReportRepository";

export async function getRetro(id: string): Promise<RetroDocument | null> {
  const db = await getDb();
  const raw = await db.get(STORE_RETROS, id);
  return raw ? migrateRetroDocument(raw) : null;
}

export async function getRetroByBriefId(briefId: string): Promise<RetroDocument | null> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_RETROS, "eventBriefId", briefId);
  if (rows.length === 0) return null;
  return migrateRetroDocument([...rows].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0]);
}

export async function listRetros(): Promise<RetroDocument[]> {
  const db = await getDb();
  const rows = await db.getAll(STORE_RETROS);
  return rows.map(migrateRetroDocument).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function saveRetro(retro: RetroDocument): Promise<RetroDocument> {
  const next = { ...retro, version: retro.version + 1, updatedAt: nowIso() };
  const db = await getDb();
  await db.put(STORE_RETROS, next);
  return next;
}

export async function deleteRetro(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_RETROS, id);
}

/* -------------------------------------------------------------------------- */
/* Ingestion — read-only against PRD 3, 4 and 6                                */
/* -------------------------------------------------------------------------- */

/** FR-3 — the issue log from the logistics pack, if one exists. */
export async function ingestIssueLog(briefId: string): Promise<IngestedIssueLogSummary> {
  const pack = await getPackByBriefId(briefId);
  if (!pack) return EMPTY_ISSUE_LOG;
  const entries = pack.issueLog ?? [];
  return {
    available: true,
    logisticsPackId: pack.id,
    totalIssues: entries.length,
    bySeverity: {
      low: entries.filter((e) => e.severity === "low").length,
      medium: entries.filter((e) => e.severity === "medium").length,
      high: entries.filter((e) => e.severity === "high").length,
    },
    openAtIngestion: entries.filter((e) => e.status === "open").length,
    entries,
  };
}

/** FR-4 — budget variance via PRD 4's own function. No variance math is re-derived here. */
export async function ingestBudgetVariance(brief: EventBrief): Promise<{
  summary: IngestedBudgetVarianceSummary;
  thresholdPct: number;
}> {
  const settings = await getBudgetSettings(brief.id);
  if (!settings) return { summary: EMPTY_BUDGET_VARIANCE, thresholdPct: 10 };

  const lineItems = await getLineItems(brief.id);
  const budgetSummary = computeBudgetActualsSummary(lineItems, settings, brief);

  const worst = [...budgetSummary.spendByCategory]
    .filter((c) => c.budgeted !== 0 || c.actual !== 0)
    .sort((a, b) => Math.abs(b.variancePct ?? 0) - Math.abs(a.variancePct ?? 0))
    .slice(0, 3);

  return {
    summary: {
      available: true,
      totalBudgeted: budgetSummary.totalBudgeted,
      totalActual: budgetSummary.totalActual,
      variancePct: budgetSummary.variancePct,
      worstCategoryVariances: worst,
      varianceAtClose: budgetSummary.varianceAtClose,
    },
    thresholdPct: settings.defaultVarianceThresholdPct,
  };
}

/** FR-5 — the ROI scorecard, labelled draft or final to match its source. */
export async function ingestRoiScorecard(briefId: string): Promise<IngestedRoiScorecardSummary> {
  const report = await getReportByBriefId(briefId);
  if (!report || !report.scorecard) return EMPTY_ROI_SCORECARD;
  return {
    available: true,
    roiReportId: report.id,
    reportStatus: report.status,
    recommendation: report.scorecard.recommendation,
    recommendationRationale: report.scorecard.recommendationRationale,
    scorePct: report.scorecard.scorePct,
    dimensions: report.scorecard.dimensions,
    npsScore: report.surveySummary?.npsScore ?? null,
  };
}

/**
 * FR-1/FR-6 — find the brief's retro or build one, ingesting all three sources and seeding
 * candidate lessons from them. Idempotent: opening an existing retro re-reads nothing and
 * regenerates nothing, so the planner's edits are never overwritten.
 */
export async function findOrCreateRetro(brief: EventBrief): Promise<RetroDocument> {
  const existing = await getRetroByBriefId(brief.id);
  if (existing) return existing;

  const [issueLog, budget, roi] = await Promise.all([
    ingestIssueLog(brief.id),
    ingestBudgetVariance(brief),
    ingestRoiScorecard(brief.id),
  ]);

  const timestamp = nowIso();
  const retro: RetroDocument = {
    schemaVersion: CURRENT_RETRO_SCHEMA_VERSION,
    id: newId(),
    eventBriefId: brief.id,
    eventName: brief.name || "Untitled event",
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    version: 1,
    ingestedIssueLogSummary: issueLog,
    ingestedBudgetVarianceSummary: budget.summary,
    ingestedRoiScorecardSummary: roi,
    lessons: generateCandidateLessons(brief.id, issueLog, budget.summary, roi, budget.thresholdPct),
    successMetricAdjustments: [],
  };

  const db = await getDb();
  await db.put(STORE_RETROS, retro);
  return retro;
}

/** Re-run ingestion on an open retro without touching the planner's lessons. */
export async function refreshIngestion(retro: RetroDocument, brief: EventBrief): Promise<RetroDocument> {
  const [issueLog, budget, roi] = await Promise.all([
    ingestIssueLog(brief.id),
    ingestBudgetVariance(brief),
    ingestRoiScorecard(brief.id),
  ]);
  return saveRetro({
    ...retro,
    ingestedIssueLogSummary: issueLog,
    ingestedBudgetVarianceSummary: budget.summary,
    ingestedRoiScorecardSummary: roi,
  });
}
