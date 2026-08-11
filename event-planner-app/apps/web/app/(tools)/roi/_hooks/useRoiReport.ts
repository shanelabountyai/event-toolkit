"use client";

/**
 * Loads a report and everything it derives from, and recomputes the whole report object
 * whenever any input changes.
 *
 * Recomputation is centralised deliberately: the scorecard, cost figures and executive
 * summary are all functions of the same four inputs, and letting individual panels compute
 * their own would be how they start disagreeing with each other.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventBrief } from "@event-toolkit/schema";
import {
  computeCostSummary,
  computePipelineSummary,
  computeScorecard,
  computeSurveySummary,
  computeYoyDeltas,
  markLeadMatches,
  reclassifyOpportunities,
  renderExecutiveSummary,
  suggestComparator,
  type AttributionSettings,
  type ComparatorCandidate,
  type CostSummary,
  type PipelineOpportunity,
  type RoiReport,
  type SurveyResponse,
} from "@event-toolkit/roi-report-core";
import {
  getAttributionSettings,
  getBrief,
  getReport,
  listBriefs,
  listPipelineOpportunities,
  listReports,
  listSurveyResponses,
  loadBudgetSummary,
  loadLeadSources,
  logUsageEvent,
  saveAttributionSettings,
  savePipelineOpportunitiesBulk,
  saveReport,
  type LeadSourceOption,
} from "@event-toolkit/local-store";

export interface RoiState {
  report: RoiReport | null;
  brief: EventBrief | null;
  opportunities: PipelineOpportunity[];
  responses: SurveyResponse[];
  settings: AttributionSettings | null;
  leadSources: LeadSourceOption[];
  comparators: ComparatorCandidate[];
  loading: boolean;
  notFound: boolean;
  refresh: () => Promise<void>;
  updateSettings: (next: AttributionSettings) => Promise<void>;
  setLeadSource: (mode: CostSummary["leadSourceMode"], sessionId: string | null, manualCount: number | null) => Promise<void>;
  setComparator: (comparator: ComparatorCandidate | null) => Promise<void>;
  saveReportPatch: (patch: Partial<RoiReport>) => Promise<RoiReport | null>;
}

export function useRoiReport(reportId: string): RoiState {
  const [report, setReport] = useState<RoiReport | null>(null);
  const [brief, setBrief] = useState<EventBrief | null>(null);
  const [opportunities, setOpportunities] = useState<PipelineOpportunity[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [settings, setSettings] = useState<AttributionSettings | null>(null);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);
  const [comparators, setComparators] = useState<ComparatorCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const loaded = await getReport(reportId);
    if (!loaded) {
      setNotFound(true);
      return;
    }
    const linkedBrief = await getBrief(loaded.eventBriefId);
    const [rows, surveyRows, attributionSettings, sources] = await Promise.all([
      listPipelineOpportunities(reportId),
      listSurveyResponses(reportId),
      getAttributionSettings(),
      loadLeadSources(loaded.eventBriefId),
    ]);

    // Every other finalized report is a potential YoY comparator.
    const [allReports, allBriefs] = await Promise.all([listReports(), listBriefs()]);
    const candidates: ComparatorCandidate[] = [];
    for (const other of allReports) {
      const otherBrief = allBriefs.find((b) => b.id === other.eventBriefId);
      if (otherBrief) candidates.push({ brief: otherBrief, report: other, sameType: false });
    }

    setReport(loaded);
    setBrief(linkedBrief);
    setOpportunities(rows);
    setResponses(surveyRows);
    setSettings(attributionSettings);
    setLeadSources(sources);
    setComparators(candidates);
  }, [reportId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  /** Everything derived, in one place so no two panels can disagree. */
  const derived = useMemo(() => {
    if (!report || !brief) return null;

    const pipelineSummary = opportunities.length > 0 ? computePipelineSummary(opportunities) : null;
    const surveySummary = responses.length > 0 ? computeSurveySummary(responses) : null;

    const chosenSource =
      report.leadSessionId ? leadSources.find((s) => s.sessionId === report.leadSessionId) : undefined;
    const autoSource = leadSources.length === 1 ? leadSources[0] : undefined;
    const totalLeads =
      report.manualLeadCount ?? chosenSource?.leadCount ?? autoSource?.leadCount ?? null;
    const leadSourceMode: CostSummary["leadSourceMode"] =
      report.manualLeadCount !== null && report.manualLeadCount !== undefined
        ? "manual_entry"
        : chosenSource
          ? "planner_selected_session"
          : autoSource
            ? "auto_single_session"
            : "unavailable";

    const costSummary = computeCostSummary(report.budgetSummary, totalLeads, pipelineSummary, leadSourceMode);
    const scorecard = computeScorecard({
      budgetSummary: report.budgetSummary,
      pipelineSummary,
      surveySummary,
      costSummary,
      successMetrics: brief.successMetrics,
    });

    return { pipelineSummary, surveySummary, costSummary, scorecard };
  }, [report, brief, opportunities, responses, leadSources]);

  /** Fold the derived values back onto the report object the panels render from. */
  const composed = useMemo(() => {
    if (!report || !derived) return report;
    const next: RoiReport = {
      ...report,
      pipelineSummary: derived.pipelineSummary,
      surveySummary: derived.surveySummary,
      costSummary: derived.costSummary,
      scorecard: derived.scorecard,
    };
    return { ...next, executiveSummaryText: renderExecutiveSummary(next) };
  }, [report, derived]);

  const saveReportPatch = useCallback(
    async (patch: Partial<RoiReport>) => {
      if (!report) return null;
      const saved = await saveReport({ ...report, ...patch });
      setReport(saved);
      return saved;
    },
    [report],
  );

  /** FR-5 — a settings change reclassifies every stored row, no re-import. */
  const updateSettings = useCallback(
    async (next: AttributionSettings) => {
      const saved = await saveAttributionSettings(next);
      setSettings(saved);
      if (!brief) return;
      const window = {
        eventStartDate: brief.dates?.eventStartDate ?? "",
        eventEndDate: brief.dates?.eventEndDate ?? "",
      };
      const reclassified = reclassifyOpportunities(opportunities, window, saved, new Date().toISOString());
      await savePipelineOpportunitiesBulk(reportId, reclassified);
      setOpportunities(reclassified);
      await logUsageEvent({
        type: "attribution_settings_changed",
        briefId: brief.id,
        details: { sourced: saved.sourcedWindowDays, influenced: saved.influencedWindowDays },
      });
    },
    [brief, opportunities, reportId],
  );

  const setLeadSource = useCallback(
    async (mode: CostSummary["leadSourceMode"], sessionId: string | null, manualCount: number | null) => {
      await saveReportPatch({
        leadSessionId: mode === "planner_selected_session" ? sessionId : null,
        manualLeadCount: mode === "manual_entry" ? manualCount : null,
      });
      // Cross-check pipeline contacts against the chosen pool (informational only).
      const source = leadSources.find((s) => s.sessionId === sessionId) ?? (leadSources.length === 1 ? leadSources[0] : undefined);
      if (source && opportunities.length > 0) {
        const marked = markLeadMatches(opportunities, source.emails);
        await savePipelineOpportunitiesBulk(reportId, marked);
        setOpportunities(marked);
      }
    },
    [saveReportPatch, leadSources, opportunities, reportId],
  );

  const setComparator = useCallback(
    async (comparator: ComparatorCandidate | null) => {
      if (!composed) return;
      if (!comparator) {
        await saveReportPatch({ yoyComparison: null });
        return;
      }
      await saveReportPatch({
        yoyComparison: computeYoyDeltas(composed, comparator, "planner_selected"),
      });
      await logUsageEvent({
        type: "yoy_comparator_selected",
        details: { comparator: comparator.brief.name ?? comparator.brief.id },
      });
    },
    [composed, saveReportPatch],
  );

  // Auto-suggest a comparator the first time one becomes available.
  useEffect(() => {
    if (!composed || !brief || composed.yoyComparison || comparators.length === 0) return;
    const suggestion = suggestComparator(brief, comparators);
    if (!suggestion) return;
    void saveReport({
      ...composed,
      yoyComparison: computeYoyDeltas(composed, suggestion, "auto_suggested"),
    }).then(setReport);
  }, [composed, brief, comparators]);

  return {
    report: composed,
    brief,
    opportunities,
    responses,
    settings,
    leadSources,
    comparators,
    loading,
    notFound,
    refresh: load,
    updateSettings,
    setLeadSource,
    setComparator,
    saveReportPatch,
  };
}

/** Budget is loaded once per report and cached on it — it is the seam, so make it explicit. */
export async function refreshBudgetOnReport(report: RoiReport, brief: EventBrief): Promise<RoiReport> {
  const budgetSummary = await loadBudgetSummary(brief);
  return saveReport({ ...report, budgetSummary });
}
