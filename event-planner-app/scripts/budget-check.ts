/**
 * Headless exercise of PRD 4 (Budget Builder & Tracker).
 *
 * This is money arithmetic feeding a finance export and, via `computeBudgetActualsSummary`,
 * a tool that doesn't exist yet — so the variance formula, the roll-up totals and the summary
 * contract get checked here rather than eyeballed in a table.
 *
 * Run with: pnpm budget-check
 */

import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  BUDGET_CATEGORIES,
  type BudgetLineItem,
  type BudgetSettings,
  type EventBrief,
} from "../packages/schema/src/index";
import { aggregateVarianceForLineItems,
  applyImportPlan,
  buildExportWorkbook,
  buildImportPlan,
  buildInitialLineItems,
  categoryActualTotals,
  categoryForAllocationName,
  computeBudgetActualsSummary,
  computeVariance,
  detectReforecastTriggers,
  newLineItem,
  parseMoney,
  reconcileAllocations,
  roundMoney,
  seedLineItemsForEventType,
  sheetToCsv,
  snapshotScope,
  suggestColumnMapping,
  worstFlagForLineItems,
} from "../packages/budget-calc/src/index";
import {
  deleteBrief,
  findOrCreateBudget,
  getBudgetSettings,
  getLineItems,
  saveBrief,
  saveLineItems,
  syncActualsToBrief,
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
const read = (name: string) => JSON.parse(readFileSync(join(here, "..", "fixtures", name), "utf8"));
const conference = read("conference-brief-example.json") as EventBrief;
const budgetFixture = read("conference-budget-example.json") as {
  lineItems: BudgetLineItem[];
  settings: BudgetSettings;
};

const SETTINGS: Pick<BudgetSettings, "defaultVarianceThresholdPct"> = {
  defaultVarianceThresholdPct: 10,
};

function item(partial: Partial<BudgetLineItem>): BudgetLineItem {
  return newLineItem("brief-x", partial);
}

async function main(): Promise<void> {
  /* ---------------------------------------------------------------- */
  console.log("\nFR-4 · the variance formula");
  check("1000 budgeted / 1150 actual → amber (15% ≥ 10%)",
    computeVariance(item({ budgetedAmount: 1000, actualAmount: 1150 }), SETTINGS).flag === "amber");
  check("1000 budgeted / 1300 actual → red (30% ≥ 20%)",
    computeVariance(item({ budgetedAmount: 1000, actualAmount: 1300 }), SETTINGS).flag === "red");
  check("1000 budgeted / 1050 actual → none (5% < 10%)",
    computeVariance(item({ budgetedAmount: 1000, actualAmount: 1050 }), SETTINGS).flag === "none");
  check("exactly at the amber threshold flags amber",
    computeVariance(item({ budgetedAmount: 1000, actualAmount: 1100 }), SETTINGS).flag === "amber");
  check("exactly at the red threshold flags red",
    computeVariance(item({ budgetedAmount: 1000, actualAmount: 1200 }), SETTINGS).flag === "red");
  check("under-spend flags too — variance is absolute",
    computeVariance(item({ budgetedAmount: 1000, actualAmount: 700 }), SETTINGS).flag === "red");

  console.log("\nFR-4 · unbudgeted spend is always red");
  check("0 budgeted with committed spend → red",
    computeVariance(item({ budgetedAmount: 0, committedAmount: 500 }), SETTINGS).flag === "red");
  check("0 budgeted with actual spend → red",
    computeVariance(item({ budgetedAmount: 0, actualAmount: 1 }), SETTINGS).flag === "red");
  check("0 budgeted and nothing spent → no flag",
    computeVariance(item({ budgetedAmount: 0 }), SETTINGS).flag === "none");
  check("the unbudgeted case is marked as such",
    computeVariance(item({ budgetedAmount: 0, actualAmount: 10 }), SETTINGS).isUnbudgeted);

  console.log("\nFR-4 · commitments are the early-warning signal");
  const committedOnly = computeVariance(item({ budgetedAmount: 1000, committedAmount: 1250 }), SETTINGS);
  check("a commitment alone can flag before any invoice", committedOnly.flag === "red");
  check("…and reports that it came from the commitment", committedOnly.effectiveBasis === "committed");
  const both = computeVariance(item({ budgetedAmount: 1000, committedAmount: 1250, actualAmount: 1050 }), SETTINGS);
  check("once actuals exist they win over commitments", both.effectiveBasis === "actual" && both.flag === "none");

  console.log("\nFR-4 · per-line threshold override");
  check("a widened per-line threshold suppresses the flag",
    computeVariance(item({ budgetedAmount: 1000, actualAmount: 1150, varianceThresholdPct: 20 }), SETTINGS).flag === "none");
  check("a tightened per-line threshold raises one (3% against a 2% threshold → amber)",
    computeVariance(item({ budgetedAmount: 1000, actualAmount: 1030, varianceThresholdPct: 2 }), SETTINGS).flag === "amber");
  check("…and doubles to red at 2× the tightened threshold",
    computeVariance(item({ budgetedAmount: 1000, actualAmount: 1050, varianceThresholdPct: 2 }), SETTINGS).flag === "red");
  check("worst-flag rollup takes the worst of a set",
    worstFlagForLineItems([
      item({ budgetedAmount: 1000, actualAmount: 1000 }),
      item({ budgetedAmount: 1000, actualAmount: 1150 }),
      item({ budgetedAmount: 1000, actualAmount: 1500 }),
    ], SETTINGS) === "red");

  console.log("\nMoney arithmetic");
  check("cents survive float addition", roundMoney(0.1 + 0.2) === 0.3);
  check("parses $1,234.56", parseMoney("$1,234.56") === 1234.56);
  check("parses accounting negatives", parseMoney("(500)") === -500);
  check("rejects free text", parseMoney("n/a") === null);
  check("passes numbers through", parseMoney(42) === 42);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-1 · per-event-type templates");
  for (const [type, expected] of [["conference", true], ["webinar", true], ["trade_show", true]] as const) {
    const seeded = seedLineItemsForEventType("b", type);
    check(`${type} seeds line items (${seeded.length})`, seeded.length > 0 === expected);
  }
  check("custom seeds nothing", seedLineItemsForEventType("b", "custom").length === 0);
  check("webinar has no venue or F&B rows",
    !seedLineItemsForEventType("b", "webinar").some((i) => i.category === "venue" || i.category === "f_and_b"));
  check("conference seeds both F&B rows",
    seedLineItemsForEventType("b", "conference").filter((i) => i.category === "f_and_b").length === 2);
  check("every seeded row starts at zero",
    seedLineItemsForEventType("b", "conference").every((i) => i.budgetedAmount === 0 && i.actualAmount === 0));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-2 · reconciling the brief's own allocations");
  check("Catering → f_and_b", categoryForAllocationName("Catering") === "f_and_b");
  check("A/V → av", categoryForAllocationName("A/V") === "av");
  check("Production → av", categoryForAllocationName("Production") === "av");
  check("Speaker fees → staffing", categoryForAllocationName("Speaker fees") === "staffing");
  check("Speaker travel → travel, not staffing", categoryForAllocationName("Speaker travel") === "travel");
  check("Photobooth → other", categoryForAllocationName("Photobooth") === "other");

  const reconciled = reconcileAllocations("brief-x", [
    { id: "a1", category: "Catering", plannedAmount: 12000 },
    { id: "a2", category: "Speaker fees", plannedAmount: 8000 },
    { id: "a3", category: "Photobooth", plannedAmount: 2500 },
  ]);
  check("three allocations become three line items", reconciled.lineItems.length === 3);
  check("the unmatched one keeps its literal name",
    reconciled.lineItems.some((i) => i.category === "other" && i.lineItemName === "Photobooth"));
  check("unmatched labels are reported", reconciled.unmatched.includes("Photobooth"));
  check("planned amounts carry across as budgeted",
    reconciled.lineItems.find((i) => i.lineItemName === "Catering")?.budgetedAmount === 12000);

  const merged = buildInitialLineItems(
    { ...conference, budget: { currency: "USD", allocations: [{ id: "a1", category: "Venue rental", plannedAmount: 95000 }] } },
    seedLineItemsForEventType(conference.id, "conference"),
  );
  check("a seeded row is not duplicated by a matching allocation",
    merged.lineItems.filter((i) => i.lineItemName.toLowerCase() === "venue rental").length === 1);
  check("…and the surviving row carries the allocation's amount",
    merged.lineItems.find((i) => i.lineItemName.toLowerCase() === "venue rental")?.budgetedAmount === 95000);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-7 · reforecast triggers");
  const base = { ...conference, audience: { ...conference.audience, estimatedSize: 300 } };
  const snapshot = snapshotScope(base);
  const trig = (b: EventBrief) => detectReforecastTriggers(b, snapshot);

  check("+33% headcount triggers",
    trig({ ...base, audience: { ...base.audience, estimatedSize: 400 } }).some((t) => t.field === "estimatedSize"));
  check("+7% headcount does not",
    trig({ ...base, audience: { ...base.audience, estimatedSize: 321 } }).length === 0);
  check("exactly 15% triggers",
    trig({ ...base, audience: { ...base.audience, estimatedSize: 345 } }).some((t) => t.field === "estimatedSize"));
  check("any delivery-mode change triggers",
    trig({ ...base, format: { ...base.format, deliveryMode: "hybrid" } }).some((t) => t.field === "deliveryMode"));
  check("any start-date change triggers",
    trig({ ...base, dates: { ...base.dates, eventStartDate: "2026-11-19" } }).some((t) => t.field === "eventStartDate"));
  check("any total-budget change triggers",
    trig({ ...base, budget: { ...base.budget, totalBudget: 300000 } }).some((t) => t.field === "totalBudget"));
  check("an unchanged brief triggers nothing", trig(base).length === 0);
  check("a version bump alone triggers nothing", trig({ ...base, version: base.version + 5 }).length === 0);
  check("a headcount change names its likely categories",
    trig({ ...base, audience: { ...base.audience, estimatedSize: 400 } })[0].affectedCategories.includes("f_and_b"));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-6 · import column mapping and matching");
  const mapping = suggestColumnMapping(["Line Item", "Category", "Actual Spend", "Vendor Name"]);
  check('"Actual Spend" auto-maps to actualAmount', mapping["Actual Spend"] === "actualAmount");
  check('"Line Item" auto-maps to the name', mapping["Line Item"] === "lineItemName");
  check('"Vendor Name" auto-maps to vendor', mapping["Vendor Name"] === "vendor");
  check("an unknown column defaults to ignore", suggestColumnMapping(["Sparkle"])["Sparkle"] === "ignore");

  const existing = [
    item({ id: "keep-1", category: "f_and_b", lineItemName: "Reception catering", budgetedAmount: 22000 }),
    item({ id: "keep-2", category: "venue", lineItemName: "Venue rental", budgetedAmount: 95000 }),
  ];
  const plan = buildImportPlan(
    [
      { "Line Item": "Reception catering", Category: "F&B", "Actual Spend": "$24,850" },
      { "Line Item": "Photobooth", Category: "Other", "Actual Spend": "3200" },
      { "Line Item": "", Category: "Venue", "Actual Spend": "10" },
      { "Line Item": "Mystery", Category: "Venue", "Actual Spend": "not a number" },
    ],
    mapping,
    existing,
  );
  check(`one row matches an existing line item (${plan.willUpdate})`, plan.willUpdate === 1);
  check(`one row is new (${plan.willCreate})`, plan.willCreate === 1);
  check("a nameless row is an error, not a silent skip", plan.errors.some((e) => e.row === 3));
  check("a row with no usable amount is an error", plan.errors.some((e) => e.row === 4));
  check("the matched row carries the parsed money",
    plan.candidates.find((c) => c.outcome === "update")?.actualAmount === 24850);
  check("matching is by category and name together",
    plan.candidates.find((c) => c.outcome === "update")?.existingId === "keep-1");

  const applied = applyImportPlan(existing, plan.candidates, "brief-x", "csv_import", "2026-11-24T00:00:00.000Z");
  check(`import adds only the new row (${applied.length})`, applied.length === 3);
  check("the updated row kept its budgeted amount",
    applied.find((i) => i.id === "keep-1")?.budgetedAmount === 22000);
  check("…and took the imported actual", applied.find((i) => i.id === "keep-1")?.actualAmount === 24850);
  check("untouched rows are untouched", applied.find((i) => i.id === "keep-2")?.actualAmount === 0);
  check("imported rows are tagged with their source",
    applied.find((i) => i.lineItemName === "Photobooth")?.source === "csv_import");
  check("an ambiguous match is skipped rather than guessed", (() => {
    const dupes = [
      item({ id: "d1", category: "venue", lineItemName: "Rental" }),
      item({ id: "d2", category: "venue", lineItemName: "Rental" }),
    ];
    const p = buildImportPlan([{ "Line Item": "Rental", Category: "Venue", "Actual Spend": "5" }], mapping, dupes);
    return p.skipped === 1 && p.willUpdate === 0;
  })());

  /* ---------------------------------------------------------------- */
  console.log("\nFR-13 · the ROI seam (computeBudgetActualsSummary)");
  const { lineItems: fx, settings: fxSettings } = budgetFixture;
  const summary = computeBudgetActualsSummary(fx, fxSettings, conference);

  const handTotal = roundMoney(fx.reduce((s, i) => s + i.actualAmount, 0));
  check(`totalActual equals the sum of line items (${summary.totalActual})`, summary.totalActual === handTotal);
  check("spendByCategory sums back to totalActual",
    roundMoney(summary.spendByCategory.reduce((s, c) => s + c.actual, 0)) === summary.totalActual);
  check("spendByCategory sums back to totalBudgeted",
    roundMoney(summary.spendByCategory.reduce((s, c) => s + c.budgeted, 0)) === summary.totalBudgeted);
  check("every taxonomy category is present",
    summary.spendByCategory.length === BUDGET_CATEGORIES.length);
  check("variance is actual minus budgeted",
    summary.varianceAmount === roundMoney(summary.totalActual - summary.totalBudgeted));
  check("a reconciled budget reports isFinal", summary.varianceAtClose.isFinal === true);
  check("…and carries the timestamp", summary.varianceAtClose.reconciledAt === fxSettings.reconciledAt);
  check("an unreconciled budget does not",
    computeBudgetActualsSummary(fx, { ...fxSettings, reconciledAt: null }, conference).varianceAtClose.isFinal === false);
  check(`line item count (${summary.lineItemCount})`, summary.lineItemCount === fx.length);
  check(`reconciled line item % (${summary.reconciledLineItemPct})`,
    summary.reconciledLineItemPct === Math.round((fx.filter((i) => i.actualAmount > 0).length / fx.length) * 100));
  check("currency comes off the budget settings", summary.currency === "USD");
  check("an empty budget does not divide by zero", (() => {
    const empty = computeBudgetActualsSummary([], fxSettings, conference);
    return empty.variancePct === null && empty.reconciledLineItemPct === 0 && empty.totalActual === 0;
  })());

  console.log("\nFixture exercises the interesting cases");
  check("it contains an over-spend", fx.some((i) => computeVariance(i, fxSettings).flag === "red" && i.actualAmount > i.budgetedAmount));
  check("it contains an under-spend", fx.some((i) => i.actualAmount > 0 && i.actualAmount < i.budgetedAmount));
  check("it contains an unbudgeted line", fx.some((i) => computeVariance(i, fxSettings).isUnbudgeted));
  check("it contains a committed-not-invoiced line", fx.some((i) => i.committedAmount > 0 && i.actualAmount === 0));
  check("it contains a per-line threshold override", fx.some((i) => i.varianceThresholdPct !== null));
  check("it contains a completed reforecast", fxSettings.reforecastHistory.some((r) => r.action === "reforecasted"));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-10 · export");
  const workbook = buildExportWorkbook(fx, fxSettings, conference);
  check("three sheets", workbook.sheets.length === 3);
  check("sheets are named as finance expects",
    workbook.sheets.map((s) => s.name).join(", ") === "Line Items, Summary by Category, Budget vs Brief");
  check(`line items sheet has a row per item plus a header (${workbook.sheets[0].rows.length})`,
    workbook.sheets[0].rows.length === fx.length + 1);
  check("summary subtotals match the line items sheet", (() => {
    const summarySheet = workbook.sheets[1].rows;
    const totalRow = summarySheet[summarySheet.length - 1];
    const lineItemsActual = roundMoney(
      workbook.sheets[0].rows.slice(1).reduce((s, r) => s + Number(r[5] ?? 0), 0),
    );
    return Number(totalRow[3]) === lineItemsActual;
  })());
  check("CSV escapes a comma inside a cell",
    sheetToCsv([["a,b", "c"]]).split("\n")[0] === '"a,b",c');
  check("CSV escapes embedded quotes", sheetToCsv([['say "hi"']]).includes('"say ""hi"""'));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-9 · actuals roll-up into the brief");
  const rollupBrief = await saveBrief({
    ...conference,
    id: "budget-brief",
    budget: {
      currency: "USD",
      totalBudget: 285000,
      allocations: [
        { id: "alloc-fnb", category: "Catering", plannedAmount: 76000 },
        { id: "alloc-venue", category: "Venue", plannedAmount: 95000 },
      ],
    },
  });
  const fnbItems = [
    newLineItem("budget-brief", { category: "f_and_b", lineItemName: "Lunch", actualAmount: 9000 }),
    newLineItem("budget-brief", { category: "f_and_b", lineItemName: "Reception", actualAmount: 3400 }),
  ];
  const totals = categoryActualTotals(fnbItems);
  check("category totals add up", totals.find((t) => t.category === "f_and_b")?.actual === 12400);

  const synced = await syncActualsToBrief(rollupBrief, fnbItems);
  const fnbAllocation = synced.budget.allocations!.find((a) => a.category === "Catering")!;
  check("the planner's own 'Catering' allocation received the F&B total", fnbAllocation.actualAmount === 12400);
  check("plannedAmount was not touched", fnbAllocation.plannedAmount === 76000);
  check(`brief version incremented (${rollupBrief.version} → ${synced.version})`, synced.version > rollupBrief.version);
  check("no duplicate allocation was created", synced.budget.allocations!.length === 2);

  const withNewCategory = await syncActualsToBrief(synced, [
    ...fnbItems,
    newLineItem("budget-brief", { category: "swag", lineItemName: "Bags", actualAmount: 500 }),
  ]);
  check("a category with no allocation gains one", withNewCategory.budget.allocations!.length === 3);
  check("…created with zero planned, so it can't be mistaken for a plan",
    withNewCategory.budget.allocations!.find((a) => a.category === "Swag")?.plannedAmount === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-1/FR-11 · persistence, idempotence and isolation");
  const briefA = await saveBrief({ ...conference, id: "budget-a", type: "conference", version: 1 });
  const briefB = await saveBrief({ ...conference, id: "budget-b", type: "webinar", version: 1, budget: { currency: "EUR" } });

  const bootA = await findOrCreateBudget(briefA);
  check("first open generates the template", bootA.generated && bootA.lineItems.length > 0);
  const bootAgain = await findOrCreateBudget(briefA);
  check("second open does not regenerate", !bootAgain.generated);
  check("…and does not duplicate rows", bootAgain.lineItems.length === bootA.lineItems.length);

  const bootB = await findOrCreateBudget(briefB);
  check("a second brief gets its own budget", bootB.lineItems.every((i) => i.eventBriefId === "budget-b"));
  check("settings snapshot the brief's currency", bootB.settings.currency === "EUR");
  check("no line-item bleed between briefs",
    (await getLineItems("budget-a")).every((i) => i.eventBriefId === "budget-a"));

  await saveLineItems(bootA.lineItems.map((i, n) => (n === 0 ? { ...i, actualAmount: 1234 } : i)));
  check("an edited amount persists", (await getLineItems("budget-a"))[0].actualAmount === 1234);

  await (async () => {
    const settings = (await getBudgetSettings("budget-a"))!;
    const { saveBudgetSettings } = await import("../packages/local-store/src/index");
    await saveBudgetSettings({ ...settings, reconciledAt: "2026-12-01T00:00:00.000Z" });
  })();
  check("marking reconciled persists", (await getBudgetSettings("budget-a"))!.reconciledAt !== null);
  check("…and flips isFinal on the summary",
    computeBudgetActualsSummary(await getLineItems("budget-a"), (await getBudgetSettings("budget-a"))!, briefA)
      .varianceAtClose.isFinal === true);

  console.log("\nHousekeeping · deleting a brief clears its budget");
  await deleteBrief("budget-a");
  check("line items gone", (await getLineItems("budget-a")).length === 0);
  check("settings gone", (await getBudgetSettings("budget-a")) === null);
  check("the other brief's budget survived", (await getLineItems("budget-b")).length > 0);

  /* ---------------------------------------------------------------- */
  /* ------------------------------------------------------------------ */
  console.log("\n⭐ A variance flag knows which way it went");
  {
    // The exact numbers from a real event run, where the budget screen said "Over" on a total
    // that came in $660 under, and "On budget" on the only category genuinely overspent.
    const settings = { defaultVarianceThresholdPct: 10 } as never;
    const line = (id: string, budgeted: number, actual: number) =>
      ({ id, briefId: "b", lineItemName: id, category: "other", budgetedAmount: budgeted,
         committedAmount: actual, actualAmount: actual, status: "reconciled" }) as never;

    const av = aggregateVarianceForLineItems([line("av", 2800, 2150)], settings);
    check("a 23% underspend is still flagged", av.flag !== "none", "an underspend is a planning miss too");
    check("⭐ …and its direction is under, not over", av.direction === "under");

    const promo = aggregateVarianceForLineItems([line("promo", 10000, 10740)], settings);
    check("⭐ a 7% overspend inside the threshold is not flagged", promo.flag === "none");
    check("…and reads as over when it is", aggregateVarianceForLineItems([line("p", 10000, 12000)], settings).direction === "over");

    const total = aggregateVarianceForLineItems(
      [line("av", 2800, 2150), line("other", 2900, 2650), line("promo", 10000, 10740), line("staff", 2300, 1800)],
      settings,
    );
    check(
      "⭐ a total $660 under budget does not report as over",
      total.direction === "under",
      "$18,000 budgeted against $17,340 actual read \"Over\" on the money screen",
    );

    check("an exact match has no direction", aggregateVarianceForLineItems([line("x", 5000, 5000)], settings).direction === "none");
    check("an empty budget has no direction", aggregateVarianceForLineItems([], settings).direction === "none");
  }

  if (failures > 0) {
    console.error(`\n${failures} budget check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll budget builder checks passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
