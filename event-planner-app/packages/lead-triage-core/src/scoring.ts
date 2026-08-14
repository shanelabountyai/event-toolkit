// packages/lead-triage-core/src/scoring.ts
//
// FR-5/FR-6 — the scoring rubric. Every rule is visible, editable and shows its contribution
// in the breakdown; nothing about a lead's score is a black box the planner can't argue with.
//
// The starter weights are a documented default, not a validated model (PRD §15).

import { newId, nowIso, type EventBrief } from "@event-toolkit/schema";
import type {
  LeadRecord,
  LeadTier,
  ScoreBreakdownEntry,
  ScoringRubric,
  ScoringRule,
} from "./types";

export const DEFAULT_TIER_THRESHOLDS = { hot: 70, warm: 40 };

/**
 * The starter rubric: a demo request dominates, booth and session engagement accumulate with
 * caps so a single busy attendee can't out-score real buying intent, and a persona title match
 * adds a modest boost when the session is linked to a brief that names its target personas.
 */
export function defaultRubric(triageSessionId: string, targetPersonas?: string[]): ScoringRubric {
  const rules: ScoringRule[] = [
    {
      id: newId(),
      signal: "demoRequested",
      label: "Demo requested",
      flatPoints: 40,
      enabled: true,
    },
    {
      id: newId(),
      signal: "boothInteractions",
      label: "Booth interactions",
      pointsPerUnit: 10,
      cap: 30,
      enabled: true,
    },
    {
      id: newId(),
      signal: "sessionsAttended",
      label: "Sessions attended",
      pointsPerUnit: 5,
      cap: 25,
      enabled: true,
    },
    {
      id: newId(),
      signal: "personaTitleMatch",
      label: "Persona title match",
      flatPoints: 15,
      // Only meaningful when the session is linked to a brief that names personas.
      enabled: (targetPersonas?.length ?? 0) > 0,
    },
  ];

  return {
    id: newId(),
    triageSessionId,
    rules,
    tierThresholds: { ...DEFAULT_TIER_THRESHOLDS },
    updatedAt: nowIso(),
  };
}

