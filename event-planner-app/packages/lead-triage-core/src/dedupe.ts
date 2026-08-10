// packages/lead-triage-core/src/dedupe.ts
//
// The correctness heart of the tool. Two rules, and the asymmetry between them is deliberate:
//
//   1. Exact normalized email → auto-merge. An email is an identifier; two rows with the same
//      one are the same person. Conflicting non-empty field values are *recorded*, never
//      silently overwritten.
//   2. No email, or emails differ → fuzzy name + company similarity. This NEVER auto-merges.
//      It queues for a human. Wrongly merging two real people loses a lead and mails the wrong
//      person; the cost of a false positive is far higher than the cost of asking.

import { newId, nowIso } from "@event-toolkit/schema";
import type {
  DuplicateCandidate,
  FieldConflict,
  LeadContact,
  LeadRecord,
  LeadSignals,
} from "./types";

/** Similarity at or above this counts as a possible duplicate worth a human's attention. */
export const FUZZY_MATCH_THRESHOLD = 0.85;

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/** Lower-case, trimmed, quote-stripped email. Empty string when there isn't one. */
export function normalizeEmail(email: string | undefined): string {
  return (email ?? "")
    .toString()
    .trim()
    .replace(/^["'<]+|["'>]+$/g, "")
    .toLowerCase();
}

/** Collapse a name or company to comparable form: lower-case, punctuation and suffixes gone. */
export function normalizeName(value: string | undefined): string {
  return (value ?? "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPANY_SUFFIXES = new Set([
  "inc", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "plc", "gmbh", "sa", "bv", "ag", "group", "holdings",
  // Joining words, so "Cedar & Vine" and "Cedar and Vine" compare equal once "&" has been
  // punctuation-stripped to nothing.
  "and", "the", "of",
]);

/** Company names differ mostly in legal suffix noise — strip it before comparing. */
export function normalizeCompany(value: string | undefined): string {
  return normalizeName(value)
    .split(" ")
    .filter((word) => word && !COMPANY_SUFFIXES.has(word))
    .join(" ");
}

/** Best available display name for a contact. */
export function contactName(contact: LeadContact): string {
  const joined = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return (contact.fullName?.trim() || joined || "").trim();
}

/**
 * The dedupe key: normalized email when present, otherwise a name+company key.
 *
 * The `name:` prefix matters — it keeps the non-email path in its own namespace so a lead
 * whose "email" column happened to contain a name can never collide with a real address.
 */
export function normalizeKey(contact: LeadContact): string {
  const email = normalizeEmail(contact.email);
  if (email) return email;
  const name = normalizeName(contactName(contact));
  const company = normalizeCompany(contact.company);
  return name || company ? `name:${name}|${company}` : `unknown:${newId()}`;
}

/* -------------------------------------------------------------------------- */
/* Similarity                                                                 */
/* -------------------------------------------------------------------------- */

/** Levenshtein distance, two-row DP. Inputs here are names, so length is small. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (a.length > b.length) [a, b] = [b, a];

  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  let curr = new Array<number>(a.length + 1);
  for (let j = 1; j <= b.length; j += 1) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

/** 1 for identical, 0 for nothing in common. */
export function similarityRatio(a: string, b: string): number {
  if (!a && !b) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Name similarity that understands shortened forenames.
 *
 * Plain edit distance rates "Tom Alvarez" vs "Thomas Alvarez" at 0.79 — under any sensible
 * threshold — yet that is the single most common way one person appears twice across a badge
 * scan and a registration list. Note that a prefix rule alone does not save it: "Tom" is not
 * a prefix of "Thomas".
 *
 * So tokens match on any of three grounds, and the best of the token score and the raw ratio
 * wins:
 *   - identical
 *   - one is a prefix of the other, ≥3 chars ("Dan"/"Daniel", "Kate"/"Katherine")
 *   - same initial, ≥3 chars, and at least half-similar ("Tom"/"Thomas", "Bill"/"William" no)
 *
 * The third rule will occasionally pair two different people with similar forenames at the
 * same company. That is the right direction to err: this path never auto-merges, it only asks
 * a human. A missed duplicate mails the same person twice and splits their engagement across
 * two rows; a queued non-duplicate costs one click.
 */
export function nameSimilarity(nameA: string, nameB: string): number {
  const raw = similarityRatio(nameA, nameB);

  const tokensA = nameA.split(" ").filter(Boolean);
  const tokensB = nameB.split(" ").filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return raw;

  const tokensMatch = (a: string, b: string): boolean => {
    if (a === b) return true;
    if (a.length < 3 || b.length < 3) return false;
    if (a.startsWith(b) || b.startsWith(a)) return true;
    return a[0] === b[0] && similarityRatio(a, b) >= 0.45;
  };

  const remaining = [...tokensB];
  let matched = 0;
  for (const token of tokensA) {
    const index = remaining.findIndex((other) => tokensMatch(token, other));
    if (index >= 0) {
      matched += 1;
      remaining.splice(index, 1);
    }
  }

  const tokenScore = matched / Math.max(tokensA.length, tokensB.length);
  return Math.max(raw, tokenScore);
}

/**
 * Combined name + company similarity, weighted toward the name.
 *
 * Company alone is far too weak a signal — a big enough company puts dozens of unrelated
 * people at similarity 1.0 — so a pair only clears the bar when the names are close too.
 */
export function contactSimilarity(a: LeadContact, b: LeadContact): number {
  const nameA = normalizeName(contactName(a));
  const nameB = normalizeName(contactName(b));
  if (!nameA || !nameB) return 0;

  const nameScore = nameSimilarity(nameA, nameB);
  const companyA = normalizeCompany(a.company);
  const companyB = normalizeCompany(b.company);

  // Without a company on either side, the name has to carry the whole judgement.
  if (!companyA || !companyB) return nameScore * 0.9;

  const companyScore = similarityRatio(companyA, companyB);
  // Rounded before it meets a threshold: 0.7 + 0.3 weighting lands exactly on 0.85 for real
  // inputs, and unrounded that evaluates to 0.8499999999999999 and silently fails the test.
  return Math.round((nameScore * 0.7 + companyScore * 0.3) * 10_000) / 10_000;
}

/* -------------------------------------------------------------------------- */
/* Merging                                                                    */
/* -------------------------------------------------------------------------- */

function mergeContacts(
  winner: LeadContact,
  loser: LeadContact,
): { contact: LeadContact; conflicts: FieldConflict[] } {
  const fields: Array<keyof LeadContact> = [
    "firstName",
    "lastName",
    "fullName",
    "email",
    "company",
    "jobTitle",
    "phone",
  ];
  const contact: LeadContact = { ...winner };
  const conflicts: FieldConflict[] = [];

  for (const field of fields) {
    const a = winner[field]?.toString().trim();
    const b = loser[field]?.toString().trim();
    if (!b) continue;
    if (!a) {
      // Filling a gap is not a conflict — it's the main reason to merge.
      contact[field] = b;
      continue;
    }
    if (a.toLowerCase() !== b.toLowerCase()) {
      conflicts.push({ field, kept: a, discarded: b });
    }
  }

  return { contact, conflicts };
}

/** Signals are cumulative evidence, so merging takes the union / max / any. */
function mergeSignals(a: LeadSignals, b: LeadSignals): LeadSignals {
  const sessions = [...new Set([...(a.sessionsAttended ?? []), ...(b.sessionsAttended ?? [])])];
  return {
    sessionsAttended: sessions,
    // The list is the better count when we have one; fall back to the larger reported number.
    sessionsAttendedCount: Math.max(
      sessions.length,
      a.sessionsAttendedCount ?? 0,
      b.sessionsAttendedCount ?? 0,
    ),
    boothInteractions: (a.boothInteractions ?? 0) + (b.boothInteractions ?? 0),
    demoRequested: Boolean(a.demoRequested || b.demoRequested),
    // "attended" beats "registered" beats "no_show" — the strongest evidence wins.
    registrationStatus:
      a.registrationStatus === "attended" || b.registrationStatus === "attended"
        ? "attended"
        : a.registrationStatus === "registered" || b.registrationStatus === "registered"
          ? "registered"
          : (a.registrationStatus ?? b.registrationStatus),
    customSignals: { ...(b.customSignals ?? {}), ...(a.customSignals ?? {}) },
  };
}

/**
 * Merge `loser` into `winner`. The winner keeps its id and any owner/status/draft it already
 * had — merging must never silently un-route a lead a planner has already worked.
 */
export function mergeLeadRecords(winner: LeadRecord, loser: LeadRecord): LeadRecord {
  const { contact, conflicts } = mergeContacts(winner.contact, loser.contact);
  return {
    ...winner,
    contact,
    signals: mergeSignals(winner.signals, loser.signals),
    sourceRows: [...winner.sourceRows, ...loser.sourceRows],
    mergedFrom: [...(winner.mergedFrom ?? []), loser.id, ...(loser.mergedFrom ?? [])],
    conflicts: [...(winner.conflicts ?? []), ...conflicts],
    ownerId: winner.ownerId ?? loser.ownerId,
    ownerName: winner.ownerName ?? loser.ownerName,
    assignmentMethod: winner.assignmentMethod ?? loser.assignmentMethod,
    followUpDraft: winner.followUpDraft ?? loser.followUpDraft,
    updatedAt: nowIso(),
  };
}

export interface DedupeResult {
  /** The pool after exact-email auto-merges. */
  leads: LeadRecord[];
  /** Fuzzy pairs for the merge-review queue. Nothing here has been merged. */
  candidates: DuplicateCandidate[];
  autoMergedCount: number;
}

/**
 * FR-4 — auto-merge on exact email, queue fuzzy name+company pairs for review.
 *
 * Fuzzy comparison only considers leads with no email at all on at least one side: two rows
 * that both carry different, valid emails are two different people, however similar the names.
 */
export function dedupeLeads(
  leads: LeadRecord[],
  existingCandidates: DuplicateCandidate[] = [],
): DedupeResult {
  const byEmail = new Map<string, LeadRecord>();
  const merged: LeadRecord[] = [];
  let autoMergedCount = 0;

  for (const lead of leads) {
    const email = normalizeEmail(lead.contact.email);
    if (!email) {
      merged.push(lead);
      continue;
    }
    const existing = byEmail.get(email);
    if (existing) {
      const combined = mergeLeadRecords(existing, lead);
      byEmail.set(email, combined);
      const index = merged.findIndex((m) => m.id === existing.id);
      if (index >= 0) merged[index] = combined;
      autoMergedCount += 1;
    } else {
      byEmail.set(email, lead);
      merged.push(lead);
    }
  }

  // Anything already decided stays decided — re-running dedupe must not resurrect a pair the
  // planner already rejected.
  const settled = new Set(
    existingCandidates
      .filter((c) => c.status !== "pending")
      .map((c) => pairKey(c.leadAId, c.leadBId)),
  );

  const candidates: DuplicateCandidate[] = [];
  for (let i = 0; i < merged.length; i += 1) {
    for (let j = i + 1; j < merged.length; j += 1) {
      const a = merged[i];
      const b = merged[j];
      const emailA = normalizeEmail(a.contact.email);
      const emailB = normalizeEmail(b.contact.email);
      // Both have (different) emails → different people. Nothing to review.
      if (emailA && emailB) continue;
      if (settled.has(pairKey(a.id, b.id))) continue;

      const similarity = contactSimilarity(a.contact, b.contact);
      if (similarity >= FUZZY_MATCH_THRESHOLD) {
        candidates.push({
          id: newId(),
          triageSessionId: a.triageSessionId,
          leadAId: a.id,
          leadBId: b.id,
          similarity: Math.round(similarity * 100) / 100,
          reason: `${Math.round(similarity * 100)}% name and company match, and at least one has no email`,
          status: "pending",
        });
      }
    }
  }

  return { leads: merged, candidates, autoMergedCount };
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Resolve a reviewed pair by merging B into A, returning the new pool. */
export function applyMerge(leads: LeadRecord[], leadAId: string, leadBId: string): LeadRecord[] {
  const a = leads.find((l) => l.id === leadAId);
  const b = leads.find((l) => l.id === leadBId);
  if (!a || !b) return leads;
  const combined = mergeLeadRecords(a, b);
  return leads.filter((l) => l.id !== leadBId).map((l) => (l.id === leadAId ? combined : l));
}
