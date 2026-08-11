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
  appendIssueViaShareLink,
  createShareLink,
  deleteSubject,
  listPacksInWorkspace,
  loadPackRecords,
  resolveShareLink,
  revokeShareLink,
  shareLinks,
  exportSubject,
  getRetentionPolicy,
  migrateRecords,
  purgeExpiredRecords,
  searchSubject,
  setRetentionPolicy,
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

  console.log("\nShare links (PRD 8 FR-8)");
  {
    const ws4 = await createWorkspace(db, "Share test", alice.id);
    const owner4 = ctx(ws4.id, alice.id, "owner");
    const packId = "pack-share-1";

    await migrateRecords(db, owner4, [
      { kind: "logisticsPack", documentId: packId, document: { id: packId, eventBriefId: "b1", version: 1 } },
      { kind: "logisticsPack.session", documentId: "sess-1", document: { id: "sess-1", label: "Keynote", packId } },
      { kind: "logisticsPack.contact", documentId: "con-1", document: { id: "con-1", name: "Venue", packId } },
      // Belongs to a different pack — must not leak into this one's share view.
      { kind: "logisticsPack.session", documentId: "sess-x", document: { id: "sess-x", label: "Other event", packId: "pack-other" } },
    ]);

    check("packs are listed from the envelope", (await listPacksInWorkspace(db, owner4)).some((p) => p.id === packId));

    const future = new Date(Date.now() + 3 * 86_400_000);
    const link = await createShareLink(db, owner4, packId, future);
    check("a link is created with a long token", link.token.length >= 32);

    const resolved = await resolveShareLink(db, link.token);
    check("a live link resolves", resolved?.grant.logisticsPackId === packId);
    check("…to its own workspace", resolved?.workspaceId === ws4.id);
    check("a forged token resolves to nothing", (await resolveShareLink(db, "nope")) === null);

    const loaded = await loadPackRecords(db, ws4.id, packId);
    check("the pack loads", loaded !== null);
    check(
      "⭐ another pack's items are not included",
      !loaded!.items.some((i) => i.documentId === "sess-x"),
      "a share-link request is the least trusted request this product serves",
    );
    check("its own items are", loaded!.items.some((i) => i.documentId === "sess-1"));

    await appendIssueViaShareLink(db, ws4.id, packId, {
      id: "issue-share-1",
      timestamp: new Date().toISOString(),
      description: "Projector dead",
      severity: "high",
      status: "open",
    });
    const withIssue = await loadPackRecords(db, ws4.id, packId);
    check("an issue logged via the link lands on the pack", withIssue!.items.some((i) => i.documentId === "issue-share-1"));

    await appendIssueViaShareLink(db, ws4.id, packId, {
      id: "issue-share-1",
      timestamp: new Date().toISOString(),
      description: "Projector dead",
      severity: "high",
      status: "open",
    });
    const again = await loadPackRecords(db, ws4.id, packId);
    check(
      "⭐ a retried submit does not duplicate it",
      again!.items.filter((i) => i.documentId === "issue-share-1").length === 1,
      "venue wifi retries; an issue log full of doubles is an issue log nobody reads",
    );

    check(
      "a finance user cannot create a link",
      await throws(() => createShareLink(db, ctx(ws4.id, cara.id, "finance"), packId, future), PermissionError),
    );
    check(
      "⭐ a coordinator CAN create one — running logistics is their job",
      (await createShareLink(db, ctx(ws4.id, cara.id, "coordinator"), packId, future)) !== undefined,
    );

    await revokeShareLink(db, owner4, link.id);
    check("a revoked link resolves to nothing", (await resolveShareLink(db, link.token)) === null);

    const expiredLink = await createShareLink(db, owner4, packId, future);
    await db.update(shareLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(shareLinks.id, expiredLink.id));
    check("an expired link resolves to nothing", (await resolveShareLink(db, expiredLink.token)) === null);

    check(
      "creating and revoking are both logged",
      (await listAccessEvents(db, owner4)).filter((e) => e.action.startsWith("share_link.")).length >= 3,
    );
  }

  console.log("\nPrivacy operations (PRD 10)");
  {
    const ws2 = await createWorkspace(db, "Privacy test", alice.id);
    const admin2 = ctx(ws2.id, alice.id, "owner");
    const DANA = "dana.okoro@example.com";

    await migrateRecords(db, admin2, [
      { kind: "leadRecords", documentId: "lr-d", document: { id: "lr-d", contact: { email: DANA, firstName: "Dana", lastName: "Okoro", phone: "+1 555 0100" }, signals: { boothInteractions: 2 } } },
      { kind: "surveyResponses", documentId: "sr-d", document: { id: "sr-d", respondentEmail: DANA, comment: "Sam was unhelpful", npsScore: 3 } },
      { kind: "pipelineOpportunities", documentId: "op-d", document: { id: "op-d", contactEmail: DANA, contactName: "Dana Okoro", opportunityName: "Renewal", amount: 48000 } },
      { kind: "leadRecords", documentId: "lr-other", document: { id: "lr-other", contact: { email: "someone@else.com", firstName: "Someone" } } },
      { kind: "briefs", documentId: "b-d", document: { id: "b-d", name: "Summit", stakeholders: [{ id: "s1", name: "Dana Okoro", email: DANA, role: "Sponsor" }, { id: "s2", name: "Sam Reyes", email: "sam@example.com", role: "Marketing" }] } },
    ]);

    const hits = await searchSubject(db, admin2, "DANA.OKORO@example.com  ");
    check("⭐ subject search finds every record across tools", hits.length === 4, `found ${hits.length}`);
    check("…and does not match anybody else", !hits.some((h) => h.documentId === "lr-other"));
    check("…naming the tool each came from", hits.some((h) => h.label === "Attendee lead record"));
    check("…and its sensitivity", hits.some((h) => h.sensitivity === "third_party_personal"));
    check(
      "⭐ the search itself is logged as a read of personal data (FR-6)",
      (await listAccessEvents(db, admin2)).some((e) => e.action === "privacy.subject_searched"),
    );

    const exported = await exportSubject(db, admin2, DANA);
    check("export carries every matching record", exported.records.length === 4);
    check("…including the survey free text", JSON.stringify(exported).includes("Sam was unhelpful"));
    check("…and the behavioural signals", JSON.stringify(exported).includes("boothInteractions"));

    check(
      "⭐ a finance user cannot reach subject search",
      await throws(() => searchSubject(db, ctx(ws2.id, cara.id, "finance"), DANA), PermissionError),
      "otherwise the privacy screen is a way around the one permission with a legal consequence",
    );
    check(
      "…nor a coordinator",
      await throws(() => searchSubject(db, ctx(ws2.id, cara.id, "coordinator"), DANA), PermissionError),
    );

    const result = await deleteSubject(db, admin2, DANA);
    check("the lead record and the survey response are deleted outright", result.deletedRecords === 2);
    check("the opportunity and the brief keep their rows", result.erasedFields === 2);
    check("…and the result says plainly that aggregates are not recomputed", result.note.includes("not"));

    const after = await db.select().from(records).where(eq(records.workspaceId, ws2.id));
    const lead = after.find((r) => r.documentId === "lr-d")!;
    check("⭐ the deleted lead is a tombstone, not a flagged row", lead.deletedAt !== null);
    check(
      "⭐ …carrying no trace of the person",
      !JSON.stringify(lead.document).includes("Okoro") && !JSON.stringify(lead.document).includes("555 0100"),
      "a tombstone still holding the data is the same data, one query away",
    );

    const opp = after.find((r) => r.documentId === "op-d")!;
    check("the opportunity survives", opp.deletedAt === null);
    check("⭐ …with its amount intact", (opp.document as { amount: number }).amount === 48000);
    check("…and the contact gone", !JSON.stringify(opp.document).includes("Okoro"));

    const briefRow = after.find((r) => r.documentId === "b-d")!;
    const stakeholders = (briefRow.document as { stakeholders: Record<string, unknown>[] }).stakeholders;
    check("⭐ the other stakeholder in the same brief is untouched", stakeholders[1].name === "Sam Reyes");
    check("…while the subject's details are gone", !("email" in stakeholders[0]));

    check("somebody else's lead record is untouched", after.find((r) => r.documentId === "lr-other")!.deletedAt === null);
    check("searching again finds nothing", (await searchSubject(db, admin2, DANA)).length === 0);
    check(
      "the deletion is logged",
      (await listAccessEvents(db, admin2)).some((e) => e.action === "privacy.subject_deleted"),
    );
    check(
      "⭐ the deletion advanced the version, so it propagates to every device",
      lead.version > 1,
      "a device that already synced must be told, not left holding a copy",
    );
  }

  console.log("\nRetention (PRD 10 FR-4)");
  {
    const ws3 = await createWorkspace(db, "Retention test", alice.id);
    const admin3 = ctx(ws3.id, alice.id, "owner");
    await migrateRecords(db, admin3, [
      { kind: "leadRecords", documentId: "old-lead", document: { id: "old-lead", contact: { email: "old@x.com" } } },
      { kind: "surveyResponses", documentId: "old-survey", document: { id: "old-survey", respondentEmail: "old@x.com" } },
      { kind: "briefs", documentId: "old-brief", document: { id: "old-brief", name: "Ancient summit" } },
      { kind: "budgetLineItems", documentId: "old-budget", document: { id: "old-budget", plannedAmount: 100 } },
    ]);

    check("the default policy is 12 months", (await getRetentionPolicy(db, ws3.id)).months === 12);

    // Age everything past the cutoff.
    const longAgo = new Date();
    longAgo.setFullYear(longAgo.getFullYear() - 2);
    await db.update(records).set({ updatedAt: longAgo }).where(eq(records.workspaceId, ws3.id));

    const purge = await purgeExpiredRecords(db, ws3.id);
    check("the purge removes expired attendee data", purge.purged === 2, `purged ${purge.purged}`);

    const remaining = await db.select().from(records).where(eq(records.workspaceId, ws3.id));
    check("⭐ the brief survives — an event's own history is not a person's data", remaining.find((r) => r.documentId === "old-brief")!.deletedAt === null);
    check("…as does the budget", remaining.find((r) => r.documentId === "old-budget")!.deletedAt === null);
    check("the attendee record is tombstoned", remaining.find((r) => r.documentId === "old-lead")!.deletedAt !== null);
    check("…carrying nothing", JSON.stringify(remaining.find((r) => r.documentId === "old-lead")!.document) === "{}");
    check(
      "⭐ the purge writes an audit entry — an automated deletion nobody can account for is data loss",
      (await listAccessEvents(db, admin3)).some((e) => e.action === "privacy.retention_purge"),
    );
    check("…and records when it last ran", (await getRetentionPolicy(db, ws3.id)).lastRunAt !== null);

    const second = await purgeExpiredRecords(db, ws3.id);
    check("running it again purges nothing — already-tombstoned rows are skipped", second.purged === 0);

    await setRetentionPolicy(db, admin3, 24, false);
    const disabled = await purgeExpiredRecords(db, ws3.id);
    check("a disabled policy purges nothing", disabled.skipped === "disabled");
    check(
      "a coordinator cannot change the retention policy",
      await throws(() => setRetentionPolicy(db, ctx(ws3.id, cara.id, "coordinator"), 1, true), PermissionError),
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} server database check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll server database checks passed.\n");
}

void main();
