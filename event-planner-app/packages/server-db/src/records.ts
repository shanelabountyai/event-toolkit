// packages/server-db/src/records.ts
//
// The document envelope, server side: PRD 8 FR-9's migration and PRD 9's push and pull.
//
// The permission check lives here rather than in the route handlers, because push and pull are
// the two places every tool's data passes through. A rule enforced at the seam is enforced once;
// a rule enforced in the handler is enforced for the handlers somebody remembered.

import { assertCan, can, type AccessContext, type Capability } from "@event-toolkit/access";
import { classify, type OutboxEntry, type Resolution, type ServerRecord } from "@event-toolkit/sync-engine";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { records, workspaces } from "./schema";

import type { Db } from "./db-type";

/**
 * Which capability governs which sync kind.
 *
 * The same mapping `local-store` applies on the device, restated for the server because the
 * server must never trust the client to have applied it. `logisticsPack.*` all answer to
 * logistics; the two kinds carrying third-party personal data answer to `leads` rather than to
 * the tool that displays them (PRD 8 FR-5).
 */
export function capabilityForKind(kind: string, verb: "view" | "edit"): Capability {
  if (kind.startsWith("logisticsPack")) return `logistics:${verb}`;

  const tool = KIND_TOOLS[kind];
  // An unknown kind maps to a capability only an owner holds, so a kind the server has never
  // heard of cannot be written by a coordinator on the strength of the client asking nicely.
  return tool ? (`${tool}:${verb}` as Capability) : "workspace:delete";
}

const KIND_TOOLS: Record<string, string> = {
  briefs: "brief",
  promoAssetSets: "promo",
  pacingEntries: "promo",
  pacingConfigs: "promo",
  budgetLineItems: "budget",
  budgetSettings: "budget",
  triageSessions: "leads",
  importBatches: "leads",
  leadRecords: "leads",
  scoringRubrics: "leads",
  followUpTemplates: "leads",
  duplicateCandidates: "leads",
  roiReports: "roi",
  attributionSettings: "roi",
  pipelineImportBatches: "roi",
  surveyImportBatches: "roi",
  // Personal data — gated by leads, not roi. See PRD 8 FR-5 and PRD 10's classification.
  surveyResponses: "leads",
  pipelineOpportunities: "leads",
  retros: "retro",
};

/** `nextval` on every write, so the pull cursor advances for updates and not only inserts. */
const nextSeq = sql`nextval(pg_get_serial_sequence('records', 'seq'))`;

/* -------------------------------------------------------------------------- */
/* Migration (PRD 8 FR-9)                                                      */
/* -------------------------------------------------------------------------- */

export interface IncomingRecord {
  kind: string;
  documentId: string;
  document: unknown;
}

export interface MigrationResult {
  inserted: number;
  updated: number;
  skipped: { kind: string; documentId: string; reason: string }[];
}

/**
 * Upload a whole local dataset into a workspace.
 *
 * **Idempotent.** Every row upserts onto (workspaceId, kind, documentId), so running it twice
 * produces the same workspace rather than two copies of every event. That property is not a nicety:
 * the characteristic failure of a migration is a half-finished one that somebody retries.
 *
 * Records the user may not write are skipped and reported rather than silently dropped — a
 * migration that quietly loses a third of somebody's data is worse than one that refuses.
 */
export async function migrateRecords(
  db: Db,
  ctx: AccessContext,
  incoming: IncomingRecord[],
): Promise<MigrationResult> {
  const result: MigrationResult = { inserted: 0, updated: 0, skipped: [] };

  for (const record of incoming) {
    const capability = capabilityForKind(record.kind, "edit");
    if (!can(ctx, capability)) {
      result.skipped.push({ kind: record.kind, documentId: record.documentId, reason: capability });
      continue;
    }

    const [existing] = await db
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          eq(records.workspaceId, ctx.workspaceId),
          eq(records.kind, record.kind),
          eq(records.documentId, record.documentId),
        ),
      );

    if (existing) {
      await db
        .update(records)
        .set({
          document: record.document,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
          seq: nextSeq as never,
          // A re-run of the migration is not a new edit by another person, so the version does
          // not advance — otherwise every retry would invalidate every device's base version and
          // manufacture conflicts out of nothing.
        })
        .where(eq(records.id, existing.id));
      result.updated += 1;
    } else {
      await db.insert(records).values({
        workspaceId: ctx.workspaceId,
        kind: record.kind,
        documentId: record.documentId,
        document: record.document,
        updatedBy: ctx.userId,
      });
      result.inserted += 1;
    }
  }

  await db.update(workspaces).set({ migratedAt: new Date() }).where(eq(workspaces.id, ctx.workspaceId));
  return result;
}

/* -------------------------------------------------------------------------- */
/* Push (PRD 9 FR-5)                                                           */
/* -------------------------------------------------------------------------- */

export interface PushResult {
  applied: { kind: string; documentId: string; version: number }[];
  conflicts: { kind: string; documentId: string; resolution: Resolution; server: ServerRecord }[];
  rejected: { kind: string; documentId: string; reason: string }[];
}

