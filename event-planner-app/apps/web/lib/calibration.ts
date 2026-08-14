/**
 * Calibration — what the data says about the suite's documented defaults.
 *
 * Every PRD resolved its open questions with a decisive default flagged
 * "Assumption — pending validation". Those flags have been sitting in the docs unread while
 * the app quietly accumulated exactly the evidence needed to test them: every merge-review
 * decision is a labelled example of whether the dedupe threshold is right, every line item's
 * variance says whether 10%/20% flags signal or wallpaper, every lead score says whether
 * "hot" selects anyone.
 *
 * This module turns that into findings. Three rules it follows:
 *
 *   1. It never concludes below a minimum sample. "Not enough data yet" is the honest and
 *      most common answer, and saying it plainly is the point.
 *   2. It reports what the data shows, and separates that from what to do about it. A
 *      suggestion is a prompt to think, never an instruction.
 *   3. It cannot validate causality. Attribution windows in particular are not empirically
 *      resolvable by a standalone tool — the best available is sensitivity, showing how much
 *      the answer moves when the window does.
 *
 * Pure functions, no React and no storage access, so the check script can exercise them
 * against synthetic data.
 */

import type { BudgetLineItem, BudgetSettings, EventBrief } from "@event-toolkit/schema";
import { computeVariance } from "@event-toolkit/budget-calc";
import type {
  DuplicateCandidate,
  LeadRecord,
  ScoringRule,
  ScoringRubric,
} from "@event-toolkit/lead-triage-core";
import type { PipelineOpportunity, RoiReport, SurveySummary } from "@event-toolkit/roi-report-core";
import { daysBetweenIsoDates } from "@event-toolkit/schema";
import type { RetroDocument } from "@event-toolkit/postmortem-core";
import { RETRO_PROMPT_DELAY_DAYS, RETRO_PROMPT_ESCALATION_DAYS } from "@event-toolkit/postmortem-core";

export type CalibrationStatus =
  /** Nothing recorded yet. */
  | "no_data"
  /** Some data, but not enough to say anything honest. */
  | "too_early"
  /** The evidence is consistent with the default. */
  | "supports"
  /** The evidence gives you a reason to revisit the default. */
  | "questions";

export interface CalibrationFinding {
  id: string;
  prd: number;
  label: string;
  /** The current default, stated in words. */
  assumption: string;
  status: CalibrationStatus;
  sampleSize: number;
  minSample: number;
  /** What the data actually shows. Facts only. */
  evidence: string;
  /** What that might mean. Null when there is nothing to suggest. */
  suggestion: string | null;
}

