/**
 * PRD 9 §2 and §6 — the two pieces where a mistake silently loses someone's work.
 *
 * Nothing here touches a network, a database or IndexedDB. The conflict classifier and the
 * LogisticsPack explode/reassemble are pure by design precisely so they can be exercised
 * exhaustively before any transport exists to hide a bug behind.
 *
 * The test that matters most is the disjoint-edit one: a planner editing the run of show while a
 * coordinator ticks a checklist item, both offline, must both land with **no conflict**. That is
 * the scenario the whole platform tier exists to enable, and record-level concurrency breaks it.
 *
 * Run with: pnpm sync-check
 */

import { createLogisticsPackFromBrief } from "../packages/logistics/src/index";
import { createEmptyBrief } from "../packages/schema/src/index";
import {
  PACK_ITEM_KINDS,
  SYNC_KINDS,
  classify,
  explodePack,
  isAppendOnly,
  needsUserAttention,
  reassemblePack,
  syncKind,
  type OutboxEntry,
  type PackScalars,
  type Resolution,
  type ServerRecord,
} from "../packages/sync-engine/src/index";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const ALICE = "user-alice";
const BOB = "user-bob";

function mutation(over: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: "out-1",
    workspaceId: "ws-1",
    kind: "briefs",
    documentId: "doc-1",
    document: { id: "doc-1", name: "edited" },
    baseVersion: 3,
    userId: ALICE,
    queuedAt: "2026-08-11T10:00:00.000Z",
    attempts: 0,
    ...over,
  };
}

function serverRecord(over: Partial<ServerRecord> = {}): ServerRecord {
  return {
    kind: "briefs",
    documentId: "doc-1",
    document: { id: "doc-1", name: "server copy" },
    version: 3,
    updatedBy: ALICE,
    updatedAt: "2026-08-11T09:00:00.000Z",
    deletedAt: null,
    ...over,
  };
}

function samplePack() {
  const brief = { ...createEmptyBrief("conference"), name: "Summit" };
  const pack = createLogisticsPackFromBrief(brief);
  return {
    ...pack,
    sessions: [
      { ...(pack.sessions[0] ?? {}), id: "s1", title: "Keynote" },
      { ...(pack.sessions[0] ?? {}), id: "s2", title: "Panel" },
    ],
    venueChecklist: [
      { ...(pack.venueChecklist[0] ?? {}), id: "c1", label: "Power tested", done: false },
    ],
    issueLog: [{ id: "i1", summary: "Projector flickering", loggedAt: "2026-08-11T12:00:00.000Z" }],
    contacts: [{ ...(pack.contacts[0] ?? {}), id: "k1", name: "Venue manager" }],
  } as typeof pack;
}

