// packages/postmortem-core/src/prompt.ts
//
// FR-2 — the nudge. A retro that never gets run is the default outcome, so the tool asks.
// Both thresholds are documented assumptions pending validation, kept as named constants.

import { addDaysToIsoDate, todayIsoDate } from "@event-toolkit/schema";
import { RETRO_PROMPT_DELAY_DAYS, RETRO_PROMPT_ESCALATION_DAYS } from "./retro";

export type RetroPromptLevel = "none" | "standard" | "escalated";

/**
 * Whether to nudge, and how loudly. Escalation is a visual cue only — it never blocks
 * anything, because a planner who hasn't run a retro is busy, not disobedient.
 */
export function retroPromptLevel(
  eventEndDate: string | undefined,
  hasCompletedRetro: boolean,
  today: string = todayIsoDate(),
): RetroPromptLevel {
  if (hasCompletedRetro || !eventEndDate) return "none";
  if (today >= addDaysToIsoDate(eventEndDate, RETRO_PROMPT_ESCALATION_DAYS)) return "escalated";
  if (today >= addDaysToIsoDate(eventEndDate, RETRO_PROMPT_DELAY_DAYS)) return "standard";
  return "none";
}

export function retroPromptMessage(eventName: string, level: RetroPromptLevel): string {
  if (level === "escalated") {
    return `${eventName} finished over two weeks ago and its retro is still open — the details fade fast.`;
  }
  return `It's been a few days since ${eventName} — ready to run the retro?`;
}
