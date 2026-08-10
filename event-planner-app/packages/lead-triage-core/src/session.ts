// packages/lead-triage-core/src/session.ts
//
// FR-1 — creating a triage session, linked to a brief or standalone.

import { newId, nowIso, type EventBrief } from "@event-toolkit/schema";
import type { TriageSession } from "./types";

/**
 * A session for an existing brief. `eventClosedAt` anchors the 24-48 hour metric, so it comes
 * from the brief's end date at end of day rather than "now" — the clock starts when the event
 * finished, not when the planner got round to opening this tool.
 */
export function sessionFromBrief(brief: EventBrief): TriageSession {
  const endDate = brief.dates?.eventEndDate || brief.dates?.eventStartDate || "";
  const timestamp = nowIso();
  return {
    id: newId(),
    eventBriefId: brief.id,
    eventName: brief.name || "Untitled event",
    eventClosedAt: endDate ? `${endDate}T18:00` : timestamp,
    status: "importing",
    owners: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function standaloneSession(eventName: string, eventClosedAt: string): TriageSession {
  const timestamp = nowIso();
  return {
    id: newId(),
    eventBriefId: null,
    eventName: eventName.trim(),
    eventClosedAt,
    status: "importing",
    owners: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
