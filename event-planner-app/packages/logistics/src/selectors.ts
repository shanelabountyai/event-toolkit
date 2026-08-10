// packages/logistics/src/selectors.ts
//
// The ONE place session-reference resolution happens. Every view that shows a time tied to a
// session calls in here at render time — nothing caches a resolved time back onto the
// referencing record, so there is no second copy anywhere to go stale.
//
// Pure functions only: pack in, derived facts out.

import type {
  ChecklistItem,
  LogisticsPack,
  OnSiteContact,
  Session,
  StaffAssignment,
} from "./logistics-pack";

export interface ResolvedSession {
  startTime: string;
  endTime: string;
  label: string;
  location?: string;
}

/** The canonical lookup. Returns null for a missing or dangling reference. */
export function resolveSessionTime(
  pack: LogisticsPack,
  sessionId: string | undefined,
): ResolvedSession | null {
  if (!sessionId) return null;
  const session = pack.sessions.find((s) => s.id === sessionId);
  return session
    ? {
        startTime: session.startTime,
        endTime: session.endTime,
        label: session.label,
        location: session.location,
      }
    : null;
}

/* -------------------------------------------------------------------------- */
/* Time helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Milliseconds for an ISO datetime, or null when unparseable/empty. */
export function toMillis(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd).
 * Touching ranges (one ends exactly when the next begins) deliberately do NOT overlap —
 * back-to-back sessions in the same room are normal, not a conflict.
 */
export function rangesOverlap(
  aStart: string | undefined,
  aEnd: string | undefined,
  bStart: string | undefined,
  bEnd: string | undefined,
): boolean {
  const as = toMillis(aStart);
  const ae = toMillis(aEnd);
  const bs = toMillis(bStart);
  const be = toMillis(bEnd);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && bs < ae;
}

/** Sessions ordered by start time; unparseable times sort last rather than throwing. */
export function sessionsByStart(pack: LogisticsPack): Session[] {
  return [...pack.sessions].sort((a, b) => {
    const am = toMillis(a.startTime);
    const bm = toMillis(b.startTime);
    if (am === null && bm === null) return 0;
    if (am === null) return 1;
    if (bm === null) return -1;
    return am - bm;
  });
}

/**
 * The effective time window for a staffing assignment: the referenced session's window when
 * there is one, otherwise its own custom block.
 */
export function assignmentWindow(
  pack: LogisticsPack,
  assignment: StaffAssignment,
): { startTime?: string; endTime?: string } {
  const resolved = resolveSessionTime(pack, assignment.sessionId);
  if (resolved) return { startTime: resolved.startTime, endTime: resolved.endTime };
  return { startTime: assignment.customStartTime, endTime: assignment.customEndTime };
}

/* -------------------------------------------------------------------------- */
/* Conflict detection                                                         */
/* -------------------------------------------------------------------------- */

/**
 * FR-3 — ids of sessions that share a non-empty location with another session and overlap it
 * in time. Sessions with no location can't conflict: two things at unspecified places are not
 * evidence of a clash.
 */
export function findOverlaps(pack: LogisticsPack): Set<string> {
  const flagged = new Set<string>();
  const located = pack.sessions.filter((s) => (s.location ?? "").trim().length > 0);

  for (let i = 0; i < located.length; i += 1) {
    for (let j = i + 1; j < located.length; j += 1) {
      const a = located[i];
      const b = located[j];
      if (normalise(a.location) !== normalise(b.location)) continue;
      if (rangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
        flagged.add(a.id);
        flagged.add(b.id);
      }
    }
  }
  return flagged;
}

/**
 * FR-5 — ids of staff assignments where the same person is booked into two overlapping
 * windows, whether those windows come from sessions or custom time blocks.
 */
export function findDoubleBookings(pack: LogisticsPack): Set<string> {
  const flagged = new Set<string>();
  const withWindows = pack.staffAssignments.map((a) => ({
    assignment: a,
    window: assignmentWindow(pack, a),
  }));

  for (let i = 0; i < withWindows.length; i += 1) {
    for (let j = i + 1; j < withWindows.length; j += 1) {
      const a = withWindows[i];
      const b = withWindows[j];
      if (normalise(a.assignment.personName) !== normalise(b.assignment.personName)) continue;
      if (!normalise(a.assignment.personName)) continue;
      if (rangesOverlap(a.window.startTime, a.window.endTime, b.window.startTime, b.window.endTime)) {
        flagged.add(a.assignment.id);
        flagged.add(b.assignment.id);
      }
    }
  }
  return flagged;
}

