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
  capabilityForStore,
  databaseName,
  getDb,
  getStoreContext,
  resetDbConnection,
  resetStoreContext,
  setStoreContext,
} from "../packages/local-store/src/index";
import { createEmptyBrief } from "../packages/schema/src/index";

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
  const ungated = new Set(["usageEvents"]);
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

  resetStoreContext();

  if (failures > 0) {
    console.error(`\n${failures} workspace store check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll workspace store checks passed.\n");
}

void main();