export interface CalibrationInputs {
  briefs: EventBrief[];
  leads: LeadRecord[];
  rubrics: ScoringRubric[];
  duplicateCandidates: DuplicateCandidate[];
  budgetLineItems: BudgetLineItem[];
  budgetSettings: BudgetSettings[];
  reports: RoiReport[];
  /** Opportunities paired with their event's end date, so offsets can be computed. */
  attributionSamples: Array<{ opportunity: PipelineOpportunity; eventEndDate: string }>;
  surveySummaries: SurveySummary[];
  retros: RetroDocument[];
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function finding(
  base: Omit<CalibrationFinding, "status"> & { status?: CalibrationStatus },
): CalibrationFinding {
  const status: CalibrationStatus =
    base.status ??
    (base.sampleSize === 0 ? "no_data" : base.sampleSize < base.minSample ? "too_early" : "supports");
  return { ...base, status };
}

/* -------------------------------------------------------------------------- */
/* PRD 5 — dedupe threshold                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every fuzzy pair the planner resolved is a labelled example. A high rejection rate means
 * 0.85 is catching too much; zero pairs ever queued across a lot of leads *might* mean it is
 * catching too little, but that one cannot be proved from this side — un-caught duplicates
 * leave no trace.
 */
export function calibrateDedupeThreshold(inputs: CalibrationInputs): CalibrationFinding {
  const resolved = inputs.duplicateCandidates.filter((c) => c.status !== "pending");
  const merged = resolved.filter((c) => c.status === "merged").length;
  const rejected = resolved.filter((c) => c.status === "rejected").length;
  const minSample = 10;

  if (resolved.length < minSample) {
    return finding({
      id: "dedupe-threshold",
      prd: 5,
      label: "Fuzzy duplicate threshold",
      assumption: "A name + company similarity of 0.85 or above is worth a human's review.",
      sampleSize: resolved.length,
      minSample,
      evidence:
        resolved.length === 0
          ? "No fuzzy duplicate pairs have been reviewed yet."
          : `Only ${resolved.length} pair${resolved.length === 1 ? "" : "s"} reviewed so far (${merged} merged, ${rejected} rejected).`,
      suggestion: null,
    });
  }

  const rejectRate = pct(rejected, resolved.length);
  const tooLoose = rejectRate >= 60;

  return finding({
    id: "dedupe-threshold",
    prd: 5,
    label: "Fuzzy duplicate threshold",
    assumption: "A name + company similarity of 0.85 or above is worth a human's review.",
    status: tooLoose ? "questions" : "supports",
    sampleSize: resolved.length,
    minSample,
    evidence: `${resolved.length} pairs reviewed: ${merged} merged (${pct(merged, resolved.length)}%), ${rejected} rejected (${rejectRate}%).`,
    suggestion: tooLoose
      ? `Most pairs it surfaced were not duplicates. Raising the threshold would cut the review queue — but a missed duplicate leaves no trace, so weigh that against the cost of the extra clicks.`
      : `The queue is mostly finding real duplicates, which is what the threshold is for.`,
  });
}

/* -------------------------------------------------------------------------- */
/* PRD 5 — tier thresholds and rubric weights                                  */
/* -------------------------------------------------------------------------- */

export function calibrateLeadTiers(inputs: CalibrationInputs): CalibrationFinding {
  /**
   * A lead that scored zero has still been scored.
   *
   * This filtered on `scoreBreakdown.length > 0`, so a lead where no rule fired was not counted —
   * and those are exactly the leads that say the most about whether the thresholds are right. It
   * under-counted systematically: a triage view showing 17 leads reported 13 here, and the gap is
   * always the least-engaged leads, which on a virtual event is most of them.
   */
  const scored = inputs.leads;
  const minSample = 25;
  const hot = scored.filter((l) => l.tier === "hot").length;
  const warm = scored.filter((l) => l.tier === "warm").length;
  const cold = scored.filter((l) => l.tier === "cold").length;

  if (scored.length < minSample) {
    return finding({
      id: "lead-tiers",
      prd: 5,
      label: "Lead tier thresholds",
      assumption: "Hot at 70 points and above, warm at 40-69, cold below 40.",
      sampleSize: scored.length,
      minSample,
      evidence:
        scored.length === 0
          ? "No leads have been scored yet."
          : `Only ${scored.length} scored leads so far (${hot} hot, ${warm} warm, ${cold} cold).`,
      suggestion: null,
    });
  }

  const hotPct = pct(hot, scored.length);
  // A tier that selects almost nobody, or almost everybody, isn't sorting anything.
  const unhelpful = hotPct < 5 || hotPct > 50;

  return finding({
    id: "lead-tiers",
    prd: 5,
    label: "Lead tier thresholds",
    assumption: "Hot at 70 points and above, warm at 40-69, cold below 40.",
    status: unhelpful ? "questions" : "supports",
    sampleSize: scored.length,
    minSample,
    evidence: `${scored.length} scored leads: ${hotPct}% hot, ${pct(warm, scored.length)}% warm, ${pct(cold, scored.length)}% cold.`,
    suggestion: unhelpful
      ? hotPct < 5
        ? `Almost nothing clears 70, so "hot" isn't giving sales a shortlist. Either the threshold is too high or the rubric under-rewards the signals your events actually capture.`
        : `Over half your leads are hot, which makes the label meaningless as a priority. Raise the threshold or reduce the weights.`
      : `The split gives sales a workable shortlist rather than everything or nothing.`,
  });
}

/**
 * A rule that never fires is dead weight in the rubric — worth knowing before anyone tunes
 * the weights of rules that are actually doing the work.
 */
export function calibrateRubricRules(inputs: CalibrationInputs): CalibrationFinding {
  /**
   * A lead that scored zero has still been scored.
   *
   * This filtered on `scoreBreakdown.length > 0`, so a lead where no rule fired was not counted —
   * and those are exactly the leads that say the most about whether the thresholds are right. It
   * under-counted systematically: a triage view showing 17 leads reported 13 here, and the gap is
   * always the least-engaged leads, which on a virtual event is most of them.
   */
  const scored = inputs.leads;
  const minSample = 25;
  const enabledRules: ScoringRule[] = inputs.rubrics.flatMap((r) => r.rules.filter((rule) => rule.enabled));
  const firedRuleIds = new Set(scored.flatMap((lead) => lead.scoreBreakdown.map((b) => b.ruleId)));
  const neverFired = enabledRules.filter((rule) => !firedRuleIds.has(rule.id));

  if (scored.length < minSample || enabledRules.length === 0) {
    return finding({
      id: "rubric-rules",
      prd: 5,
      label: "Scoring rubric weights",
      assumption: "Demo request +40, booth interactions +10 each (cap 30), sessions +5 each (cap 25), persona match +15.",
      sampleSize: scored.length,
      minSample,
      evidence:
        scored.length === 0
          ? "No leads have been scored yet."
          : `Only ${scored.length} scored leads so far.`,
      suggestion: null,
    });
  }

  return finding({
    id: "rubric-rules",
    prd: 5,
    label: "Scoring rubric weights",
    assumption: "Demo request +40, booth interactions +10 each (cap 30), sessions +5 each (cap 25), persona match +15.",
    status: neverFired.length > 0 ? "questions" : "supports",
    sampleSize: scored.length,
    minSample,
    evidence:
      neverFired.length === 0
        ? `All ${enabledRules.length} enabled rules contributed points to at least one lead.`
        : `${neverFired.length} enabled rule${neverFired.length === 1 ? "" : "s"} never scored anything: ${neverFired.map((r) => r.label).join(", ")}.`,
    suggestion:
      neverFired.length > 0
        ? `Either your imports don't carry those signals, or the rule is mis-mapped. A rule that never fires is not a weighting problem — check the column mapping before touching any numbers.`
        : `Every rule is contributing, so the weights are worth tuning rather than the rule set.`,
  });
}

/* -------------------------------------------------------------------------- */
/* PRD 4 — variance thresholds and reforecast sensitivity                      */
/* -------------------------------------------------------------------------- */

/**
 * A flag that fires on almost every line is wallpaper; one that never fires is decoration.
 * Either way the planner stops reading it, which is the actual failure mode.
 */
export function calibrateVarianceThresholds(inputs: CalibrationInputs): CalibrationFinding {
  const withActuals = inputs.budgetLineItems.filter((item) => item.actualAmount > 0);
  const minSample = 20;

  const settingsFor = (item: BudgetLineItem) =>
    inputs.budgetSettings.find((s) => s.eventBriefId === item.eventBriefId) ?? {
      defaultVarianceThresholdPct: 10,
    };
  const flags = withActuals.map((item) => computeVariance(item, settingsFor(item)).flag);
  const flagged = flags.filter((f) => f !== "none").length;

  if (withActuals.length < minSample) {
    return finding({
      id: "variance-thresholds",
      prd: 4,
      label: "Budget variance thresholds",
      assumption: "Amber at 10% off budget, red at 20%.",
      sampleSize: withActuals.length,
      minSample,
      evidence:
        withActuals.length === 0
          ? "No budget line items have actuals recorded yet."
          : `Only ${withActuals.length} line items with actuals so far (${flagged} flagged).`,
      suggestion: null,
    });
  }

  const flaggedPct = pct(flagged, withActuals.length);
  const noisy = flaggedPct >= 60;
  const silent = flaggedPct === 0;

  return finding({
    id: "variance-thresholds",
    prd: 4,
    label: "Budget variance thresholds",
    assumption: "Amber at 10% off budget, red at 20%.",
    status: noisy || silent ? "questions" : "supports",
    sampleSize: withActuals.length,
    minSample,
    evidence: `${flaggedPct}% of ${withActuals.length} line items with actuals carry a flag (${flags.filter((f) => f === "red").length} red, ${flags.filter((f) => f === "amber").length} amber).`,
    suggestion: noisy
      ? `When most lines are flagged, the flag stops meaning anything and people stop looking. Widening to 15%/30% would leave the genuine outliers visible.`
      : silent
        ? `Nothing has ever flagged. Either your estimates are unusually good or the threshold is too wide to catch anything — check a few lines by hand before trusting the silence.`
        : `A minority of lines flag, which is what makes the flag worth reading.`,
  });
}

export function calibrateReforecastSensitivity(inputs: CalibrationInputs): CalibrationFinding {
  const events = inputs.budgetSettings.flatMap((s) => s.reforecastHistory ?? []);
  const minSample = 5;
  const dismissed = events.filter((e) => e.action === "dismissed").length;

  if (events.length < minSample) {
    return finding({
      id: "reforecast-sensitivity",
      prd: 4,
      label: "Reforecast trigger sensitivity",
      assumption: "A 15% swing in headcount or capacity prompts a reforecast; any change to dates, mode or total budget always does.",
      sampleSize: events.length,
      minSample,
      evidence:
        events.length === 0
          ? "No reforecast prompts have fired yet."
          : `Only ${events.length} prompt${events.length === 1 ? "" : "s"} so far (${dismissed} dismissed).`,
      suggestion: null,
    });
  }

  const dismissRate = pct(dismissed, events.length);
  const tooSensitive = dismissRate >= 70;

  return finding({
    id: "reforecast-sensitivity",
    prd: 4,
    label: "Reforecast trigger sensitivity",
    assumption: "A 15% swing in headcount or capacity prompts a reforecast; any change to dates, mode or total budget always does.",
    status: tooSensitive ? "questions" : "supports",
    sampleSize: events.length,
    minSample,
    evidence: `${events.length} prompts fired, ${dismissRate}% dismissed without a reforecast.`,
    suggestion: tooSensitive
      ? `Most prompts were dismissed, which is how a prompt trains people to ignore it. Raising the headcount trigger above 15% would fire less often on changes that don't move the budget.`
      : `Most prompts led to an actual reforecast, so they are landing on changes that matter.`,
  });
}

/* -------------------------------------------------------------------------- */
/* PRD 6 — attribution windows (sensitivity, not validation)                   */
/* -------------------------------------------------------------------------- */

export interface AttributionSensitivityRow {
  sourcedWindowDays: number;
  sourcedCount: number;
  sourcedAmount: number;
}

/**
 * How much the headline number moves as the window moves.
 *
 * This is deliberately NOT presented as validation. Which opportunities the event actually
 * caused is not knowable from a CSV of created dates — no window setting makes it knowable.
 * What this can show is fragility: if sourced pipeline doubles between a 20- and 40-day
 * window, the number is a choice, and it should be quoted as one.
 */
export function attributionSensitivity(
  inputs: CalibrationInputs,
  windows: number[] = [7, 14, 30, 45, 60, 90],
): AttributionSensitivityRow[] {
  return windows.map((sourcedWindowDays) => {
    const within = inputs.attributionSamples.filter(({ opportunity, eventEndDate }) => {
      const offset = daysBetweenIsoDates(eventEndDate, opportunity.createdDate);
      return offset >= 0 && offset <= sourcedWindowDays;
    });
    return {
      sourcedWindowDays,
      sourcedCount: within.length,
      sourcedAmount: Math.round(within.reduce((sum, s) => sum + (s.opportunity.amount || 0), 0)),
    };
  });
}

export function calibrateAttributionWindow(inputs: CalibrationInputs): CalibrationFinding {
  const minSample = 20;
  const samples = inputs.attributionSamples;

  if (samples.length < minSample) {
    return finding({
      id: "attribution-window",
      prd: 6,
      label: "Sourced attribution window",
      assumption: "Opportunities created within 30 days of the event are sourced by it; within 90 days, influenced.",
      sampleSize: samples.length,
      minSample,
      evidence:
        samples.length === 0
          ? "No pipeline data has been imported yet."
          : `Only ${samples.length} opportunit${samples.length === 1 ? "y" : "ies"} imported so far.`,
      suggestion: null,
    });
  }

  const rows = attributionSensitivity(inputs);
  const at30 = rows.find((r) => r.sourcedWindowDays === 30)!;
  const at14 = rows.find((r) => r.sourcedWindowDays === 14)!;
  const at60 = rows.find((r) => r.sourcedWindowDays === 60)!;
  const spread = at30.sourcedAmount === 0 ? 0 : Math.round(((at60.sourcedAmount - at14.sourcedAmount) / at30.sourcedAmount) * 100);

  return finding({
    id: "attribution-window",
    prd: 6,
    label: "Sourced attribution window",
    assumption: "Opportunities created within 30 days of the event are sourced by it; within 90 days, influenced.",
    // Never "supports": this assumption cannot be confirmed by data, only characterised.
    status: "questions",
    sampleSize: samples.length,
    minSample,
    evidence: `Sourced pipeline is ${at14.sourcedAmount.toLocaleString()} at a 14-day window, ${at30.sourcedAmount.toLocaleString()} at 30, ${at60.sourcedAmount.toLocaleString()} at 60 — a ${Math.abs(spread)}% swing across that range.`,
    suggestion:
      Math.abs(spread) >= 50
        ? `The headline number depends heavily on a window nobody has validated. Quote sourced pipeline with the window stated, and treat the figure as a choice rather than a measurement. No amount of data settles which opportunities the event caused.`
        : `The number is fairly stable across plausible windows, which is the best available reassurance — it still is not evidence of causation.`,
  });
}

/* -------------------------------------------------------------------------- */
/* PRD 6 — NPS small-sample rule and scorecard coverage                        */
/* -------------------------------------------------------------------------- */

export function calibrateScorecardCoverage(inputs: CalibrationInputs): CalibrationFinding {
  const scored = inputs.reports.filter((r) => r.scorecard);
  const minSample = 3;

  if (scored.length < minSample) {
    return finding({
      id: "scorecard-coverage",
      prd: 6,
      label: "Scorecard dimensions actually scoreable",
      assumption: "Five dimensions, each scoreable once its inputs exist.",
      sampleSize: scored.length,
      minSample,
      evidence:
        scored.length === 0
          ? "No ROI reports have been scored yet."
          : `Only ${scored.length} scored report${scored.length === 1 ? "" : "s"} so far.`,
      suggestion: null,
    });
  }

  const totalDimensions = scored.reduce((sum, r) => sum + (r.scorecard?.dimensions.length ?? 0), 0);
  const insufficient = scored.reduce(
    (sum, r) => sum + (r.scorecard?.dimensions.filter((d) => d.verdict === "insufficient_data").length ?? 0),
    0,
  );
  const gapPct = pct(insufficient, totalDimensions);
  const mostlyUnscoreable = gapPct >= 50;

  return finding({
    id: "scorecard-coverage",
    prd: 6,
    label: "Scorecard dimensions actually scoreable",
    assumption: "Five dimensions, each scoreable once its inputs exist.",
    status: mostlyUnscoreable ? "questions" : "supports",
    sampleSize: scored.length,
    minSample,
    evidence: `Across ${scored.length} reports, ${gapPct}% of dimensions came back "not enough data".`,
    suggestion: mostlyUnscoreable
      ? `The scorecard is mostly abstaining, so the repeat/change/kill call rests on very little. The bands aren't the problem — the missing inputs are. Find which one is usually absent and fix that upstream.`
      : `Most dimensions have the inputs they need, so the bands are actually being exercised.`,
  });
}

export function calibrateNpsSampleRule(inputs: CalibrationInputs): CalibrationFinding {
  const withSurveys = inputs.surveySummaries.filter((s) => s.responseCount > 0);
  const minSample = 3;
  const suppressed = withSurveys.filter((s) => s.npsSmallSample).length;

  return finding({
    id: "nps-sample",
    prd: 6,
    label: "NPS small-sample rule",
    assumption: "Fewer than 5 scored responses is too few to report an NPS.",
    status:
      withSurveys.length < minSample
        ? undefined
        : suppressed >= withSurveys.length / 2
          ? "questions"
          : "supports",
    sampleSize: withSurveys.length,
    minSample,
    evidence:
      withSurveys.length === 0
        ? "No survey data has been imported yet."
        : `${suppressed} of ${withSurveys.length} surveys fell below the 5-response bar.`,
    suggestion:
      withSurveys.length >= minSample && suppressed >= withSurveys.length / 2
        ? `Half your events can't report an NPS at all. The rule is protecting you from a meaningless number, but the real fix is response rate, not the threshold.`
        : null,
  });
}

/* -------------------------------------------------------------------------- */
/* PRD 7 — retro prompt timing                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Says what is actually true about the sample, including the retros that exist but cannot inform
 * timing. Silence about them is what made the page look like it had lost somebody's work.
 */
function describeRetroSample(usable: number, beforeEvent: number): string {
  const skipped =
    beforeEvent > 0
      ? ` ${beforeEvent} completed retro${beforeEvent === 1 ? " was" : "s were"} finished before the event ended, so ${beforeEvent === 1 ? "it carries" : "they carry"} no timing signal.`
      : "";

  if (usable === 0) {
    return beforeEvent > 0
      ? `No retros completed after an event yet.${skipped}`
      : "No retros have been completed yet.";
  }
  return `Only ${usable} completed retro${usable === 1 ? "" : "s"} so far.${skipped}`;
}

export function calibrateRetroTiming(inputs: CalibrationInputs): CalibrationFinding {
  const completed = inputs.retros.filter((r) => r.status === "completed" && r.completedAt);
  const minSample = 3;

  const allLags = completed
    .map((retro) => {
      const brief = inputs.briefs.find((b) => b.id === retro.eventBriefId);
      const endDate = brief?.dates?.eventEndDate;
      if (!endDate || !retro.completedAt) return null;
      return daysBetweenIsoDates(endDate, retro.completedAt.slice(0, 10));
    })
    .filter((days): days is number => days !== null);

  // A retro finished before its event ended carries no timing signal — it is a dry run, or the
  // event is still in the future. Excluding it from the median is right; reporting "no retros have
  // been completed" because of it is not. A planner who has just completed one reads that and
  // concludes the tool lost their work.
  const lags = allLags.filter((days) => days >= 0);
  const beforeEvent = allLags.length - lags.length;

  if (lags.length < minSample) {
    return finding({
      id: "retro-timing",
      prd: 7,
      label: "Retro prompt timing",
      assumption: `Prompt ${RETRO_PROMPT_DELAY_DAYS} days after the event, escalate at ${RETRO_PROMPT_ESCALATION_DAYS}.`,
      sampleSize: lags.length,
      minSample,
      evidence: describeRetroSample(lags.length, beforeEvent),
      suggestion: null,
    });
  }

  const median = [...lags].sort((a, b) => a - b)[Math.floor(lags.length / 2)];
  const afterEscalation = lags.filter((d) => d > RETRO_PROMPT_ESCALATION_DAYS).length;
  const late = afterEscalation >= lags.length / 2;

  return finding({
    id: "retro-timing",
    prd: 7,
    label: "Retro prompt timing",
    assumption: `Prompt ${RETRO_PROMPT_DELAY_DAYS} days after the event, escalate at ${RETRO_PROMPT_ESCALATION_DAYS}.`,
    status: late ? "questions" : "supports",
    sampleSize: lags.length,
    minSample,
    evidence: `Median ${median} days from event end to completed retro, across ${lags.length} retros. ${afterEscalation} finished after the ${RETRO_PROMPT_ESCALATION_DAYS}-day escalation.`,
    suggestion: late
      ? `Retros are mostly landing after the escalation fires, so the current timing isn't changing behaviour. Either prompt earlier, or accept that a retro is a scheduled meeting rather than something a banner produces.`
      : `Retros are mostly done before the escalation, which is what the prompt is for.`,
  });
}

/* -------------------------------------------------------------------------- */

export function runCalibration(inputs: CalibrationInputs): CalibrationFinding[] {
  return [
    calibrateDedupeThreshold(inputs),
    calibrateLeadTiers(inputs),
    calibrateRubricRules(inputs),
    calibrateVarianceThresholds(inputs),
    calibrateReforecastSensitivity(inputs),
    calibrateAttributionWindow(inputs),
    calibrateScorecardCoverage(inputs),
    calibrateNpsSampleRule(inputs),
    calibrateRetroTiming(inputs),
  ];
}

export interface CalibrationSummary {
  findings: CalibrationFinding[];
  readyCount: number;
  questioningCount: number;
  waitingCount: number;
}

export function summarise(findings: CalibrationFinding[]): CalibrationSummary {
  return {
    findings,
    readyCount: findings.filter((f) => f.status === "supports").length,
    questioningCount: findings.filter((f) => f.status === "questions").length,
    waitingCount: findings.filter((f) => f.status === "no_data" || f.status === "too_early").length,
  };
}
