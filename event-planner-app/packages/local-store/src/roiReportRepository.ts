/**
 * ROI report repository (PRD 6).
 *
 * Reads upstream tools through their own existing functions — `getBrief`, `getLineItems` /
 * `getBudgetSettings`, `listSessions` / `listLeads` — rather than opening their stores
 * directly. This tool writes to none of them; the sole exception in the suite is
 * `successMetrics[].actual`, which goes through `saveBrief` from the finalize flow.
 */

import { nowIso, type EventBrief } from "@event-toolkit/schema";
import { computeBudgetActualsSummary, type BudgetActualsSummary } from "@event-toolkit/budget-calc";
import type {
  AttributionSettings,
  PipelineImportBatch,
  PipelineOpportunity,
  RoiReport,
  SurveyImportBatch,
  SurveyResponse,
} from "@event-toolkit/roi-report-core";
import { DEFAULT_ATTRIBUTION_SETTINGS } from "@event-toolkit/roi-report-core";
import {
  getDb,
  STORE_ATTRIBUTION_SETTINGS,
  STORE_PIPELINE_IMPORT_BATCHES,
  STORE_PIPELINE_OPPORTUNITIES,
  STORE_ROI_REPORTS,
  STORE_SURVEY_IMPORT_BATCHES,
  STORE_SURVEY_RESPONSES,
} from "./db";
import { getBudgetSettings, getLineItems } from "./budgetRepository";
import { listLeads, listSessions } from "./leadRepository";

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

export async function getReport(id: string): Promise<RoiReport | null> {
  const db = await getDb();
  return (await db.get(STORE_ROI_REPORTS, id)) ?? null;
}

/** FR-1 — one active report per brief. The oldest wins if a duplicate ever slipped in. */
export async function getReportByBriefId(briefId: string): Promise<RoiReport | null> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_ROI_REPORTS, "eventBriefId", briefId);
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
}

export async function listReports(): Promise<RoiReport[]> {
  const db = await getDb();
  const rows = await db.getAll(STORE_ROI_REPORTS);
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function saveReport(report: RoiReport): Promise<RoiReport> {
  const next = { ...report, updatedAt: nowIso() };
  const db = await getDb();
  await db.put(STORE_ROI_REPORTS, next);
  return next;
}

export async function deleteReport(id: string): Promise<void> {
  const db = await getDb();
  const [opportunities, pipelineBatches, responses, surveyBatches] = await Promise.all([
    db.getAllFromIndex(STORE_PIPELINE_OPPORTUNITIES, "roiReportId", id),
    db.getAllFromIndex(STORE_PIPELINE_IMPORT_BATCHES, "roiReportId", id),
    db.getAllFromIndex(STORE_SURVEY_RESPONSES, "roiReportId", id),
    db.getAllFromIndex(STORE_SURVEY_IMPORT_BATCHES, "roiReportId", id),
  ]);

  const tx = db.transaction(
    [
      STORE_ROI_REPORTS,
      STORE_PIPELINE_OPPORTUNITIES,
      STORE_PIPELINE_IMPORT_BATCHES,
      STORE_SURVEY_RESPONSES,
      STORE_SURVEY_IMPORT_BATCHES,
    ],
    "readwrite",
  );
  await tx.objectStore(STORE_ROI_REPORTS).delete(id);
  for (const row of opportunities) await tx.objectStore(STORE_PIPELINE_OPPORTUNITIES).delete(row.id);
  for (const row of pipelineBatches) await tx.objectStore(STORE_PIPELINE_IMPORT_BATCHES).delete(row.id);
  for (const row of responses) await tx.objectStore(STORE_SURVEY_RESPONSES).delete(row.id);
  for (const row of surveyBatches) await tx.objectStore(STORE_SURVEY_IMPORT_BATCHES).delete(row.id);
  await tx.done;
}

/* -------------------------------------------------------------------------- */
/* Pipeline + survey data                                                      */
/* -------------------------------------------------------------------------- */

export async function listPipelineOpportunities(reportId: string): Promise<PipelineOpportunity[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_PIPELINE_OPPORTUNITIES, "roiReportId", reportId);
  return rows.sort((a, b) => (a.createdDate < b.createdDate ? -1 : 1));
}

