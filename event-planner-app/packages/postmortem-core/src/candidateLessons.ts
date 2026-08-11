// packages/postmortem-core/src/candidateLessons.ts
//
// FR-6 — turn the three ingested inputs into draft lessons.
//
// Every suggested disposition is exactly that: a suggestion, pre-selected in an editable
// dropdown. The tool's job is to make sure nothing that happened gets quietly forgotten, not
// to decide what it meant.
//
// Text is built from deterministic templates with real figures merged in. No AI, same
// convention as every other generated copy in this suite.

import { newId, nowIso, type LessonDisposition } from "@event-toolkit/schema";
import type { IssueLogEntry } from "@event-toolkit/logistics";
import { ARTIFACT_LABELS } from "@event-toolkit/logistics";
import type { CategorySpend } from "@event-toolkit/budget-calc";
import { BUDGET_CATEGORY_LABELS } from "@event-toolkit/schema";
import type {
  IngestedBudgetVarianceSummary,
  IngestedIssueLogSummary,
  IngestedRoiScorecardSummary,
  RetroLesson,
  RetroLessonSourceType,
} from "./retro";

function lesson(
  eventBriefId: string,
  text: string,
  disposition: LessonDisposition,
  sourceType: RetroLessonSourceType,
  category: string,
  sourceRef?: string,
): RetroLesson {
  return {
    id: newId(),
    sourceEventId: eventBriefId,
    category,
    lesson: text,
    addedAt: nowIso(),
    disposition,
    sourceType,
    sourceRef,
    carryForward: true,
  };
}

