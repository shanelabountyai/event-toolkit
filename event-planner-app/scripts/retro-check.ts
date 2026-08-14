/**
 * Headless exercise of PRD 7 (Post-Mortem Generator) — the tool that closes the suite's loop.
 *
 * The verification that actually proves this works is at the bottom: after completing a retro,
 * PRD 1's own unmodified `queryLessons` read path surfaces the carried-forward lessons for the
 * next brief of the same type. If that needed any PRD 1 change, the write-back would be wrong.
 *
 * Run with: pnpm retro-check
 */

import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  CURRENT_SCHEMA_VERSION,
  newId,
  nowIso,
  type EventBrief,
} from "../packages/schema/src/index";
import { computeBudgetActualsSummary } from "../packages/budget-calc/src/index";
import { newIssue, type LogisticsPack } from "../packages/logistics/src/index";
import { computeScorecard } from "../packages/roi-report-core/src/index";
import {
  CURRENT_RETRO_SCHEMA_VERSION,
  EMPTY_BUDGET_VARIANCE,
  EMPTY_ISSUE_LOG,
  EMPTY_ROI_SCORECARD,
  RETRO_PROMPT_DELAY_DAYS,
  applyCarryForward,
  applyMetricAdjustment,
  canComplete,
  categoryFlag,
  generateCandidateLessons,
  lessonsBlockingCompletion,
  migrateRetroDocument,
  previewCarryForward,
  renderRetroMarkdown,
  retroPromptLevel,
  toCanonicalLesson,
  type RetroDocument,
  type RetroLesson,
} from "../packages/postmortem-core/src/index";
import {
  findOrCreateRetro,
  getBrief,
  getRetroByBriefId,
  ingestIssueLog,
  queryLessons,
  saveBrief,
  saveBudgetSettings,
  saveLineItems,
  savePack,
  saveRetro,
} from "../packages/local-store/src/index";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (n: string) => JSON.parse(readFileSync(join(here, "..", "fixtures", n), "utf8"));
const conference = fixture("conference-brief-example.json") as EventBrief;
const budgetFixture = fixture("conference-budget-example.json");

function retroLesson(partial: Partial<RetroLesson>): RetroLesson {
  return {
    id: newId(),
    sourceEventId: "brief-1",
    lesson: "Something happened",
    addedAt: nowIso(),
    disposition: "fix",
    sourceType: "manual",
    carryForward: true,
    ...partial,
  };
}

function retroDoc(lessons: RetroLesson[]): RetroDocument {
  return {
    schemaVersion: CURRENT_RETRO_SCHEMA_VERSION,
    id: "retro-1",
    eventBriefId: "brief-1",
    eventName: "Test event",
    status: "draft",
    createdAt: "", updatedAt: "", completedAt: null, version: 1,
    ingestedIssueLogSummary: EMPTY_ISSUE_LOG,
    ingestedBudgetVarianceSummary: EMPTY_BUDGET_VARIANCE,
    ingestedRoiScorecardSummary: EMPTY_ROI_SCORECARD,
    lessons,
    successMetricAdjustments: [],
  };
}

