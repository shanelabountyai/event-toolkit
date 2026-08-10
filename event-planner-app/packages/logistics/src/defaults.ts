// packages/logistics/src/defaults.ts
//
// Seeding a new pack from the brief. The point is that a planner opening the Logistics Pack
// for the first time lands on something already half-filled from what they told the brief,
// rather than five empty tables.

import { newId, nowIso, type EventBrief } from "@event-toolkit/schema";
import {
  CURRENT_LOGISTICS_SCHEMA_VERSION,
  type LogisticsPack,
  type OnSiteContact,
  type Session,
} from "./logistics-pack";

/** Where a seeded session happens, per the brief's delivery mode. */
function defaultLocation(brief: EventBrief): string | undefined {
  const venue = brief.format?.venueOrPlatform?.name?.trim();
  if (brief.format?.deliveryMode === "virtual") return venue || "Online";
  return venue || undefined;
}

/**
 * A one-hour slot on `date`, starting at 09:00 local and stepping an hour per index.
 *
 * Milestones only carry a date, not a time, so stacking every seeded session at the same
 * instant would fire the overlap warning on day one. Sequential hourly blocks give the
 * planner a sane starting shape to drag around instead.
 */
function seedSlot(date: string, index: number): { startTime: string; endTime: string } {
  const startHour = 9 + index;
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return {
    startTime: `${date}T${pad(Math.min(startHour, 22))}:00`,
    endTime: `${date}T${pad(Math.min(startHour + 1, 23))}:00`,
  };
}

/**
 * FR-1 — build a pack from the brief: sessions from `during_event` milestones, contacts from
 * stakeholders, location default from the venue.
 */
export function createLogisticsPackFromBrief(brief: EventBrief): LogisticsPack {
  const location = defaultLocation(brief);
  const eventDate = brief.dates?.eventStartDate || "";

  const duringEvent = (brief.timeline?.milestones ?? []).filter(
    (m) => m.phase === "during_event",
  );

  const sessions: Session[] = duringEvent.map((milestone, index) => {
    // Prefer the milestone's own date; fall back to the event start when it has none.
    const date = milestone.targetDate || eventDate;
    const slot = seedSlot(date, index);
    return {
      id: newId(),
      label: milestone.label || `Session ${index + 1}`,
      startTime: slot.startTime,
      endTime: slot.endTime,
      location,
      owner: milestone.owner,
      type: "session",
      notes: milestone.notes,
    };
  });

  const contacts: OnSiteContact[] = (brief.stakeholders ?? []).map((stakeholder) => ({
    id: newId(),
    name: stakeholder.name,
    role: stakeholder.role,
    orgType: "internal",
    email: stakeholder.email,
  }));

  const timestamp = nowIso();
  return {
    schemaVersion: CURRENT_LOGISTICS_SCHEMA_VERSION,
    id: newId(),
    eventBriefId: brief.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
    sessions,
    staffAssignments: [],
    shippingItems: [],
    venueChecklist: [],
    contacts,
    issueLog: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Row factories — used by every "add row" button                             */
/* -------------------------------------------------------------------------- */

export function newSession(partial: Partial<Session> = {}): Session {
  return {
    id: newId(),
    label: "",
    startTime: "",
    endTime: "",
    type: "session",
    ...partial,
  };
}

export function newStaffAssignment(
  partial: Partial<LogisticsPack["staffAssignments"][number]> = {},
): LogisticsPack["staffAssignments"][number] {
  return { id: newId(), personName: "", assignmentRole: "", ...partial };
}

export function newShippingItem(
  partial: Partial<LogisticsPack["shippingItems"][number]> = {},
): LogisticsPack["shippingItems"][number] {
  return {
    id: newId(),
    item: "",
    quantity: 1,
    shipTo: "",
    status: "not_shipped",
    ...partial,
  };
}

export function newChecklistItem(
  partial: Partial<LogisticsPack["venueChecklist"][number]> = {},
): LogisticsPack["venueChecklist"][number] {
  return { id: newId(), category: "Other", item: "", status: "todo", ...partial };
}

export function newContact(
  partial: Partial<OnSiteContact> = {},
): OnSiteContact {
  return { id: newId(), name: "", role: "", orgType: "internal", ...partial };
}

export function newIssue(
  partial: Partial<LogisticsPack["issueLog"][number]> = {},
): LogisticsPack["issueLog"][number] {
  return {
    id: newId(),
    timestamp: nowIso(),
    description: "",
    severity: "medium",
    status: "open",
    ...partial,
  };
}
