/**
 * Headless exercise of PRD 6 (Event ROI & Attribution Report).
 *
 * The attribution rule and the scorecard are the credibility of this tool's output — a report
 * that miscounts sourced pipeline or shows a colour it can't justify is worse than no report,
 * because someone will take a budget decision on it. Both are tested at their boundaries.
 *
 * Run with: pnpm roi-check
 */

import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { EventBrief } from "../packages/schema/src/index";
import { computeBudgetActualsSummary } from "../packages/budget-calc/src/index";
import type { BudgetActualsSummary } from "../packages/budget-calc/src/index";
import {
  DEFAULT_ATTRIBUTION_SETTINGS,
  SCORECARD_THRESHOLDS,
  applyMetricWriteBacks,
  computeAttribution,
  computeCostSummary,
  computePipelineSummary,
  computeScorecard,
  computeSurveySummary,
  computeYoyDeltas,
  effectiveAttribution,
  findEligibleComparators,
  markLeadMatches,
  matchSuccessMetrics,
  mergePipelineRows,
  parseCsv,
  parseIsoDateCell,
  reclassifyOpportunities,
  renderExecutiveSummary,
  renderFullReport,
  rowsToPipelineOpportunities,
  rowsToSurveyResponses,
  suggestComparator,
  suggestPipelineColumnMapping,
  suggestSurveyColumnMapping,
  type AttributionSettings,
  type PipelineOpportunity,
  type RoiReport,
  type SurveyResponse,
} from "../packages/roi-report-core/src/index";
import {
  getAttributionSettings,
  getReportByBriefId,
  listPipelineOpportunities,
  loadBudgetSummary,
  saveAttributionSettings,
  savePipelineOpportunitiesBulk,
  saveReport,
  getBudgetSettings,
  getLineItems,
  saveBrief,
  getBrief,
  saveBudgetSettings,
  saveLineItems,
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
const fixture = (name: string) => readFileSync(join(here, "..", "fixtures", name), "utf8");
const conference = JSON.parse(fixture("conference-brief-example.json")) as EventBrief;
const budgetFixture = JSON.parse(fixture("conference-budget-example.json")) as {
  lineItems: Parameters<typeof computeBudgetActualsSummary>[0];
  settings: Parameters<typeof computeBudgetActualsSummary>[1];
};

/** The event ran 12-13 November 2026, so windows are measured from the 13th. */
const WINDOW = { eventStartDate: "2026-11-12", eventEndDate: "2026-11-13" };
const SETTINGS: AttributionSettings = { ...DEFAULT_ATTRIBUTION_SETTINGS, updatedAt: "" };

function opportunity(partial: Partial<PipelineOpportunity>): PipelineOpportunity {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    roiReportId: "report-1",
    recordId: partial.recordId ?? "R1",
    recordType: "opportunity",
    createdDate: "2026-11-20",
    amount: 1000,
    computedAttributionType: "sourced",
    effectiveAttributionType: "sourced",
    leadMatchStatus: "not_checked",
    source: "csv_import",
    sourceImportBatchId: "batch-1",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function survey(scores: number[]): SurveyResponse[] {
  return scores.map((npsScore, i) => ({
    id: `s${i}`,
    roiReportId: "report-1",
    npsScore,
    sourceImportBatchId: "b",
    createdAt: "",
  }));
}

async function main(): Promise<void> {
  /* ---------------------------------------------------------------- */
  console.log("\nFR-6 · attribution classification");
  check("created 20 days after close → sourced",
    computeAttribution("2026-12-03", WINDOW, SETTINGS) === "sourced");
  check("created during the event → sourced",
    computeAttribution("2026-11-12", WINDOW, SETTINGS) === "sourced");
  check("exactly on the sourced boundary (30 days) → sourced",
    computeAttribution("2026-12-13", WINDOW, SETTINGS) === "sourced");
  check("one day past the sourced boundary → influenced",
    computeAttribution("2026-12-14", WINDOW, SETTINGS) === "influenced");
  check("45 days after close → influenced",
    computeAttribution("2026-12-28", WINDOW, SETTINGS) === "influenced");
  check("exactly on the influenced boundary (90 days) → influenced",
    computeAttribution("2027-02-11", WINDOW, SETTINGS) === "influenced");
  check("120 days after close → outside_window",
    computeAttribution("2027-03-13", WINDOW, SETTINGS) === "outside_window");
  check("pre-existing pipeline created before the event → influenced",
    computeAttribution("2026-09-01", WINDOW, SETTINGS) === "influenced");
  check("a missing created date → outside_window",
    computeAttribution("", WINDOW, SETTINGS) === "outside_window");

  console.log("\nFR-6 · the CRM's own column, and its limits");
  check("an explicit CRM value overrides the computed one",
    effectiveAttribution("influenced", "sourced", SETTINGS) === "sourced");
  check("…but not when the override setting is off",
    effectiveAttribution("influenced", "sourced", { useExplicitAttributionTypeColumn: false }) === "influenced");
  check("an override can NEVER resurrect an outside-window row",
    effectiveAttribution("outside_window", "sourced", SETTINGS) === "outside_window");
  check("with no CRM value the computed one stands",
    effectiveAttribution("sourced", null, SETTINGS) === "sourced");

  console.log("\nFR-5 · a settings change reclassifies live, no re-import");
  const rows = [
    opportunity({ recordId: "A", createdDate: "2026-12-03" }),
    opportunity({ recordId: "B", createdDate: "2027-03-13" }),
  ];
  const tightened = reclassifyOpportunities(rows, WINDOW, { ...SETTINGS, sourcedWindowDays: 14 }, "t");
  check("the 20-day opportunity reclassifies to influenced",
    tightened[0].computedAttributionType === "influenced");
  check("…and its effective type moved with it", tightened[0].effectiveAttributionType === "influenced");
  check("the far-future row stays outside the window", tightened[1].effectiveAttributionType === "outside_window");
  check("widening the influenced window pulls a row back in",
    reclassifyOpportunities(rows, WINDOW, { ...SETTINGS, influencedWindowDays: 200 }, "t")[1].computedAttributionType === "influenced");

  /* ---------------------------------------------------------------- */
  console.log("\nFR-4 · pipeline import");
  const pipelineCsv = parseCsv(fixture("roi-sample-pipeline.csv"));
  const pipelineMapping = suggestPipelineColumnMapping(pipelineCsv.headers);
  const mapFor = (col: string) => pipelineMapping.find((m) => m.sourceColumn === col)?.targetField;
  check('"Opp ID" auto-maps to recordId', mapFor("Opp ID") === "recordId");
  check('"Account Name" auto-maps to company', mapFor("Account Name") === "company");
  check('"Created Date" auto-maps to createdDate', mapFor("Created Date") === "createdDate");
  check('"Amount" auto-maps to amount', mapFor("Amount") === "amount");
  check('"Attribution" auto-maps to attributionType', mapFor("Attribution") === "attributionType");

  check("US-style dates parse", parseIsoDateCell("11/20/2026") === "2026-11-20");
  check("ISO dates pass through", parseIsoDateCell("2026-11-20") === "2026-11-20");
  check("junk dates yield empty, not a wrong date", parseIsoDateCell("not a date") === "");

  const parsed = rowsToPipelineOpportunities(
    pipelineCsv.rows, pipelineMapping, "report-1", "batch-1", WINDOW, SETTINGS, "csv_import",
  );
  check(`all 7 rows import (${parsed.rows.length})`, parsed.rows.length === 7);
  check("no errors on the clean fixture", parsed.errors.length === 0);
  check("meetings are distinguished from opportunities",
    parsed.rows.filter((r) => r.recordType === "meeting").length === 2);
  check("the far-future row lands outside the window",
    parsed.rows.find((r) => r.recordId === "OPP-1005")?.effectiveAttributionType === "outside_window");
  check("a pre-event opportunity is influenced",
    parsed.rows.find((r) => r.recordId === "OPP-1003")?.computedAttributionType === "influenced");
  check("the computed value is retained even when the CRM overrode it",
    parsed.rows.find((r) => r.recordId === "OPP-1003")?.importedAttributionType === "influenced");

  const missingId = rowsToPipelineOpportunities(
    [{ "Created Date": "2026-11-20", Amount: "10" }], pipelineMapping, "r", "b", WINDOW, SETTINGS, "csv_import",
  );
  check("a row with no record id is an error, not a silent skip", missingId.errors.length === 1);
  check("an unmapped amount column is flagged loudly",
    rowsToPipelineOpportunities(pipelineCsv.rows, pipelineMapping.map((m) => m.targetField === "amount" ? { ...m, targetField: "ignore" as const } : m), "r", "b", WINDOW, SETTINGS, "csv_import").amountUnmapped);

  const reimported = rowsToPipelineOpportunities(
    pipelineCsv.rows.slice(0, 2).map((r) => ({ ...r, Amount: "999999" })),
    pipelineMapping, "report-1", "batch-2", WINDOW, SETTINGS, "csv_import",
  );
  const merged = mergePipelineRows(parsed.rows, reimported.rows);
  check(`re-import updates rather than duplicating (${merged.rows.length})`, merged.rows.length === 7);
  check(`…reporting 2 updated, 0 created (${merged.updated}/${merged.created})`, merged.updated === 2 && merged.created === 0);
  check("the updated row took the new amount",
    merged.rows.find((r) => r.recordId === "OPP-1001")?.amount === 999999);
  check("…and kept its original id", merged.rows.find((r) => r.recordId === "OPP-1001")?.id === parsed.rows.find((r) => r.recordId === "OPP-1001")?.id);

  console.log("\nFR-4 · pipeline summary");
  const summary = computePipelineSummary(parsed.rows);
  check(`5 opportunities, 2 meetings (${summary.opportunitiesCount}/${summary.meetingsCount})`,
    summary.opportunitiesCount === 5 && summary.meetingsCount === 2);
  check("outside-window rows are counted, not dropped", summary.outsideWindowCount === 1);
  check("won amounts are captured", summary.wonAmount === 80000 && summary.wonCount === 1);
  check("sourced and influenced amounts split", summary.sourcedAmount > 0 && summary.influencedAmount > 0);

  const withMatches = markLeadMatches(parsed.rows, ["dana.whitfield@northwind.example"]);
  check("lead cross-check marks a match", withMatches.some((r) => r.leadMatchStatus === "matched"));
  check("…and is informational only, not gating attribution",
    computePipelineSummary(withMatches).sourcedAmount === summary.sourcedAmount);
  check("with no lead emails, nothing is checked",
    markLeadMatches(parsed.rows, []).every((r) => r.leadMatchStatus === "not_checked"));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-7 · survey and NPS");
  const surveyCsv = parseCsv(fixture("roi-sample-survey.csv"));
  const surveyMapping = suggestSurveyColumnMapping(surveyCsv.headers);
  check('"How likely are you to recommend" maps to npsScore',
    surveyMapping.find((m) => m.sourceColumn === "How likely are you to recommend")?.targetField === "npsScore");
  check('"Overall rating" maps to csatScore',
    surveyMapping.find((m) => m.sourceColumn === "Overall rating")?.targetField === "csatScore");

  const responses = rowsToSurveyResponses(surveyCsv.rows, surveyMapping, "report-1", "b");
  check(`10 responses parse (${responses.length})`, responses.length === 10);

  // 20 promoters, 15 passives, 5 detractors → (20-5)/40 = 37.5 → 38.
  const big = computeSurveySummary(survey([
    ...Array(20).fill(10), ...Array(15).fill(8), ...Array(5).fill(3),
  ]));
  check(`the worked example computes NPS 38 (${big.npsScore})`, big.npsScore === 38);
  check("…and is not flagged small-sample", !big.npsSmallSample);
  check("3 responses flag as a small sample", computeSurveySummary(survey([10, 9, 8])).npsSmallSample);
  check("all promoters is +100", computeSurveySummary(survey([10, 10, 10, 9, 9])).npsScore === 100);
  check("all detractors is -100", computeSurveySummary(survey([0, 1, 2, 3, 4])).npsScore === -100);
  check("passives count in the denominator but score nothing",
    computeSurveySummary(survey([10, 8, 8, 8, 8])).npsScore === 20);
  check("no scored responses yields null, not zero", computeSurveySummary([]).npsScore === null);
  check("CSAT averages when present", computeSurveySummary(responses).csatAverage !== null);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-8 · cost per outcome");
  const fakeBudget = { totalActual: 50000, currency: "USD" } as BudgetActualsSummary;
  const costs = computeCostSummary(fakeBudget, 250, { opportunitiesCount: 40, meetingsCount: 10 } as never, "auto_single_session");
  check(`cost per lead is $200 (${costs.costPerLead})`, costs.costPerLead === 200);
  check(`cost per opportunity is $1,250 (${costs.costPerOpportunity})`, costs.costPerOpportunity === 1250);
  check(`cost per meeting is $5,000 (${costs.costPerMeeting})`, costs.costPerMeeting === 5000);

  const noPipeline = computeCostSummary(fakeBudget, 250, null, "auto_single_session");
  check("no pipeline → opportunity cost is null, not a division by zero", noPipeline.costPerOpportunity === null);
  check("…and cost per lead still computes", noPipeline.costPerLead === 200);
  check("no budget → every cost figure is null",
    computeCostSummary(null, 250, { opportunitiesCount: 40, meetingsCount: 10 } as never, "auto_single_session").costPerLead === null);
  check("zero leads → null rather than Infinity",
    computeCostSummary(fakeBudget, 0, null, "unavailable").costPerLead === null);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-10 · the scorecard");
  const budgetSummary = computeBudgetActualsSummary(budgetFixture.lineItems, budgetFixture.settings, conference);
  const strongPipeline = computePipelineSummary([
    opportunity({ recordId: "S1", amount: 900000, effectiveAttributionType: "sourced" }),
  ]);
  const strong = computeScorecard({
    budgetSummary,
    pipelineSummary: strongPipeline,
    surveySummary: computeSurveySummary(survey([10, 10, 10, 10, 9])),
    costSummary: computeCostSummary(budgetSummary, 200, strongPipeline, "auto_single_session"),
    successMetrics: conference.successMetrics.map((m) => ({ ...m, actual: m.target })),
  });
  check("a strong event scores green on ROI ratio",
    strong.dimensions.find((d) => d.id === "roi_ratio")?.verdict === "green");
  check("…and recommends repeat", strong.recommendation === "repeat", strong.recommendation);
  check("every dimension carries its threshold text",
    strong.dimensions.every((d) => d.thresholdsApplied.length > 10));
  check("…and its raw value when scoreable",
    strong.dimensions.filter((d) => d.verdict !== "insufficient_data").every((d) => d.rawValue !== null));

  const weakPipeline = computePipelineSummary([
    opportunity({ recordId: "W1", amount: 1000, effectiveAttributionType: "sourced" }),
  ]);
  const weak = computeScorecard({
    budgetSummary,
    pipelineSummary: weakPipeline,
    surveySummary: computeSurveySummary(survey([0, 1, 2, 3, 4])),
    costSummary: computeCostSummary(budgetSummary, 5, weakPipeline, "auto_single_session"),
    successMetrics: conference.successMetrics.map((m) => ({ ...m, actual: 0 })),
  });
  check("a weak event recommends kill", weak.recommendation === "kill", weak.recommendation);
  check("…and its rationale names the weak dimensions", weak.recommendationRationale.length > 40);

  const partial = computeScorecard({
    budgetSummary: null,
    pipelineSummary: null,
    surveySummary: null,
    costSummary: computeCostSummary(null, null, null, "unavailable"),
    successMetrics: [],
  });
  check("with nothing imported, every dimension is insufficient_data",
    partial.dimensions.every((d) => d.verdict === "insufficient_data"));
  check("…and no recommendation is made", partial.recommendation === "insufficient_data");
  check("…with a rationale that says what is missing", /missing/i.test(partial.recommendationRationale));
  check("scorePct is null when nothing is scoreable", partial.scorePct === null);

  const oneDimension = computeScorecard({
    budgetSummary: null, pipelineSummary: null, surveySummary: null,
    costSummary: computeCostSummary(null, null, null, "unavailable"),
    successMetrics: [{ id: "m", metric: "Registrations", target: 100, actual: 120 }],
  });
  check("one scoreable dimension is still insufficient for a call",
    oneDimension.scoreableDimensionCount === 1 && oneDimension.recommendation === "insufficient_data");

  const unreconciled = computeScorecard({
    budgetSummary: { ...budgetSummary, varianceAtClose: { ...budgetSummary.varianceAtClose, isFinal: false } },
    pipelineSummary: strongPipeline,
    surveySummary: null,
    costSummary: computeCostSummary(budgetSummary, 200, strongPipeline, "auto_single_session"),
    successMetrics: [],
  });
  check("an unreconciled budget is insufficient data, not a penalty",
    unreconciled.dimensions.find((d) => d.id === "budget_discipline")?.verdict === "insufficient_data");
  check("a small-sample NPS does not score",
    computeScorecard({
      budgetSummary, pipelineSummary: strongPipeline,
      surveySummary: computeSurveySummary(survey([10, 10])),
      costSummary: computeCostSummary(budgetSummary, 200, strongPipeline, "auto_single_session"),
      successMetrics: [],
    }).dimensions.find((d) => d.id === "nps")?.verdict === "insufficient_data");
  check("thresholds live in one constant, not scattered",
    SCORECARD_THRESHOLDS.roiRatio.green === 3 && SCORECARD_THRESHOLDS.nps.green === 30);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-13 · success metric matching");
  const matchInputs = {
    pipelineSummary: strongPipeline,
    surveySummary: computeSurveySummary(survey([10, 10, 10, 10, 9])),
    costSummary: computeCostSummary(budgetSummary, 200, strongPipeline, "auto_single_session"),
    scorecard: strong,
  };
  const matches = matchSuccessMetrics(
    [
      { id: "m1", metric: "NPS", target: 40 },
      { id: "m2", metric: "MQLs generated", target: 100 },
      { id: "m3", metric: "Swag budget", target: 5000 },
      { id: "m4", metric: "Cost per Lead", target: 150 },
      { id: "m5", metric: "Pipeline influenced", target: 500000 },
    ],
    matchInputs,
  );
  const byId = (id: string) => matches.find((m) => m.metric.id === id)!;
  check("NPS matches the survey score", byId("m1").matchedField === "NPS" && byId("m1").proposedValue !== null);
  check("an unrelated metric stays unmatched", byId("m3").matchedField === null);
  check('"Cost per Lead" matches the cost, not the lead count',
    byId("m4").matchedField === "Cost per lead", String(byId("m4").matchedField));
  check('"Pipeline influenced" matches pipeline', byId("m5").matchedField === "Sourced + influenced pipeline");
  check("a metric mentioning leads matches the lead count",
    matchSuccessMetrics([{ id: "x", metric: "Leads captured", target: 1 }], matchInputs)[0].matchedField === "Total leads");

  const written = applyMetricWriteBacks(
    { ...conference, successMetrics: [
      { id: "m1", metric: "NPS", target: 40 },
      { id: "m3", metric: "Swag budget", target: 5000 },
    ] },
    [{ metricId: "m1", value: 90 }],
  );
  check("only accepted matches are written", written.successMetrics.find((m) => m.id === "m1")?.actual === 90);
  check("an unmatched metric is left untouched, never zeroed",
    written.successMetrics.find((m) => m.id === "m3")?.actual === undefined);
  check("accepting nothing changes nothing",
    applyMetricWriteBacks(conference, []) === conference);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-9 · year over year");
  const priorReport: RoiReport = {
    id: "prior", eventBriefId: "prior-brief", eventName: "Q4 Summit 2025", status: "final",
    finalizedAt: "2025-12-01T00:00:00.000Z",
    budgetSummary: { ...budgetSummary, totalActual: 200000 },
    pipelineSummary: { ...strongPipeline, sourcedAmount: 500000, influencedAmount: 100000 },
    surveySummary: computeSurveySummary(survey([10, 10, 9, 9, 8])),
    costSummary: computeCostSummary({ totalActual: 200000 } as BudgetActualsSummary, 400, strongPipeline, "manual_entry"),
    yoyComparison: null, scorecard: null, executiveSummaryText: null, successMetricWriteBacks: [],
    createdAt: "", updatedAt: "",
  };
  const draftReport: RoiReport = { ...priorReport, id: "draft", eventBriefId: "draft-brief", status: "draft" };

  const candidates = [
    { brief: { id: "prior-brief", name: "Q4 Summit 2025", type: "conference" as const, dates: { timezone: "UTC", eventStartDate: "2025-11-12", eventEndDate: "2025-11-13" } }, report: priorReport, sameType: true },
    { brief: { id: "draft-brief", name: "Draft event", type: "conference" as const, dates: { timezone: "UTC", eventStartDate: "2026-01-01", eventEndDate: "2026-01-02" } }, report: draftReport, sameType: true },
    { brief: { id: "webinar-brief", name: "A webinar", type: "webinar" as const, dates: { timezone: "UTC", eventStartDate: "2026-06-18", eventEndDate: "2026-06-18" } }, report: { ...priorReport, id: "w", eventBriefId: "webinar-brief" }, sameType: false },
  ];
  const eligible = findEligibleComparators({ id: "current", type: "conference" }, candidates);
  check(`only finalized reports are eligible (${eligible.length})`, eligible.length === 2);
  check("a draft report is excluded", !eligible.some((c) => c.report.status === "draft"));
  check("same-type comparators sort first", eligible[0].sameType === true);
  check("different-type ones are still offered", eligible.some((c) => !c.sameType));
  check("the auto-suggestion is same-type", suggestComparator({ id: "current", type: "conference" }, candidates)?.brief.id === "prior-brief");
  check("no same-type finalized report → no auto-suggestion",
    suggestComparator({ id: "current", type: "trade_show" }, candidates) === null);

  const current: RoiReport = { ...priorReport, id: "current", eventBriefId: conference.id, status: "draft",
    budgetSummary: { ...budgetSummary, totalActual: 250000 },
    pipelineSummary: { ...strongPipeline, sourcedAmount: 600000, influencedAmount: 150000 } };
  const yoy = computeYoyDeltas(current, eligible[0], "auto_suggested");
  check("spend delta computes", yoy.deltas.totalActual.deltaAbsolute === 50000);
  check(`…as a percentage too (${yoy.deltas.totalActual.deltaPct}%)`, yoy.deltas.totalActual.deltaPct === 25);
  check("sourced pipeline delta computes", yoy.deltas.sourcedAmount.deltaAbsolute === 100000);
  check("a missing figure on either side yields null, not a wrong number",
    computeYoyDeltas({ ...current, surveySummary: null }, eligible[0], "auto_suggested").deltas.npsScore.deltaAbsolute === null);
  check("a zero prior baseline yields null percent, not Infinity", (() => {
    const zeroPrior = { ...eligible[0], report: { ...priorReport, budgetSummary: { ...budgetSummary, totalActual: 0 } } };
    return computeYoyDeltas(current, zeroPrior, "auto_suggested").deltas.totalActual.deltaPct === null;
  })());

  /* ---------------------------------------------------------------- */
  console.log("\nFR-11/FR-12 · report rendering");
  const full: RoiReport = { ...current, scorecard: strong, yoyComparison: yoy,
    surveySummary: computeSurveySummary(survey([10, 10, 10, 10, 9])) };
  const exec = renderExecutiveSummary(full);
  const report = renderFullReport(full);
  check("the summary names the recommendation", /Recommendation: Repeat/.test(exec));
  check("…and carries real numbers, not tokens", !/\{\{/.test(exec) && /\$/.test(exec));
  check("…and states every headline figure without a cross-reference",
    /Total spend/.test(exec) && /Pipeline generated/.test(exec) && /Cost per lead/.test(exec));
  check("…and never says 'see the full report'", !/see the full report/i.test(exec));
  check("the full report is materially longer", report.length > exec.length * 1.4);
  check("the full report includes budget detail", /Budget detail/.test(report));
  check("…and the attribution breakdown", /Outside attribution window/.test(report));
  check("rendering is deterministic", renderExecutiveSummary(full) === exec);
  check("a bare report renders without crashing", (() => {
    const empty: RoiReport = { ...full, budgetSummary: null, pipelineSummary: null, surveySummary: null,
      scorecard: null, yoyComparison: null,
      costSummary: computeCostSummary(null, null, null, "unavailable") };
    const text = renderExecutiveSummary(empty);
    return text.includes("not available") && !text.includes("NaN");
  })());

  /* ---------------------------------------------------------------- */
  console.log("\nFR-1/FR-2/FR-3 · persistence and the read-only seams");
  const brief = await saveBrief({ ...conference, id: "roi-brief" });
  const report1 = await saveReport({
    id: "roi-report-1", eventBriefId: brief.id, eventName: brief.name, status: "draft",
    finalizedAt: null, budgetSummary: null, pipelineSummary: null, surveySummary: null,
    costSummary: computeCostSummary(null, null, null, "unavailable"),
    yoyComparison: null, scorecard: null, executiveSummaryText: null, successMetricWriteBacks: [],
    createdAt: "2026-12-01T00:00:00.000Z", updatedAt: "",
  });
  check("a report round-trips by brief id", (await getReportByBriefId("roi-brief"))?.id === report1.id);
  check("attribution settings default lazily on first read", (await getAttributionSettings()).sourcedWindowDays === 30);
  await saveAttributionSettings({ ...(await getAttributionSettings()), sourcedWindowDays: 14 });
  check("…and persist once changed", (await getAttributionSettings()).sourcedWindowDays === 14);

  await savePipelineOpportunitiesBulk("roi-report-1", parsed.rows.map((r) => ({ ...r, roiReportId: "roi-report-1" })));
  check(`pipeline rows persist (${(await listPipelineOpportunities("roi-report-1")).length})`,
    (await listPipelineOpportunities("roi-report-1")).length === 7);
  await savePipelineOpportunitiesBulk("roi-report-1", parsed.rows.slice(0, 3).map((r) => ({ ...r, roiReportId: "roi-report-1" })));
  check("a bulk save deletes rows a merge removed",
    (await listPipelineOpportunities("roi-report-1")).length === 3);

  console.log("\nThe budget seam is a call, not a reimplementation");
  await saveBudgetSettings({ ...budgetFixture.settings, eventBriefId: "roi-brief" });
  await saveLineItems(budgetFixture.lineItems.map((i) => ({ ...i, eventBriefId: "roi-brief" })));
  const viaRepo = await loadBudgetSummary(brief);
  const direct = computeBudgetActualsSummary(
    await getLineItems("roi-brief"), (await getBudgetSettings("roi-brief"))!, brief,
  );
  check("loadBudgetSummary matches PRD 4's own function exactly",
    viaRepo?.totalActual === direct.totalActual && viaRepo?.varianceAmount === direct.varianceAmount);
  check("a brief with no budget returns null, so the UI can say 'not available'",
    (await loadBudgetSummary({ ...conference, id: "no-budget-brief" })) === null);

  console.log("\nUpstream data is never modified");
  const budgetItemsBefore = JSON.stringify(await getLineItems("roi-brief"));
  const briefBefore = JSON.stringify(await getBrief("roi-brief"));
  await saveReport({ ...report1, scorecard: strong, executiveSummaryText: exec });
  check("building a report leaves budget line items untouched",
    JSON.stringify(await getLineItems("roi-brief")) === budgetItemsBefore);
  check("…and the brief untouched until finalize", JSON.stringify(await getBrief("roi-brief")) === briefBefore);

  /* ---------------------------------------------------------------- */
  /* ------------------------------------------------------------------ */
  console.log("\n⭐ The influenced window is bounded on both sides");
  {
    const w = { eventStartDate: "2026-09-24", eventEndDate: "2026-09-24" };
    const settings = { sourcedWindowDays: 30, influencedWindowDays: 90 } as never;
    const at = (d: string) => computeAttribution(d, w, settings);

    check("an opportunity opened during the event is sourced", at("2026-09-24") === "sourced");
    check("…and 20 days after", at("2026-10-14") === "sourced");
    check("60 days after is influenced", at("2026-11-23") === "influenced");
    check("30 days before is influenced — the event may have moved it", at("2026-08-25") === "influenced");
    check(
      "⭐ three years before is NOT influenced",
      at("2023-09-24") === "outside_window",
      "an unbounded window let a webinar claim influence on every deal already in flight",
    );
    check("…nor is 91 days before", at("2026-06-25") === "outside_window");
    check("…and well after still falls outside", at("2027-06-01") === "outside_window");
  }

  if (failures > 0) {
    console.error(`\n${failures} ROI check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll ROI report checks passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