function normalise(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Grouping                                                                   */
/* -------------------------------------------------------------------------- */

/** FR-4 — "By Person", derived from the same array the "By Session" view reads. */
export function assignmentsByPerson(
  pack: LogisticsPack,
): Array<{ personName: string; assignments: StaffAssignment[] }> {
  const groups = new Map<string, { personName: string; assignments: StaffAssignment[] }>();
  for (const assignment of pack.staffAssignments) {
    const key = normalise(assignment.personName) || "(unnamed)";
    const group = groups.get(key) ?? {
      personName: assignment.personName || "(unnamed)",
      assignments: [],
    };
    group.assignments.push(assignment);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.personName.localeCompare(b.personName));
}

/** FR-4 — "By Session", plus an "unscheduled" bucket for custom-time assignments. */
export function assignmentsBySession(
  pack: LogisticsPack,
): Array<{ session: Session | null; assignments: StaffAssignment[] }> {
  const out: Array<{ session: Session | null; assignments: StaffAssignment[] }> = [];
  for (const session of sessionsByStart(pack)) {
    out.push({
      session,
      assignments: pack.staffAssignments.filter((a) => a.sessionId === session.id),
    });
  }
  const loose = pack.staffAssignments.filter(
    (a) => !a.sessionId || !pack.sessions.some((s) => s.id === a.sessionId),
  );
  if (loose.length > 0) out.push({ session: null, assignments: loose });
  return out;
}

/** FR-7 — checklist grouped by its free-text category, with per-category progress. */
export function checklistByCategory(
  pack: LogisticsPack,
): Array<{ category: string; items: ChecklistItem[]; done: number; total: number }> {
  const groups = new Map<string, ChecklistItem[]>();
  for (const item of pack.venueChecklist) {
    const key = item.category?.trim() || "Other";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([category, items]) => ({
      category,
      items,
      done: items.filter((i) => i.status === "done").length,
      total: items.length,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/** FR-8 — contacts grouped by organisation type, in a fixed display order. */
export function contactsByOrgType(
  pack: LogisticsPack,
): Array<{ orgType: OnSiteContact["orgType"]; contacts: OnSiteContact[] }> {
  const order: OnSiteContact["orgType"][] = ["internal", "vendor", "venue"];
  return order
    .map((orgType) => ({
      orgType,
      contacts: pack.contacts.filter((c) => c.orgType === orgType),
    }))
    .filter((group) => group.contacts.length > 0);
}

/* -------------------------------------------------------------------------- */
/* Completeness (FR-13)                                                       */
/* -------------------------------------------------------------------------- */

export interface ArtifactCompleteness {
  key: "run-of-show" | "staffing" | "shipping" | "checklist" | "contacts";
  label: string;
  /** Short "6/10 sessions staffed" style summary. */
  summary: string;
  count: number;
  total: number;
}

export interface PackCompleteness {
  artifacts: ArtifactCompleteness[];
  openIssues: number;
}

export function packCompleteness(pack: LogisticsPack): PackCompleteness {
  const sessionCount = pack.sessions.length;
  const staffedSessions = pack.sessions.filter((s) =>
    pack.staffAssignments.some((a) => a.sessionId === s.id),
  ).length;
  const shippedItems = pack.shippingItems.filter(
    (i) => i.status === "delivered" || i.status === "confirmed_onsite",
  ).length;
  const doneChecklist = pack.venueChecklist.filter((i) => i.status === "done").length;
  const reachableContacts = pack.contacts.filter(
    (c) => (c.phone ?? "").trim() || (c.email ?? "").trim(),
  ).length;

  return {
    openIssues: pack.issueLog.filter((i) => i.status === "open").length,
    artifacts: [
      {
        key: "run-of-show",
        label: "Run of show",
        summary: `${sessionCount} session${sessionCount === 1 ? "" : "s"} scheduled`,
        count: sessionCount,
        total: sessionCount,
      },
      {
        key: "staffing",
        label: "Staffing",
        summary: `${staffedSessions}/${sessionCount} sessions staffed`,
        count: staffedSessions,
        total: sessionCount,
      },
      {
        key: "shipping",
        label: "Shipping",
        summary: `${shippedItems}/${pack.shippingItems.length} items delivered`,
        count: shippedItems,
        total: pack.shippingItems.length,
      },
      {
        key: "checklist",
        label: "Venue checklist",
        summary: `${doneChecklist}/${pack.venueChecklist.length} items done`,
        count: doneChecklist,
        total: pack.venueChecklist.length,
      },
      {
        key: "contacts",
        label: "Contacts",
        summary: `${reachableContacts}/${pack.contacts.length} with phone or email`,
        count: reachableContacts,
        total: pack.contacts.length,
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Session deletion (§5's sharp edge)                                         */
/* -------------------------------------------------------------------------- */

export interface SessionReferences {
  staffAssignments: StaffAssignment[];
  checklistItems: ChecklistItem[];
  contacts: OnSiteContact[];
  /** Issue-log entries pointing at the session. Cleared on delete; never blocks it. */
  issueCount: number;
  total: number;
}

/** Everything still pointing at a session — what the delete dialog has to offer to fix. */
export function findSessionReferences(pack: LogisticsPack, sessionId: string): SessionReferences {
  const staffAssignments = pack.staffAssignments.filter((a) => a.sessionId === sessionId);
  const checklistItems = pack.venueChecklist.filter((i) => i.dueSessionId === sessionId);
  const contacts = pack.contacts.filter((c) => c.availabilitySessionId === sessionId);
  const issueCount = pack.issueLog.filter((i) => i.relatedSessionId === sessionId).length;
  return {
    staffAssignments,
    checklistItems,
    contacts,
    issueCount,
    total: staffAssignments.length + checklistItems.length + contacts.length,
  };
}

export type SessionDeleteStrategy =
  | { kind: "reassign"; targetSessionId: string }
  /** Copy the doomed session's final time/label into each referrer's freeform note field. */
  | { kind: "snapshot" };

/**
 * Delete a session, resolving every reference rather than silently orphaning it.
 *
 * "reassign" repoints referrers at another session and they stay live. "snapshot" converts
 * each reference into a one-time freeform note holding the session's final label and time,
 * explicitly marked as no longer live — a user-initiated copy, the one place in this tool
 * where duplicating a session's time is correct.
 */
export function deleteSessionWithStrategy(
  pack: LogisticsPack,
  sessionId: string,
  strategy: SessionDeleteStrategy,
): LogisticsPack {
  const doomed = pack.sessions.find((s) => s.id === sessionId);
  const snapshotText = doomed
    ? `${doomed.label} (was ${formatRangeForSnapshot(doomed.startTime, doomed.endTime)} — session deleted, no longer updates)`
    : "Deleted session";

  const reassignTo = strategy.kind === "reassign" ? strategy.targetSessionId : undefined;

  return {
    ...pack,
    sessions: pack.sessions.filter((s) => s.id !== sessionId),
    staffAssignments: pack.staffAssignments.map((a) =>
      a.sessionId !== sessionId
        ? a
        : strategy.kind === "reassign"
          ? { ...a, sessionId: reassignTo }
          : {
              ...a,
              sessionId: undefined,
              customStartTime: doomed?.startTime,
              customEndTime: doomed?.endTime,
              notes: appendNote(a.notes, snapshotText),
            },
    ),
    venueChecklist: pack.venueChecklist.map((i) =>
      i.dueSessionId !== sessionId
        ? i
        : strategy.kind === "reassign"
          ? { ...i, dueSessionId: reassignTo }
          : { ...i, dueSessionId: undefined, dueNote: snapshotText },
    ),
    contacts: pack.contacts.map((c) =>
      c.availabilitySessionId !== sessionId
        ? c
        : strategy.kind === "reassign"
          ? { ...c, availabilitySessionId: reassignTo }
          : { ...c, availabilitySessionId: undefined, availabilityNote: snapshotText },
    ),
    // Issue entries keep their history; only the dangling pointer is cleared.
    issueLog: pack.issueLog.map((i) =>
      i.relatedSessionId === sessionId
        ? { ...i, relatedSessionId: strategy.kind === "reassign" ? reassignTo : undefined }
        : i,
    ),
  };
}

function appendNote(existing: string | undefined, addition: string): string {
  return existing?.trim() ? `${existing.trim()} — ${addition}` : addition;
}

function formatRangeForSnapshot(startTime: string, endTime: string): string {
  const start = toMillis(startTime);
  const end = toMillis(endTime);
  if (start === null || end === null) return "time unknown";
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  return `${iso(start)}–${iso(end)}`;
}