function main(): void {
  console.log("\nThe classification table, row by row (PRD 9 §6)");

  const expect = (label: string, got: Resolution, want: Resolution) =>
    check(label, got === want, `expected ${want}, got ${got}`);

  expect("no server record — first write", classify(mutation(), null, ALICE), "apply");
  expect(
    "server version equals the base we edited against",
    classify(mutation({ baseVersion: 3 }), serverRecord({ version: 3 }), ALICE),
    "apply",
  );
  expect(
    "⭐ stale base, same user, exactly one version ahead — a planner's own two devices",
    classify(
      mutation({ baseVersion: 3, userId: ALICE }),
      serverRecord({ version: 4, updatedBy: ALICE }),
      ALICE,
    ),
    "fast_forward",
  );
  expect(
    "stale base, different users, append-only kind",
    classify(
      mutation({ kind: "logisticsPack.issue", baseVersion: 3, userId: ALICE }),
      serverRecord({ kind: "logisticsPack.issue", version: 5, updatedBy: BOB }),
      ALICE,
    ),
    "union",
  );
  expect(
    "stale base, different users, any other kind — surfaced",
    classify(
      mutation({ baseVersion: 3, userId: ALICE }),
      serverRecord({ version: 4, updatedBy: BOB }),
      ALICE,
    ),
    "conflict",
  );
  expect(
    "server record is a tombstone, local is an edit",
    classify(mutation(), serverRecord({ deletedAt: "2026-08-11T11:00:00.000Z" }), ALICE),
    "server_wins",
  );

  console.log("\nThe edges the table does not spell out");
  expect(
    "same user but two versions ahead is a real conflict, not a fast-forward",
    classify(
      mutation({ baseVersion: 3, userId: ALICE }),
      serverRecord({ version: 5, updatedBy: ALICE }),
      ALICE,
    ),
    "conflict",
    // Two versions means something else landed in between. Fast-forwarding would discard it.
  );
  expect(
    "one version ahead but written by someone else is a conflict",
    classify(
      mutation({ baseVersion: 3, userId: ALICE }),
      serverRecord({ version: 4, updatedBy: BOB }),
      ALICE,
    ),
    "conflict",
  );
  expect(
    "⭐ a tombstone beats even the user's own fast-forwardable edit",
    classify(
      mutation({ baseVersion: 3, userId: ALICE }),
      serverRecord({ version: 4, updatedBy: ALICE, deletedAt: "2026-08-11T11:00:00.000Z" }),
      ALICE,
    ),
    "server_wins",
    // A deletion may have been made because an attendee asked for it (PRD 10). Resurrecting it
    // silently would be a compliance failure, not a merge inconvenience.
  );
  expect(
    "a server version *behind* the local base is surfaced, not applied",
    classify(mutation({ baseVersion: 7 }), serverRecord({ version: 3 }), ALICE),
    "conflict",
    // Versions only rise, so this means the client carries state from a database that no longer
    // exists — a restore, or a re-run migration.
  );
  expect(
    "an unknown kind falls back to conflict rather than union",
    classify(
      mutation({ kind: "somethingNewNobodyRegistered", baseVersion: 3, userId: ALICE }),
      serverRecord({ version: 4, updatedBy: BOB }),
      ALICE,
    ),
    "conflict",
  );
  check(
    "a local deletion against an unchanged server record still applies",
    classify(mutation({ document: null, baseVersion: 3 }), serverRecord({ version: 3 }), ALICE) ===
      "apply",
  );
  check(
    "only conflict and server_wins ever interrupt the user",
    needsUserAttention("conflict") &&
      needsUserAttention("server_wins") &&
      !needsUserAttention("apply") &&
      !needsUserAttention("fast_forward") &&
      !needsUserAttention("union"),
  );

  console.log("\n⭐ The disjoint-edit test — the scenario the platform tier exists for");
  {
    // Event day. Alice reworks the run of show; Bob ticks a checklist item. Both offline, both
    // against the same pack, at the same moment.
    const aliceEditsSession = mutation({
      kind: "logisticsPack.session",
      documentId: "s1",
      userId: ALICE,
      baseVersion: 2,
    });
    const bobTicksChecklist = mutation({
      kind: "logisticsPack.checklist",
      documentId: "c1",
      userId: BOB,
      baseVersion: 2,
    });
    // Each lands against its own item's record, untouched by the other.
    const aliceResult = classify(
      aliceEditsSession,
      serverRecord({ kind: "logisticsPack.session", documentId: "s1", version: 2, updatedBy: ALICE }),
      ALICE,
    );
    const bobResult = classify(
      bobTicksChecklist,
      serverRecord({ kind: "logisticsPack.checklist", documentId: "c1", version: 2, updatedBy: BOB }),
      BOB,
    );
    check("the run-of-show edit applies", aliceResult === "apply", aliceResult);
    check("the checklist tick applies", bobResult === "apply", bobResult);
    check(
      "neither prompts anyone",
      !needsUserAttention(aliceResult) && !needsUserAttention(bobResult),
      "record-level concurrency would have conflicted these two over parts they never touched",
    );
  }

  console.log("\nTwo coordinators logging different issues both keep theirs");
  {
    const result = classify(
      mutation({ kind: "logisticsPack.issue", documentId: "i2", userId: BOB, baseVersion: 4 }),
      serverRecord({ kind: "logisticsPack.issue", documentId: "i2", version: 6, updatedBy: ALICE }),
      BOB,
    );
    check("append-only unions rather than conflicting", result === "union");
    check("the issue log is registered as append-only", isAppendOnly("logisticsPack.issue"));
    check("…and so are lead records", isAppendOnly("leadRecords"));
    check("…and survey responses", isAppendOnly("surveyResponses"));
    check("…and pipeline opportunities", isAppendOnly("pipelineOpportunities"));
    check("…and import batches", isAppendOnly("importBatches"));
    check("a brief is NOT append-only — two edits to one field must be surfaced", !isAppendOnly("briefs"));
    check("nor is a budget line item", !isAppendOnly("budgetLineItems"));
  }

  console.log("\nExplode and reassemble a LogisticsPack");
  {
    const pack = samplePack();
    const exploded = explodePack(pack);
    const scalarRecord = exploded.find((r) => r.kind === "logisticsPack");

    check("exactly one scalar record", exploded.filter((r) => r.kind === "logisticsPack").length === 1);
    check("the scalar record is keyed by the pack id", scalarRecord?.documentId === pack.id);
    check(
      "the scalar record carries no arrays",
      Object.values(scalarRecord?.document as Record<string, unknown>).every((v) => !Array.isArray(v)),
    );
    check(
      "one record per session",
      exploded.filter((r) => r.kind === "logisticsPack.session").length === pack.sessions.length,
    );
    check(
      "item records are keyed by the item's own id, not the pack's",
      exploded.some((r) => r.kind === "logisticsPack.session" && r.documentId === "s1"),
    );
    check(
      "every item record names its pack, so a record pulled alone knows where it belongs",
      exploded
        .filter((r) => r.kind !== "logisticsPack")
        .every((r) => (r.document as { packId?: string }).packId === pack.id),
    );

    const items = exploded.filter((r) => r.kind !== "logisticsPack");
    const rebuilt = reassemblePack(scalarRecord?.document as PackScalars, items);

    check(
      "⭐ explode → reassemble round-trips to the original pack",
      JSON.stringify(rebuilt) === JSON.stringify(pack),
      "the document shape the UI sees must never change",
    );
    check(
      "reassembly restores every array",
      rebuilt.sessions.length === 2 &&
        rebuilt.venueChecklist.length === 1 &&
        rebuilt.issueLog.length === 1 &&
        rebuilt.contacts.length === 1,
    );
    check(
      "the packId helper field does not survive into the document",
      !rebuilt.sessions.some((s) => "packId" in (s as object)),
    );

    // A record belonging to a different pack must not be grafted on.
    const foreign = {
      kind: "logisticsPack.session",
      documentId: "s9",
      document: { id: "s9", title: "Someone else's keynote", packId: "another-pack" },
    };
    const guarded = reassemblePack(scalarRecord?.document as PackScalars, [...items, foreign]);
    check(
      "⭐ an item belonging to another pack is ignored, not merged in",
      guarded.sessions.length === pack.sessions.length,
      "a mis-keyed record must not graft one event's run of show onto another's",
    );

    const empty = reassemblePack(scalarRecord?.document as PackScalars, []);
    check(
      "a pack with no item records reassembles to empty arrays, not undefined",
      Array.isArray(empty.sessions) && empty.sessions.length === 0 && Array.isArray(empty.issueLog),
    );
  }

  console.log("\nThe kind registry");
  check("no duplicate kinds", new Set(SYNC_KINDS.map((k) => k.kind)).size === SYNC_KINDS.length);
  check(
    "every pack item kind is registered",
    Object.keys(PACK_ITEM_KINDS).every((k) => syncKind(k) !== undefined),
  );
  check(
    "every pack item kind maps to the logisticsPacks store",
    Object.keys(PACK_ITEM_KINDS).every((k) => syncKind(k)?.store === "logisticsPacks"),
  );
  check("an unregistered kind resolves to undefined", syncKind("nope") === undefined);
  check(
    "⭐ the whole pack is never itself a syncable document",
    !SYNC_KINDS.some((k) => k.kind === "logisticsPacks"),
    "if it were, record-level concurrency would sneak back in beside the sub-document kinds",
  );

  if (failures > 0) {
    console.error(`\n${failures} sync check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll sync checks passed.\n");
}

main();