async function main(): Promise<void> {
  /* ---------------------------------------------------------------- */
  console.log("\nSchema · additions stay additive");
  // Pinned to the constant, not a literal. This assertion existed to prove PRD 7's fields landed
  // with a MINOR bump; hard-coding the number made the next legitimate bump look like a failure.
  check(
    `schema version is a MINOR series above 1.0 (${CURRENT_SCHEMA_VERSION})`,
    /^1\.[1-9]\d*\.\d+$/.test(CURRENT_SCHEMA_VERSION),
  );
  check("a 1.0.0 lesson with no disposition still type-checks and round-trips", (() => {
    const legacy = { id: "l1", lesson: "Old lesson", addedAt: nowIso() };
    return legacy.id === "l1";
  })());

  /* ---------------------------------------------------------------- */
  console.log("\nFR-6 · candidate lessons from the issue log");
  const issueEntries = [
    newIssue({ description: "Crate 2 never arrived", severity: "high", relatedArtifact: "shipping" }),
    newIssue({ description: "Second shipment misrouted", severity: "high", relatedArtifact: "shipping" }),
    newIssue({ description: "Registration scanner dropped out", severity: "high", relatedArtifact: "run_of_show" }),
    newIssue({ description: "Coffee ran out mid-morning", severity: "medium", relatedArtifact: "checklist" }),
    newIssue({ description: "Signage slightly small", severity: "low", relatedArtifact: "checklist" }),
  ];
  const issueLog = {
    available: true, logisticsPackId: "pack-1", totalIssues: 5,
    bySeverity: { low: 1, medium: 1, high: 3 }, openAtIngestion: 2, entries: issueEntries,
  };

  const fromIssues = generateCandidateLessons("brief-1", issueLog, EMPTY_BUDGET_VARIANCE, EMPTY_ROI_SCORECARD);
  check(`5 entries + 1 clustered pattern = 6 candidates (${fromIssues.length})`, fromIssues.length === 6);
  check("the low-severity one suggests repeat",
    fromIssues.find((l) => l.lesson.includes("Signage"))?.disposition === "repeat");
  check("…and frames it as 'generally worked'", fromIssues.some((l) => /generally worked/i.test(l.lesson)));
  check("medium and high suggest fix",
    fromIssues.filter((l) => /Coffee|scanner/.test(l.lesson)).every((l) => l.disposition === "fix"));
  const pattern = fromIssues.find((l) => l.sourceRef === "shipping" && l.disposition === "drop");
  check("2 high-severity issues on one artifact add a clustered drop candidate", Boolean(pattern));
  check("…and it names the pattern, not the incident", /pattern/i.test(pattern?.lesson ?? ""));
  check("a single high-severity issue does NOT cluster",
    !fromIssues.some((l) => l.sourceRef === "run_of_show" && l.disposition === "drop"));
  check("every candidate keeps its source for traceability",
    fromIssues.every((l) => l.sourceType === "issue_log" && l.sourceRef));
  check("…and defaults to carrying forward", fromIssues.every((l) => l.carryForward));

  console.log("\nFR-6 · candidate lessons from budget variance");
  const budgetSummary = computeBudgetActualsSummary(budgetFixture.lineItems, budgetFixture.settings, conference);
  const budgetIngest = {
    available: true,
    totalBudgeted: budgetSummary.totalBudgeted,
    totalActual: budgetSummary.totalActual,
    variancePct: budgetSummary.variancePct,
    worstCategoryVariances: [
      { category: "other" as const, budgeted: 0, committed: 3200, actual: 3200, varianceAmount: 3200, variancePct: null },
      { category: "travel" as const, budgeted: 18000, committed: 18000, actual: 23600, varianceAmount: 5600, variancePct: 31.1 },
      { category: "venue" as const, budgeted: 95000, committed: 95000, actual: 95000, varianceAmount: 0, variancePct: 0 },
    ],
    varianceAtClose: budgetSummary.varianceAtClose,
  };
  const fromBudget = generateCandidateLessons("brief-1", EMPTY_ISSUE_LOG, budgetIngest, EMPTY_ROI_SCORECARD, 10);
  check("unbudgeted spend suggests drop",
    fromBudget.find((l) => l.sourceRef === "other")?.disposition === "drop");
  check("…and says it was never budgeted", /never budgeted/i.test(fromBudget.find((l) => l.sourceRef === "other")?.lesson ?? ""));
  check("an over-budget category suggests fix",
    fromBudget.find((l) => l.sourceRef === "travel")?.disposition === "fix");
  check("an on-budget category suggests repeat",
    fromBudget.find((l) => l.sourceRef === "venue")?.disposition === "repeat");
  check("the flag rule matches PRD 4's bands", (() => {
    const amber = categoryFlag({ category: "venue", budgeted: 100, committed: 0, actual: 115, varianceAmount: 15, variancePct: 15 }, 10);
    const red = categoryFlag({ category: "venue", budgeted: 100, committed: 0, actual: 130, varianceAmount: 30, variancePct: 30 }, 10);
    const none = categoryFlag({ category: "venue", budgeted: 100, committed: 0, actual: 105, varianceAmount: 5, variancePct: 5 }, 10);
    return amber === "amber" && red === "red" && none === "none";
  })());

  console.log("\nFR-6 · candidate lessons from the ROI scorecard");
  const scorecard = computeScorecard({
    budgetSummary,
    pipelineSummary: { opportunitiesCount: 3, meetingsCount: 1, sourcedCount: 1, sourcedAmount: 5000,
      influencedCount: 1, influencedAmount: 5000, outsideWindowCount: 0, wonCount: 0, wonAmount: 0, leadMatchRatePct: null },
    surveySummary: { responseCount: 6, npsScore: 10, npsSmallSample: false, csatAverage: 7 },
    costSummary: { costPerLead: 100, costPerMeeting: null, costPerOpportunity: null, totalLeads: 10, leadSourceMode: "manual_entry" },
    successMetrics: conference.successMetrics.map((m) => ({ ...m, actual: 0 })),
  });
  const roiIngest = {
    available: true, roiReportId: "roi-1", reportStatus: "final" as const,
    recommendation: scorecard.recommendation, recommendationRationale: scorecard.recommendationRationale,
    scorePct: scorecard.scorePct, dimensions: scorecard.dimensions, npsScore: 10,
  };
  const fromRoi = generateCandidateLessons("brief-1", EMPTY_ISSUE_LOG, EMPTY_BUDGET_VARIANCE, roiIngest);
  check("one candidate per scoreable dimension, plus a summary",
    fromRoi.length === scorecard.dimensions.filter((d) => d.verdict !== "insufficient_data").length + 1);
  check("insufficient-data dimensions produce no lesson",
    !fromRoi.some((l) => scorecard.dimensions.some((d) => d.id === l.sourceRef && d.verdict === "insufficient_data")));
  const summaryLesson = fromRoi.find((l) => l.sourceRef === "recommendation")!;
  check("the summary candidate mirrors the recommendation", Boolean(summaryLesson));
  check("…and carries the scorecard's own rationale wording",
    summaryLesson.lesson.includes(scorecard.recommendationRationale.slice(0, 30)));

  console.log("\nFR-6 · nothing ingested means nothing generated");
  check("no sources → zero candidates",
    generateCandidateLessons("brief-1", EMPTY_ISSUE_LOG, EMPTY_BUDGET_VARIANCE, EMPTY_ROI_SCORECARD).length === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-2 · the retro prompt");
  check("before the 3-day delay, no prompt", retroPromptLevel("2026-11-13", false, "2026-11-15") === "none");
  check("on day 3, a standard prompt", retroPromptLevel("2026-11-13", false, "2026-11-16") === "standard");
  check("on day 14, it escalates", retroPromptLevel("2026-11-13", false, "2026-11-27") === "escalated");
  check("a completed retro silences it", retroPromptLevel("2026-11-13", true, "2026-12-30") === "none");
  check("no end date, no prompt", retroPromptLevel(undefined, false, "2026-12-30") === "none");
  check("the thresholds are named constants", RETRO_PROMPT_DELAY_DAYS === 3);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-11 · completion gating");
  check("a lesson with no text blocks completion",
    !canComplete(retroDoc([retroLesson({ lesson: "  " })])));
  check("…and is named as the blocker",
    lessonsBlockingCompletion(retroDoc([retroLesson({ lesson: "" })])).length === 1);
  check("a complete lesson does not block", canComplete(retroDoc([retroLesson({})])));
  check("zero lessons is a legitimate retro", canComplete(retroDoc([])));

  const preview = previewCarryForward(retroDoc([
    retroLesson({ disposition: "repeat" }),
    retroLesson({ disposition: "fix" }),
    retroLesson({ disposition: "drop" }),
    retroLesson({ disposition: "fix", carryForward: false }),
  ]));
  check(`the preview counts only carried lessons (${preview.total})`, preview.total === 3);
  check("…split by disposition", preview.repeat === 1 && preview.fix === 1 && preview.drop === 1);

  /* ---------------------------------------------------------------- */
  console.log("\n§7 · the carry-forward write-back");
  const baseBrief: EventBrief = { ...conference, id: "brief-1", carryForwardLessons: [] };
  const lessons = [
    retroLesson({ lesson: "Book AV 90 days out", disposition: "fix", sourceType: "issue_log", sourceRef: "issue-9" }),
    retroLesson({ lesson: "Keep the same caterer", disposition: "repeat", sourceType: "budget_variance" }),
    retroLesson({ lesson: "Drop the photobooth", disposition: "drop", sourceType: "manual" }),
    retroLesson({ lesson: "Not carried", disposition: "fix", carryForward: false }),
  ];

  const first = applyCarryForward(baseBrief, lessons);
  check(`3 of 4 lessons written (${first.added})`, first.added === 3);
  check("the brief has exactly 3 carry-forward entries", first.brief.carryForwardLessons.length === 3);
  check("dispositions travel with them",
    first.brief.carryForwardLessons.every((l) => ["repeat", "fix", "drop"].includes(l.disposition ?? "")));
  check("source types travel with them",
    first.brief.carryForwardLessons.some((l) => l.sourceType === "issue_log"));
  check("retro-local fields do NOT travel", (() => {
    const written = first.brief.carryForwardLessons[0] as Record<string, unknown>;
    return !("sourceRef" in written) && !("carryForward" in written);
  })());
  check("each written lesson is stamped for idempotency",
    first.lessons.filter((l) => l.carryForward).every((l) => l.writtenLessonId));
  check("the un-carried lesson has no stamp", first.lessons[3].writtenLessonId === undefined);

  console.log("\n§7 · re-completing is idempotent, not duplicative");
  const edited = first.lessons.map((l, i) => (i === 0 ? { ...l, lesson: "Book AV 120 days out" } : l));
  const second = applyCarryForward(first.brief, edited);
  check(`still 3 entries, not 6 (${second.brief.carryForwardLessons.length})`,
    second.brief.carryForwardLessons.length === 3);
  check("…and the edit landed in place",
    second.brief.carryForwardLessons.some((l) => l.lesson === "Book AV 120 days out"));
  check("…reported as updated, not added", second.updated === 3 && second.added === 0);
  check("the entry kept its id across the rewrite",
    second.brief.carryForwardLessons[0].id === first.brief.carryForwardLessons[0].id);

  console.log("\n§7 · un-ticking carry-forward removes the entry");
  const unticked = second.lessons.map((l, i) => (i === 1 ? { ...l, carryForward: false } : l));
  const third = applyCarryForward(second.brief, unticked);
  check(`down to 2 entries (${third.brief.carryForwardLessons.length})`, third.brief.carryForwardLessons.length === 2);
  check("…reported as removed", third.removed === 1);
  check("…and the removed lesson forgets its link, so re-ticking writes fresh",
    third.lessons[1].writtenLessonId === undefined);
  const reticked = applyCarryForward(third.brief, third.lessons.map((l, i) => (i === 1 ? { ...l, carryForward: true } : l)));
  check("re-ticking restores it without duplicating", reticked.brief.carryForwardLessons.length === 3);

  check("lessons the retro never wrote are left alone", (() => {
    const withForeign: EventBrief = {
      ...baseBrief,
      carryForwardLessons: [{ id: "foreign-1", lesson: "From another retro", addedAt: nowIso() }],
    };
    const result = applyCarryForward(withForeign, lessons);
    return result.brief.carryForwardLessons.some((l) => l.id === "foreign-1");
  })());
  check("the canonical shape drops retro-only fields", (() => {
    const canonical = toCanonicalLesson(lessons[0]) as Record<string, unknown>;
    return !("carryForward" in canonical) && "disposition" in canonical;
  })());

  /* ---------------------------------------------------------------- */
  console.log("\nFR-13 · export");
  const doc = retroDoc(lessons);
  const markdown = renderRetroMarkdown({ ...doc, ingestedIssueLogSummary: issueLog, status: "completed" });
  check("groups by disposition", /## Repeat/.test(markdown) && /## Fix/.test(markdown) && /## Drop/.test(markdown));
  check("carries the disposition definitions", /worked. Keep doing it/.test(markdown));
  check("says what it was based on", /## What this was based on/.test(markdown));
  check("names unavailable sources honestly", /not available/.test(markdown));
  check("an empty retro still renders", /No lessons were recorded/.test(renderRetroMarkdown(retroDoc([]))));
  check("rendering is deterministic", renderRetroMarkdown(doc) === renderRetroMarkdown(doc));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-15 · migration");
  check("a versionless retro is stamped current",
    migrateRetroDocument({ ...doc, schemaVersion: "0.0.1" }).schemaVersion === CURRENT_RETRO_SCHEMA_VERSION);
  check("missing arrays are defaulted", (() => {
    const broken = { ...doc, lessons: undefined } as unknown as RetroDocument;
    return Array.isArray(migrateRetroDocument(broken).lessons);
  })());

  /* ---------------------------------------------------------------- */
  console.log("\nFR-1/FR-3/FR-4/FR-5 · ingestion through the real repositories");
  const stored = await saveBrief({ ...conference, id: "retro-brief", type: "conference" });
  const pack: LogisticsPack = {
    schemaVersion: "1.0.0", id: "pack-r", eventBriefId: "retro-brief",
    createdAt: nowIso(), updatedAt: nowIso(), version: 1,
    sessions: [], staffAssignments: [], shippingItems: [], venueChecklist: [], contacts: [],
    issueLog: issueEntries,
  };
  await savePack(pack);
  await saveBudgetSettings({ ...budgetFixture.settings, eventBriefId: "retro-brief" });
  await saveLineItems(budgetFixture.lineItems.map((i: { id: string }) => ({ ...i, eventBriefId: "retro-brief" })));

  const ingested = await ingestIssueLog("retro-brief");
  check(`the issue log ingests (${ingested.totalIssues} issues)`, ingested.available && ingested.totalIssues === 5);
  check("…with the severity split", ingested.bySeverity.high === 3);
  check("a brief with no pack degrades gracefully", (await ingestIssueLog("no-such-brief")).available === false);

  const retro = await findOrCreateRetro(stored);
  check("find-or-create seeds candidates from every available source", retro.lessons.length > 6);
  check("…and records what was available",
    retro.ingestedIssueLogSummary.available && retro.ingestedBudgetVarianceSummary.available);
  const again = await findOrCreateRetro(stored);
  check("opening it again does not regenerate", again.id === retro.id && again.lessons.length === retro.lessons.length);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-10 · success metric adjustment");
  const metricId = stored.successMetrics[0].id;
  const adjusted = await saveBrief(applyMetricAdjustment(stored, metricId, 512));
  check("the metric's actual is written", adjusted.successMetrics.find((m) => m.id === metricId)?.actual === 512);
  check("the brief version incremented", adjusted.version > stored.version);
  check("other metrics are untouched",
    adjusted.successMetrics.slice(1).every((m, i) => m.actual === stored.successMetrics[i + 1].actual));

  /* ---------------------------------------------------------------- */
  console.log("\nTHE PAYOFF · PRD 1's own intake read path sees the lessons");
  const completed = applyCarryForward(adjusted, [
    retroLesson({ sourceEventId: adjusted.id, lesson: "Book AV 120 days out — 90 was still tight", disposition: "fix", sourceType: "issue_log" }),
    retroLesson({ sourceEventId: adjusted.id, lesson: "Keep the same caterer — on budget and on time", disposition: "repeat", sourceType: "budget_variance" }),
  ]);
  const savedBrief = await saveBrief(completed.brief);
  await saveRetro({ ...retro, status: "completed", completedAt: nowIso(), lessons: completed.lessons });

  // This is PRD 1's function, unchanged, exactly as its intake calls it.
  const suggestions = await queryLessons("conference", "a-brand-new-brief");
  check(`PRD 1's queryLessons surfaces the carried lessons (${suggestions.length})`, suggestions.length >= 2);
  check("…with the lesson text intact",
    suggestions.some((s) => s.lesson.includes("Book AV 120 days out")));
  check("…with the disposition PRD 7 attached", suggestions.some((s) => s.disposition === "fix"));
  check("…and attributed to the event they came from",
    suggestions.every((s) => s.sourceBriefName === savedBrief.name));
  check("a brief's own lessons are excluded from its own intake",
    (await queryLessons("conference", savedBrief.id)).every((s) => s.sourceBriefId !== savedBrief.id));

  console.log("\nUpstream data is never modified");
  const packAfter = JSON.stringify((await getBrief("retro-brief")) ? await ingestIssueLog("retro-brief") : null);
  check("the logistics pack's issue log is unchanged after a full retro",
    packAfter.includes("Crate 2 never arrived"));
  check("the stored retro round-trips", (await getRetroByBriefId("retro-brief"))?.status === "completed");

  /* ---------------------------------------------------------------- */
  /* ------------------------------------------------------------------ */
  console.log("\n⭐ The retro does not give advice that makes the next event worse");
  {
    const cat = (category: string, budgeted: number, actual: number) => ({
      category: category as never,
      budgeted,
      committed: actual,
      actual,
      varianceAmount: actual - budgeted,
      variancePct: budgeted ? ((actual - budgeted) / budgeted) * 100 : null,
    });

    const ingest = (rows: ReturnType<typeof cat>[]) => ({
      ...EMPTY_BUDGET_VARIANCE,
      available: true,
      worstCategoryVariances: rows,
    });

    const text = (rows: ReturnType<typeof cat>[]) =>
      generateCandidateLessons("brief-1", EMPTY_ISSUE_LOG, ingest(rows) as never, EMPTY_ROI_SCORECARD, 10)
        .map((l) => l.lesson)
        .join("\n");

    const contingency = text([cat("contingency", 500, 0)]);
    check(
      "⭐ unspent contingency is never a lesson to budget less",
      !/budget less/i.test(contingency),
      "contingency going unspent is contingency working",
    );

    const under = text([cat("catering", 10000, 6000)]);
    check(
      "⭐ a real underspend asks rather than instructs",
      /good buying|never right/i.test(under),
      "only the planner knows whether an underspend was skill or a bad estimate",
    );
    check("…and never tells them to budget less", !/budget less/i.test(under));

    const over = text([cat("av", 5000, 7500)]);
    check("an overspend still says budget more realistically", /more realistically/i.test(over));
  }

  if (failures > 0) {
    console.error(`\n${failures} retro check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll post-mortem checks passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
