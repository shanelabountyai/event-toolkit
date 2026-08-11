/**
 * PRD 10 §3 — the registry, and the three operations built on it.
 *
 * The completeness assertion below is the highest-value check in this session: a sync kind that
 * appears in neither the registry nor the NO_PII allowlist fails the build. Without it, a new
 * tool ships a whole category of personal data that is invisible to subject search, invisible to
 * export, and survives a deletion request — and nothing anywhere goes red.
 *
 * Everything here is pure. No database, no IndexedDB.
 *
 * Run with: pnpm pii-check
 */

import {
  NO_PII,
  PII_REGISTRY,
  erasePath,
  eraseSubject,
  eraseSubjectFromCollection,
  extractSubject,
  matchesSubject,
  piiLocation,
  readPath,
  retainedKinds,
  thirdPartyKinds,
  unregisteredKinds,
} from "../packages/pii-registry/src/index";
import { SYNC_KINDS } from "../packages/sync-engine/src/index";
import { REDACTED, redact, redactErrorReport, redactString } from "../apps/web/lib/redact";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const lead = () => ({
  id: "lead-1",
  triageSessionId: "ts-1",
  contact: {
    firstName: "Dana",
    lastName: "Okoro",
    email: "Dana.Okoro@Example.com",
    phone: "+1 555 0100",
    company: "Northwind",
    jobTitle: "Director of Ops",
  },
  signals: { sessionsAttendedCount: 3, boothInteractions: 2, demoRequested: true },
  score: 71,
  tier: "hot",
});

const opportunity = () => ({
  id: "opp-1",
  roiReportId: "roi-1",
  recordId: "006XYZ",
  opportunityName: "Northwind — platform renewal",
  contactName: "Dana Okoro",
  contactEmail: "dana.okoro@example.com",
  company: "Northwind",
  amount: 48_000,
  createdDate: "2026-03-02",
});

const brief = () => ({
  id: "brief-1",
  name: "Summit 2026",
  stakeholders: [
    { id: "st-1", name: "Dana Okoro", role: "Sponsor", raci: "accountable", email: "dana.okoro@example.com" },
    { id: "st-2", name: "Sam Reyes", role: "Field Marketing", raci: "responsible", email: "sam@example.com" },
  ],
  budget: { plannedTotal: 120_000 },
});