/** Amber/red bands, matching PRD 4's own rule so the two tools never disagree. */
export function categoryFlag(
  spend: CategorySpend,
  thresholdPct: number,
): "none" | "amber" | "red" {
  if (spend.budgeted === 0 && spend.actual > 0) return "red";
  if (spend.variancePct === null) return "none";
  const magnitude = Math.abs(spend.variancePct);
  if (magnitude >= thresholdPct * 2) return "red";
  if (magnitude >= thresholdPct) return "amber";
  return "none";
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * Candidates from all three sources.
 *
 * The clustering rule is the interesting one: two or more high-severity issues sharing an
 * artifact produce an *additional* pattern-level lesson suggesting drop, on top of the
 * individual entries. Three separate "the scanner broke" notes are a bad day; a pattern
 * across the same artifact is a structural problem, and it should be visible as one.
 */
export function generateCandidateLessons(
  eventBriefId: string,
  issueLog: IngestedIssueLogSummary,
  budget: IngestedBudgetVarianceSummary,
  roi: IngestedRoiScorecardSummary,
  budgetThresholdPct = 10,
): RetroLesson[] {
  const candidates: RetroLesson[] = [];

  /* ---- Issue log ------------------------------------------------------- */
  if (issueLog.available) {
    for (const entry of issueLog.entries) {
      const where = entry.relatedArtifact ? ` (${ARTIFACT_LABELS[entry.relatedArtifact].toLowerCase()})` : "";
      if (entry.severity === "low") {
        candidates.push(
          lesson(
            eventBriefId,
            `Generally worked — minor note: ${entry.description}${where}.`,
            "repeat",
            "issue_log",
            "Logistics",
            entry.id,
          ),
        );
      } else {
        candidates.push(
          lesson(
            eventBriefId,
            `${entry.severity === "high" ? "Significant issue" : "Issue"} on the day: ${entry.description}${where}.${
              entry.resolutionNotes ? ` Resolved by: ${entry.resolutionNotes}.` : " No resolution was recorded."
            }`,
            "fix",
            "issue_log",
            "Logistics",
            entry.id,
          ),
        );
      }
    }

    // Clustered high-severity issues sharing an artifact → one pattern-level lesson.
    const highByArtifact = new Map<string, IssueLogEntry[]>();
    for (const entry of issueLog.entries) {
      if (entry.severity !== "high" || !entry.relatedArtifact) continue;
      highByArtifact.set(entry.relatedArtifact, [
        ...(highByArtifact.get(entry.relatedArtifact) ?? []),
        entry,
      ]);
    }
    for (const [artifact, entries] of highByArtifact) {
      if (entries.length < 2) continue;
      const label = ARTIFACT_LABELS[artifact as keyof typeof ARTIFACT_LABELS] ?? artifact;
      candidates.push(
        lesson(
          eventBriefId,
          `${entries.length} separate high-severity issues all came from ${label.toLowerCase()} — that is a pattern, not bad luck. Rethink how this is run rather than tuning it.`,
          "drop",
          "issue_log",
          "Logistics",
          artifact,
        ),
      );
    }
  }

  /* ---- Budget variance --------------------------------------------------- */
  if (budget.available) {
    for (const spend of budget.worstCategoryVariances) {
      const label = BUDGET_CATEGORY_LABELS[spend.category] ?? spend.category;
      const flag = categoryFlag(spend, budgetThresholdPct);

      if (flag === "red" && spend.budgeted === 0) {
        candidates.push(
          lesson(
            eventBriefId,
            `${label} was never budgeted but cost ${money(spend.actual)}. Either plan for it next time or don't do it.`,
            "drop",
            "budget_variance",
            "Budget",
            spend.category,
          ),
        );
      } else if (flag === "red" || flag === "amber") {
        const over = spend.varianceAmount > 0;
        candidates.push(
          lesson(
            eventBriefId,
            `${label} came in ${money(Math.abs(spend.varianceAmount))} ${over ? "over" : "under"} budget (${Math.round(spend.variancePct ?? 0)}%). Budget ${over ? "more realistically" : "less"} for it next time.`,
            "fix",
            "budget_variance",
            "Budget",
            spend.category,
          ),
        );
      } else if (spend.actual > 0) {
        candidates.push(
          lesson(
            eventBriefId,
            `${label} landed on budget at ${money(spend.actual)}. The estimate was sound — reuse it.`,
            "repeat",
            "budget_variance",
            "Budget",
            spend.category,
          ),
        );
      }
    }
  }

  /* ---- ROI scorecard ------------------------------------------------------ */
  if (roi.available) {
    for (const dimension of roi.dimensions) {
      if (dimension.verdict === "insufficient_data") continue;
      const value = dimension.rawValue === null ? "" : ` (${dimension.rawValue})`;
      if (dimension.verdict === "green") {
        candidates.push(
          lesson(
            eventBriefId,
            `${dimension.label} was strong${value}. Whatever drove that is worth protecting next time.`,
            "repeat",
            "roi_scorecard",
            "Strategy",
            dimension.id,
          ),
        );
      } else {
        candidates.push(
          lesson(
            eventBriefId,
            `${dimension.label} came in ${dimension.verdict === "red" ? "poorly" : "below where it should be"}${value} against ${dimension.thresholdsApplied}. Worth changing how this is approached.`,
            "fix",
            "roi_scorecard",
            "Strategy",
            dimension.id,
          ),
        );
      }
    }

    if (roi.recommendation && roi.recommendation !== "insufficient_data") {
      const disposition: LessonDisposition =
        roi.recommendation === "repeat" ? "repeat" : roi.recommendation === "kill" ? "drop" : "fix";
      const text =
        roi.recommendation === "repeat"
          ? `The ROI report says repeat this event. ${roi.recommendationRationale ?? ""}`.trim()
          : roi.recommendation === "kill"
            ? `The ROI report says kill this event in its current form. ${roi.recommendationRationale ?? ""}`.trim()
            : // "change" must name the weak dimensions, mirroring the scorecard's own language.
              `The ROI report says change this event rather than repeat it. ${roi.recommendationRationale ?? ""}`.trim();
      candidates.push(lesson(eventBriefId, text, disposition, "roi_scorecard", "Strategy", "recommendation"));
    }
  }

  return candidates;
}

/** FR-7 — a manual lesson starts with no suggested disposition; the planner decides. */
export function newManualLesson(eventBriefId: string, disposition: LessonDisposition): RetroLesson {
  return lesson(eventBriefId, "", disposition, "manual", "");
}
