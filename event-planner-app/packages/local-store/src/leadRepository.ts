/**
 * Lead triage repository (PRD 5) — same shape as `briefRepository`.
 *
 * This is the only persistence path for attendee personal data. It reads `EventBrief` through
 * the existing `getBrief` when a session is linked and NEVER writes one: PRD 5 is strictly
 * read-only against briefs in v1, so no brief-write function is imported here at all.
 */

import { nowIso } from "@event-toolkit/schema";
import type {
  DuplicateCandidate,
  FollowUpTemplate,
  ImportBatch,
  LeadRecord,
  ScoringRubric,
  TriageSession,
} from "@event-toolkit/lead-triage-core";
import {
  getDb,
  STORE_DUPLICATE_CANDIDATES,
  STORE_FOLLOWUP_TEMPLATES,
  STORE_IMPORT_BATCHES,
  STORE_LEAD_RECORDS,
  STORE_SCORING_RUBRICS,
  STORE_TRIAGE_SESSIONS,
} from "./db";

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

export async function getSession(id: string): Promise<TriageSession | null> {
  const db = await getDb();
  return (await db.get(STORE_TRIAGE_SESSIONS, id)) ?? null;
}

export async function listSessions(): Promise<TriageSession[]> {
  const db = await getDb();
  const rows = await db.getAll(STORE_TRIAGE_SESSIONS);
  return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function saveSession(session: TriageSession): Promise<TriageSession> {
  const next = { ...session, updatedAt: nowIso() };
  const db = await getDb();
  await db.put(STORE_TRIAGE_SESSIONS, next);
  return next;
}

/** Delete a session and everything belonging to it. */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  const [leads, batches, rubrics, templates, candidates] = await Promise.all([
    db.getAllFromIndex(STORE_LEAD_RECORDS, "triageSessionId", id),
    db.getAllFromIndex(STORE_IMPORT_BATCHES, "triageSessionId", id),
    db.getAllFromIndex(STORE_SCORING_RUBRICS, "triageSessionId", id),
    db.getAllFromIndex(STORE_FOLLOWUP_TEMPLATES, "triageSessionId", id),
    db.getAllFromIndex(STORE_DUPLICATE_CANDIDATES, "triageSessionId", id),
  ]);

  const tx = db.transaction(
    [
      STORE_TRIAGE_SESSIONS,
      STORE_LEAD_RECORDS,
      STORE_IMPORT_BATCHES,
      STORE_SCORING_RUBRICS,
      STORE_FOLLOWUP_TEMPLATES,
      STORE_DUPLICATE_CANDIDATES,
    ],
    "readwrite",
  );
  await tx.objectStore(STORE_TRIAGE_SESSIONS).delete(id);
  for (const row of leads) await tx.objectStore(STORE_LEAD_RECORDS).delete(row.id);
  for (const row of batches) await tx.objectStore(STORE_IMPORT_BATCHES).delete(row.id);
  for (const row of rubrics) await tx.objectStore(STORE_SCORING_RUBRICS).delete(row.id);
  for (const row of templates) await tx.objectStore(STORE_FOLLOWUP_TEMPLATES).delete(row.id);
  for (const row of candidates) await tx.objectStore(STORE_DUPLICATE_CANDIDATES).delete(row.id);
  await tx.done;
}

/* -------------------------------------------------------------------------- */
/* Import batches                                                              */
/* -------------------------------------------------------------------------- */

export async function listImportBatches(sessionId: string): Promise<ImportBatch[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_IMPORT_BATCHES, "triageSessionId", sessionId);
  return rows.sort((a, b) => (a.importedAt < b.importedAt ? -1 : 1));
}

export async function saveImportBatch(batch: ImportBatch): Promise<ImportBatch> {
  const db = await getDb();
  await db.put(STORE_IMPORT_BATCHES, batch);
  return batch;
}

/* -------------------------------------------------------------------------- */
/* Leads                                                                       */
/* -------------------------------------------------------------------------- */