/** Replaces the report's whole set, so a dedupe-on-recordId merge can remove rows. */
export async function savePipelineOpportunitiesBulk(
  reportId: string,
  rows: PipelineOpportunity[],
): Promise<PipelineOpportunity[]> {
  const db = await getDb();
  const existing = await db.getAllFromIndex(STORE_PIPELINE_OPPORTUNITIES, "roiReportId", reportId);
  const keep = new Set(rows.map((row) => row.id));
  const tx = db.transaction(STORE_PIPELINE_OPPORTUNITIES, "readwrite");
  for (const row of existing) {
    if (!keep.has(row.id)) await tx.store.delete(row.id);
  }
  for (const row of rows) await tx.store.put(row);
  await tx.done;
  return rows;
}

export async function savePipelineImportBatch(batch: PipelineImportBatch): Promise<PipelineImportBatch> {
  const db = await getDb();
  await db.put(STORE_PIPELINE_IMPORT_BATCHES, batch);
  return batch;
}

export async function listPipelineImportBatches(reportId: string): Promise<PipelineImportBatch[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_PIPELINE_IMPORT_BATCHES, "roiReportId", reportId);
}

export async function listSurveyResponses(reportId: string): Promise<SurveyResponse[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_SURVEY_RESPONSES, "roiReportId", reportId);
}

export async function saveSurveyResponsesBulk(rows: SurveyResponse[]): Promise<SurveyResponse[]> {
  const db = await getDb();
  const tx = db.transaction(STORE_SURVEY_RESPONSES, "readwrite");
  for (const row of rows) await tx.store.put(row);
  await tx.done;
  return rows;
}

export async function saveSurveyImportBatch(batch: SurveyImportBatch): Promise<SurveyImportBatch> {
  const db = await getDb();
  await db.put(STORE_SURVEY_IMPORT_BATCHES, batch);
  return batch;
}

export async function listSurveyImportBatches(reportId: string): Promise<SurveyImportBatch[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_SURVEY_IMPORT_BATCHES, "roiReportId", reportId);
}

/* -------------------------------------------------------------------------- */
/* Attribution settings                                                        */
/* -------------------------------------------------------------------------- */

/** Lazily creates the single default row on first read — no separate init step. */
export async function getAttributionSettings(): Promise<AttributionSettings> {
  const db = await getDb();
  const existing = await db.get(STORE_ATTRIBUTION_SETTINGS, DEFAULT_ATTRIBUTION_SETTINGS.id);
  if (existing) return existing;
  const created: AttributionSettings = { ...DEFAULT_ATTRIBUTION_SETTINGS, updatedAt: nowIso() };
  await db.put(STORE_ATTRIBUTION_SETTINGS, created);
  return created;
}

export async function saveAttributionSettings(settings: AttributionSettings): Promise<AttributionSettings> {
  const next = { ...settings, updatedAt: nowIso() };
  const db = await getDb();
  await db.put(STORE_ATTRIBUTION_SETTINGS, next);
  return next;
}

/* -------------------------------------------------------------------------- */
/* Read-only views of upstream tools                                           */
/* -------------------------------------------------------------------------- */

/**
 * FR-2 — the budget seam. Calls PRD 4's own function; no spend or variance math is
 * reimplemented here. Returns null when the brief has no budget, so the UI can say "not
 * available" rather than showing a persuasive zero.
 */
export async function loadBudgetSummary(brief: EventBrief): Promise<BudgetActualsSummary | null> {
  const settings = await getBudgetSettings(brief.id);
  if (!settings) return null;
  const lineItems = await getLineItems(brief.id);
  return computeBudgetActualsSummary(lineItems, settings, brief);
}

export interface LeadSourceOption {
  sessionId: string;
  eventName: string;
  leadCount: number;
  emails: string[];
}

/** FR-3 — triage sessions linked to this brief. Read-only against PRD 5. */
export async function loadLeadSources(briefId: string): Promise<LeadSourceOption[]> {
  const sessions = (await listSessions()).filter((session) => session.eventBriefId === briefId);
  const options: LeadSourceOption[] = [];
  for (const session of sessions) {
    const leads = await listLeads(session.id);
    options.push({
      sessionId: session.id,
      eventName: session.eventName,
      leadCount: leads.length,
      emails: leads.map((lead) => lead.contact.email ?? "").filter(Boolean),
    });
  }
  return options;
}
