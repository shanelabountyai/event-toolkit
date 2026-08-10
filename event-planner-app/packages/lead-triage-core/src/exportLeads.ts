// packages/lead-triage-core/src/exportLeads.ts
//
// FR-10 — the handoff. Export is the entire mechanism by which leads reach a sales owner in
// v1, so the sort order is the product: tier first, then score, so the top of the file is
// literally the first call to make.

import type { LeadRecord, LeadTier, SessionOwner, TriageSession } from "./types";
import { LEAD_TIER_LABELS } from "./types";
import { contactName } from "./dedupe";

const TIER_RANK: Record<LeadTier, number> = { hot: 0, warm: 1, cold: 2 };

export type SheetMatrix = Array<Array<string | number | null>>;

export interface ExportFile {
  /** Filename without extension — the caller appends .csv or .xlsx. */
  basename: string;
  sheetName: string;
  rows: SheetMatrix;
  leadCount: number;
}

const HEADERS = [
  "Tier",
  "Score",
  "First name",
  "Last name",
  "Email",
  "Company",
  "Job title",
  "Phone",
  "Sessions attended",
  "Booth interactions",
  "Demo requested",
  "Registration status",
  "Owner",
  "Status",
  "Follow-up subject",
  "Follow-up body",
  "Score breakdown",
];

/** Tier, then score descending — the order a sales owner should work the list in. */
export function sortForExport(leads: LeadRecord[]): LeadRecord[] {
  return [...leads].sort(
    (a, b) =>
      TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
      b.score - a.score ||
      contactName(a.contact).localeCompare(contactName(b.contact)),
  );
}

function leadRow(lead: LeadRecord): Array<string | number | null> {
  return [
    LEAD_TIER_LABELS[lead.tier],
    lead.score,
    lead.contact.firstName ?? "",
    lead.contact.lastName ?? "",
    lead.contact.email ?? "",
    lead.contact.company ?? "",
    lead.contact.jobTitle ?? "",
    lead.contact.phone ?? "",
    lead.signals.sessionsAttended.join("; "),
    lead.signals.boothInteractions,
    lead.signals.demoRequested ? "Yes" : "No",
    lead.signals.registrationStatus ?? "",
    lead.ownerName ?? "Unassigned",
    lead.status,
    lead.followUpDraft?.subject ?? "",
    lead.followUpDraft?.body ?? "",
    lead.scoreBreakdown.map((entry) => `${entry.label}: ${entry.points}`).join("; "),
  ];
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "leads"
  );
}

/** One file per owner — each containing only that owner's leads. */
export function buildPerOwnerExport(
  leads: LeadRecord[],
  session: TriageSession,
  owners: SessionOwner[],
): ExportFile[] {
  const files: ExportFile[] = [];
  const eventSlug = slug(session.eventName);

  for (const owner of owners) {
    const mine = sortForExport(leads.filter((lead) => lead.ownerId === owner.id));
    if (mine.length === 0) continue;
    files.push({
      basename: `${eventSlug}-leads-${slug(owner.name)}`,
      sheetName: owner.name.slice(0, 28) || "Leads",
      rows: [HEADERS, ...mine.map(leadRow)],
      leadCount: mine.length,
    });
  }

  // Unassigned leads still have to go somewhere, or they quietly vanish from the handoff.
  const unassigned = sortForExport(leads.filter((lead) => !lead.ownerId));
  if (unassigned.length > 0) {
    files.push({
      basename: `${eventSlug}-leads-unassigned`,
      sheetName: "Unassigned",
      rows: [HEADERS, ...unassigned.map(leadRow)],
      leadCount: unassigned.length,
    });
  }

  return files;
}

/** One file, grouped by owner then tier then score. */
export function buildCombinedExport(
  leads: LeadRecord[],
  session: TriageSession,
  owners: SessionOwner[],
): ExportFile {
  const ordered: LeadRecord[] = [];
  for (const owner of owners) {
    ordered.push(...sortForExport(leads.filter((lead) => lead.ownerId === owner.id)));
  }
  ordered.push(...sortForExport(leads.filter((lead) => !lead.ownerId)));

  return {
    basename: `${slug(session.eventName)}-leads-all`,
    sheetName: "All leads",
    rows: [HEADERS, ...ordered.map(leadRow)],
    leadCount: ordered.length,
  };
}

/** RFC 4180 CSV. */
export function toCsv(rows: SheetMatrix): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          const text = String(cell);
          return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\r\n");
}

/* -------------------------------------------------------------------------- */
/* Progress dashboard (FR-11)                                                 */
/* -------------------------------------------------------------------------- */

export interface TriageProgress {
  leadCount: number;
  mergedCount: number;
  dedupedPct: number;
  scoredPct: number;
  routedPct: number;
  draftReadyPct: number;
  pendingDuplicates: number;
  /** Hours since the event closed — the 24/48-hour metric this tool is judged on. */
  hoursSinceClose: number | null;
}

export function computeProgress(
  leads: LeadRecord[],
  session: TriageSession,
  pendingDuplicates: number,
  now: Date = new Date(),
): TriageProgress {
  const total = leads.length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const merged = leads.filter((lead) => (lead.mergedFrom?.length ?? 0) > 0).length;

  const closedAt = session.eventClosedAt ? Date.parse(session.eventClosedAt) : NaN;
  const hoursSinceClose = Number.isNaN(closedAt)
    ? null
    : Math.max(0, Math.round(((now.getTime() - closedAt) / 3_600_000) * 10) / 10);

  return {
    leadCount: total,
    mergedCount: merged,
    dedupedPct: pct(merged),
    scoredPct: pct(leads.filter((lead) => lead.score > 0).length),
    routedPct: pct(leads.filter((lead) => lead.ownerId !== null).length),
    draftReadyPct: pct(leads.filter((lead) => lead.followUpDraft !== null).length),
    pendingDuplicates,
    hoursSinceClose,
  };
}
