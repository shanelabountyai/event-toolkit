/**
 * Headless exercise of the calibration read-out.
 *
 * The whole point of that page is that it does not overclaim: it must say "not enough data"
 * far more often than it says anything else, and it must never present the attribution window
 * as validated. Those are the properties tested here, alongside the arithmetic.
 *
 * Run with: pnpm calibration-check
 */

import {
  attributionSensitivity,
  calibrateAttributionWindow,
  calibrateDedupeThreshold,
  calibrateLeadTiers,
  calibrateRetroTiming,
  calibrateRubricRules,
  calibrateVarianceThresholds,
  runCalibration,
  summarise,
  type CalibrationInputs,
} from "../apps/web/lib/calibration";
import type { BudgetLineItem, EventBrief } from "../packages/schema/src/index";
import type { DuplicateCandidate, LeadRecord } from "../packages/lead-triage-core/src/index";
import type { PipelineOpportunity } from "../packages/roi-report-core/src/index";
import type { RetroDocument } from "../packages/postmortem-core/src/index";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const EMPTY: CalibrationInputs = {
  briefs: [], leads: [], rubrics: [], duplicateCandidates: [], budgetLineItems: [],
  budgetSettings: [], reports: [], attributionSamples: [], surveySummaries: [], retros: [],
};

function candidates(merged: number, rejected: number): DuplicateCandidate[] {
  return [
    ...Array.from({ length: merged }, (_, i) => ({ id: `m${i}`, triageSessionId: "s", leadAId: "a", leadBId: "b", similarity: 0.9, reason: "", status: "merged" as const })),
    ...Array.from({ length: rejected }, (_, i) => ({ id: `r${i}`, triageSessionId: "s", leadAId: "a", leadBId: "b", similarity: 0.9, reason: "", status: "rejected" as const })),
  ];
}

function lead(score: number, tier: LeadRecord["tier"], ruleId = "rule-a"): LeadRecord {
  return {
    id: Math.random().toString(36).slice(2), triageSessionId: "s", dedupeKey: "k",
    contact: {}, signals: { sessionsAttended: [], sessionsAttendedCount: 0, boothInteractions: 0, demoRequested: false },
    score, scoreBreakdown: [{ ruleId, label: "Rule A", points: score }], tier,
    ownerId: null, ownerName: null, assignmentMethod: null, status: "new",
    followUpDraft: null, sourceRows: [], createdAt: "", updatedAt: "",
  };
}

function lineItem(budgeted: number, actual: number): BudgetLineItem {
  return {
    id: Math.random().toString(36).slice(2), eventBriefId: "b", category: "venue",
    lineItemName: "x", budgetedAmount: budgeted, committedAmount: 0, actualAmount: actual,
    varianceThresholdPct: null, status: "paid", source: "manual", createdAt: "", updatedAt: "",
  };
}

function opportunity(createdDate: string, amount: number): PipelineOpportunity {
  return {
    id: Math.random().toString(36).slice(2), roiReportId: "r", recordId: "R", recordType: "opportunity",
    createdDate, amount, computedAttributionType: "sourced", effectiveAttributionType: "sourced",
    leadMatchStatus: "not_checked", source: "csv_import", sourceImportBatchId: "b",
    createdAt: "", updatedAt: "",
  };
}

