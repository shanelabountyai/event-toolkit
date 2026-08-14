// packages/roi-report-core/src/attribution.ts
//
// The single most load-bearing rule in this tool: was this opportunity created *because of*
// the event, merely alongside it, or nothing to do with it?
//
// It is a binary timing split, deliberately not a weighted multi-touch model — v1 has no
// cross-channel touchpoint history to model against, so a model would be false precision.

import { addDaysToIsoDate } from "@event-toolkit/schema";
import type {
  AttributionResult,
  AttributionSettings,
  AttributionType,
  PipelineOpportunity,
  PipelineSummary,
} from "./types";

export interface EventWindow {
  eventStartDate: string;
  eventEndDate: string;
}

/**
 * Classify by created date alone.
 *
 * Anything created between the event's start and the sourced cut-off is sourced. Anything else
 * inside the influenced window is influenced — including opportunities created *before* the event,
 * which is the pre-existing pipeline the event may have moved along.
 *
 * **The influenced window is symmetric, and that is a correction.** It previously had no lower
 * bound: `createdDate <= influencedWindowEnd` counted an opportunity created at any point in the
 * past, however old. For a hosted webinar — where the invite list is deliberately your existing
 * open pipeline — the event then claimed influence on essentially every deal in flight, including
 * ones opened years earlier. That is the kind of overclaim a CFO finds, and finding it discredits
 * every other number on the page.
 *
 * A deal opened the same number of days *before* the event as the window allows after it could
 * plausibly have been moved by attending. One opened three years before was not.
 */
export function computeAttribution(
  createdDate: string,
  window: EventWindow,
  settings: Pick<AttributionSettings, "sourcedWindowDays" | "influencedWindowDays">,
): AttributionResult {
  if (!createdDate || !window.eventStartDate || !window.eventEndDate) return "outside_window";

  const sourcedWindowEnd = addDaysToIsoDate(window.eventEndDate, settings.sourcedWindowDays);
  const influencedWindowEnd = addDaysToIsoDate(window.eventEndDate, settings.influencedWindowDays);
  const influencedWindowStart = addDaysToIsoDate(
    window.eventStartDate,
    -settings.influencedWindowDays,
  );

  // ISO dates compare correctly as strings, which keeps this free of timezone drift.
  if (createdDate >= window.eventStartDate && createdDate <= sourcedWindowEnd) return "sourced";
  if (createdDate >= influencedWindowStart && createdDate <= influencedWindowEnd) {
    return "influenced";
  }
  return "outside_window";
}

/**
 * The value the report actually counts.
 *
 * A CRM's own attribution column wins when the planner has enabled that — but it can never
 * resurrect a row the timing rule puts outside the window. If a CRM insists an opportunity
 * created six months later was "sourced" by the event, that is a data-quality flag to show,
 * not a number to silently trust.
 */
export function effectiveAttribution(
  computed: AttributionResult,
  imported: AttributionType | null | undefined,
  settings: Pick<AttributionSettings, "useExplicitAttributionTypeColumn">,
): AttributionResult {
  if (computed === "outside_window") return "outside_window";
  if (settings.useExplicitAttributionTypeColumn && imported) return imported;
  return computed;
}

/** True when the CRM's column disagrees with the timing rule — surfaced, never hidden. */
export function hasAttributionDisagreement(row: PipelineOpportunity): boolean {
  return Boolean(row.importedAttributionType && row.importedAttributionType !== row.computedAttributionType);
}

/**
 * FR-5 — recompute every row's classification after a settings change. No re-import needed,
 * and `effectiveAttributionType` is recomputed alongside `computedAttributionType`; updating
 * only one of the two is the obvious way to get this subtly wrong.
 */
export function reclassifyOpportunities(
  rows: PipelineOpportunity[],
  window: EventWindow,
  settings: AttributionSettings,
  timestamp: string,
): PipelineOpportunity[] {
  return rows.map((row) => {
    const computed = computeAttribution(row.createdDate, window, settings);
    const effective = effectiveAttribution(computed, row.importedAttributionType, settings);
    if (computed === row.computedAttributionType && effective === row.effectiveAttributionType) {
      return row;
    }
    return {
      ...row,
      computedAttributionType: computed,
      effectiveAttributionType: effective,
      updatedAt: timestamp,
    };
  });
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Roll pipeline rows up. Outside-window rows are counted, never dropped. */
export function computePipelineSummary(rows: PipelineOpportunity[]): PipelineSummary {
  const opportunities = rows.filter((r) => r.recordType === "opportunity");
  const meetings = rows.filter((r) => r.recordType === "meeting");
  const sourced = rows.filter((r) => r.effectiveAttributionType === "sourced");
  const influenced = rows.filter((r) => r.effectiveAttributionType === "influenced");
  const won = rows.filter((r) => r.isWon);
  const checked = rows.filter((r) => r.leadMatchStatus !== "not_checked");

  const sum = (list: PipelineOpportunity[]) =>
    round2(list.reduce((total, row) => total + (Number.isFinite(row.amount) ? row.amount : 0), 0));

  return {
    opportunitiesCount: opportunities.length,
    meetingsCount: meetings.length,
    sourcedCount: sourced.length,
    sourcedAmount: sum(sourced),
    influencedCount: influenced.length,
    influencedAmount: sum(influenced),
    outsideWindowCount: rows.filter((r) => r.effectiveAttributionType === "outside_window").length,
    wonCount: won.length,
    wonAmount: sum(won),
    leadMatchRatePct:
      checked.length === 0
        ? null
        : Math.round((checked.filter((r) => r.leadMatchStatus === "matched").length / checked.length) * 100),
  };
}

/**
 * Informational only (FR-4): does this opportunity's contact email appear in the event's lead
 * pool? It never affects attribution — a real opportunity whose contact wasn't scanned at the
 * booth is still a real opportunity.
 */
export function markLeadMatches(
  rows: PipelineOpportunity[],
  leadEmails: string[],
): PipelineOpportunity[] {
  if (leadEmails.length === 0) {
    return rows.map((row) => ({ ...row, leadMatchStatus: "not_checked" as const }));
  }
  const known = new Set(leadEmails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  return rows.map((row) => {
    const email = row.contactEmail?.trim().toLowerCase();
    return {
      ...row,
      leadMatchStatus: !email ? ("not_checked" as const) : known.has(email) ? ("matched" as const) : ("unmatched" as const),
    };
  });
}
