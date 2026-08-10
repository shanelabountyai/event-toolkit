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
 * A lead's title matches a persona when either contains the other's significant words —
 * "VP of Marketing" should match a "Marketing VP" persona without a synonym dictionary.
 */
export function matchesPersonaTitle(jobTitle: string | undefined, personaTitles: string[]): boolean {
  const title = (jobTitle ?? "").toLowerCase().trim();
  if (!title || personaTitles.length === 0) return false;

  const words = (value: string) =>
    value
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["the", "and", "for", "of"].includes(w));

  const titleWords = new Set(words(title));
  return personaTitles.some((persona) => {
    const personaWords = words(persona);
    if (personaWords.length === 0) return false;
    const overlap = personaWords.filter((w) => titleWords.has(w)).length;
    // Half the persona's significant words present is a match — enough to catch reorderings
    // without firing on a single generic word like "manager".
    return overlap >= Math.max(1, Math.ceil(personaWords.length / 2));
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
