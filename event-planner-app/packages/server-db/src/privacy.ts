// packages/server-db/src/privacy.ts
//
// PRD 10 FR-1, FR-2, FR-3, FR-4, FR-6 — the obligations that begin the moment other people's
// personal data lands on a server.
//
// Until the hosted tier existed this product held a great deal of third-party personal data and
// had no obligations at all, because none of it left the planner's browser. Now attendees whose
// badges were scanned have rights over that data, and the customer cannot honour them unless this
// product provides the mechanism. That is what this file is.
//
// Every operation is driven by `PII_REGISTRY` rather than written per tool. Seven hand-written
// traversals means missing one, and the one missed is a category of personal data that survives
// every deletion request anybody makes.

import {
  PII_REGISTRY,
  eraseSubject,
  eraseSubjectFromCollection,
  extractSubject,
  matchesSubject,
  piiLocation,
  retainedKinds,
  thirdPartyKinds,
  type SubjectExtract,
} from "@event-toolkit/pii-registry";
import { assertCan, type AccessContext } from "@event-toolkit/access";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { accessEvents, records, retentionPolicies, workspaces } from "./schema";
import type { Db } from "./db-type";

const nextSeq = sql`nextval(pg_get_serial_sequence('records', 'seq'))`;

export interface SubjectHit {
  kind: string;
  label: string;
  documentId: string;
  sensitivity: "business_contact" | "third_party_personal";
  extract: SubjectExtract;
}

/**
 * FR-6 — every read of third-party personal data is logged.
 *
 * Paired with PRD 8's `leads:view`, this is the whole access-control story for the most sensitive
 * data the product holds: a short list of who may read it, and a record of every time they did.
 */
async function logPiiAccess(
  db: Db,
  ctx: AccessContext,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.insert(accessEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action,
    detail,
  });
}

/**
 * FR-1 — find every record in this workspace that references one person.
 *
 * Gated on `leads:view`, not on `members:manage`. An admin who cannot read attendee data must not
 * be able to reach it through the privacy screen — otherwise subject search is a way around the
 * one permission PRD 8 says has a legal consequence attached.
 */
export async function searchSubject(db: Db, ctx: AccessContext, email: string): Promise<SubjectHit[]> {
  assertCan(ctx, "leads:view");

  const kinds = PII_REGISTRY.map((l) => l.kind);
  const rows = await db
    .select()
    .from(records)
    .where(
      and(eq(records.workspaceId, ctx.workspaceId), inArray(records.kind, kinds), isNull(records.deletedAt)),
    );

  const hits: SubjectHit[] = [];
  for (const row of rows) {
    const location = piiLocation(row.kind);
    if (!location) continue;
    if (!matchesSubject(row.document, location, email)) continue;
    hits.push({
      kind: row.kind,
      label: location.label,
      documentId: row.documentId,
      sensitivity: location.sensitivity,
      extract: extractSubject(row.document, location),
    });
  }

  // The search itself is a read of personal data, so it is logged like any other.
  await logPiiAccess(db, ctx, "privacy.subject_searched", { matches: hits.length });
  return hits;
}

/** FR-3 — everything held about one person, for a subject access request. */
export async function exportSubject(db: Db, ctx: AccessContext, email: string) {
  const hits = await searchSubject(db, ctx, email);
  await logPiiAccess(db, ctx, "privacy.subject_exported", { matches: hits.length });
  return {
    subject: email.trim().toLowerCase(),
    exportedAt: new Date().toISOString(),
    workspaceId: ctx.workspaceId,
    records: hits.map((h) => ({ kind: h.kind, label: h.label, documentId: h.documentId, data: h.extract.fields })),
  };
}

export interface DeletionResult {
  deletedRecords: number;
  erasedFields: number;
  /** Aggregates already computed are not recomputed. The UI states this plainly — see below. */
  note: string;
}

/**
 * FR-2 — delete everything about one person, honouring each location's strategy.
 *
 * **Hard deletion.** The row is removed, not flagged: "we kept it but stopped showing it" is not
 * an answer to an erasure request. What survives is a tombstone carrying no document, which is
 * what lets PRD 9 propagate the deletion to every device rather than leaving copies behind on the
 * laptops that already synced.
 *
 * Aggregates already computed — a lead count, a cost per lead — are deliberately not recomputed.
 * A count is not personal data, and rewriting last quarter's ROI report to pretend somebody was
 * never there would be theatre that also destroys the report's integrity. The UI says so.
 */