/** Persona titles from a linked brief, used by the `personaTitleMatch` rule. */
export function personaTitlesFromBrief(brief: EventBrief | null): string[] {
  if (!brief) return [];
  return (brief.audience?.targetPersonas ?? [])
    .flatMap((persona) => [persona.title, persona.name])
    .map((value) => (value ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Words that describe seniority rather than domain.
 *
 * On their own they carry no fit signal: every company has a manager, and matching "Manager"
 * against "Marketing manager" would fire for the entire badge scan. They still count when they
 * appear alongside a domain word — "operations director" vs "operations lead" is a real match.
 */
const GENERIC_ROLE_WORDS = new Set([
  "manager", "director", "lead", "head", "chief", "officer", "president", "vice",
  "senior", "junior", "principal", "executive", "specialist", "associate",
  "coordinator", "analyst", "owner", "founder", "staff", "global", "regional",
]);

/**
 * A lead's title matches a persona when **either contains the other's** significant words —
 * "VP of Marketing" matches a "Marketing VP" persona without a synonym dictionary.
 *
 * The comparison is against the *shorter* of the two word sets, which is the fix for a real
 * scoring failure: planners write descriptive personas ("Plant operations director — active
 * buyer") while real job titles are two or three words ("Plant Operations Lead"). Measuring
 * overlap against the persona alone meant a longer persona could never be matched by a shorter
 * title, so the rule fired for none of an eight-lead import and the tool ranked a hospitality
 * events manager above the literal ICP at a manufacturing conference.
 *
 * A single shared *generic* word is not a match, which is what stops the symmetric version from
 * over-firing.
 */
export function matchesPersonaTitle(jobTitle: string | undefined, personaTitles: string[]): boolean {
  const title = (jobTitle ?? "").toLowerCase().trim();
  if (!title || personaTitles.length === 0) return false;

  const words = (value: string) =>
    value
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["the", "and", "for", "of"].includes(w));

  const titleWords = words(title);
  const titleSet = new Set(titleWords);

  return personaTitles.some((persona) => {
    const personaWords = words(persona);
    if (personaWords.length === 0 || titleWords.length === 0) return false;

    const shared = personaWords.filter((w) => titleSet.has(w));
    if (shared.length === 0) return false;

    // Half of the shorter side, so a short title can still match a long persona.
    const shorter = Math.min(personaWords.length, titleWords.length);
    if (shared.length < Math.max(1, Math.ceil(shorter / 2))) return false;

    // One generic word in common is a coincidence, not a match.
    return shared.some((w) => !GENERIC_ROLE_WORDS.has(w));
  });
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdownEntry[];
  tier: LeadTier;
}

/** Score a lead against a rubric. Pure — same inputs, same score, every time. */
export function scoreLead(
  lead: Pick<LeadRecord, "signals" | "contact">,
  rubric: ScoringRubric,
  personaTitles: string[] = [],
): ScoreResult {
  const breakdown: ScoreBreakdownEntry[] = [];

  for (const rule of rubric.rules) {
    if (!rule.enabled) continue;
    let points = 0;

    switch (rule.signal) {
      case "demoRequested":
        if (lead.signals.demoRequested) points = rule.flatPoints ?? 0;
        break;

      case "boothInteractions":
        points = (lead.signals.boothInteractions ?? 0) * (rule.pointsPerUnit ?? 0);
        break;

      case "sessionsAttended": {
        // Prefer the actual list length; the count column is a fallback for files that only
        // report a number.
        const count = Math.max(
          lead.signals.sessionsAttended?.length ?? 0,
          lead.signals.sessionsAttendedCount ?? 0,
        );
        points = count * (rule.pointsPerUnit ?? 0);
        break;
      }

      case "personaTitleMatch":
        if (matchesPersonaTitle(lead.contact.jobTitle, personaTitles)) {
          points = rule.flatPoints ?? 0;
        }
        break;

      case "customSignal": {
        const raw = rule.customSignalKey
          ? lead.signals.customSignals?.[rule.customSignalKey]
          : undefined;
        if (raw === undefined || raw === null || raw === "") break;
        if (typeof raw === "boolean") points = raw ? (rule.flatPoints ?? 0) : 0;
        else if (typeof raw === "number") points = raw * (rule.pointsPerUnit ?? 0);
        else {
          const numeric = Number(raw);
          points = Number.isFinite(numeric)
            ? numeric * (rule.pointsPerUnit ?? 0)
            : (rule.flatPoints ?? 0);
        }
        break;
      }
    }

    if (rule.cap !== undefined) points = Math.min(points, rule.cap);
    points = Math.round(points);
    if (points !== 0) breakdown.push({ ruleId: rule.id, label: rule.label, points });
  }

  const score = breakdown.reduce((sum, entry) => sum + entry.points, 0);
  return { score, breakdown, tier: tierForScore(score, rubric.tierThresholds) };
}

export function tierForScore(score: number, thresholds: { hot: number; warm: number }): LeadTier {
  if (score >= thresholds.hot) return "hot";
  if (score >= thresholds.warm) return "warm";
  return "cold";
}

/** Re-score a whole pool — what the rubric editor calls on every change (FR-5). */
export function rescoreLeads(
  leads: LeadRecord[],
  rubric: ScoringRubric,
  personaTitles: string[] = [],
): LeadRecord[] {
  return leads.map((lead) => {
    const { score, breakdown, tier } = scoreLead(lead, rubric, personaTitles);
    if (lead.score === score && lead.tier === tier) return lead;
    return { ...lead, score, scoreBreakdown: breakdown, tier, updatedAt: nowIso() };
  });
}

export function tierCounts(leads: LeadRecord[]): Record<LeadTier, number> {
  return {
    hot: leads.filter((l) => l.tier === "hot").length,
    warm: leads.filter((l) => l.tier === "warm").length,
    cold: leads.filter((l) => l.tier === "cold").length,
  };
}