function main(): void {
  console.log("\n⭐ The registry describes every kind that exists");
  const missing = unregisteredKinds();
  check(
    `all ${SYNC_KINDS.length} sync kinds are either registered or explicitly declared PII-free`,
    missing.length === 0,
    missing.length ? `undescribed: ${missing.join(", ")}` : undefined,
  );
  check(
    "…and nothing is claimed twice",
    !PII_REGISTRY.some((l) => NO_PII.includes(l.kind)),
  );
  const phantom = [...PII_REGISTRY.map((l) => l.kind), ...NO_PII].filter(
    (k) => !SYNC_KINDS.some((s) => s.kind === k),
  );
  check("…and nothing names a kind that does not exist", phantom.length === 0, phantom.join(", "));
  check(
    "every registered location can actually be searched or erased",
    PII_REGISTRY.every((l) => l.emailPaths.length > 0 || l.personalPaths.length > 0),
  );
  check(
    "the two attendee-data kinds are classified as third-party personal",
    thirdPartyKinds().includes("leadRecords") && thirdPartyKinds().includes("surveyResponses"),
  );
  check(
    "…and they are the kinds the retention policy applies to",
    retainedKinds().includes("leadRecords") && retainedKinds().includes("surveyResponses"),
  );
  check(
    "briefs, budgets and retros are NOT subject to retention",
    !retainedKinds().includes("briefs") && !retainedKinds().includes("budgetLineItems"),
    "an event's own history is not a person's data and is not purged out from under the planner",
  );

  console.log("\nPath reading");
  check("a dotted path reads a nested value", readPath(lead(), "contact.email")[0] === "Dana.Okoro@Example.com");
  check("a fan-out path reads every array entry", readPath(brief(), "stakeholders[].email").length === 2);
  check("a missing path yields nothing rather than throwing", readPath(lead(), "nope.not.here").length === 0);
  check("a null value is not returned as a match", readPath({ a: null }, "a").length === 0);
  check("a path into a primitive yields nothing", readPath({ a: 5 }, "a.b").length === 0);

  console.log("\nSubject search (FR-1)");
  const leadLocation = piiLocation("leadRecords")!;
  check("finds the person by email", matchesSubject(lead(), leadLocation, "dana.okoro@example.com"));
  check(
    "⭐ matching is case-insensitive — an email differing only in case is the same person",
    matchesSubject(lead(), leadLocation, "DANA.OKORO@EXAMPLE.COM"),
  );
  check("…and whitespace-tolerant", matchesSubject(lead(), leadLocation, "  dana.okoro@example.com "));
  check("does not match somebody else", !matchesSubject(lead(), leadLocation, "sam@example.com"));
  check("an empty search matches nothing", !matchesSubject(lead(), leadLocation, "   "));
  check(
    "finds a stakeholder inside a brief's array",
    matchesSubject(brief(), piiLocation("briefs")!, "sam@example.com"),
  );

  console.log("\nSubject export (FR-3)");
  {
    const extract = extractSubject(lead(), leadLocation);
    check("names the tool the data came from", extract.label === "Attendee lead record");
    check("carries the sensitivity classification", extract.sensitivity === "third_party_personal");
    check("includes the email", extract.fields["contact.email"]?.[0] === "Dana.Okoro@Example.com");
    check("includes the phone number", extract.fields["contact.phone"]?.[0] === "+1 555 0100");
    check(
      "includes the behavioural signals — what the system inferred is data about them too",
      extract.fields["signals"] !== undefined,
    );
    check("omits paths the document does not have", !("contact.fullName" in extract.fields));
  }

  console.log("\nSubject deletion (FR-2)");
  check(
    "a lead record is deleted outright — the record IS the person",
    eraseSubject(lead(), leadLocation).action === "delete_record",
  );
  check(
    "a survey response is deleted outright",
    eraseSubject({}, piiLocation("surveyResponses")!).action === "delete_record",
  );
  {
    const outcome = eraseSubject(opportunity(), piiLocation("pipelineOpportunities")!);
    check("⭐ a pipeline opportunity keeps its row", outcome.action === "erase_fields");
    const doc = (outcome as { document: Record<string, unknown> }).document;
    check("…and its amount, which the ROI report rests on", doc.amount === 48_000);
    check("…and the opportunity name", doc.opportunityName === "Northwind — platform renewal");
    check("…while the contact's name is gone", !("contactName" in doc));
    check("…and their email is gone", !("contactEmail" in doc));
    check(
      "⭐ the field is removed, not blanked — a blank string still asserts something about a person",
      !Object.values(doc).includes(""),
    );
    check("the original document was not mutated", opportunity().contactName === "Dana Okoro");
  }

  console.log("\n⭐ Erasing one person from a document that names several");
  {
    const outcome = eraseSubjectFromCollection(brief(), piiLocation("briefs")!, "dana.okoro@example.com");
    const doc = (outcome as { document: Record<string, unknown> }).document;
    const stakeholders = doc.stakeholders as Record<string, unknown>[];
    check("the brief itself survives", outcome.action === "erase_fields" && doc.name === "Summit 2026");
    check("both stakeholder entries remain, so nothing else shifts", stakeholders.length === 2);
    check("the subject's name is gone", !("name" in stakeholders[0]));
    check("the subject's email is gone", !("email" in stakeholders[0]));
    check("their role in the event survives — that is not personal data", stakeholders[0].role === "Sponsor");
    check(
      "⭐ the other stakeholder is completely untouched",
      stakeholders[1].name === "Sam Reyes" && stakeholders[1].email === "sam@example.com",
      "erasing one person's record must not blank everybody named in the same document",
    );
    check("the budget is untouched", (doc.budget as { plannedTotal: number }).plannedTotal === 120_000);
  }

  console.log("\nErasure mechanics");
  check("erasePath removes a nested key", !("email" in (erasePath(lead(), "contact.email") as { contact: object }).contact));
  check(
    "erasePath leaves siblings alone",
    (erasePath(lead(), "contact.email") as { contact: { phone: string } }).contact.phone === "+1 555 0100",
  );
  check("erasePath on a missing path is a no-op", erasePath(lead(), "nope.here") !== undefined);
  check(
    "erasePath does not mutate its input",
    (() => {
      const original = lead();
      erasePath(original, "contact.email");
      return original.contact.email === "Dana.Okoro@Example.com";
    })(),
  );

  console.log("\nLog redaction (FR-5)");
  {
    const dump = JSON.stringify(redact(lead()));
    check("an attendee's email never reaches a log", !dump.includes("Dana.Okoro@Example.com"));
    check("…nor their phone number", !dump.includes("555 0100"));
    check("…nor their name", !dump.includes("Dana") && !dump.includes("Okoro"));
    check(
      "the record id survives, so the entry is still diagnosable",
      dump.includes("lead-1") && dump.includes("ts-1"),
      "redaction that removes the ability to debug is redaction that gets switched off",
    );
    check("non-personal fields survive", dump.includes("71") && dump.includes("hot"));

    check(
      "⭐ an email interpolated into an error message is scrubbed",
      !redactString("failed to parse row for dana.okoro@example.com").includes("okoro@"),
      "the common case is not a logged record, it is a helpful error message",
    );
    check(
      "a phone number in free text is scrubbed",
      redactString("called +1 555 0100 twice").includes(REDACTED),
    );

    const reported = JSON.stringify(
      redactErrorReport(new Error("bad email: dana.okoro@example.com"), {
        workspaceId: "ws-1",
        kind: "leadRecords",
      }),
    );
    check("an Error's message is scrubbed", !reported.includes("dana.okoro"));
    check(
      "…while the workspace and kind survive for diagnosis",
      reported.includes("ws-1") && reported.includes("leadRecords"),
    );
    check(
      "a survey comment nested anywhere is redacted",
      !JSON.stringify(
        redact({ batch: { rows: [{ comment: "Sam was rude", respondentEmail: "x@y.com" }] } }),
      ).includes("rude"),
    );
    check(
      "a circular reference does not crash the logger",
      (() => {
        const a: Record<string, unknown> = { id: "x" };
        a.self = a;
        return JSON.stringify(redact(a)).includes("circular");
      })(),
      "a logger that throws while logging an error loses both",
    );
    check("primitives pass through", redact(42) === 42 && redact(null) === null);
  }

  if (failures > 0) {
    console.error(`\n${failures} PII registry check(s) failed.\n`);
    console.error("If a new sync kind was added, describe it in PII_REGISTRY or NO_PII.\n");
    process.exit(1);
  }
  console.log("\nAll PII registry checks passed.\n");
}

main();