export async function deleteSubject(db: Db, ctx: AccessContext, email: string): Promise<DeletionResult> {
  assertCan(ctx, "leads:edit");

  const hits = await searchSubject(db, ctx, email);
  let deletedRecords = 0;
  let erasedFields = 0;

  for (const hit of hits) {
    const location = piiLocation(hit.kind)!;
    const [row] = await db
      .select()
      .from(records)
      .where(
        and(
          eq(records.workspaceId, ctx.workspaceId),
          eq(records.kind, hit.kind),
          eq(records.documentId, hit.documentId),
        ),
      );
    if (!row) continue;

    const outcome =
      location.eraseStrategy === "fields"
        ? eraseSubjectFromCollection(row.document, location, email)
        : eraseSubject(row.document, location);

    if (outcome.action === "delete_record") {
      await db
        .update(records)
        .set({
          // The document goes with the row's contents, not merely out of view. A tombstone that
          // still carries the person's data is the same data, one query away.
          document: {},
          deletedAt: new Date(),
          version: row.version + 1,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
          seq: nextSeq as never,
        })
        .where(eq(records.id, row.id));
      deletedRecords += 1;
    } else {
      await db
        .update(records)
        .set({
          document: outcome.document,
          version: row.version + 1,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
          seq: nextSeq as never,
        })
        .where(eq(records.id, row.id));
      erasedFields += 1;
    }
  }

  await logPiiAccess(db, ctx, "privacy.subject_deleted", { deletedRecords, erasedFields });

  return {
    deletedRecords,
    erasedFields,
    note:
      "Figures already calculated — lead counts, cost per lead, the ROI scorecard — are not " +
      "recalculated. They contain no personal data, and rewriting them would not remove anything " +
      "about this person.",
  };
}

/* -------------------------------------------------------------------------- */
/* Retention (FR-4)                                                            */
/* -------------------------------------------------------------------------- */

export async function getRetentionPolicy(db: Db, workspaceId: string) {
  const [row] = await db.select().from(retentionPolicies).where(eq(retentionPolicies.workspaceId, workspaceId));
  // 12 months is PRD 10's default. A workspace with no row has not opted out; it has not been asked.
  return row ?? { workspaceId, months: 12, enabled: true, lastRunAt: null, updatedAt: new Date() };
}

export async function setRetentionPolicy(db: Db, ctx: AccessContext, months: number, enabled: boolean) {
  assertCan(ctx, "members:manage");
  await db
    .insert(retentionPolicies)
    .values({ workspaceId: ctx.workspaceId, months, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: retentionPolicies.workspaceId,
      set: { months, enabled, updatedAt: new Date() },
    });
  await logPiiAccess(db, ctx, "privacy.retention_changed", { months, enabled });
}

export interface PurgeResult {
  workspaceId: string;
  purged: number;
  cutoff: string;
  skipped: "disabled" | null;
}

/**
 * The daily purge.
 *
 * Applies only to locations marked `retained` — attendee data and survey responses. Briefs,
 * budgets and retros are the planner's own record of their own events and are never purged out
 * from under them.
 *
 * Runs without an `AccessContext` because it is a scheduled job rather than a person, and it
 * writes an audit entry for the same reason: an automated deletion nobody can account for
 * afterwards is indistinguishable from data loss.
 */
export async function purgeExpiredRecords(
  db: Db,
  workspaceId: string,
  now: Date = new Date(),
): Promise<PurgeResult> {
  const policy = await getRetentionPolicy(db, workspaceId);
  if (!policy.enabled) {
    return { workspaceId, purged: 0, cutoff: now.toISOString(), skipped: "disabled" };
  }

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - policy.months);

  const expired = await db
    .select({ id: records.id, version: records.version })
    .from(records)
    .where(
      and(
        eq(records.workspaceId, workspaceId),
        inArray(records.kind, retainedKinds()),
        isNull(records.deletedAt),
        lt(records.updatedAt, cutoff),
      ),
    );

  for (const row of expired) {
    await db
      .update(records)
      .set({
        document: {},
        deletedAt: now,
        version: row.version + 1,
        updatedAt: now,
        seq: nextSeq as never,
      })
      .where(eq(records.id, row.id));
  }

  await db.insert(accessEvents).values({
    workspaceId,
    actorUserId: null,
    action: "privacy.retention_purge",
    detail: { purged: expired.length, cutoff: cutoff.toISOString(), months: policy.months },
  });

  await db
    .insert(retentionPolicies)
    .values({ workspaceId, months: policy.months, enabled: policy.enabled, lastRunAt: now })
    .onConflictDoUpdate({ target: retentionPolicies.workspaceId, set: { lastRunAt: now } });

  return { workspaceId, purged: expired.length, cutoff: cutoff.toISOString(), skipped: null };
}

/** Every workspace, for the daily purge. No context: a cron job is not a person. */
export async function listAllWorkspaceIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  return rows.map((r) => r.id);
}

/** Kinds whose every read is logged. Exported so the pull path can apply the same rule. */
export const LOGGED_KINDS = thirdPartyKinds();
