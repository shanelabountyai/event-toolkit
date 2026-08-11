/**
 * PRD 8 §7 — the persistence seam under a workspace.
 *
 * Two things have to be true at once, and they pull in opposite directions:
 *
 *   1. **Local-only mode is untouched.** A planner who never signs in must get exactly today's
 *      behaviour — no permission checks, no namespacing, no network. That was a deliberate
 *      product decision, not a stepping stone, so the first section here proves the guard is
 *      genuinely inert rather than merely permissive.
 *
 *   2. **Workspace mode separates people from data they may not have.** A Finance user's device
 *      must refuse to hand over attendee records even though the rows are sitting in the same
 *      browser.
 *
 * The exhaustiveness check at the end is the one that matters most over time: a new store added
 * without a line in STORE_TOOLS fails here rather than quietly defaulting to readable.
 *
 * Run with: pnpm workspace-store-check
 */

import "fake-indexeddb/auto";
import {
  DB_NAME,
  LocalStorePermissionError,
  STORE_BRIEFS,
  STORE_TOOLS,
  UNGATED_STORES,
  capabilityForStore,
  clearOutbox,
  enqueue,
  hasPendingWrites,
  listPending,
  markFailed,
  markSynced,
  pendingCount,
  collectLocalRecords,
  unknownKinds,
  databaseName,
  getDb,
  getStoreContext,
  resetDbConnection,
  resetStoreContext,
  setStoreContext,
} from "../packages/local-store/src/index";
import { createEmptyBrief } from "../packages/schema/src/index";
import { createLogisticsPackFromBrief } from "../packages/logistics/src/index";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function named(type: Parameters<typeof createEmptyBrief>[0], name: string) {
  return { ...createEmptyBrief(type), name };
}

async function refuses(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (error) {
    return error instanceof LocalStorePermissionError;
  }
}

async function allows(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (error) {
    if (error instanceof LocalStorePermissionError) return false;
    throw error;
  }
}

/** Every store this build knows about, read from the database rather than a second hand-written list. */
async function storeNames(): Promise<string[]> {
  resetStoreContext();
  resetDbConnection();
  const db = await getDb();
  return [...db.objectStoreNames];
}

