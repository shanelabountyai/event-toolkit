/**
 * Headless exercise of `@event-toolkit/local-store` against an in-memory IndexedDB
 * (fake-indexeddb), covering the persistence behaviour the browser UI depends on:
 * FR-6 (autosave/resume state), FR-7 (list), FR-9 (migrate on every read),
 * FR-11 (carry-forward lesson matching) and FR-13 (usage log + CSV).
 *
 * Run with: pnpm store-check
 */

import "fake-indexeddb/auto";
import {
  createEmptyBrief,
  newLessonLearned,
  type EventBrief,
} from "../packages/schema/src/index";
import {
  STORE_BRIEFS,
  deleteBrief,
  exportUsageLogCsv,
  getBrief,
  getDb,
  getIntakeProgress,
  listBriefs,
  logUsageEvent,
  queryLessons,
  saveBrief,
  saveIntakeProgress,
} from "../packages/local-store/src/index";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function seed(type: EventBrief["type"], name: string): EventBrief {
  const brief = createEmptyBrief(type);
  return {
    ...brief,
    name,
    goals: { ...brief.goals, primaryObjective: `Objective for ${name}` },
    audience: { ...brief.audience, description: `Audience for ${name}` },
    dates: { timezone: "UTC", eventStartDate: "2026-09-01", eventEndDate: "2026-09-02" },
  };
}

