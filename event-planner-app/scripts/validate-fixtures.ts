/**
 * Validates the worked example briefs in `fixtures/` twice over:
 *   1. against `packages/schema/src/event-brief.schema.json` with Ajv (draft 2020-12), and
 *   2. against the zod runtime schema the app itself uses (`validateBrief`),
 * then checks that `migrateBrief()` round-trips each document unchanged.
 *
 * Run with: pnpm validate:fixtures
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  CURRENT_SCHEMA_VERSION,
  computeCompleteness,
  migrateBrief,
  missingRequiredFields,
  validateBrief,
} from "../packages/schema/src/index";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(root, "packages/schema/src/event-brief.schema.json");
const fixturesDir = join(root, "fixtures");

const jsonSchema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateJsonSchema = ajv.compile(jsonSchema);

/**
 * Brief fixtures only. `fixtures/` also holds worked examples for other tools (e.g.
 * `conference-budget-example.json`, which is a budget, not a brief) — those are validated by
 * their own tool's check script, and running the EventBrief schema over them would fail on
 * documents that were never meant to satisfy it.
 */
const files = readdirSync(fixturesDir)
  .filter((f) => f.endsWith("-brief-example.json"))
  .sort();
if (files.length === 0) {
  console.error("No brief fixtures found in fixtures/");
  process.exit(1);
}

let failures = 0;

for (const file of files) {
  const raw: unknown = JSON.parse(readFileSync(join(fixturesDir, file), "utf8"));
  const problems: string[] = [];

  // 1. JSON Schema ---------------------------------------------------------
  if (!validateJsonSchema(raw)) {
    for (const err of validateJsonSchema.errors ?? []) {
      problems.push(`[json-schema] ${err.instancePath || "(root)"} ${err.message ?? ""}`);
    }
  }

  // 2. zod ------------------------------------------------------------------
  const zodResult = validateBrief(raw);
  if (!zodResult.ok) {
    for (const issue of zodResult.issues) {
      problems.push(`[zod] ${issue.path || "(root)"}: ${issue.message}`);
    }
  }

  // 3. migrateBrief round-trip ---------------------------------------------
  const migrated = migrateBrief(raw);
  if (migrated.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    problems.push(
      `[migrate] schemaVersion is ${migrated.schemaVersion}, expected ${CURRENT_SCHEMA_VERSION}`,
    );
  }
  if (!validateJsonSchema(migrated)) {
    problems.push("[migrate] migrated document no longer satisfies the JSON Schema");
  }

  const missing = missingRequiredFields(migrated);
  const completeness = computeCompleteness(migrated);

  if (problems.length > 0) {
    failures += 1;
    console.error(`✗ ${file}`);
    for (const p of problems) console.error(`    ${p}`);
  } else {
    console.log(
      `✓ ${file} — valid against JSON Schema + zod · ${completeness.percent}% complete · ${
        missing.length
      } required field(s) missing · ${migrated.successMetrics.length} metrics, ${
        migrated.riskRegister.length
      } risks, ${migrated.timeline.milestones.length} milestones`,
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} fixture(s) failed validation.`);
  process.exit(1);
}
console.log(`\nAll ${files.length} fixture(s) valid against schema v${CURRENT_SCHEMA_VERSION}.`);