async function loadServerRecord(
  db: Db,
  workspaceId: string,
  kind: string,
  documentId: string,
): Promise<ServerRecord | null> {
  const [row] = await db
    .select()
    .from(records)
    .where(
      and(eq(records.workspaceId, workspaceId), eq(records.kind, kind), eq(records.documentId, documentId)),
    );
  if (!row) return null;
  return {
    kind: row.kind,
    documentId: row.documentId,
    document: row.document,
    version: row.version,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

/**
 * Apply a batch of queued mutations.
 *
 * Conflicts are **returned, not resolved**. The server has no way to know which of two edits a
 * person meant to keep, and guessing is how somebody's work disappears without anybody noticing.
 * This is the same refusal PRD 2, PRD 5 and PRD 7 already make in their own domains.
 */
export async function pushMutations(
  db: Db,
  ctx: AccessContext,
  mutations: OutboxEntry[],
): Promise<PushResult> {
  const result: PushResult = { applied: [], conflicts: [], rejected: [] };

  for (const mutation of mutations) {
    const capability = capabilityForKind(mutation.kind, "edit");
    if (!can(ctx, capability)) {
      result.rejected.push({ kind: mutation.kind, documentId: mutation.documentId, reason: capability });
      continue;
    }
    // A client is free to claim any workspace it likes. The context is what decides.
    if (mutation.workspaceId !== ctx.workspaceId) {
      result.rejected.push({
        kind: mutation.kind,
        documentId: mutation.documentId,
        reason: "workspace_mismatch",
      });
      continue;
    }

    const server = await loadServerRecord(db, ctx.workspaceId, mutation.kind, mutation.documentId);
    const resolution = classify(mutation, server, ctx.userId);

    if (resolution === "conflict" || resolution === "server_wins") {
      result.conflicts.push({
        kind: mutation.kind,
        documentId: mutation.documentId,
        resolution,
        server: server!,
      });
      continue;
    }

    const isDelete = mutation.document === null;

    if (!server) {
      const [inserted] = await db
        .insert(records)
        .values({
          workspaceId: ctx.workspaceId,
          kind: mutation.kind,
          documentId: mutation.documentId,
          document: mutation.document ?? {},
          updatedBy: ctx.userId,
          deletedAt: isDelete ? new Date() : null,
        })
        .returning({ version: records.version });
      result.applied.push({ kind: mutation.kind, documentId: mutation.documentId, version: inserted.version });
      continue;
    }

    const [updated] = await db
      .update(records)
      .set({
        document: mutation.document ?? server.document,
        version: server.version + 1,
        updatedAt: new Date(),
        updatedBy: ctx.userId,
        seq: nextSeq as never,
        deletedAt: isDelete ? new Date() : null,
      })
      .where(
        and(
          eq(records.workspaceId, ctx.workspaceId),
          eq(records.kind, mutation.kind),
          eq(records.documentId, mutation.documentId),
          // The version is checked in the WHERE clause, not only in `classify`. Between reading
          // the record and writing it another request can land, and a check that is not part of
          // the write is not a check at all.
          eq(records.version, server.version),
        ),
      )
      .returning({ version: records.version });

    if (!updated) {
      const fresh = await loadServerRecord(db, ctx.workspaceId, mutation.kind, mutation.documentId);
      result.conflicts.push({
        kind: mutation.kind,
        documentId: mutation.documentId,
        resolution: "conflict",
        server: fresh!,
      });
      continue;
    }

    result.applied.push({ kind: mutation.kind, documentId: mutation.documentId, version: updated.version });
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Pull (PRD 9 FR-3)                                                           */
/* -------------------------------------------------------------------------- */

export interface PullResult {
  records: (ServerRecord & { seq: number })[];
  cursor: string;
  hasMore: boolean;
}

/**
 * Everything in this workspace after `since`, in sequence order.
 *
 * Records the caller may not read are filtered out here rather than at the client. A Finance
 * user's device should never receive an attendee record in the first place — filtering it in the
 * UI would mean the data reached the browser, sat in IndexedDB, and appeared in any backup of it.
 */
export async function pullRecords(
  db: Db,
  ctx: AccessContext,
  since: string = "0",
  limit = 500,
): Promise<PullResult> {
  assertCan(ctx, "brief:view");

  const cursor = Number.parseInt(since, 10);
  const from = Number.isFinite(cursor) && cursor > 0 ? cursor : 0;

  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, ctx.workspaceId), gt(records.seq, from)))
    .orderBy(asc(records.seq))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const visible = page.filter((row) => can(ctx, capabilityForKind(row.kind, "view")));

  return {
    records: visible.map((row) => ({
      kind: row.kind,
      documentId: row.documentId,
      document: row.document,
      version: row.version,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      seq: Number(row.seq),
    })),
    // The cursor advances past everything *read*, not everything returned. Otherwise a page
    // consisting entirely of records this role cannot see would leave the cursor unmoved and the
    // client would request it forever.
    cursor: String(page.length > 0 ? Number(page[page.length - 1].seq) : from),
    hasMore: rows.length > limit,
  };
}
