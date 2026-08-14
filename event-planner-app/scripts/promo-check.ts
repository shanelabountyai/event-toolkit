/**
 * Headless exercise of PRD 2 (Promo Campaign Kit) — the generation, edit-tracking,
 * regeneration and pacing logic, plus its persistence, against an in-memory IndexedDB.
 *
 * The UI is CRUD over these functions; this is where the tool's correctness actually lives.
 *
 * Run with: pnpm promo-check
 */

import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  EXPECTED_ASSET_COUNT,
  createEmptyBrief,
  PLACEHOLDER,
  REGISTRATION_LINK_PLACEHOLDER,
  X_MAX_CHARS,
  assessPacing,
  buildPacingWindow,
  canGenerate,
  computeEmailSendDates,
  editDistancePct,
  findRegistrationMetric,
  generatePromoAssets,
  isAssetSetStale,
  missingFieldsForGeneration,
  parsePacingCsv,
  recommendedInterventions,
  targetPctAtFraction,
  withRecomputedEdit,
  type EventBrief,
  type PacingCurveStyle,
  type PromoAsset,
} from "../packages/schema/src/index";
import {
  addEntry,
  deleteBrief,
  generateAssetSet,
  getAssetSet,
  getConfig,
  importCsv,
  listEntries,
  planRegeneration,
  regenerateAssetSet,
  saveAssetSet,
  saveBrief,
  saveConfig,
  updateAssetBody,
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
const fixture = (name: string): EventBrief =>
  JSON.parse(readFileSync(join(here, "..", "fixtures", name), "utf8")) as EventBrief;

const conference = fixture("conference-brief-example.json");
const webinar = fixture("webinar-brief-example.json");

/** A body must never leak a template token or a JS coercion artefact into planner-facing copy. */
function leaks(body: string): string | null {
  if (body.includes("{{") || body.includes("}}")) return "un-interpolated {{token}}";
  if (/\bundefined\b/.test(body)) return "literal 'undefined'";
  if (/\bNaN\b/.test(body)) return "literal 'NaN'";
  if (body.includes("[object Object]")) return "stringified object";
  return null;
}

function byType(assets: PromoAsset[], type: PromoAsset["type"]): PromoAsset[] {
  return assets.filter((a) => a.type === type);
}

async function main(): Promise<void> {
  /* ---------------------------------------------------------------- */
  console.log("\nFR-1 · generation produces the full 18-asset set");
  const confAssets = generatePromoAssets(conference, "neutral_professional", "2026-09-01");
  check(
    `exactly ${EXPECTED_ASSET_COUNT} assets (${confAssets.length})`,
    confAssets.length === EXPECTED_ASSET_COUNT,
  );
  check(`1 landing page (${byType(confAssets, "landing_page").length})`, byType(confAssets, "landing_page").length === 1);
  check(`5 emails (${byType(confAssets, "email").length})`, byType(confAssets, "email").length === 5);
  check(`9 social (${byType(confAssets, "social").length})`, byType(confAssets, "social").length === 9);
  check(`3 sales snippets (${byType(confAssets, "sales_outreach").length})`, byType(confAssets, "sales_outreach").length === 3);
  check(
    "social covers 3 channels × 3 subtypes",
    new Set(byType(confAssets, "social").map((a) => `${a.channel}|${a.subtype}`)).size === 9,
  );
  check("every asset id is unique", new Set(confAssets.map((a) => a.id)).size === confAssets.length);

  console.log("\nFR-1 · no un-interpolated tokens, in a full brief or a sparse one");
  const sparse: EventBrief = {
    ...webinar,
    goals: { primaryObjective: "Fill the top of the funnel" },
    audience: { description: "Marketing ops practitioners" },
    format: { deliveryMode: "in_person" }, // no venueOrPlatform at all
    dates: { ...webinar.dates, eventEndDate: webinar.dates.eventStartDate },
  };
  for (const [label, brief] of [["conference", conference], ["webinar", webinar], ["sparse", sparse]] as const) {
    const assets = generatePromoAssets(brief, "neutral_professional", "2026-01-01");
    const bad = assets.map((a) => ({ a, leak: leaks(a.generatedBody) })).filter((r) => r.leak);
    check(`${label} brief: 0 leaked tokens`, bad.length === 0, bad.map((b) => `${b.a.label}: ${b.leak}`).join("; "));
  }
  const sparseAssets = generatePromoAssets(sparse, "neutral_professional", "2026-01-01");
  check(
    "a missing venue degrades to the documented placeholder",
    sparseAssets.some((a) => a.generatedBody.includes(PLACEHOLDER)),
  );

  console.log("\nFR-1 · copy branches on delivery mode, not just interpolates");
  const virtualBody = byType(generatePromoAssets(webinar, "neutral_professional", "2026-01-01"), "landing_page")[0].generatedBody;
  const inPersonBody = byType(confAssets, "landing_page")[0].generatedBody;
  check("virtual copy talks about a join link", /join link/i.test(virtualBody));
  check("virtual copy does not claim a physical venue", !/^.*In person at/m.test(virtualBody));
  check("in-person copy names the venue", inPersonBody.includes("Moscone West"));
  check("in-person copy does not offer a join link", !/join link/i.test(inPersonBody));

  const hybrid: EventBrief = { ...conference, format: { ...conference.format, deliveryMode: "hybrid" } };
  const hybridBody = byType(generatePromoAssets(hybrid, "neutral_professional", "2026-01-01"), "landing_page")[0].generatedBody;
  check("hybrid copy mentions both venue and stream", hybridBody.includes("Moscone West") && /join link/i.test(hybridBody));

  console.log("\nFR-1 · event type changes the wording");
  check("conference copy says 'conference'", confAssets.some((a) => /conference/i.test(a.generatedBody)));
  check(
    "webinar copy says 'webinar' and uses its own CTA",
    generatePromoAssets(webinar, "neutral_professional", "2026-01-01").some(
      (a) => /webinar/i.test(a.generatedBody) && /save your seat/i.test(a.generatedBody),
    ),
  );

  console.log("\nFR-1 · X posts respect the character ceiling");
  const longNamed: EventBrief = { ...conference, name: "The Extremely Long Annual Customer Success and Revenue Operations Summit for Enterprise Practitioners 2026" };
  for (const [label, brief] of [["normal", conference], ["long name", longNamed]] as const) {
    const xPosts = generatePromoAssets(brief, "neutral_professional", "2026-01-01").filter((a) => a.channel === "x");
    const over = xPosts.filter((p) => p.currentBody.length > X_MAX_CHARS);
    check(`${label}: all 3 X posts ≤ ${X_MAX_CHARS} chars`, over.length === 0, over.map((p) => `${p.label}=${p.currentBody.length}`).join(", "));
  }
  check(
    "LinkedIn posts are longer-form than X, not the same text",
    (() => {
      const social = byType(confAssets, "social");
      const li = social.find((a) => a.channel === "linkedin" && a.subtype === "announcement")!;
      const x = social.find((a) => a.channel === "x" && a.subtype === "announcement")!;
      return li.generatedBody !== x.generatedBody && li.generatedBody.length > x.generatedBody.length;
    })(),
  );

  console.log("\nFR-2 · required-field guard");
  check("a complete brief can generate", canGenerate(conference));
  const noDate: EventBrief = { ...conference, dates: { ...conference.dates, eventStartDate: "" } };
  check("a brief with no start date is blocked", !canGenerate(noDate));
  check(
    "the block names the specific missing field",
    missingFieldsForGeneration(noDate).some((f) => f.path === "dates.eventStartDate"),
  );
  check("fixing the field unblocks generation", canGenerate({ ...noDate, dates: conference.dates }));

  console.log("\nFR-3 · email send dates, including past-offset compression");
  const roomy = computeEmailSendDates("2026-11-12", "2026-01-01"); // ~315 days of runway
  check("full runway uses the exact offsets", roomy[0] === "2026-10-01" && roomy[4] === "2026-11-12", roomy.join(", "));
  const tight = computeEmailSendDates("2026-11-12", "2026-11-02"); // only 10 days left
  check("compressed: no send date lands in the past", tight.every((d) => d >= "2026-11-02"), tight.join(", "));
  check("compressed: dates stay in chronological order", tight.every((d, i) => i === 0 || d >= tight[i - 1]), tight.join(", "));
  check("compressed: still 5 distinct-ish sends ending on the event date", tight.length === 5 && tight[4] === "2026-11-12");
  const past = computeEmailSendDates("2026-11-12", "2026-12-01"); // event already over
  check("an event in the past degrades without throwing", past.length === 5 && past.every((d) => d === "2026-11-12"));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-4 · edit distance is a live comparison, never a sticky flag");
  check("identical bodies are 0%", editDistancePct("hello world", "hello world") === 0);
  check("a total rewrite is 100%", editDistancePct("aaaa", "bbbb") === 100);
  check("a small tweak is small", (() => { const p = editDistancePct("hello world", "hello world!"); return p > 0 && p < 20; })());

  const original = confAssets[0];
  const edited = withRecomputedEdit({ ...original, currentBody: `${original.generatedBody}\n\nExtra line.` }, "2026-01-02T00:00:00.000Z");
  check("editing sets isEdited", edited.isEdited && edited.editDistancePct > 0);
  const revertedByHand = withRecomputedEdit({ ...edited, currentBody: original.generatedBody });
  check("editing back to the exact original clears isEdited", !revertedByHand.isEdited && revertedByHand.editDistancePct === 0);
  check("reverting also clears lastEditedAt", revertedByHand.lastEditedAt === undefined);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-5 · staleness + regenerate skip/override");
  const set = generateAssetSet(conference, "2026-09-01");
  check("a fresh set is not stale", !isAssetSetStale(set, conference));
  const bumped: EventBrief = { ...conference, version: conference.version + 1, name: "Q4 Customer Summit 2026 (renamed)" };
  check("a brief edit makes it stale", isAssetSetStale(set, bumped));

  // Edit one asset, leave another untouched.
  const emailAsset = set.assets.find((a) => a.subtype === "reminder_1")!;
  const untouched = set.assets.find((a) => a.subtype === "invite")!;
  const editedSet = {
    ...set,
    assets: set.assets.map((a) =>
      a.id === emailAsset.id ? withRecomputedEdit({ ...a, currentBody: "My own hand-written reminder." }, "2026-09-02T00:00:00.000Z") : a,
    ),
  };

  const plan = planRegeneration(bumped, editedSet, [], "2026-09-03");
  check("plan marks the edited asset as skipped", plan.find((r) => r.assetId === emailAsset.id)?.outcome === "skip_edited");
  check("plan marks untouched assets as updating", plan.find((r) => r.assetId === untouched.id)?.outcome === "update");
  check(
    "plan detects the renamed event actually changes copy",
    plan.some((r) => r.bodyChanged),
  );

  const regen = regenerateAssetSet(bumped, editedSet, [], "2026-09-03");
  const regenEdited = regen.assets.find((a) => a.id === emailAsset.id)!;
  const regenUntouched = regen.assets.find((a) => a.id === untouched.id)!;
  check("edited asset keeps the planner's copy", regenEdited.currentBody === "My own hand-written reminder.");
  check("untouched asset picks up the new brief data", regenUntouched.currentBody.includes("(renamed)"));
  check("asset ids survive regeneration (deep links hold)", regen.assets.length === EXPECTED_ASSET_COUNT && regen.assets.some((a) => a.id === untouched.id));
  check("sourceBriefVersion advances, clearing staleness", !isAssetSetStale(regen, bumped));

  const overridden = regenerateAssetSet(bumped, editedSet, [emailAsset.id], "2026-09-03");
  const overriddenAsset = overridden.assets.find((a) => a.id === emailAsset.id)!;
  check("'regenerate anyway' discards the edit", overriddenAsset.currentBody !== "My own hand-written reminder." && !overriddenAsset.isEdited);
  check("override plan row says override", planRegeneration(bumped, editedSet, [emailAsset.id], "2026-09-03").find((r) => r.assetId === emailAsset.id)?.outcome === "override");

  /* ---------------------------------------------------------------- */
  console.log("\nFR-6 · pacing target curve");
  check("backloaded starts at 5%", targetPctAtFraction(0, "backloaded_standard") === 5);
  check("backloaded ends at 100%", targetPctAtFraction(1, "backloaded_standard") === 100);
  check("backloaded hits its 0.6 checkpoint", targetPctAtFraction(0.6, "backloaded_standard") === 50);
  check("backloaded interpolates between checkpoints", (() => { const v = targetPctAtFraction(0.5, "backloaded_standard"); return v > 30 && v < 50; })());
  check("linear is a straight line", targetPctAtFraction(0.5, "linear") === 50 && targetPctAtFraction(0.25, "linear") === 25);
  check("fractions clamp outside 0-1", targetPctAtFraction(-1, "linear") === 0 && targetPctAtFraction(2, "linear") === 100);
  check("backloaded is genuinely behind linear early on", targetPctAtFraction(0.3, "backloaded_standard") < targetPctAtFraction(0.3, "linear"));

  console.log("\nFR-6 · registration metric detection");
  check("finds the registration goal on the conference brief", findRegistrationMetric(conference)?.target === 500);
  check("matches case-insensitively", findRegistrationMetric({ ...conference, successMetrics: [{ id: "x", metric: "REGISTRATIONS", target: 10 }] })?.target === 10);
  check("ignores a zero target", findRegistrationMetric({ ...conference, successMetrics: [{ id: "x", metric: "Registrations", target: 0 }] }) === null);
  check("blocked when there is no registration metric", findRegistrationMetric({ ...conference, successMetrics: [] }) === null);

  console.log("\nFR-7 · pacing status at representative points, both curve styles");
  // 100-day window, goal 500. Halfway (day 50) backloaded expects 40% = 200.
  const window = buildPacingWindow("2026-08-04", "2026-11-12");
  check(`window is 100 days (${window.totalDays})`, window.totalDays === 100);
  const at = (n: number, style: PacingCurveStyle) =>
    assessPacing(
      [{ id: "e", eventBriefId: "b", date: "2026-09-23", cumulativeRegistrations: n, source: "manual", enteredAt: "" }],
      window,
      style,
      500,
      "2026-09-23",
    );
  check(`backloaded target at the halfway point is 200 (${at(200, "backloaded_standard").target})`, at(200, "backloaded_standard").target === 200);
  check("on target → On Pace", at(200, "backloaded_standard").status === "on_pace");
  check("5% short → On Pace (within 10%)", at(190, "backloaded_standard").status === "on_pace");
  check("20% short → Behind Pace", at(160, "backloaded_standard").status === "behind_pace");
  check("50% short → Critical", at(100, "backloaded_standard").status === "critical");
  check("ahead of target → On Pace", at(400, "backloaded_standard").status === "on_pace");
  check("linear expects more by the same date, so the same number reads worse", at(200, "linear").status !== "on_pace" && at(200, "linear").target === 250);
  check("no entries at all does not crash", assessPacing([], window, "backloaded_standard", 500, "2026-09-23").actual === 0);
  check("days remaining counts down to the event", at(200, "backloaded_standard").daysRemaining === 50);

  console.log("\nFR-8 · interventions only when behind");
  check("On Pace shows none", recommendedInterventions(at(200, "backloaded_standard")).length === 0);
  check("Behind Pace shows some", recommendedInterventions(at(160, "backloaded_standard")).length > 0);
  check("Critical adds the escalation tactic", recommendedInterventions(at(100, "backloaded_standard")).some((i) => i.id === "revisit-target"));
  check("interventions point at real asset subtypes", (() => {
    const subtypes = new Set(confAssets.map((a) => a.subtype).filter(Boolean));
    return recommendedInterventions(at(100, "backloaded_standard"))
      .filter((i) => i.assetSubtype)
      .every((i) => subtypes.has(i.assetSubtype));
  })());
  check("with a week left the tactic is the last-chance send", (() => {
    const late = assessPacing(
      [{ id: "e", eventBriefId: "b", date: "2026-11-08", cumulativeRegistrations: 100, source: "manual", enteredAt: "" }],
      window, "backloaded_standard", 500, "2026-11-08",
    );
    return recommendedInterventions(late)[0]?.assetSubtype === "last_chance";
  })());

  /* ---------------------------------------------------------------- */
  console.log("\nFR-9 · CSV import reports bad rows and keeps the good ones");
  const goodCsv = "date,count\n2026-08-10,25\n2026-08-17,60\n2026-08-24,120\n";
  check("a clean file imports every row", parsePacingCsv(goodCsv).rows.length === 3 && parsePacingCsv(goodCsv).errors.length === 0);

  const messyCsv = [
    "date,count",
    "2026-08-10,25",
    "10/08/2026,40",      // wrong date format
    "2026-08-17,sixty",   // non-numeric
    "2026-13-01,10",      // impossible month
    "2026-08-24",         // missing column
    "2026-08-31,-5",      // negative
    "2026-08-10,99",      // duplicate date
    "2026-09-07,200",
  ].join("\n");
  const messy = parsePacingCsv(messyCsv);
  check(`keeps the 2 valid rows (${messy.rows.length})`, messy.rows.length === 2);
  check(`reports 6 bad rows (${messy.errors.length})`, messy.errors.length === 6);
  check("row numbers match the file's line numbers", messy.errors[0].row === 3, JSON.stringify(messy.errors[0]));
  check("rejects an impossible calendar date", messy.errors.some((e) => e.row === 5));
  check("flags the duplicate date", messy.errors.some((e) => /duplicate/i.test(e.reason)));
  check("a file with no header still imports", parsePacingCsv("2026-08-10,25\n").rows.length === 1);
  check("an empty file yields nothing and throws nothing", parsePacingCsv("").rows.length === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-10 · persistence round-trip and per-brief isolation");
  const briefA = await saveBrief({ ...conference, id: "brief-a", version: 1 });
  const briefB = await saveBrief({ ...webinar, id: "brief-b", version: 1 });

  await saveAssetSet(generateAssetSet(briefA, "2026-09-01"));
  await saveAssetSet(generateAssetSet(briefB, "2026-09-01"));
  const loadedA = await getAssetSet("brief-a");
  const loadedB = await getAssetSet("brief-b");
  check("set A round-trips with all 18 assets", loadedA?.assets.length === EXPECTED_ASSET_COUNT);
  check("set B is a different set, not A's", loadedB!.assets[0].generatedBody !== loadedA!.assets[0].generatedBody);
  check("each set carries its own brief id", loadedA?.eventBriefId === "brief-a" && loadedB?.eventBriefId === "brief-b");

  const targetAsset = loadedA!.assets[3];
  await updateAssetBody("brief-a", targetAsset.id, "Rewritten by the planner.");
  const afterEdit = await getAssetSet("brief-a");
  const persistedAsset = afterEdit!.assets.find((a) => a.id === targetAsset.id)!;
  check("an edit persists across a reload", persistedAsset.currentBody === "Rewritten by the planner.");
  check("its edit distance persisted too", persistedAsset.isEdited && persistedAsset.editDistancePct > 0);
  check("B's assets were untouched by A's edit", (await getAssetSet("brief-b"))!.assets.every((a) => !a.isEdited));

  await addEntry({ eventBriefId: "brief-a", date: "2026-08-10", cumulativeRegistrations: 25 });
  await addEntry({ eventBriefId: "brief-a", date: "2026-08-17", cumulativeRegistrations: 60 });
  await addEntry({ eventBriefId: "brief-b", date: "2026-08-17", cumulativeRegistrations: 5 });
  check("entries are scoped per brief", (await listEntries("brief-a")).length === 2 && (await listEntries("brief-b")).length === 1);
  await addEntry({ eventBriefId: "brief-a", date: "2026-08-17", cumulativeRegistrations: 65 });
  const corrected = await listEntries("brief-a");
  check("re-entering a date corrects it instead of duplicating", corrected.length === 2 && corrected[1].cumulativeRegistrations === 65);
  check("entries come back oldest-first", corrected[0].date < corrected[1].date);

  const imported = await importCsv("brief-a", messyCsv);
  check(`CSV import lands the valid rows (${imported.imported.length})`, imported.imported.length === 2);
  check("…and still reports the bad ones", imported.errors.length === 6);

  check("config defaults to the backloaded curve", (await getConfig("brief-a")).curveStyle === "backloaded_standard");
  await saveConfig({ eventBriefId: "brief-a", curveStyle: "linear" });
  check("a changed curve style persists", (await getConfig("brief-a")).curveStyle === "linear");
  check("B keeps its own default", (await getConfig("brief-b")).curveStyle === "backloaded_standard");

  console.log("\nHousekeeping · deleting a brief clears its promo and pacing data");
  await deleteBrief("brief-a");
  check("asset set gone", (await getAssetSet("brief-a")) === null);
  check("pacing entries gone", (await listEntries("brief-a")).length === 0);
  check("pacing config reset to default", (await getConfig("brief-a")).curveStyle === "backloaded_standard");
  check("brief B survived", (await getAssetSet("brief-b")) !== null && (await listEntries("brief-b")).length === 1);

  /* ---------------------------------------------------------------- */
  /* ------------------------------------------------------------------ */
  console.log("\n⭐ Internal fields never reach customer-facing copy");
  {
    // The exact brief shape from a full event run, where all 18 generated assets were unsendable.
    const exhibiting = {
      ...createEmptyBrief("trade_show"),
      name: "Northgate Manufacturing Summit 2026",
      goals: {
        primaryObjective: "capture 60 qualified leads and influence $900K of pipeline",
        objectives: [
          "Book 15 on-site meetings with named target accounts",
          "Drive 120 attendees to the sponsored happy hour",
        ],
      },
      audience: {
        description: "operations and plant leaders at mid-market manufacturers",
        targetPersonas: [
          { id: "p1", name: "Booth visitor — evaluating vendors", title: "Plant operations director" },
        ],
      },
      dates: { eventStartDate: "2026-05-12", eventEndDate: "2026-05-13", timezone: "America/Los_Angeles" },
    } as unknown as EventBrief;

    const assets = generatePromoAssets(exhibiting, "assertive");
    const everything = assets.map((a) => `${a.generatedBody} ${a.label}`).join("\n").toLowerCase();

    check(
      "⭐ the internal revenue target never appears in generated copy",
      !everything.includes("900k") && !everything.includes("60 qualified leads"),
      "a generated email once opened \"I thought of you because capture 60 qualified leads…\"",
    );
    check(
      "⭐ internal secondary objectives are not sold as attendee benefits",
      !everything.includes("book 15 on-site meetings") && !everything.includes("sponsored happy hour"),
    );
    check(
      "⭐ internal persona labels are never printed to the reader",
      !everything.includes("booth visitor — evaluating vendors") && !everything.includes("evaluating vendors"),
    );
    check(
      "a missing attendee promise shows a placeholder, not a substituted objective",
      everything.includes("worth their time"),
      "an empty promise is a prompt to write one; a revenue target reads as finished copy",
    );

    console.log("\n⭐ An exhibitor does not speak as the host");
    check(
      "does not claim to be running somebody else's conference",
      !everything.includes("we're running"),
    );
    check("…and says it will be there instead", everything.includes("we'll be at"));
    check(
      "does not claim control of capacity or registration",
      !everything.includes("close to capacity") && !everything.includes("hold you a place"),
    );

    // A brief we genuinely host must keep the host voice.
    const hosting = {
      ...createEmptyBrief("conference"),
      name: "Our Own Summit",
      audience: { description: "customers", attendeeValue: { promise: "see what shipped this year" } },
      dates: { eventStartDate: "2026-05-12", timezone: "UTC" },
    } as unknown as EventBrief;
    const hostKit = generatePromoAssets(hosting, "assertive").map((a) => a.generatedBody).join("\n").toLowerCase();
    check(
      "…while a hosted event still speaks as the host",
      hostKit.includes("we're running"),
      "the fix must not flatten both voices into one",
    );
    check("and uses the planner's attendee promise", hostKit.includes("see what shipped this year"));
  }

  /* ------------------------------------------------------------------ */
  console.log("\n⭐ What the planner types is what gets generated");
  {
    // The gap this closes: the schema and templates supported attendee value for a while before
    // intake collected it, so every brief generated placeholders and nobody could fix it.
    const filled = {
      ...createEmptyBrief("trade_show"),
      name: "Northgate Manufacturing Summit 2026",
      goals: { primaryObjective: "capture 60 qualified leads", objectives: ["Book 15 meetings"] },
      audience: {
        description: "operations and plant leaders at mid-market manufacturers",
        attendeeValue: {
          promise: "see what three plants did to cut changeover time by half",
          takeaways: ["A benchmark against your peers", "A teardown of a 14-month payback retrofit"],
        },
      },
      dates: { eventStartDate: "2026-05-12", timezone: "America/Los_Angeles" },
    } as unknown as EventBrief;

    const copy = generatePromoAssets(filled, "assertive").map((a) => a.generatedBody).join("\n").toLowerCase();

    check("the attendee promise reaches the copy", copy.includes("cut changeover time by half"));
    check("…and so do the takeaways", copy.includes("benchmark against your peers"));
    check("the placeholder is gone once it is filled in", !copy.includes("worth their time"));
    check(
      "…and the internal objective still never appears",
      !copy.includes("60 qualified leads") && !copy.includes("book 15 meetings"),
    );

    // Role is a planner decision, so the override has to win over the type default.
    const sponsoring = {
      ...filled,
      format: { ...(filled.format ?? {}), participationRole: "host" },
    } as unknown as EventBrief;
    const hostCopy = generatePromoAssets(sponsoring, "assertive").map((a) => a.generatedBody).join("\n").toLowerCase();
    check(
      "⭐ a planner overriding the role to host gets host voice on a trade show",
      hostCopy.includes("we're running"),
      "the type default is a starting point, not a decision the planner cannot change",
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} promo check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll promo campaign kit checks passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
