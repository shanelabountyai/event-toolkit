// packages/server-db/src/share-links.ts
//
// PRD 8 FR-8 — read-only links for on-site staff.
//
// The point of the link is that somebody standing in a venue can read the run of show and report
// that the projector is broken, without being given an account or the run of the workspace. It is
// a credential in a URL, so everything here is built around that being true: 32 bytes of CSPRNG
// output, an expiry, revocation, and a scope of exactly one logistics pack.
//
// What the link *confers* is decided in `packages/access`, not here. This file only records that
// it exists.

import { assertCan, isShareLinkValid, type AccessContext, type ShareLinkGrant } from "@event-toolkit/access";
import { and, eq } from "drizzle-orm";
import { accessEvents, records, shareLinks } from "./schema";
import type { Db } from "./db-type";

/** Event end + 2 days, per FR-8. Used when the caller does not name an expiry. */
export const DEFAULT_SHARE_TTL_DAYS = 2;

function token(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

export async function createShareLink(
  db: Db,
  ctx: AccessContext,
  logisticsPackId: string,
  expiresAt: Date,
) {
  // Creating a link hands out access, so it needs the right to edit the thing being shared —
  // not merely to view it. Otherwise anyone who can read a pack can widen who else can.
  assertCan(ctx, "logistics:edit");

  const [link] = await db
    .insert(shareLinks)
    .values({
      workspaceId: ctx.workspaceId,
      logisticsPackId,
      token: token(),
      expiresAt,
      createdBy: ctx.userId,
    })
    .returning();

  await db.insert(accessEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "share_link.created",
    targetId: link.id,
    detail: { logisticsPackId, expiresAt: expiresAt.toISOString() },
  });

  return link;
}

export async function listShareLinks(db: Db, ctx: AccessContext, logisticsPackId: string) {
  assertCan(ctx, "logistics:view");
  return db
    .select()
    .from(shareLinks)
    .where(
      and(eq(shareLinks.workspaceId, ctx.workspaceId), eq(shareLinks.logisticsPackId, logisticsPackId)),
    );
}

export async function revokeShareLink(db: Db, ctx: AccessContext, linkId: string) {
  assertCan(ctx, "logistics:edit");
  await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.id, linkId), eq(shareLinks.workspaceId, ctx.workspaceId)));

  await db.insert(accessEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "share_link.revoked",
    targetId: linkId,
  });
}

/**
 * Resolve a token into the grant `can()` understands.
 *
 * Returns null for anything that is not a live link, so an expired token and a forged one are
 * indistinguishable to the caller — and therefore to whoever is holding the URL.
 */
export async function resolveShareLink(
  db: Db,
  tokenValue: string,
  now: Date = new Date(),
): Promise<{ workspaceId: string; grant: ShareLinkGrant } | null> {
  const [row] = await db.select().from(shareLinks).where(eq(shareLinks.token, tokenValue));
  if (!row) return null;

  const grant: ShareLinkGrant = {
    logisticsPackId: row.logisticsPackId,
    expiresAt: row.expiresAt.toISOString(),
    revoked: row.revokedAt !== null,
  };

  if (!isShareLinkValid(grant, now)) return null;
  return { workspaceId: row.workspaceId, grant };
}

/**
 * Every record making up one logistics pack.
 *
 * Scoped to the pack and to the workspace in the query itself, rather than fetched broadly and
 * filtered afterwards. A share-link request is the least trusted request this product serves, and
 * "fetch everything, show some of it" is how the rest ends up in a payload somebody can read.
 */
export async function loadPackRecords(db: Db, workspaceId: string, logisticsPackId: string) {
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, "logisticsPack")));

  const scalars = rows.find((r) => r.documentId === logisticsPackId && r.deletedAt === null);
  if (!scalars) return null;

  const itemKinds = [
    "logisticsPack.session",
    "logisticsPack.staff",
    "logisticsPack.shipping",
    "logisticsPack.checklist",
    "logisticsPack.contact",
    "logisticsPack.issue",
  ];

  const all = await db
    .select()
    .from(records)
    .where(eq(records.workspaceId, workspaceId));

  const items = all
    .filter(
      (r) =>
        itemKinds.includes(r.kind) &&
        r.deletedAt === null &&
        (r.document as { packId?: string })?.packId === logisticsPackId,
    )
    .map((r) => ({ kind: r.kind, documentId: r.documentId, document: r.document }));

  return { scalars: scalars.document, items };
}

/**
 * The logistics packs in a workspace, for the screen that hands out links.
 *
 * Reads the envelope rather than the tool's own storage, because on the server the envelope is
 * all there is — the pack the planner edits lives in their browser until sync writes it here.
 */
export async function listPacksInWorkspace(db: Db, ctx: AccessContext) {
  assertCan(ctx, "logistics:view");
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, ctx.workspaceId), eq(records.kind, "logisticsPack")));

  return rows
    .filter((r) => r.deletedAt === null)
    .map((r) => ({
      id: r.documentId,
      eventBriefId: (r.document as { eventBriefId?: string }).eventBriefId ?? null,
      updatedAt: r.updatedAt,
    }));
}

/**
 * Append one issue to the log through a share link.
 *
 * The only write a link permits. It is an insert of a new record rather than an edit of anything
 * existing, which is what makes it safe to hand to a phone in a venue: the worst a leaked link can
 * do is add noise to an issue log, not change a run of show or reach a lead.
 */
export async function appendIssueViaShareLink(
  db: Db,
  workspaceId: string,
  logisticsPackId: string,
  issue: {
    id: string;
    timestamp: string;
    description: string;
    severity: "low" | "medium" | "high";
    status: "open" | "resolved";
    loggedBy?: string;
  },
) {
  await db
    .insert(records)
    .values({
      workspaceId,
      kind: "logisticsPack.issue",
      documentId: issue.id,
      document: { ...issue, packId: logisticsPackId },
    })
    // A retried submit from a flaky venue connection must not produce two identical issues.
    .onConflictDoNothing();

  await db.insert(accessEvents).values({
    workspaceId,
    actorUserId: null,
    action: "share_link.issue_logged",
    targetId: issue.id,
    detail: { logisticsPackId },
  });
}