function main(): void {
  console.log("\nA fresh install says so, and says nothing else");
  const empty = runCalibration(EMPTY);
  check(`every finding reports no_data (${empty.filter((f) => f.status === "no_data").length}/${empty.length})`,
    empty.every((f) => f.status === "no_data"));
  check("…and none of them offers a suggestion", empty.every((f) => f.suggestion === null));
  check("…and none of them claims support", !empty.some((f) => f.status === "supports"));
  check("the summary counts them as waiting", summarise(empty).waitingCount === empty.length);
  check("every finding names the assumption it is testing",
    empty.every((f) => f.assumption.length > 20));
  check("…and states the sample it would need", empty.every((f) => f.minSample > 0));

  console.log("\nSample gating — a little data is still not enough");
  check("3 reviewed pairs is too early",
    calibrateDedupeThreshold({ ...EMPTY, duplicateCandidates: candidates(2, 1) }).status === "too_early");
  check("5 scored leads is too early",
    calibrateLeadTiers({ ...EMPTY, leads: Array.from({ length: 5 }, () => lead(80, "hot")) }).status === "too_early");
  check("…and it says how many more are needed", (() => {
    const f = calibrateLeadTiers({ ...EMPTY, leads: Array.from({ length: 5 }, () => lead(80, "hot")) });
    return f.evidence.includes("5") && f.minSample === 25;
  })());

  console.log("\nDedupe threshold");
  const mostlyRejected = calibrateDedupeThreshold({ ...EMPTY, duplicateCandidates: candidates(2, 18) });
  check("a high rejection rate questions the threshold", mostlyRejected.status === "questions");
  check("…and reports the actual rate", mostlyRejected.evidence.includes("90%"));
  check("…and warns that missed duplicates leave no trace",
    /no trace/.test(mostlyRejected.suggestion ?? ""));
  check("a healthy rate supports it",
    calibrateDedupeThreshold({ ...EMPTY, duplicateCandidates: candidates(15, 5) }).status === "supports");

  console.log("\nLead tiers");
  const barelyAnyHot = calibrateLeadTiers({
    ...EMPTY,
    leads: [...Array.from({ length: 1 }, () => lead(80, "hot")), ...Array.from({ length: 49 }, () => lead(10, "cold"))],
  });
  check("2% hot questions the threshold", barelyAnyHot.status === "questions");
  check("…and says the shortlist is empty", /shortlist/.test(barelyAnyHot.suggestion ?? ""));

  const mostlyHot = calibrateLeadTiers({
    ...EMPTY,
    leads: [...Array.from({ length: 40 }, () => lead(80, "hot")), ...Array.from({ length: 10 }, () => lead(10, "cold"))],
  });
  check("80% hot also questions it", mostlyHot.status === "questions");
  check("…for the opposite reason", /meaningless/.test(mostlyHot.suggestion ?? ""));

  const balanced = calibrateLeadTiers({
    ...EMPTY,
    leads: [...Array.from({ length: 8 }, () => lead(80, "hot")),
           ...Array.from({ length: 14 }, () => lead(50, "warm")),
           ...Array.from({ length: 18 }, () => lead(10, "cold"))],
  });
  check("a workable split supports it", balanced.status === "supports", balanced.evidence);

  console.log("\nRubric rules that never fire");
  const rubric = {
    id: "rub", triageSessionId: "s", updatedAt: "", tierThresholds: { hot: 70, warm: 40 },
    rules: [
      { id: "rule-a", signal: "demoRequested" as const, label: "Demo requested", flatPoints: 40, enabled: true },
      { id: "rule-dead", signal: "personaTitleMatch" as const, label: "Persona title match", flatPoints: 15, enabled: true },
    ],
  };
  const deadRule = calibrateRubricRules({
    ...EMPTY, rubrics: [rubric],
    leads: Array.from({ length: 30 }, () => lead(40, "warm", "rule-a")),
  });
  check("a rule that never scores is flagged", deadRule.status === "questions");
  check("…by name", deadRule.evidence.includes("Persona title match"));
  check("…and points at the mapping, not the weights", /column mapping/.test(deadRule.suggestion ?? ""));
  check("all rules firing supports the rubric", (() => {
    const leads = [
      ...Array.from({ length: 15 }, () => lead(40, "warm", "rule-a")),
      ...Array.from({ length: 15 }, () => lead(15, "cold", "rule-dead")),
    ];
    return calibrateRubricRules({ ...EMPTY, rubrics: [rubric], leads }).status === "supports";
  })());

  console.log("\nBudget variance thresholds");
  const settings = [{ eventBriefId: "b", currency: "USD", defaultVarianceThresholdPct: 10,
    lastSeenBriefVersion: 1, lastSeenScopeSnapshot: { eventStartDate: "", eventEndDate: "", deliveryMode: "in_person" as const },
    reforecastHistory: [], reconciledAt: null }];

  const noisy = calibrateVarianceThresholds({
    ...EMPTY, budgetSettings: settings,
    budgetLineItems: Array.from({ length: 25 }, () => lineItem(100, 150)),
  });
  check("everything flagging questions the threshold", noisy.status === "questions");
  check("…and says the flag stops being read", /stops meaning anything/.test(noisy.suggestion ?? ""));

  const silent = calibrateVarianceThresholds({
    ...EMPTY, budgetSettings: settings,
    budgetLineItems: Array.from({ length: 25 }, () => lineItem(100, 100)),
  });
  check("nothing ever flagging also questions it", silent.status === "questions");
  check("…and suggests checking by hand rather than trusting silence",
    /by hand/.test(silent.suggestion ?? ""));

  const useful = calibrateVarianceThresholds({
    ...EMPTY, budgetSettings: settings,
    budgetLineItems: [...Array.from({ length: 5 }, () => lineItem(100, 150)),
                      ...Array.from({ length: 20 }, () => lineItem(100, 102))],
  });
  check("a minority flagging supports it", useful.status === "supports", useful.evidence);

  console.log("\nAttribution — characterised, never validated");
  const samples = [
    ...Array.from({ length: 10 }, () => ({ opportunity: opportunity("2026-11-20", 10000), eventEndDate: "2026-11-13" })),
    ...Array.from({ length: 10 }, () => ({ opportunity: opportunity("2026-12-20", 10000), eventEndDate: "2026-11-13" })),
  ];
  const attribution = calibrateAttributionWindow({ ...EMPTY, attributionSamples: samples });
  check("with enough data it still never reports 'supports'", attribution.status === "questions");
  check("…and says causation is not settleable", /caused|causation/i.test(attribution.suggestion ?? ""));
  check("with no data it reports no_data, not a false conclusion",
    calibrateAttributionWindow(EMPTY).status === "no_data");

  const rows = attributionSensitivity({ ...EMPTY, attributionSamples: samples });
  check("a wider window never captures fewer opportunities", (() => {
    for (let i = 1; i < rows.length; i += 1) {
      if (rows[i].sourcedCount < rows[i - 1].sourcedCount) return false;
    }
    return true;
  })());
  // The near cluster sits exactly 7 days out, so a 7-day window includes it — the bound is
  // inclusive, matching computeAttribution's own rule. The far cluster is 37 days out.
  check("the window bound is inclusive, so the 7-day cluster counts at 7 days",
    rows.find((r) => r.sourcedWindowDays === 7)!.sourcedCount === 10);
  check("…and the 37-day cluster does not",
    rows.find((r) => r.sourcedWindowDays === 14)!.sourcedCount === 10);
  check("the 30-day window captures only the near ones",
    rows.find((r) => r.sourcedWindowDays === 30)!.sourcedCount === 10);
  check("the 60-day window captures both clusters",
    rows.find((r) => r.sourcedWindowDays === 60)!.sourcedCount === 20);
  check("amounts track the counts",
    rows.find((r) => r.sourcedWindowDays === 60)!.sourcedAmount === 200000);

  console.log("\nRetro timing");
  const brief = (id: string, endDate: string) => ({ id, dates: { eventEndDate: endDate } }) as EventBrief;
  const retro = (id: string, briefId: string, completedAt: string) =>
    ({ id, eventBriefId: briefId, status: "completed", completedAt } as RetroDocument);

  const late = calibrateRetroTiming({
    ...EMPTY,
    briefs: [brief("b1", "2026-01-10"), brief("b2", "2026-02-10"), brief("b3", "2026-03-10")],
    retros: [retro("r1", "b1", "2026-02-10"), retro("r2", "b2", "2026-03-15"), retro("r3", "b3", "2026-04-12")],
  });
  check("retros landing after escalation question the timing", late.status === "questions");
  check("…and report a median", /Median \d+ days/.test(late.evidence));

  const prompt = calibrateRetroTiming({
    ...EMPTY,
    briefs: [brief("b1", "2026-01-10"), brief("b2", "2026-02-10"), brief("b3", "2026-03-10")],
    retros: [retro("r1", "b1", "2026-01-14"), retro("r2", "b2", "2026-02-15"), retro("r3", "b3", "2026-03-13")],
  });
  check("prompt retros support the timing", prompt.status === "supports", prompt.evidence);

  console.log("\nEvery finding is legible");
  const populated = runCalibration({
    ...EMPTY,
    duplicateCandidates: candidates(15, 5),
    leads: Array.from({ length: 30 }, () => lead(50, "warm")),
    rubrics: [rubric],
    budgetSettings: settings,
    budgetLineItems: Array.from({ length: 25 }, () => lineItem(100, 102)),
    attributionSamples: samples,
  });
  check("no finding is left without evidence text", populated.every((f) => f.evidence.length > 10));
  check("a 'questions' finding always says what to consider",
    populated.filter((f) => f.status === "questions").every((f) => (f.suggestion ?? "").length > 20));
  check("nothing reports a sample it does not have",
    populated.every((f) => f.sampleSize >= 0 && Number.isFinite(f.sampleSize)));

  /* ------------------------------------------------------------------ */
  console.log("\n⭐ A completed retro is never reported as missing");
  {
    // A retro completed before its event — a future-dated event, or a dry run. The lag is
    // negative and rightly excluded from the median, but the retro exists.
    const brief = {
      id: "b-future",
      dates: { eventStartDate: "2026-09-24", eventEndDate: "2026-09-24", timezone: "UTC" },
    } as never;
    const retro = { id: "r1", eventBriefId: "b-future", status: "completed",
      completedAt: "2026-08-14T11:00:00.000Z" } as never;

    const f = calibrateRetroTiming({ briefs: [brief], retros: [retro] } as never);
    check(
      "⭐ it does not claim no retros have been completed",
      !f.evidence.includes("No retros have been completed yet"),
      "a planner who just finished one reads that and thinks the tool lost their work",
    );
    check("…and says why it carries no timing signal", f.evidence.includes("before the event ended"));
    check("…while still refusing to conclude", f.status === "no_data", f.status);

    const none = calibrateRetroTiming({ briefs: [], retros: [] } as never);
    check("with genuinely no retros it still says so", none.evidence.includes("No retros have been completed yet"));
  }

  if (failures > 0) {
    console.error(`\n${failures} calibration check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll calibration checks passed.\n");
}

main();
