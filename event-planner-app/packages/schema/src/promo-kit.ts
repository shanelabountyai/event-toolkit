// packages/schema/src/promo-kit.ts
//
// PRD 2 (Promo Campaign Kit) types, constants and pure logic.
//
// This tool is a pure *reader* of `EventBrief` — nothing here writes to a brief, adds a
// field to it, or touches `CURRENT_SCHEMA_VERSION`. Its own records (asset sets, pacing
// entries, pacing config) are siblings keyed by `eventBriefId`.
//
// Like the rest of this package: no React, no DOM, no network. Everything below is a pure
// function so the generation and pacing math can be exercised headlessly (`pnpm promo-check`)
// without a browser.

import { addDaysToIsoDate } from "./ids";
import type { EventBrief, SuccessMetric } from "./event-brief";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type PromoAssetType = "landing_page" | "email" | "social" | "sales_outreach";
export type SocialChannel = "linkedin" | "x" | "facebook";
export type PacingCurveStyle = "backloaded_standard" | "linear";
export type PacingStatus = "on_pace" | "behind_pace" | "critical";

export interface PromoAsset {
  id: string;
  type: PromoAssetType;
  /**
   * email: "invite" | "reminder_1" | "reminder_2" | "last_chance" | "day_of"
   * social: "announcement" | "mid_campaign" | "last_chance"
   */
  subtype?: string;
  /** Set only when `type === "social"`. */
  channel?: SocialChannel;
  label: string;
  /** ISO date. Emails only in v1. */
  suggestedSendDate?: string;
  /** Immutable snapshot of the original template output. */
  generatedBody: string;
  /** Editable; starts equal to `generatedBody`. */
  currentBody: string;
  /** 0-100, recomputed on every save. */
  editDistancePct: number;
  /** `currentBody !== generatedBody` — always recomputed, never a sticky flag. */
  isEdited: boolean;
  lastEditedAt?: string;
}

export interface PromoAssetSet {
  id: string;
  /** FK -> EventBrief.id */
  eventBriefId: string;
  /** `EventBrief.version` at generation time — the staleness check. */
  sourceBriefVersion: number;
  generatedAt: string;
  regeneratedAt?: string;
  /**
   * The campaign start used for pacing targets. Stored once, at first generation — NOT the
   * brief's `createdAt`, so re-generating later never silently re-scales the target curve.
   */
  campaignStartDate: string;
  /** Exactly 18 on first generation: 1 landing + 5 email + 9 social + 3 sales. */
  assets: PromoAsset[];
}

export interface PacingEntry {
  id: string;
  eventBriefId: string;
  /** ISO date. */
  date: string;
  cumulativeRegistrations: number;
  source: "manual" | "csv";
  enteredAt: string;
}

export interface PacingConfig {
  /** One record per brief. */
  eventBriefId: string;
  curveStyle: PacingCurveStyle;
  /** ISO date. Overrides `PromoAssetSet.campaignStartDate` when the planner sets it. */
  campaignStartDateOverride?: string;
}

/** Fixed backloaded preset: cumulative % of target at each fraction of the campaign window. */
export const BACKLOADED_CURVE_CHECKPOINTS: Array<[fraction: number, cumulativePct: number]> = [
  [0.0, 5],
  [0.2, 15],
  [0.4, 30],
  [0.6, 50],
  [0.8, 75],
  [0.9, 90],
  [1.0, 100],
];

export const PACING_STATUS_THRESHOLDS = { onPaceWithinPct: 10, behindPaceWithinPct: 25 };

export const PACING_STATUS_LABELS: Record<PacingStatus, string> = {
  on_pace: "On pace",
  behind_pace: "Behind pace",
  critical: "Critical",
};

export const CURVE_STYLE_LABELS: Record<PacingCurveStyle, string> = {
  backloaded_standard: "Backloaded (standard)",
  linear: "Linear",
};

export const SOCIAL_CHANNEL_LABELS: Record<SocialChannel, string> = {
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
};

export const PROMO_ASSET_TYPE_LABELS: Record<PromoAssetType, string> = {
  landing_page: "Landing page",
  email: "Email sequence",
  social: "Social posts",
  sales_outreach: "Sales outreach",
};

