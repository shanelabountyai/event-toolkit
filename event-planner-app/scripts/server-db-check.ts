/**
 * The hosted tier against a real Postgres.
 *
 * PGlite is Postgres compiled to WebAssembly, so this runs the actual generated migration and the
 * actual queries — the partial unique index, the role enum, the foreign keys, the sequence — with
 * nothing provisioned, on a laptop and in CI. Mocking the database was the alternative, and a mock
 * agrees with whatever the code does, which is the thing under test.
 *
 * The cases that matter most here are the ones where the rule is enforced by the *database*
 * rather than by the code that remembers to check: migration idempotency resting on a unique
 * index, and the version check living in the UPDATE's WHERE clause rather than only in `classify`.
 *
 * Run with: pnpm server-db-check
 */

import {
  InvitationError,
  MembershipError,
  acceptInvitation,
  capabilityForKind,
  changeRole,
  createWorkspace,
  inviteMember,
  listAccessEvents,
  listInvitations,
  listMembers,
  migrateRecords,
  pullRecords,
  pushMutations,
  removeMember,
  revokeInvitation,
  roleOf,
  invitations,
  records,
  sessions,
  users,
} from "../packages/server-db/src/index";
import { createTestDb, type TestDatabase } from "../packages/server-db/src/testing";
import { PermissionError, type AccessContext, type Role } from "../packages/access/src/index";
import type { OutboxEntry } from "../packages/sync-engine/src/index";
import { eq } from "drizzle-orm";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function throws<T extends Error>(
  fn: () => Promise<unknown>,
  type: new (...args: never[]) => T,
  code?: string,
): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (error) {
    if (!(error instanceof type)) return false;
    return code === undefined || (error as unknown as { code?: string }).code === code;
  }
}

async function makeUser(db: TestDatabase, email: string, name: string) {
  const [user] = await db.insert(users).values({ email, name, emailVerified: new Date() }).returning();
  return user;
}

function ctx(workspaceId: string, userId: string, role: Role | null): AccessContext {
  return { workspaceId, userId, role };
}

function mutation(over: Partial<OutboxEntry> & Pick<OutboxEntry, "workspaceId" | "userId">): OutboxEntry {
  return {
    id: crypto.randomUUID(),
    kind: "briefs",
    documentId: "doc-1",
    document: { id: "doc-1", name: "edited" },
    baseVersion: 1,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    ...over,
  };
}