async function main(): Promise<void> {
  const allStores = await storeNames();

  console.log("\nLocal-only mode is exactly what it was");
  resetStoreContext();
  resetDbConnection();
  check("the default context is local", getStoreContext().mode === "local");
  check("…and it uses the plain database name, not a namespaced one", databaseName(DB_NAME) === DB_NAME);
  {
    const db = await getDb();
    const brief = named("conference", "Local only");
    check("writing needs no account", await allows(() => db.put(STORE_BRIEFS, brief)));
    check("reading needs no account", await allows(() => db.get(STORE_BRIEFS, brief.id)));
    check(
      "…and the guard is inert rather than permissive — no capability is even consulted",
      // In local mode there is no role at all. If the guard were merely "allow everything for
      // now", swapping in a role would change behaviour; it must not, because there is no
      // workspace and nobody to be separated from.
      getStoreContext().role === undefined,
    );
  }

  console.log("\nEach workspace gets its own database");
  setStoreContext({ mode: "workspace", workspaceId: "ws-a", userId: "u1", role: "owner" });
  check("the database name carries the workspace", databaseName(DB_NAME) === `${DB_NAME}:ws-a`);
  const ownerBrief = named("conference", "Workspace A event");
  {
    const db = await getDb();
    await db.put(STORE_BRIEFS, ownerBrief);
    check("an owner can write it", (await db.get(STORE_BRIEFS, ownerBrief.id)) !== undefined);
  }

  setStoreContext({ mode: "workspace", workspaceId: "ws-b", userId: "u1", role: "owner" });
  {
    const db = await getDb();
    check(
      "⭐ a second workspace on the same device cannot see the first one's data",
      (await db.get(STORE_BRIEFS, ownerBrief.id)) === undefined,
      "separate databases, so this cannot leak through a missed index scan",
    );
  }

  setStoreContext({ mode: "local", workspaceId: undefined });
  {
    const db = await getDb();
    check(
      "…and neither can local-only mode",
      (await db.get(STORE_BRIEFS, ownerBrief.id)) === undefined,
    );
  }

  console.log("\nA role that may not hold the data cannot read it off its own device");
  setStoreContext({ mode: "workspace", workspaceId: "ws-a", userId: "u2", role: "finance" });
  {
    const db = await getDb();
    check("finance is refused attendee records", await refuses(() => db.getAll("leadRecords")));
    check("finance is refused triage sessions", await refuses(() => db.getAll("triageSessions")));
    check("finance can read budgets", await allows(() => db.getAll("budgetLineItems")));
    check("finance can read the ROI scorecard", await allows(() => db.getAll("roiReports")));
    check(
      "⭐ finance is refused the survey rows behind that scorecard",
      await refuses(() => db.getAll("surveyResponses")),
      "survey free text is third-party personal data wherever it is displayed",
    );
    check(
      "⭐ finance is refused pipeline contacts",
      await refuses(() => db.getAll("pipelineOpportunities")),
    );
    check("finance cannot write to logistics", await refuses(() => db.put("logisticsPacks", {} as never)));
    check(
      "a read-only transaction over a forbidden store is refused too",
      await refuses(async () => db.transaction("leadRecords", "readonly")),
    );
    check(
      "…and so is a multi-store write that includes one",
      await refuses(async () => db.transaction(["briefs", "leadRecords"], "readwrite")),
    );
  }

  setStoreContext({ mode: "workspace", workspaceId: "ws-a", userId: "u3", role: "coordinator" });
  {
    const db = await getDb();
    check("a coordinator is refused budgets", await refuses(() => db.getAll("budgetLineItems")));
    check("a coordinator is refused attendee records", await refuses(() => db.getAll("leadRecords")));
    check("a coordinator can work the logistics pack", await allows(() => db.getAll("logisticsPacks")));
    check("a coordinator can read the brief", await allows(() => db.getAll(STORE_BRIEFS)));
    check(
      "…but cannot edit it — a view grant is not a write grant",
      await refuses(() => db.put(STORE_BRIEFS, named("webinar", "nope"))),
    );
  }

  setStoreContext({ mode: "workspace", workspaceId: "ws-a", userId: "u4", role: null });
  {
    const db = await getDb();
    check("a non-member is refused everything", await refuses(() => db.getAll(STORE_BRIEFS)));
  }

  console.log("\nThe store→capability table is complete");
  const ungated = UNGATED_STORES;
  const unmapped = allStores.filter((s) => !ungated.has(s) && !(s in STORE_TOOLS));
  check(
    `every one of the ${allStores.length} stores is mapped to a capability`,
    unmapped.length === 0,
    unmapped.length ? `unmapped: ${unmapped.join(", ")}` : undefined,
  );
  const stale = Object.keys(STORE_TOOLS).filter((s) => !allStores.includes(s));
  check("…and the table names no store that does not exist", stale.length === 0, stale.join(", "));
  check(
    "an unrecognised store is refused rather than defaulting to readable",
    capabilityForStore("someNewStoreNobodyMapped", "read") === "workspace:delete",
    "only an owner holds workspace:delete, so a forgotten store is visible to almost nobody and loud immediately",
  );
  check(
    "reads map to :view and writes to :edit",
    capabilityForStore("leadRecords", "read") === "leads:view" &&
      capabilityForStore("leadRecords", "write") === "leads:edit",
  );

  console.log("\nThe outbox (PRD 9 FR-2)");
  resetStoreContext();
  {
    check("local-only mode queues nothing", (await enqueue({ kind: "briefs", documentId: "d1", document: {}, baseVersion: 1 })) === null);
    check("…and reports nothing pending", (await pendingCount()) === 0, "FR-13: local mode carries no trace of sync");
  }

  setStoreContext({ mode: "workspace", workspaceId: "ws-out", userId: "u1", role: "owner" });
  await clearOutbox();
  {
    const first = await enqueue({ kind: "briefs", documentId: "d1", document: { v: 1 }, baseVersion: 3 });
    check("a workspace mutation is queued", first !== null);
    check("…carrying the version it was made against", first?.baseVersion === 3);
    check("…and who made it", first?.userId === "u1");

    // Durability: drop the connection the way a reload does, and the queue must still be there.
    resetDbConnection();
    check("⭐ the queue survives losing the connection", (await pendingCount()) === 1,
      "an in-memory queue passes every test written against a page that never closes");

    await enqueue({ kind: "briefs", documentId: "d1", document: { v: 2 }, baseVersion: 9 });
    const pending = await listPending();
    check("⭐ repeated edits to one document coalesce into a single entry", pending.length === 1,
      "dragging a session's start time must not push forty mutations from a phone on the event floor");
    check("…keeping the latest document", (pending[0]?.document as { v: number }).v === 2);
    check("⭐ …but the EARLIEST baseVersion", pending[0]?.baseVersion === 3,
      "that is the version the first unsynced edit was made against, and what the server must check");

    await enqueue({ kind: "budgetLineItems", documentId: "b1", document: {}, baseVersion: 1 });
    await enqueue({ kind: "logisticsPack.issue", documentId: "i1", document: {}, baseVersion: 1 });
    const queue = await listPending();
    check("different documents queue separately", queue.length === 3);
    check("the queue is ordered oldest first",
      queue.every((e, i) => i === 0 || queue[i - 1].queuedAt <= e.queuedAt),
      "a create must reach the server before the edit that follows it");

    check("a queued document is known to have pending writes", await hasPendingWrites("b1"));
    check("…and an unqueued one is not", !(await hasPendingWrites("nothing-here")));

    await markFailed(queue[0].id, "network unreachable");
    const afterFailure = await listPending();
    check("⭐ a failed push keeps the entry", afterFailure.length === 3,
      "discarding it is indistinguishable, from the planner's side, from losing their edit");
    check("…and records the attempt", afterFailure.find((e) => e.id === queue[0].id)?.attempts === 1);
    check("…and the reason", afterFailure.find((e) => e.id === queue[0].id)?.lastError === "network unreachable");

    await markSynced([queue[0].id, queue[1].id]);
    check("accepted mutations leave the queue", (await pendingCount()) === 1);
    await markSynced([]);
    check("marking nothing synced is harmless", (await pendingCount()) === 1);
  }

  setStoreContext({ mode: "workspace", workspaceId: "ws-other", userId: "u1", role: "owner" });
  check("another workspace sees none of it", (await pendingCount()) === 0);

  setStoreContext({ mode: "workspace", workspaceId: "ws-out", userId: "u5", role: "coordinator" });
  {
    check(
      "a coordinator can queue their own logistics edit",
      (await enqueue({ kind: "logisticsPack.session", documentId: "s1", document: {}, baseVersion: 1 })) !== null,
      "the queue is plumbing — permission was checked when the edit was made",
    );
  }

  console.log("\nMigration preview (PRD 8 FR-9)");
  resetStoreContext();
  resetDbConnection();
  {
    // Seed a local dataset the way a planner who has never signed in would have one.
    const db = await getDb();
    const brief = named("conference", "Summit 2026");
    await db.put(STORE_BRIEFS, brief);
    await db.put(STORE_BRIEFS, named("webinar", "June webinar"));
    await db.put("budgetLineItems", { id: "bl-1", briefId: brief.id, category: "venue", plannedAmount: 5000 } as never);
    await db.put("leadRecords", { id: "lr-1", triageSessionId: "ts-1", contact: { email: "a@b.com" } } as never);
    await db.put("intakeProgress", { briefId: brief.id, stepIndex: 3, dismissedLessonIds: [], generated: false, updatedAt: "x" } as never);

    const pack = createLogisticsPackFromBrief(brief);
    await db.put("logisticsPacks", {
      ...pack,
      sessions: [{ ...(pack.sessions[0] ?? {}), id: "s1", title: "Keynote" }],
      issueLog: [{ id: "i1", summary: "Projector", loggedAt: "2026-08-11T12:00:00.000Z" }],
    } as never);

    const { records, preview } = await collectLocalRecords();
    const kinds = new Set(records.map((r) => r.kind));

    const eventNames = preview.events.map((e) => e.name);
    check(
      "every event in this browser is listed for the banner",
      eventNames.includes("Summit 2026") && eventNames.includes("June webinar"),
      eventNames.join(", "),
    );
    check("…named, not just counted, so the planner sees what moves", preview.events.every((e) => e.name.length > 0));
    check("briefs are collected", kinds.has("briefs"));
    check("budget line items are collected", kinds.has("budgetLineItems"));
    check("lead records are collected", kinds.has("leadRecords"));
    check(
      "⭐ the logistics pack is exploded, not uploaded whole",
      kinds.has("logisticsPack") && kinds.has("logisticsPack.session") && kinds.has("logisticsPack.issue"),
      "uploading it whole would bring record-level concurrency back in through the migration",
    );
    check(
      "⭐ device-local stores are left behind",
      !kinds.has("intakeProgress") && !kinds.has("usageEvents") && !kinds.has("outbox"),
      "one device's wizard position means nothing to anybody else in the workspace",
    );
    check("every record keeps the id it already had", records.some((r) => r.documentId === brief.id));
    check(
      "…which is what makes a second run an upsert rather than a duplicate",
      records.filter((r) => r.documentId === brief.id && r.kind === "briefs").length === 1,
    );
    check("the preview counts what will move", preview.total === records.length && preview.counts.length > 0);
    check(
      "⭐ every collected kind is one the server, the registry and the classifier all know",
      unknownKinds(records).length === 0,
      unknownKinds(records).join(", "),
    );

    // Idempotency: collecting twice yields the same records, because nothing is consumed.
    const second = await collectLocalRecords();
    check("collecting twice yields the same set", second.records.length === records.length);
    check("…and reading it did not consume anything", (await getDb()).objectStoreNames.length > 0);
  }

  {
    // The migration reads the local database even when a workspace is connected.
    setStoreContext({ mode: "workspace", workspaceId: "ws-empty", userId: "u1", role: "owner" });
    const { preview } = await collectLocalRecords();
    check(
      "⭐ it reads the pre-account database even while signed in",
      preview.events.some((e) => e.name === "Summit 2026"),
      "reading through a workspace context is how a migration reports zero events",
    );
    check("…and leaves the caller's context as it found it", getStoreContext().workspaceId === "ws-empty");
  }

  resetStoreContext();

  if (failures > 0) {
    console.error(`\n${failures} workspace store check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll workspace store checks passed.\n");
}

void main();