async function main(): Promise<void> {
  console.log("\nFR-7 · briefs round-trip through the repository");
  const conference = await saveBrief(seed("conference", "Summit"));
  await sleep(5);
  const webinar = await saveBrief(seed("webinar", "June webinar"));
  await sleep(5);
  const tradeShow = await saveBrief(seed("trade_show", "Expo booth"));

  const all = await listBriefs();
  check(`listBriefs returns 3 (${all.length})`, all.length === 3);
  check(
    "sorted most-recently-updated first",
    all[0].id === tradeShow.id && all[2].id === conference.id,
    all.map((b) => b.name).join(", "),
  );

  console.log("\nFR-6 · saving bumps the revision counter and updatedAt");
  check("first save moved version 1 → 2", conference.version === 2);
  const edited = await saveBrief({ ...conference, name: "Summit (renamed)" });
  check("second save moved version 2 → 3", edited.version === 3);
  check("updatedAt advanced", edited.updatedAt >= conference.updatedAt);
  const reread = await getBrief(conference.id);
  check("edit persisted and re-reads identically", reread?.name === "Summit (renamed)");

  console.log("\nFR-6 · intake progress round-trips (mid-intake resume)");
  await saveIntakeProgress({
    briefId: webinar.id,
    stepIndex: 2,
    dismissedLessonIds: ["abc"],
    generated: false,
    updatedAt: new Date().toISOString(),
  });
  const progress = await getIntakeProgress(webinar.id);
  check("stored step index survives", progress?.stepIndex === 2);
  check("dismissed lessons survive", progress?.dismissedLessonIds[0] === "abc");
  check("generated flag survives", progress?.generated === false);

  console.log("\nFR-9 · migrateBrief runs on every read");
  const legacyId = "99999999-8888-4777-8666-555555555555";
  const db = await getDb();
  await db.put(STORE_BRIEFS, {
    schemaVersion: "0.9.0",
    id: legacyId,
    name: "Legacy import",
    type: "webinar",
    status: "draft",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    goals: { primaryObjective: "Old" },
    audience: { description: "Old" },
    budget: {},
    dates: { timezone: "UTC", eventStartDate: "2026-03-01" },
    format: { deliveryMode: "virtual" },
    // successMetrics / riskRegister / timeline / constraints / carryForwardLessons absent
  } as unknown as EventBrief);
  const migrated = await getBrief(legacyId);
  check("getBrief upgrades schemaVersion", migrated?.schemaVersion === "1.0.0");
  check("absent arrays are defaulted", Array.isArray(migrated?.riskRegister));
  check("absent end date defaults to start", migrated?.dates.eventEndDate === "2026-03-01");
  const listed = await listBriefs();
  check(
    "listBriefs migrates too",
    listed.every((b) => b.schemaVersion === "1.0.0"),
  );

  console.log("\nFR-11 · queryLessons matches on exact type, then falls back");
  await saveBrief({
    ...webinar,
    carryForwardLessons: [
      newLessonLearned({ lesson: "Send the 15-minute reminder", category: "Promotion" }),
    ],
  });
  await saveBrief({
    ...conference,
    name: "Summit (renamed)",
    carryForwardLessons: [
      newLessonLearned({ lesson: "Book AV 90 days out", category: "Vendor" }),
      newLessonLearned({ lesson: "Size breakouts on interest", category: "Content" }),
      newLessonLearned({ lesson: "Confirm catering count at T-14", category: "Logistics" }),
      newLessonLearned({ lesson: "Lock the promo calendar early", category: "Promotion" }),
    ],
  });

  const forConference = await queryLessons("conference");
  check(
    `conference has ≥3 exact matches → only exact returned (${forConference.length})`,
    forConference.length === 4 && forConference.every((l) => l.exactTypeMatch),
  );

  const forWebinar = await queryLessons("webinar");
  check(
    `webinar has 1 exact match → topped up to 3 (${forWebinar.length})`,
    forWebinar.length === 3,
  );
  check("exact match is listed first", forWebinar[0]?.exactTypeMatch === true);
  check(
    "fallback entries are from other types",
    forWebinar.slice(1).every((l) => !l.exactTypeMatch),
  );
  check(
    "suggestions carry their source brief name",
    forWebinar.every((l) => typeof l.sourceBriefName === "string" && l.sourceBriefName.length > 0),
  );

  const excludingSelf = await queryLessons("webinar", webinar.id);
  check(
    "a brief's own lessons are excluded when editing it",
    excludingSelf.every((l) => l.sourceBriefId !== webinar.id),
  );

  const forTradeShow = await queryLessons("trade_show");
  check(
    `trade show has 0 exact matches → 3 most recent of any type (${forTradeShow.length})`,
    forTradeShow.length === 3 && forTradeShow.every((l) => !l.exactTypeMatch),
  );

  console.log("\nFR-13 · usage log records each action and exports as CSV");
  await logUsageEvent({ type: "brief_created", briefId: conference.id, briefName: "Summit" });
  await logUsageEvent({
    type: "brief_marked_complete",
    briefId: conference.id,
    briefName: "Summit",
    details: { completenessPct: 93 },
  });
  await logUsageEvent({
    type: "export_triggered",
    briefId: conference.id,
    briefName: "Summit",
    details: { format: "markdown", filename: "summit-brief.md" },
  });
  await logUsageEvent({
    type: "tool_launch_from_brief",
    briefId: conference.id,
    briefName: "Summit",
    details: { targetTool: "budget" },
  });

  const csv = await exportUsageLogCsv();
  const lines = csv.trim().split("\r\n");
  check(`CSV has a header + 4 rows (${lines.length})`, lines.length === 5);
  check("header names the core columns", lines[0].startsWith("id,timestamp,eventType,briefId,briefName"));
  for (const type of [
    "brief_created",
    "brief_marked_complete",
    "export_triggered",
    "tool_launch_from_brief",
  ]) {
    check(`row present for ${type}`, lines.some((l) => l.includes(`,${type},`)));
  }
  check(
    "every row carries an ISO timestamp",
    lines.slice(1).every((l) => /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(l)),
  );
  check("detail columns are flattened", csv.includes("completenessPct") && csv.includes("93"));

  const commaCsvEvent = await logUsageEvent({
    type: "export_triggered",
    briefId: conference.id,
    briefName: 'Summit, "Q4" edition',
  });
  const csv2 = await exportUsageLogCsv();
  check(
    "values containing commas/quotes are escaped",
    csv2.includes('"Summit, ""Q4"" edition"'),
    commaCsvEvent?.id,
  );

  console.log("\nHousekeeping · deleteBrief clears the brief and its intake progress");
  await deleteBrief(webinar.id);
  check("brief gone", (await getBrief(webinar.id)) === null);
  check("intake progress gone", (await getIntakeProgress(webinar.id)) === null);
  check("list shrank", (await listBriefs()).length === 3);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll local-store checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
