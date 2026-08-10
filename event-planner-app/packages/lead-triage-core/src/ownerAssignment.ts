// packages/lead-triage-core/src/ownerAssignment.ts
//
// FR-7 — who owns each lead. Precedence is fixed: an owner named in the imported file wins,
// then round-robin fills the gaps, and a manual assignment overrides either.

import { newId, nowIso } from "@event-toolkit/schema";
import type { AssignmentMethod, LeadRecord, SessionOwner } from "./types";

export function newOwner(name: string, email?: string): SessionOwner {
  return { id: newId(), name: name.trim(), email: email?.trim() || undefined };
}

function normalise(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Resolve `ownerName` strings that arrived in an import against the session's owner list.
 *
 * Matches on name or email, case-insensitively. An unrecognised name is kept as text with no
 * `ownerId` — losing the planner's data because it didn't match a list would be worse than
 * carrying an unlinked name they can fix.
 */
export function applyMappedOwner(leads: LeadRecord[], owners: SessionOwner[]): LeadRecord[] {
  if (owners.length === 0) return leads;

  return leads.map((lead) => {
    if (lead.ownerId) return lead;
    if (!lead.ownerName) return lead;

    const target = normalise(lead.ownerName);
    const match = owners.find(
      (owner) => normalise(owner.name) === target || normalise(owner.email) === target,
    );
    if (!match) return lead;

    return {
      ...lead,
      ownerId: match.id,
      ownerName: match.name,
      assignmentMethod: "column_mapped" as AssignmentMethod,
      status: lead.status === "new" ? "routed" : lead.status,
      updatedAt: nowIso(),
    };
  });
}

export interface RoundRobinResult {
  leads: LeadRecord[];
  assigned: number;
}

/**
 * Fill unassigned leads round-robin.
 *
 * Highest-scoring leads are dealt first, so when the pool doesn't divide evenly the extra
 * leads land with whoever is next in rotation rather than all the best ones piling onto the
 * first owner in the list.
 */
export function roundRobinAssign(
  leads: LeadRecord[],
  owners: SessionOwner[],
  options: { onlyLeadIds?: string[] } = {},
): RoundRobinResult {
  if (owners.length === 0) return { leads, assigned: 0 };

  const eligible = leads
    .filter((lead) => !lead.ownerId)
    .filter((lead) => !options.onlyLeadIds || options.onlyLeadIds.includes(lead.id))
    .sort((a, b) => b.score - a.score);

  if (eligible.length === 0) return { leads, assigned: 0 };

  // Continue the rotation from whoever is currently lightest, so repeated runs stay balanced.
  const load = new Map(owners.map((owner) => [owner.id, leads.filter((l) => l.ownerId === owner.id).length]));
  const assignments = new Map<string, SessionOwner>();

  for (const lead of eligible) {
    const owner = [...owners].sort(
      (a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || owners.indexOf(a) - owners.indexOf(b),
    )[0];
    assignments.set(lead.id, owner);
    load.set(owner.id, (load.get(owner.id) ?? 0) + 1);
  }

  const timestamp = nowIso();
  return {
    assigned: assignments.size,
    leads: leads.map((lead) => {
      const owner = assignments.get(lead.id);
      if (!owner) return lead;
      return {
        ...lead,
        ownerId: owner.id,
        ownerName: owner.name,
        assignmentMethod: "round_robin" as AssignmentMethod,
        status: lead.status === "new" ? "routed" : lead.status,
        updatedAt: timestamp,
      };
    }),
  };
}

/** Manual (re)assignment of specific leads — always available, always wins. */
export function assignOwnerManually(
  leads: LeadRecord[],
  leadIds: string[],
  owner: SessionOwner | null,
): LeadRecord[] {
  const targets = new Set(leadIds);
  const timestamp = nowIso();

  return leads.map((lead) => {
    if (!targets.has(lead.id)) return lead;
    return {
      ...lead,
      ownerId: owner?.id ?? null,
      ownerName: owner?.name ?? null,
      assignmentMethod: owner ? ("manual" as AssignmentMethod) : null,
      // Un-assigning walks the lead back to `new`; assigning routes an untouched one.
      status: owner
        ? lead.status === "new"
          ? "routed"
          : lead.status
        : lead.status === "routed"
          ? "new"
          : lead.status,
      updatedAt: timestamp,
    };
  });
}

export interface OwnerDistribution {
  owner: SessionOwner | null;
  leadCount: number;
  hot: number;
  warm: number;
  cold: number;
}

/** Per-owner distribution for the assignment panel, with unassigned leads last. */
export function ownerDistribution(
  leads: LeadRecord[],
  owners: SessionOwner[],
): OwnerDistribution[] {
  const rows: OwnerDistribution[] = owners.map((owner) => {
    const mine = leads.filter((lead) => lead.ownerId === owner.id);
    return {
      owner,
      leadCount: mine.length,
      hot: mine.filter((l) => l.tier === "hot").length,
      warm: mine.filter((l) => l.tier === "warm").length,
      cold: mine.filter((l) => l.tier === "cold").length,
    };
  });

  const unassigned = leads.filter((lead) => !lead.ownerId);
  if (unassigned.length > 0) {
    rows.push({
      owner: null,
      leadCount: unassigned.length,
      hot: unassigned.filter((l) => l.tier === "hot").length,
      warm: unassigned.filter((l) => l.tier === "warm").length,
      cold: unassigned.filter((l) => l.tier === "cold").length,
    });
  }

  return rows;
}

/** FR-9 — a session is "routed" the moment every lead has an owner. */
export function allLeadsRouted(leads: LeadRecord[]): boolean {
  return leads.length > 0 && leads.every((lead) => lead.ownerId !== null);
}