async function main(): Promise<void> {
  const db = await createTestDb();

  const alice = await makeUser(db, "alice@example.com", "Alice");
  const bob = await makeUser(db, "bob@example.com", "Bob");
  const cara = await makeUser(db, "cara@example.com", "Cara");

  console.log("\nWorkspace creation");
  const ws = await createWorkspace(db, "Field Marketing", alice.id);
  const owner = ctx(ws.id, alice.id, "owner");
  check("the creator is an owner", (await roleOf(db, ws.id, alice.id)) === "owner");
  check("a stranger holds no role", (await roleOf(db, ws.id, bob.id)) === null);
  check("creation is logged", (await listAccessEvents(db, owner)).some((e) => e.action === "workspace.created"));

  console.log("\nInvitations (FR-6)");
  const invite = await inviteMember(db, owner, "  BOB@Example.com ", "planner");
  check("the email is normalised", invite.email === "bob@example.com");
  check("the token is long enough to be a credential", invite.token.length >= 32);
  check("it expires", invite.expiresAt.getTime() > Date.now());
  check("…in 14 days", Math.round((invite.expiresAt.getTime() - Date.now()) / 86_400_000) === 14);
  check("it is listed as pending", (await listInvitations(db, owner)).length === 1);

  check(
    "⭐ a forwarded invitation cannot be used by whoever received it",
    await throws(() => acceptInvitation(db, invite.token, cara), InvitationError, "wrong_email"),
    "without this, forwarding the link is a way into somebody else's attendee data",
  );
  check(
    "an unknown token is refused",
    await throws(() => acceptInvitation(db, "not-a-token", bob), InvitationError, "invalid"),
  );

  await acceptInvitation(db, invite.token, bob);
  check("the invited person joins with the role they were offered", (await roleOf(db, ws.id, bob.id)) === "planner");
  check(
    "a second accept is refused rather than duplicating the membership",
    await throws(() => acceptInvitation(db, invite.token, bob), InvitationError, "already_accepted"),
  );
  check("one membership row, not two", (await listMembers(db, owner)).filter((m) => m.userId === bob.id).length === 1);

  {
    // The partial unique index has to allow re-inviting somebody whose invitation was revoked.
    const second = await inviteMember(db, owner, "cara@example.com", "finance");
    await revokeInvitation(db, owner, second.id);
    let reinvited = true;
    try {
      await inviteMember(db, owner, "cara@example.com", "coordinator");
    } catch {
      reinvited = false;
    }
    check(
      "⭐ somebody whose invitation was revoked can be invited again",
      reinvited,
      "a plain unique(workspace, email) would bar them permanently",
    );
  }

  {
    const expired = await inviteMember(db, owner, "later@example.com", "planner");
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.id, expired.id));
    check(
      "an expired invitation is refused",
      await throws(
        () => acceptInvitation(db, expired.token, { id: cara.id, email: "later@example.com" }),
        InvitationError,
        "expired",
      ),
    );
  }

  console.log("\nWho may change whom");
  await db.insert(sessions).values({ sessionToken: "bob-laptop", userId: bob.id, expires: new Date(Date.now() + 8.64e7) });
  await db.insert(sessions).values({ sessionToken: "bob-phone", userId: bob.id, expires: new Date(Date.now() + 8.64e7) });

  await changeRole(db, owner, bob.id, "admin");
  check("an owner can promote", (await roleOf(db, ws.id, bob.id)) === "admin");

  const admin = ctx(ws.id, bob.id, "admin");
  check(
    "⭐ an admin cannot remove an owner",
    await throws(() => removeMember(db, admin, alice.id), MembershipError, "not_permitted"),
  );
  check(
    "⭐ an admin cannot demote an owner either",
    await throws(() => changeRole(db, admin, alice.id, "planner"), MembershipError, "not_permitted"),
    "otherwise 'owner' is a label rather than a protection",
  );
  check(
    "the last owner cannot be removed",
    await throws(() => removeMember(db, owner, alice.id), MembershipError, "last_owner"),
  );
  check(
    "…nor demoted",
    await throws(() => changeRole(db, owner, alice.id, "planner"), MembershipError, "last_owner"),
  );

  const planner = ctx(ws.id, cara.id, "planner");
  check("a planner cannot manage members at all", await throws(() => listMembers(db, ctx(ws.id, cara.id, null)), PermissionError));
  check("…and cannot invite", await throws(() => inviteMember(db, planner, "x@y.com", "planner"), PermissionError));

  console.log("\n⭐ Removal revokes access now (FR-7)");
  await removeMember(db, owner, bob.id);
  check("the membership is gone", (await roleOf(db, ws.id, bob.id)) === null);
  check(
    "every one of their sessions is deleted, not just the current one",
    (await db.select().from(sessions).where(eq(sessions.userId, bob.id))).length === 0,
    "one surviving session on another device is the whole of the access they were just removed from",
  );
  check("the removal is logged", (await listAccessEvents(db, owner)).some((e) => e.action === "member.removed"));

  console.log("\nMigration (FR-9)");
  const incoming = [
    { kind: "briefs", documentId: "b1", document: { id: "b1", name: "Summit" } },
    { kind: "budgetLineItems", documentId: "bl1", document: { id: "bl1", plannedAmount: 5000 } },
    { kind: "leadRecords", documentId: "lr1", document: { id: "lr1", contact: { email: "x@y.com" } } },
    { kind: "logisticsPack.session", documentId: "s1", document: { id: "s1", title: "Keynote" } },
  ];
  const first = await migrateRecords(db, owner, incoming);
  check("everything lands", first.inserted === 4 && first.skipped.length === 0);

  const second = await migrateRecords(db, owner, incoming);
  check(
    "⭐ running it twice updates rather than duplicating",
    second.inserted === 0 && second.updated === 4,
  );
  check(
    "…so the workspace holds one copy, not two",
    (await db.select().from(records).where(eq(records.workspaceId, ws.id))).length === 4,
    "the characteristic failure of a migration is a half-finished one somebody retries",
  );
  check(
    "…and a re-run does not bump versions and manufacture conflicts",
    (await db.select().from(records).where(eq(records.workspaceId, ws.id))).every((r) => r.version === 1),
  );

  {
    const finance = ctx(ws.id, cara.id, "finance");
    const result = await migrateRecords(db, finance, incoming);
    check(
      "⭐ a finance user's migration skips attendee data rather than uploading it",
      result.skipped.some((s) => s.kind === "leadRecords"),
    );
    check(
      "…and says so rather than losing it silently",
      result.skipped.find((r) => r.kind === "leadRecords")?.reason === "leads:edit",
    );
    check("…while their budget data still lands", result.updated > 0 || result.inserted > 0);
  }

  console.log("\nPush (PRD 9 FR-5)");
  {
    const applied = await pushMutations(db, owner, [
      mutation({ workspaceId: ws.id, userId: alice.id, documentId: "b1", baseVersion: 1, document: { id: "b1", name: "Summit renamed" } }),
    ]);
    check("an edit against the current version applies", applied.applied[0]?.version === 2);

    // Alice's own stale edit fast-forwards rather than prompting — a planner editing on a laptop
    // and then a phone is one person having one thought.
    const own = await pushMutations(db, owner, [
      mutation({ workspaceId: ws.id, userId: alice.id, documentId: "b1", baseVersion: 1, document: { id: "b1", name: "Summit renamed" } }),
    ]);
    check(
      "⭐ the user's own stale edit from a second device never prompts",
      own.applied.length === 1 && own.conflicts.length === 0,
      "noise here trains people to dismiss the prompts that matter",
    );

    // A colleague's stale edit is a different matter.
    const carasCtx = ctx(ws.id, cara.id, "planner");
    const stale = await pushMutations(db, carasCtx, [
      mutation({ workspaceId: ws.id, userId: cara.id, documentId: "b1", baseVersion: 1 }),
    ]);
    check(
      "⭐ a stale edit by another person is returned as a conflict, not applied",
      stale.conflicts.length === 1 && stale.applied.length === 0,
    );
    check(
      "…and the server's current state comes back with it, so the UI can show both",
      (stale.conflicts[0]?.server.document as { name: string })?.name === "Summit renamed",
    );

    const wrongWorkspace = await pushMutations(db, owner, [
      mutation({ workspaceId: "some-other-workspace", userId: alice.id, documentId: "b1" }),
    ]);
    check(
      "⭐ a client claiming a different workspace is rejected",
      wrongWorkspace.rejected[0]?.reason === "workspace_mismatch",
      "the context decides the tenant, never the request body",
    );

    const coordinator = ctx(ws.id, cara.id, "coordinator");
    const refused = await pushMutations(db, coordinator, [
      mutation({ workspaceId: ws.id, userId: cara.id, kind: "leadRecords", documentId: "lr1" }),
    ]);
    check(
      "a coordinator cannot push attendee data",
      refused.rejected[0]?.reason === "leads:edit" && refused.applied.length === 0,
    );

    const deleted = await pushMutations(db, owner, [
      mutation({ workspaceId: ws.id, userId: alice.id, documentId: "bl1", kind: "budgetLineItems", document: null, baseVersion: 1 }),
    ]);
    check("a deletion applies as a tombstone", deleted.applied.length === 1);
    const [tombstoned] = await db.select().from(records).where(eq(records.documentId, "bl1"));
    check("…and the row survives so the deletion can propagate", tombstoned.deletedAt !== null);

    const afterDelete = await pushMutations(db, owner, [
      mutation({ workspaceId: ws.id, userId: alice.id, documentId: "bl1", kind: "budgetLineItems", baseVersion: 1 }),
    ]);
    check(
      "⭐ an edit against a tombstone does not resurrect the record",
      afterDelete.conflicts[0]?.resolution === "server_wins",
      "that deletion may have been an erasure request",
    );
  }

  console.log("\nPull (PRD 9 FR-3)");
  {
    const full = await pullRecords(db, owner);
    check("an owner pulls everything", full.records.length === 4);
    check("the cursor is a sequence, not a timestamp", /^\d+$/.test(full.cursor));
    check(
      "the cursor advances past what was read",
      Number(full.cursor) >= Math.max(...full.records.map((r) => r.seq)),
    );

    const empty = await pullRecords(db, owner, full.cursor);
    check("pulling again from that cursor returns nothing new", empty.records.length === 0);

    await pushMutations(db, owner, [
      mutation({ workspaceId: ws.id, userId: alice.id, documentId: "b1", baseVersion: 3, document: { id: "b1", name: "again" } }),
    ]);
    const delta = await pullRecords(db, owner, full.cursor);
    check(
      "⭐ an *update* moves the cursor, not just an insert",
      delta.records.length === 1 && delta.records[0].documentId === "b1",
      "a bigserial that only fires on insert would make every edit invisible to sync",
    );

    const finance = await pullRecords(db, ctx(ws.id, cara.id, "finance"));
    check(
      "⭐ a finance user never receives attendee records at all",
      !finance.records.some((r) => r.kind === "leadRecords"),
      "filtering in the UI would mean the data reached the browser and sat in IndexedDB",
    );
    check("…but does receive budget records", finance.records.some((r) => r.kind === "budgetLineItems"));
    check(
      "…and their cursor still advances past the records they could not see",
      Number(finance.cursor) > 0,
      "otherwise the client re-requests the same page forever",
    );

    check(
      "a non-member pulls nothing",
      await throws(() => pullRecords(db, ctx(ws.id, bob.id, null)), PermissionError),
    );

    const paged = await pullRecords(db, owner, "0", 2);
    check("paging reports there is more", paged.records.length <= 2 && paged.hasMore);
  }

  console.log("\nKind → capability mapping is restated server-side");
  check("logistics sub-kinds all answer to logistics", capabilityForKind("logisticsPack.issue", "edit") === "logistics:edit");
  check("survey responses answer to leads, not roi", capabilityForKind("surveyResponses", "view") === "leads:view");
  check("pipeline opportunities answer to leads", capabilityForKind("pipelineOpportunities", "view") === "leads:view");
  check("the ROI report itself answers to roi", capabilityForKind("roiReports", "view") === "roi:view");
  check(
    "⭐ an unknown kind is writable only by an owner",
    capabilityForKind("somethingTheClientInvented", "edit") === "workspace:delete",
    "the server must never take the client's word for what a kind is",
  );

  if (failures > 0) {
    console.error(`\n${failures} server database check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll server database checks passed.\n");
}

void main();
