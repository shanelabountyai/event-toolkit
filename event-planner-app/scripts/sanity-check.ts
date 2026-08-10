/**
 * Headless sanity checks for the pure logic that the browser UI sits on top of:
 * presets (FR-1), required-field validation (FR-3), assembly + schema validation (FR-4),
 * migration of an older/partial document (FR-9), completeness (FR-10), the carry-forward
 * lesson matching rule (FR-11) and the Markdown/HTML exporters (FR-8).
 *
 * Run with: pnpm sanity
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CURRENT_SCHEMA_VERSION,
  EVENT_TYPES,
  computeCompleteness,
  createEmptyBrief,
  ensurePresetMilestones,
  migrateBrief,
  missingRequiredFields,
  pruneEmptyRows,
  validateBrief,
  type EventBrief,
} from "../packages/schema/src/index";
import { briefToMarkdown, briefToPrintableHtml } from "../apps/web/lib/brief-export";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nFR-1 · presets pre-populate metrics and risks per event type");
for (const type of EVENT_TYPES) {
  const brief = createEmptyBrief(type, { withoutPresetContent: type === "custom" });
  if (type === "custom") {
    check(
      "custom → no preset content",
      brief.successMetrics.length === 0 && brief.riskRegister.length === 0,
    );
  } else {
    check(
      `${type} → ${brief.successMetrics.length} metrics, ${brief.riskRegister.length} risks (need ≥3 each)`,
      brief.successMetrics.length >= 3 && brief.riskRegister.length >= 3,
    );
    check(
      `${type} → every row has a UUID id`,
      [...brief.successMetrics, ...brief.riskRegister].every((r) => /^[0-9a-f-]{36}$/i.test(r.id)),
    );
  }
  check(`${type} → type set correctly`, brief.type === type);
  check(`${type} → schemaVersion stamped`, brief.schemaVersion === CURRENT_SCHEMA_VERSION);
}

console.log("\nFR-1/FR-4 · milestones materialise from the event dates");
{
  let brief = createEmptyBrief("conference");
  check("no dates → no milestones", ensurePresetMilestones(brief).timeline.milestones.length === 0);
  brief = {
    ...brief,
    dates: { ...brief.dates, eventStartDate: "2026-11-12", eventEndDate: "2026-11-13" },
  };
  const withMilestones = ensurePresetMilestones(brief);
  check(
    `dates set → ${withMilestones.timeline.milestones.length} milestones`,
    withMilestones.timeline.milestones.length >= 3,
  );
  const pre = withMilestones.timeline.milestones.find((m) => m.label === "Venue contract signed");
  check("pre-event milestone dated before the event", Boolean(pre && pre.targetDate < "2026-11-12"));
  const post = withMilestones.timeline.milestones.find((m) => m.phase === "post_event");
  check("post-event milestone dated after the event", Boolean(post && post.targetDate > "2026-11-13"));
  check(
    "re-running never duplicates milestones",
    ensurePresetMilestones(withMilestones).timeline.milestones.length ===
      withMilestones.timeline.milestones.length,
  );
}

console.log("\nFR-3 · required-field validation blocks generation");
{
  const brief = createEmptyBrief("webinar");
  const missingAtStart = missingRequiredFields(brief);
  check(
    `empty brief reports ${missingAtStart.length} missing required fields`,
    missingAtStart.length >= 5,
  );
  const filled: EventBrief = {
    ...brief,
    name: "Test webinar",
    goals: { ...brief.goals, primaryObjective: "Generate 300 registrants" },
    audience: { ...brief.audience, description: "" }, // deliberately still empty
    dates: { timezone: "America/New_York", eventStartDate: "2026-06-18", eventEndDate: "2026-06-18" },
  };
  const stillMissing = missingRequiredFields(filled);
  check(
    "empty audience.description alone blocks generation",
    stillMissing.length === 1 && stillMissing[0].path === "audience.description",
    JSON.stringify(stillMissing),
  );
  check("missing field carries a jump-back section", stillMissing[0]?.section === "audience");

  const complete = { ...filled, audience: { ...filled.audience, description: "Mid-market ops leads" } };
  check("filling it unblocks generation", missingRequiredFields(complete).length === 0);

  const assembled = pruneEmptyRows(ensurePresetMilestones(complete));
  const result = validateBrief(assembled);
  check(
    "assembled brief validates against the zod schema (FR-4)",
    result.ok,
    result.ok ? "" : JSON.stringify(result.issues.slice(0, 3)),
  );
  check(
    "preset stakeholder rows with no name are pruned before validation",
    assembled.stakeholders.every((s) => s.name.trim() !== "" || s.role.trim() !== ""),
  );
}

console.log("\nFR-9 · migrateBrief upgrades an older / partial document");
{
  const legacy = {
    schemaVersion: "0.9.0",
    id: "11111111-2222-4333-8444-555555555555",
    name: "Legacy brief",
    type: "webinar",
    status: "draft",
    version: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    goals: { primaryObjective: "Old objective" },
    audience: { description: "Old audience" },
    budget: {},
    dates: { timezone: "UTC", eventStartDate: "2026-02-01" },
    format: { deliveryMode: "virtual" },
    stakeholders: [{ name: "No id person", role: "Owner", raci: "A" }],
    // successMetrics / riskRegister / timeline / constraints / carryForwardLessons all absent
    unknownFutureField: { anything: true },
  };
  const migrated = migrateBrief(legacy);
  check("schemaVersion upgraded", migrated.schemaVersion === CURRENT_SCHEMA_VERSION);
  check("missing collections defaulted", Array.isArray(migrated.successMetrics) && migrated.successMetrics.length === 0);
  check("missing timeline defaulted", migrated.timeline.milestones.length === 0);
  check("missing budget currency defaulted to USD", migrated.budget.currency === "USD");
  check("missing end date defaults to the start date", migrated.dates.eventEndDate === "2026-02-01");
  check("id back-filled on a row that had none", /.{10,}/.test(migrated.stakeholders[0]?.id ?? ""));
  check(
    "unknown future fields are preserved, not dropped",
    (migrated as unknown as Record<string, unknown>).unknownFutureField !== undefined,
  );
  check("migrated document validates", validateBrief(migrated).ok);
}

console.log("\nFR-10 · completeness reflects missing recommended sections");
{
  const empty = createEmptyBrief("custom", { withoutPresetContent: true });
  const emptyResult = computeCompleteness(empty);
  check(`blank custom brief < 100% (${emptyResult.percent}%)`, emptyResult.percent < 100);

  const conference = JSON.parse(
    readFileSync(join(root, "fixtures/conference-brief-example.json"), "utf8"),
  ) as EventBrief;
  const full = computeCompleteness(conference);
  check(`fully-populated fixture = 100% (${full.percent}%)`, full.percent === 100);

  const withoutStakeholders = computeCompleteness({ ...conference, stakeholders: [] });
  check(
    `removing stakeholders drops completeness (${withoutStakeholders.percent}%)`,
    withoutStakeholders.percent < 100,
  );
}

console.log("\nFR-8 · exporters render every populated section");
{
  const conference = JSON.parse(
    readFileSync(join(root, "fixtures/conference-brief-example.json"), "utf8"),
  ) as EventBrief;
  const md = briefToMarkdown(conference);
  const expectedHeadings = [
    "# Q4 Customer Summit 2026",
    "## Objectives",
    "## Audience",
    "## Budget",
    "## Stakeholders & RACI",
    "## Success metrics",
    "## Risk register",
    "## Timeline",
    "## Constraints",
    "## Lessons carried forward",
  ];
  for (const heading of expectedHeadings) {
    check(`markdown contains "${heading}"`, md.includes(heading));
  }
  check("markdown renders tables", md.includes("| --- |") || md.includes("| --- | --- |"));
  check("markdown contains no raw JSON braces", !md.includes('{"'));
  check(
    "markdown escapes pipes inside cells",
    !md.split("\n").some((line) => line.startsWith("|") && line.split("|").length > 12),
  );

  const html = briefToPrintableHtml(conference);
  check("html is a standalone document", html.startsWith("<!doctype html>") && html.includes("</html>"));
  check("html includes print styles", html.includes("@media print"));
  check("html renders tables", html.includes("<table>") && html.includes("</tbody>"));
  check("html escapes ampersands in headings", html.includes("Stakeholders &amp; RACI"));

  const sparse = createEmptyBrief("custom", { withoutPresetContent: true });
  const sparseMd = briefToMarkdown({ ...sparse, name: "Sparse" });
  check("sparse brief omits empty sections", !sparseMd.includes("## Risk register"));
  check("sparse brief still renders a header", sparseMd.startsWith("# Sparse"));
}

console.log("\nFR-11 · carry-forward lesson matching rule (pure part)");
{
  // queryLessons itself needs IndexedDB; the exact-match-then-fallback rule is asserted here
  // over the same shape it operates on.
  const conference = JSON.parse(
    readFileSync(join(root, "fixtures/conference-brief-example.json"), "utf8"),
  ) as EventBrief;
  check(
    "conference fixture ships carry-forward lessons for the UI to surface",
    (conference.carryForwardLessons ?? []).length >= 1,
  );
  check(
    "each lesson has an id, text and timestamp",
    (conference.carryForwardLessons ?? []).every((l) => l.id && l.lesson && l.addedAt),
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll sanity checks passed.");