/** Section render order in the Kit view, and the order used by the bulk Markdown export. */
export const PROMO_ASSET_TYPE_ORDER: PromoAssetType[] = [
  "landing_page",
  "email",
  "social",
  "sales_outreach",
];

/** Emitted in place of any missing optional field, so a raw `{{token}}` can never ship. */
export const PLACEHOLDER = "[to be confirmed]";

/* -------------------------------------------------------------------------- */
/* Date helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Whole days from `from` to `to` (negative when `to` is earlier). Local calendar dates. */
export function daysBetweenIsoDates(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Parse YYYY-MM-DD as a local calendar date. Returns null for anything else. */
export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  // Rejects impossible dates that JS would roll over (2026-02-31 -> 3 March).
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/* -------------------------------------------------------------------------- */
/* Email send-date scheduling                                                 */
/* -------------------------------------------------------------------------- */

export interface EmailStep {
  subtype: "invite" | "reminder_1" | "reminder_2" | "last_chance" | "day_of";
  label: string;
  /** Days *before* `dates.eventStartDate` at full campaign length. */
  offsetDays: number;
}

/** Invite T-6wk, Reminder 1 T-3wk, Reminder 2 T-1wk, Last Chance T-2d, Day-Of same day. */
export const EMAIL_STEPS: EmailStep[] = [
  { subtype: "invite", label: "Invitation", offsetDays: 42 },
  { subtype: "reminder_1", label: "Reminder 1", offsetDays: 21 },
  { subtype: "reminder_2", label: "Reminder 2", offsetDays: 7 },
  { subtype: "last_chance", label: "Last chance", offsetDays: 2 },
  { subtype: "day_of", label: "Day-of", offsetDays: 0 },
];

/** Full campaign length in days — the window the offsets above are defined against. */
export const FULL_CAMPAIGN_DAYS = EMAIL_STEPS[0].offsetDays;

/**
 * Send date per email step, in `EMAIL_STEPS` order.
 *
 * When there is less runway left than the full 6-week campaign, every offset is compressed
 * proportionally into the time actually remaining rather than emitting dates in the past —
 * a planner building a kit 10 days out gets 5 usable dates inside those 10 days, not three
 * dates that already happened.
 */
export function computeEmailSendDates(eventStartDate: string, today: string): string[] {
  if (!parseIsoDate(eventStartDate)) return EMAIL_STEPS.map(() => eventStartDate);
  const daysLeft = daysBetweenIsoDates(today, eventStartDate);
  // Event is today or already past: nothing to schedule against, everything lands on the day.
  if (daysLeft <= 0) return EMAIL_STEPS.map(() => eventStartDate);
  const scale = daysLeft >= FULL_CAMPAIGN_DAYS ? 1 : daysLeft / FULL_CAMPAIGN_DAYS;
  return EMAIL_STEPS.map((step) =>
    addDaysToIsoDate(eventStartDate, -Math.round(step.offsetDays * scale)),
  );
}

/* -------------------------------------------------------------------------- */
/* Edit distance                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Levenshtein distance, two-row DP.
 *
 * ponytail: O(n·m) time, O(min(n,m)) space. Bodies are a few thousand characters and this
 * only runs on a debounced save, so it stays well under a frame. If asset bodies ever grow
 * to essay length, swap in a token-level diff rather than optimising this.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Iterate over the shorter string so the row array stays small.
  if (a.length > b.length) [a, b] = [b, a];

  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  let curr = new Array<number>(a.length + 1);

  for (let j = 1; j <= b.length; j += 1) {
    curr[0] = j;
    const bj = b.charCodeAt(j - 1);
    for (let i = 1; i <= a.length; i += 1) {
      const cost = a.charCodeAt(i - 1) === bj ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

/** How far `current` has drifted from `generated`, 0-100 (rounded). */
export function editDistancePct(generated: string, current: string): number {
  if (generated === current) return 0;
  const longest = Math.max(generated.length, current.length);
  if (longest === 0) return 0;
  const pct = (levenshtein(generated, current) / longest) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Recompute `isEdited` / `editDistancePct` from the bodies themselves.
 *
 * Deliberately a live comparison, never a sticky flag: an asset edited and then edited back
 * to its exact original text is correctly not-edited again, and is safe to regenerate.
 */
export function withRecomputedEdit(asset: PromoAsset, lastEditedAt?: string): PromoAsset {
  const isEdited = asset.currentBody !== asset.generatedBody;
  return {
    ...asset,
    isEdited,
    editDistancePct: editDistancePct(asset.generatedBody, asset.currentBody),
    lastEditedAt: isEdited ? (lastEditedAt ?? asset.lastEditedAt) : undefined,
  };
}

/** Mean edit-distance across a set, rounded — the Kit view's aggregate indicator. */
export function aggregateEditPct(assets: PromoAsset[]): number {
  if (assets.length === 0) return 0;
  const total = assets.reduce((sum, a) => sum + a.editDistancePct, 0);
  return Math.round(total / assets.length);
}

/* -------------------------------------------------------------------------- */
/* Generation readiness                                                       */
/* -------------------------------------------------------------------------- */

export interface MissingField {
  /** Dotted path into the brief, e.g. "dates.eventStartDate". */
  path: string;
  label: string;
}

/**
 * Brief fields the templates cannot degrade around. Everything else falls back to
 * `PLACEHOLDER`; these four would produce copy too hollow to be worth generating.
 */
export function missingFieldsForGeneration(brief: EventBrief): MissingField[] {
  const missing: MissingField[] = [];
  if (!brief.name?.trim()) missing.push({ path: "name", label: "Event name" });
  if (!brief.dates?.eventStartDate?.trim())
    missing.push({ path: "dates.eventStartDate", label: "Event start date" });
  if (!brief.goals?.primaryObjective?.trim())
    missing.push({ path: "goals.primaryObjective", label: "Primary objective" });
  if (!brief.audience?.description?.trim())
    missing.push({ path: "audience.description", label: "Audience description" });
  return missing;
}

export function canGenerate(brief: EventBrief): boolean {
  return missingFieldsForGeneration(brief).length === 0;
}

/** True once the brief has moved on from the version the kit was generated against. */
export function isAssetSetStale(set: PromoAssetSet, brief: EventBrief): boolean {
  return brief.version > set.sourceBriefVersion;
}

/* -------------------------------------------------------------------------- */
/* Pacing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The brief's registration goal, or null when there isn't a usable one.
 * Matches any `successMetrics[].metric` containing "registration" (case-insensitive) with a
 * positive target — the pacing tab is blocked without it.
 */
export function findRegistrationMetric(brief: EventBrief): SuccessMetric | null {
  const match = (brief.successMetrics ?? []).find(
    (m) => /registration/i.test(m.metric ?? "") && typeof m.target === "number" && m.target > 0,
  );
  return match ?? null;
}

/** Cumulative % of the registration target expected by `fraction` (0-1) of the window. */
export function targetPctAtFraction(fraction: number, style: PacingCurveStyle): number {
  const f = Math.max(0, Math.min(1, fraction));
  if (style === "linear") return f * 100;

  const points = BACKLOADED_CURVE_CHECKPOINTS;
  for (let i = 1; i < points.length; i += 1) {
    const [prevF, prevPct] = points[i - 1];
    const [nextF, nextPct] = points[i];
    if (f <= nextF) {
      const span = nextF - prevF;
      if (span <= 0) return nextPct;
      return prevPct + ((f - prevF) / span) * (nextPct - prevPct);
    }
  }
  return 100;
}

export interface PacingPoint {
  date: string;
  /** Expected cumulative registrations by this date. */
  target: number;
  /** Reported cumulative registrations, or null on dates with no entry. */
  actual: number | null;
}

export interface PacingWindow {
  campaignStartDate: string;
  eventStartDate: string;
  totalDays: number;
}

/** Expected cumulative registrations on `date`, given the window, curve style and goal. */
export function targetAtDate(
  date: string,
  window: PacingWindow,
  style: PacingCurveStyle,
  registrationTarget: number,
): number {
  if (window.totalDays <= 0) return registrationTarget;
  const elapsed = daysBetweenIsoDates(window.campaignStartDate, date);
  const pct = targetPctAtFraction(elapsed / window.totalDays, style);
  return Math.round((pct / 100) * registrationTarget);
}

export function buildPacingWindow(
  campaignStartDate: string,
  eventStartDate: string,
): PacingWindow {
  return {
    campaignStartDate,
    eventStartDate,
    totalDays: Math.max(0, daysBetweenIsoDates(campaignStartDate, eventStartDate)),
  };
}

/**
 * One row per reported entry (target vs. actual), plus a final row for the event date so the
 * chart always shows the full runway rather than stopping at the last data point.
 */
export function buildPacingSeries(
  entries: PacingEntry[],
  window: PacingWindow,
  style: PacingCurveStyle,
  registrationTarget: number,
): PacingPoint[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const points: PacingPoint[] = sorted.map((e) => ({
    date: e.date,
    target: targetAtDate(e.date, window, style, registrationTarget),
    actual: e.cumulativeRegistrations,
  }));

  const hasEventDate = points.some((p) => p.date === window.eventStartDate);
  if (!hasEventDate) {
    points.push({
      date: window.eventStartDate,
      target: targetAtDate(window.eventStartDate, window, style, registrationTarget),
      actual: null,
    });
  }
  return points;
}

export interface PacingAssessment {
  status: PacingStatus;
  /** Latest reported cumulative registrations, or 0 when nothing has been entered. */
  actual: number;
  /** Expected cumulative registrations as of the latest reported date. */
  target: number;
  /** How far below target, as a % of target. 0 when at or ahead of target. */
  shortfallPct: number;
  /** Actual as a % of the full registration goal. */
  pctOfGoal: number;
  daysRemaining: number;
  /** Null when no entries have been reported yet. */
  latestEntryDate: string | null;
}

/**
 * Status at the latest reported data point: within 10% of target is On Pace, within 25% is
 * Behind Pace, worse than that is Critical.
 */
export function assessPacing(
  entries: PacingEntry[],
  window: PacingWindow,
  style: PacingCurveStyle,
  registrationTarget: number,
  today: string,
): PacingAssessment {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const latest = sorted[sorted.length - 1] ?? null;
  const asOf = latest?.date ?? today;
  const actual = latest?.cumulativeRegistrations ?? 0;
  const target = targetAtDate(asOf, window, style, registrationTarget);
  const daysRemaining = Math.max(0, daysBetweenIsoDates(today, window.eventStartDate));
  const pctOfGoal =
    registrationTarget > 0 ? Math.round((actual / registrationTarget) * 100) : 0;

  /**
   * With nothing reported, there is no pace to assess.
   *
   * Previously an empty tracker rendered "Critical — 100% below where the target curve expects you
   * to be" beside "No registration data entered yet", and recommended emergency interventions. A
   * planner opening the tool for the first time was told their campaign was failing before they
   * had told it anything.
   */
  if (sorted.length === 0) {
    return {
      status: "on_pace",
      actual: 0,
      target,
      shortfallPct: 0,
      pctOfGoal: 0,
      daysRemaining,
      latestEntryDate: null,
    };
  }

  // No target expected yet (very start of the window): can't be behind on zero.
  if (target <= 0) {
    return {
      status: "on_pace",
      actual,
      target,
      shortfallPct: 0,
      pctOfGoal,
      daysRemaining,
      latestEntryDate: latest?.date ?? null,
    };
  }

  const shortfallPct = Math.max(0, ((target - actual) / target) * 100);
  const status: PacingStatus =
    shortfallPct <= PACING_STATUS_THRESHOLDS.onPaceWithinPct
      ? "on_pace"
      : shortfallPct <= PACING_STATUS_THRESHOLDS.behindPaceWithinPct
        ? "behind_pace"
        : "critical";

  return {
    status,
    actual,
    target,
    shortfallPct: Math.round(shortfallPct),
    pctOfGoal,
    daysRemaining,
    latestEntryDate: latest?.date ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* CSV import                                                                 */
/* -------------------------------------------------------------------------- */

export interface CsvRowError {
  /** 1-based line number in the source file, so the message matches what the planner sees. */
  row: number;
  reason: string;
}

export interface ParsedPacingCsv {
  rows: Array<{ date: string; cumulativeRegistrations: number }>;
  errors: CsvRowError[];
}

/**
 * Parse a `date,count` CSV with a header row and ISO dates.
 *
 * Partial success is the point: valid rows come back in `rows`, and every rejected row is
 * reported with its line number and a specific reason rather than failing the whole file.
 */
export function parsePacingCsv(csvText: string): ParsedPacingCsv {
  const rows: ParsedPacingCsv["rows"] = [];
  const errors: CsvRowError[] = [];

  const lines = (csvText ?? "").split(/\r\n|\n|\r/);
  const seenDates = new Set<string>();
  let started = false;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (!raw.trim()) continue;

    const cells = raw.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));

    // Skip a header row wherever it appears before the first data row.
    if (!started && /^date$/i.test(cells[0] ?? "")) {
      started = true;
      continue;
    }
    started = true;

    if (cells.length < 2) {
      errors.push({ row: lineNo, reason: "Expected two columns: date,count" });
      continue;
    }

    const [dateCell, countCell] = cells;
    if (!parseIsoDate(dateCell)) {
      errors.push({ row: lineNo, reason: `"${dateCell}" is not an ISO date (YYYY-MM-DD)` });
      continue;
    }
    if (!/^\d+$/.test(countCell)) {
      errors.push({
        row: lineNo,
        reason: `"${countCell}" is not a whole, non-negative registration count`,
      });
      continue;
    }
    if (seenDates.has(dateCell)) {
      errors.push({ row: lineNo, reason: `Duplicate row for ${dateCell}` });
      continue;
    }

    seenDates.add(dateCell);
    rows.push({ date: dateCell, cumulativeRegistrations: Number(countCell) });
  }

  return { rows, errors };
}

/* -------------------------------------------------------------------------- */
/* Recommended interventions                                                  */
/* -------------------------------------------------------------------------- */

export interface Intervention {
  id: string;
  title: string;
  detail: string;
  /** Subtype/type of the kit asset this tactic points at, resolved to a real asset id in the UI. */
  assetSubtype?: string;
  assetType?: PromoAssetType;
}

/**
 * Rule-based tactic list — no scoring model, no AI. Shown only when Behind Pace / Critical.
 * Ordered most-urgent first; the UI links each one to the matching asset in the Kit view.
 */
export function recommendedInterventions(assessment: PacingAssessment): Intervention[] {
  if (assessment.status === "on_pace") return [];

  const out: Intervention[] = [];
  const { daysRemaining, status, shortfallPct } = assessment;

  if (daysRemaining <= 7) {
    out.push({
      id: "send-last-chance",
      title: "Send the last-chance email now",
      detail: `${shortfallPct}% below target with ${daysRemaining} day${
        daysRemaining === 1 ? "" : "s"
      } left — the last-chance send is the highest-yield lever remaining.`,
      assetType: "email",
      assetSubtype: "last_chance",
    });
  } else {
    out.push({
      id: "resend-invite",
      title: "Re-send the invitation to non-openers",
      detail:
        "Still enough runway for the top of the funnel to matter. Re-send the invite to anyone who has not opened it.",
      assetType: "email",
      assetSubtype: "invite",
    });
  }

  out.push({
    id: "social-push",
    title: "Run the last-chance social posts early",
    detail:
      "Move the last-chance social posts forward on all three channels rather than holding them for the final week.",
    assetType: "social",
    assetSubtype: "last_chance",
  });

  out.push({
    id: "sales-outreach",
    title: "Push personal outreach through sales",
    detail:
      "Hand the sales outreach snippets to reps for personal invites to named accounts — the highest-converting channel when broadcast is underperforming.",
    assetType: "sales_outreach",
  });

  if (status === "critical") {
    out.push({
      id: "revisit-target",
      title: "Revisit the registration target with stakeholders",
      detail:
        "The gap is wider than promotion alone typically closes. Flag it now rather than at the event — and check the target on the brief is still the right one.",
    });
  }

  return out;
}