export async function listLeads(sessionId: string): Promise<LeadRecord[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_LEAD_RECORDS, "triageSessionId", sessionId);
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function getLead(id: string): Promise<LeadRecord | null> {
  const db = await getDb();
  return (await db.get(STORE_LEAD_RECORDS, id)) ?? null;
}

export async function saveLead(lead: LeadRecord): Promise<LeadRecord> {
  const next = { ...lead, updatedAt: nowIso() };
  const db = await getDb();
  await db.put(STORE_LEAD_RECORDS, next);
  return next;
}

export async function saveLeadsBulk(leads: LeadRecord[]): Promise<LeadRecord[]> {
  const db = await getDb();
  const tx = db.transaction(STORE_LEAD_RECORDS, "readwrite");
  for (const lead of leads) await tx.store.put(lead);
  await tx.done;
  return leads;
}

export async function deleteLead(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_LEAD_RECORDS, id);
}

/**
 * Replace a session's whole pool.
 *
 * Dedupe and re-scoring operate on the pool as a set — a merge removes a record — so the
 * write has to delete what's gone rather than only upserting what remains, or merged-away
 * leads would reappear on the next load.
 */
export async function replaceLeads(sessionId: string, leads: LeadRecord[]): Promise<LeadRecord[]> {
  const db = await getDb();
  const existing = await db.getAllFromIndex(STORE_LEAD_RECORDS, "triageSessionId", sessionId);
  const keep = new Set(leads.map((lead) => lead.id));

  const tx = db.transaction(STORE_LEAD_RECORDS, "readwrite");
  for (const row of existing) {
    if (!keep.has(row.id)) await tx.store.delete(row.id);
  }
  for (const lead of leads) await tx.store.put(lead);
  await tx.done;
  return leads;
}

/* -------------------------------------------------------------------------- */
/* Rubric, templates, duplicate candidates                                     */
/* -------------------------------------------------------------------------- */

export async function getRubric(sessionId: string): Promise<ScoringRubric | null> {
  const db = await getDb();
  const rows = await db.getAllFromIndex(STORE_SCORING_RUBRICS, "triageSessionId", sessionId);
  return rows[0] ?? null;
}

export async function saveRubric(rubric: ScoringRubric): Promise<ScoringRubric> {
  const next = { ...rubric, updatedAt: nowIso() };
  const db = await getDb();
  await db.put(STORE_SCORING_RUBRICS, next);
  return next;
}

export async function listTemplates(sessionId: string): Promise<FollowUpTemplate[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_FOLLOWUP_TEMPLATES, "triageSessionId", sessionId);
}

export async function saveTemplate(template: FollowUpTemplate): Promise<FollowUpTemplate> {
  const next = { ...template, updatedAt: nowIso() };
  const db = await getDb();
  await db.put(STORE_FOLLOWUP_TEMPLATES, next);
  return next;
}

export async function saveTemplates(templates: FollowUpTemplate[]): Promise<FollowUpTemplate[]> {
  const db = await getDb();
  const tx = db.transaction(STORE_FOLLOWUP_TEMPLATES, "readwrite");
  for (const template of templates) await tx.store.put(template);
  await tx.done;
  return templates;
}

export async function listDuplicateCandidates(sessionId: string): Promise<DuplicateCandidate[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_DUPLICATE_CANDIDATES, "triageSessionId", sessionId);
}

export async function saveDuplicateCandidates(
  sessionId: string,
  candidates: DuplicateCandidate[],
): Promise<DuplicateCandidate[]> {
  const db = await getDb();
  const existing = await db.getAllFromIndex(STORE_DUPLICATE_CANDIDATES, "triageSessionId", sessionId);
  const keep = new Set(candidates.map((c) => c.id));

  const tx = db.transaction(STORE_DUPLICATE_CANDIDATES, "readwrite");
  for (const row of existing) {
    if (!keep.has(row.id)) await tx.store.delete(row.id);
  }
  for (const candidate of candidates) await tx.store.put(candidate);
  await tx.done;
  return candidates;
}
