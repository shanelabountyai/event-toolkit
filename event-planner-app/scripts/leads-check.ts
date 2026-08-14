/**
 * Headless exercise of PRD 5 (Lead Triage & Follow-Up Engine).
 *
 * Dedupe and scoring are the whole value proposition, and both fail quietly: a wrong merge
 * loses a real person and mails the wrong one, a wrong score buries a hot lead at the bottom
 * of a list nobody scrolls. They get checked here against the real sample CSVs.
 *
 * Also asserts the binding v1 constraint that this tool NEVER writes to an EventBrief.
 *
 * Run with: pnpm leads-check
 */

import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { EventBrief } from "../packages/schema/src/index";
import {
  applyDraftEdit,
  applyMappedOwner,
  applyMerge,
  assignOwnerManually,
  allLeadsRouted,
  buildCombinedExport,
  buildPerOwnerExport,
  computeProgress,
  contactSimilarity,
  dedupeLeads,
  defaultRubric,
  defaultTemplates,
  generateDraftsForLeads,
  matchesPersonaTitle,
  newImportBatch,
  newOwner,
  normalizeCompany,
  normalizeEmail,
  normalizeKey,
  ownerDistribution,
  parseCsv,
  personaTitlesFromBrief,
  rescoreLeads,
  roundRobinAssign,
  rowsToLeads,
  scoreLead,
  sessionFromBrief,
  sortForExport,
  standaloneSession,
  suggestColumnMapping,
  tierCounts,
  toCsv,
  variantForBrief,
  type LeadRecord,
  type TriageSession,
} from "../packages/lead-triage-core/src/index";
import {
  getSession,
  listLeads,
  replaceLeads,
  saveLeadsBulk,
  saveRubric,
  saveSession,
  getBrief,
  saveBrief,
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

const badgescan = parseCsv(fixture("lead-triage-sample-badgescan.csv"));
const registrants = parseCsv(fixture("lead-triage-sample-registrants.csv"));
const demoRequests = parseCsv(fixture("lead-triage-sample-demorequests.csv"));

const SESSION_ID = "triage-1";

function importFile(parsed: ReturnType<typeof parseCsv>, batchId: string): LeadRecord[] {
  const mapping = suggestColumnMapping(parsed.headers);
  return rowsToLeads(parsed.rows, mapping, SESSION_ID, batchId);
}

async function main(): Promise<void> {
  /* ---------------------------------------------------------------- */
  console.log("\nFR-1 · session creation");
  const linked = sessionFromBrief(conference);
  check("a linked session takes the brief's name", linked.eventName === conference.name);
  check("…and closes on the brief's end date", linked.eventClosedAt.startsWith(conference.dates.eventEndDate));
  check("…and keeps a soft reference to the brief", linked.eventBriefId === conference.id);
  const standalone = standaloneSession("Field Day", "2026-11-20T17:00");
  check("a standalone session has no brief reference", standalone.eventBriefId === null);
  check("both start in the importing state", linked.status === "importing" && standalone.status === "importing");

  /* ---------------------------------------------------------------- */
  console.log("\nFR-2 · CSV parsing and column mapping");
  check(`badge scan parses 6 rows (${badgescan.rows.length})`, badgescan.rows.length === 6);
  check("quoted session lists survive parsing",
    String(badgescan.rows[0]["Sessions Attended"]).includes("Keynote; Automation Workshop"));

  const registrantMapping = suggestColumnMapping(registrants.headers);
  const mapFor = (col: string) => registrantMapping.find((m) => m.sourceColumn === col)?.targetField;
  check('"Email Address" auto-maps to email', mapFor("Email Address") === "email");
  check('"Organization" auto-maps to company', mapFor("Organization") === "company");
  check('"First Name" and "Last Name" map separately',
    mapFor("First Name") === "firstName" && mapFor("Last Name") === "lastName");
  check('"Owner" maps to owner', mapFor("Owner") === "owner");
  check('"Registration Status" maps to registrationStatus', mapFor("Registration Status") === "registrationStatus");

  const badgeMapping = suggestColumnMapping(badgescan.headers);
  const badgeMapFor = (col: string) => badgeMapping.find((m) => m.sourceColumn === col)?.targetField;
  check('"Booth Scans" maps to boothInteractions', badgeMapFor("Booth Scans") === "boothInteractions");
  check('"Demo" maps to demoRequested', badgeMapFor("Demo") === "demoRequested");
  check('"Job Title" maps to jobTitle', badgeMapFor("Job Title") === "jobTitle");

  const overridden = badgeMapping.map((m) =>
    m.sourceColumn === "Job Title" ? { ...m, targetField: "ignore" as const, confidence: "manual" as const } : m,
  );
  const overriddenLeads = rowsToLeads(badgescan.rows, overridden, SESSION_ID, "b0");
  check("a manual override sticks through to imported records",
    overriddenLeads.every((lead) => lead.contact.jobTitle === undefined));

  console.log("\nFR-2 · cell coercion");
  const badgeLeads = importFile(badgescan, "batch-badge");
  const dana = badgeLeads.find((l) => l.contact.email?.includes("dana"))!;
  check("boolean-ish 'Yes' becomes demoRequested", dana.signals.demoRequested === true);
  check("'No' becomes false", badgeLeads.find((l) => l.contact.email?.includes("brightpath"))!.signals.demoRequested === false);
  check("booth scans parse as a number", dana.signals.boothInteractions === 3);
  check("a semicolon session list splits", dana.signals.sessionsAttended.length === 2);
  check("session count derives from the list", dana.signals.sessionsAttendedCount === 2);
  check("a row with no identity is dropped, not imported as a blank",
    rowsToLeads([{ Email: "", "Full Name": "" }], badgeMapping, SESSION_ID, "b").length === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-4 · dedupe — exact email auto-merges");
  check("emails normalise case and whitespace", normalizeEmail("  DANA@X.COM ") === "dana@x.com");
  check("company suffixes are stripped for comparison", normalizeCompany("Northwind Logistics Inc") === "northwind logistics");
  check("the dedupe key is the email when present", normalizeKey({ email: "A@B.com" }) === "a@b.com");
  check("…and a namespaced name key when not", normalizeKey({ fullName: "Dana W", company: "X" }).startsWith("name:"));

  const registrantLeads = importFile(registrants, "batch-reg");
  const pool = [...badgeLeads, ...registrantLeads];
  const firstPass = dedupeLeads(pool);
  check(`badge + registrants merge on shared emails (${pool.length} → ${firstPass.leads.length})`,
    firstPass.leads.length === pool.length - 4);
  check("case-differing emails still merge (DANA@ vs dana@)",
    firstPass.leads.filter((l) => normalizeEmail(l.contact.email) === "dana.whitfield@northwind.example").length === 1);

  const mergedDana = firstPass.leads.find((l) => normalizeEmail(l.contact.email) === "dana.whitfield@northwind.example")!;
  check("the merged record keeps both sources", mergedDana.sourceRows.length === 2);
  check("merging fills gaps rather than blanking", Boolean(mergedDana.contact.firstName && mergedDana.contact.fullName));
  check("signals accumulate across files", mergedDana.signals.boothInteractions === 3);
  check("conflicting non-empty values are recorded, not silently dropped",
    (mergedDana.conflicts?.length ?? 0) > 0,
    JSON.stringify(mergedDana.conflicts));
  check("a conflict names both values",
    mergedDana.conflicts!.some((c) => c.kept && c.discarded && c.kept !== c.discarded));

  console.log("\nFR-4 · dedupe — fuzzy matches queue, never auto-merge");
  const demoLeads = importFile(demoRequests, "batch-demo");
  const secondPass = dedupeLeads([...firstPass.leads, ...demoLeads]);
  const tomVsThomas = secondPass.candidates.find(
    (c) =>
      [c.leadAId, c.leadBId].every((id) =>
        /alvarez/i.test(
          secondPass.leads.find((l) => l.id === id)?.contact.fullName ??
            secondPass.leads.find((l) => l.id === id)?.contact.firstName ??
            "",
        ),
      ),
  );
  check("Tom Alvarez / Thomas Alvarez is queued for review", Boolean(tomVsThomas),
    JSON.stringify(secondPass.candidates.map((c) => c.reason)));
  check("…and was NOT auto-merged",
    secondPass.leads.filter((l) => /alvarez/i.test(l.contact.fullName ?? "")).length === 2);
  check("two different valid emails never queue as duplicates",
    !secondPass.candidates.some((c) => {
      const a = secondPass.leads.find((l) => l.id === c.leadAId);
      const b = secondPass.leads.find((l) => l.id === c.leadBId);
      return Boolean(normalizeEmail(a?.contact.email) && normalizeEmail(b?.contact.email));
    }));
  check("similarity is name-weighted, not company-dominated",
    contactSimilarity({ fullName: "Dana Whitfield", company: "Acme" }, { fullName: "Bob Jones", company: "Acme" }) < 0.85);
  check("a near-identical name at the same company scores high",
    contactSimilarity({ fullName: "Tom Alvarez", company: "Cedar & Vine Hospitality" }, { fullName: "Thomas Alvarez", company: "Cedar and Vine Hospitality" }) >= 0.7);

  const afterMerge = applyMerge(secondPass.leads, tomVsThomas!.leadAId, tomVsThomas!.leadBId);
  check(`resolving as "merge" reduces the pool by one (${secondPass.leads.length} → ${afterMerge.length})`,
    afterMerge.length === secondPass.leads.length - 1);
  const rejected = dedupeLeads(secondPass.leads, [{ ...tomVsThomas!, status: "rejected" }]);
  check('resolving as "not a duplicate" keeps both and stops re-asking',
    rejected.leads.length === secondPass.leads.length &&
      !rejected.candidates.some((c) => c.leadAId === tomVsThomas!.leadAId && c.leadBId === tomVsThomas!.leadBId));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-5/FR-6 · scoring");
  const personas = personaTitlesFromBrief(conference);
  const rubric = defaultRubric(SESSION_ID, personas);
  check("the default rubric has four rules", rubric.rules.length === 4);
  check("tier thresholds are hot 70 / warm 40", rubric.tierThresholds.hot === 70 && rubric.tierThresholds.warm === 40);

  const demoOnly = scoreLead(
    { contact: {}, signals: { sessionsAttended: [], sessionsAttendedCount: 0, boothInteractions: 0, demoRequested: true } },
    rubric,
  );
  check(`a demo request alone scores 40 (${demoOnly.score})`, demoOnly.score === 40);
  check("…which is warm, not hot", demoOnly.tier === "warm");

  const busy = scoreLead(
    { contact: {}, signals: { sessionsAttended: ["a", "b", "c", "d", "e", "f"], sessionsAttendedCount: 6, boothInteractions: 9, demoRequested: false } },
    rubric,
  );
  check(`booth interactions cap at 30 and sessions at 25 (${busy.score})`, busy.score === 55);
  check("caps are visible in the breakdown", busy.breakdown.every((b) => b.points <= 30));

  const hot = scoreLead(
    { contact: {}, signals: { sessionsAttended: ["a", "b"], sessionsAttendedCount: 2, boothInteractions: 3, demoRequested: true } },
    rubric,
  );
  check(`demo + booth + sessions is hot (${hot.score})`, hot.tier === "hot");
  check("nothing at all scores zero and is cold", (() => {
    const none = scoreLead({ contact: {}, signals: { sessionsAttended: [], sessionsAttendedCount: 0, boothInteractions: 0, demoRequested: false } }, rubric);
    return none.score === 0 && none.tier === "cold" && none.breakdown.length === 0;
  })());

  console.log("\nFR-5 · persona title matching");
  check("persona titles come off the brief", personas.length > 0);
  check("a reordered title still matches", matchesPersonaTitle("Marketing VP", ["vp of marketing"]));
  check("an unrelated title does not", !matchesPersonaTitle("Plant Operations Lead", ["vp of marketing"]));
  check("no personas means no match", !matchesPersonaTitle("VP of Marketing", []));

  // The failure a full event run surfaced: planners write descriptive personas, real job titles
  // are short, and measuring overlap against the persona alone meant the rule fired for nobody.
  check(
    "⭐ a short real title matches a longer descriptive persona",
    matchesPersonaTitle("Plant Operations Lead", ["plant operations director", "director of manufacturing operations"]),
    "this scored the literal ICP at 5/100 and ranked a hospitality manager above them",
  );
  check(
    "…and the reverse direction still works",
    matchesPersonaTitle("Director of Manufacturing Operations", ["plant operations director"]),
  );
  check(
    "⭐ a single generic word in common is not a match",
    !matchesPersonaTitle("Office Manager", ["marketing manager"]),
    "otherwise every badge scan with 'manager' in it matches",
  );
  check(
    "…nor is a shared seniority word alone",
    !matchesPersonaTitle("Senior Analyst", ["senior marketing lead"]),
  );
  check(
    "a domain word alongside a generic one does match",
    matchesPersonaTitle("Operations Lead", ["operations director"]),
  );
  check(
    "an unrelated industry still does not match",
    !matchesPersonaTitle("Head of Events, Hospitality", ["plant operations director"]),
  );

  console.log("\nFR-5 · a rubric edit rescoresyour pool live");
  const scored = rescoreLeads(afterMerge, rubric, personas);
  const before = tierCounts(scored);
  const boosted = {
    ...rubric,
    rules: rubric.rules.map((r) => (r.signal === "demoRequested" ? { ...r, flatPoints: 80 } : r)),
  };
  const after = tierCounts(rescoreLeads(scored, boosted, personas));
  check(`raising demo points moves leads up a tier (${before.hot} → ${after.hot} hot)`, after.hot > before.hot);
  check("re-scoring with the same rubric changes nothing",
    JSON.stringify(tierCounts(rescoreLeads(scored, rubric, personas))) === JSON.stringify(before));
  check("every scored lead carries a breakdown",
    scored.filter((l) => l.score > 0).every((l) => l.scoreBreakdown.length > 0));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-7 · owner assignment");
  const alex = newOwner("Alex Rivera");
  const jordan = newOwner("Jordan Kim");
  const sam = newOwner("Sam Okafor");
  const owners = [alex, jordan, sam];

  const mapped = applyMappedOwner(scored, owners);
  const mappedCount = mapped.filter((l) => l.assignmentMethod === "column_mapped").length;
  check(`the Owner column assigns leads (${mappedCount})`, mappedCount > 0);
  check("mapped leads become routed", mapped.filter((l) => l.assignmentMethod === "column_mapped").every((l) => l.status === "routed"));
  check("an unmatched owner name is kept as text, not discarded", (() => {
    const stranger = applyMappedOwner(
      [{ ...scored[0], ownerId: null, ownerName: "Someone Not In The List" }],
      owners,
    )[0];
    return stranger.ownerId === null && stranger.ownerName === "Someone Not In The List";
  })());

  const rr = roundRobinAssign(mapped, owners);
  check(`round robin fills the rest (${rr.assigned} assigned)`, rr.assigned > 0);
  check("every lead now has an owner", allLeadsRouted(rr.leads));
  check("round-robin leads are tagged as such",
    rr.leads.some((l) => l.assignmentMethod === "round_robin"));
  const distribution = ownerDistribution(rr.leads, owners);
  const counts = distribution.filter((d) => d.owner).map((d) => d.leadCount);
  check(`the split is balanced (${counts.join("/")})`, Math.max(...counts) - Math.min(...counts) <= 1);

  const target = rr.leads[0];
  const reassigned = assignOwnerManually(rr.leads, [target.id], sam);
  check("manual reassignment wins", reassigned.find((l) => l.id === target.id)?.ownerId === sam.id);
  check("…and is tagged manual", reassigned.find((l) => l.id === target.id)?.assignmentMethod === "manual");
  check("only the selected lead changed",
    reassigned.filter((l, i) => l.ownerId !== rr.leads[i].ownerId).length === 1);
  const unassigned = assignOwnerManually(rr.leads, [target.id], null);
  check("unassigning walks the lead back to new",
    unassigned.find((l) => l.id === target.id)?.ownerId === null &&
      unassigned.find((l) => l.id === target.id)?.status === "new");

  /* ---------------------------------------------------------------- */
  console.log("\nFR-8 · follow-up drafts");
  const session: TriageSession = { ...linked, id: SESSION_ID, owners };
  check("the template variant follows the brief's delivery mode", variantForBrief(conference) === "in_person");
  const templates = defaultTemplates(SESSION_ID, variantForBrief(conference));
  check("one template per tier", templates.length === 3);

  const drafted = generateDraftsForLeads(rr.leads, session, templates);
  check(`drafts generated for every lead (${drafted.generated})`, drafted.generated === rr.leads.length);
  check("leads become draft_ready", drafted.leads.every((l) => l.status === "draft_ready"));
  const sampleDraft = drafted.leads.find((l) => l.contact.firstName)!.followUpDraft!;
  check("merge tokens are filled", !sampleDraft.body.includes("{{first_name}}"));
  check("the event name is interpolated", sampleDraft.subject.includes(conference.name));
  check("no token is left unrendered in any draft",
    drafted.leads.every((l) => !/\{\{\s*(first_name|company|event_name|owner_name)\s*\}\}/.test(l.followUpDraft?.body ?? "")));
  check("an unknown token stays visible rather than blanking", (() => {
    const rendered = generateDraftsForLeads(
      [drafted.leads[0]],
      session,
      [{ ...templates[0], tier: "all", bodyTemplate: "Hi {{first_name}}, {{not_a_token}}" }],
      { overwriteEdited: true },
    );
    return rendered.leads[0].followUpDraft!.body.includes("{{not_a_token}}");
  })());

  const editedLead = applyDraftEdit(drafted.leads[0], "My own subject", "My own body");
  check("editing marks the draft as edited", editedLead.followUpDraft?.edited === true);
  const regenerated = generateDraftsForLeads(
    [editedLead, ...drafted.leads.slice(1)],
    session,
    templates,
  );
  check("regenerating preserves the edited draft",
    regenerated.leads[0].followUpDraft?.body === "My own body");
  check(`…and reports it as preserved (${regenerated.preserved})`, regenerated.preserved === 1);
  check("…while un-edited drafts still regenerate", regenerated.generated === drafted.leads.length - 1);
  const forced = generateDraftsForLeads([editedLead], session, templates, { overwriteEdited: true });
  check("an explicit overwrite does replace it", forced.leads[0].followUpDraft?.body !== "My own body");
  check("a contacted lead is not walked back to draft_ready", (() => {
    const contacted = { ...drafted.leads[1], status: "contacted" as const, followUpDraft: null };
    return generateDraftsForLeads([contacted], session, templates).leads[0].status === "contacted";
  })());

  /* ---------------------------------------------------------------- */
  console.log("\nFR-10 · export");
  const finalLeads = regenerated.leads;
  const sorted = sortForExport(finalLeads);
  check("export sorts hot first", sorted[0].tier === "hot" || tierCounts(finalLeads).hot === 0);
  check("…then by score descending within a tier", (() => {
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i - 1].tier === sorted[i].tier && sorted[i - 1].score < sorted[i].score) return false;
    }
    return true;
  })());

  const perOwner = buildPerOwnerExport(finalLeads, session, owners);
  check(`one file per owner with leads (${perOwner.length})`, perOwner.length >= 3);
  check("each file holds only that owner's leads", perOwner.every((file) => {
    const ownerName = file.rows[1]?.[12];
    return file.rows.slice(1).every((row) => row[12] === ownerName);
  }));
  check("every export row count matches its lead count",
    perOwner.every((file) => file.rows.length === file.leadCount + 1));
  check("the draft subject and body are columns",
    perOwner[0].rows[0].includes("Follow-up subject") && perOwner[0].rows[0].includes("Follow-up body"));
  check("drafts actually appear in the rows", perOwner[0].rows[1]?.[14] !== "");

  const combined = buildCombinedExport(finalLeads, session, owners);
  check("combined is one file with every lead", combined.leadCount === finalLeads.length);
  check("combined groups by owner — each owner's rows are contiguous", (() => {
    const ownersInOrder = combined.rows.slice(1).map((r) => String(r[12]));
    // A name is grouped when its first and last occurrence bracket exactly its own rows.
    return [...new Set(ownersInOrder)].every((name) => {
      const first = ownersInOrder.indexOf(name);
      const last = ownersInOrder.lastIndexOf(name);
      return last - first + 1 === ownersInOrder.filter((n) => n === name).length;
    });
  })());
  check("unassigned leads are never dropped from the handoff", (() => {
    const withOrphan = [...finalLeads.slice(1), { ...finalLeads[0], ownerId: null, ownerName: null }];
    const files = buildPerOwnerExport(withOrphan, session, owners);
    return files.some((f) => f.basename.endsWith("unassigned"));
  })());
  check("CSV quotes a multi-line draft body", toCsv([["a\nb"]]).includes('"a\nb"'));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-11 · progress dashboard");
  const progress = computeProgress(finalLeads, session, 1, new Date("2026-11-14T18:00:00Z"));
  check(`lead count (${progress.leadCount})`, progress.leadCount === finalLeads.length);
  check("routed is 100% once everyone has an owner", progress.routedPct === 100);
  check("draft-ready is 100% once drafts exist", progress.draftReadyPct === 100);
  check("merged leads are counted as deduped", progress.mergedCount > 0 && progress.dedupedPct > 0);
  check("hours since close is computed", (progress.hoursSinceClose ?? 0) > 0);
  check("an empty pool does not divide by zero", (() => {
    const empty = computeProgress([], session, 0);
    return empty.routedPct === 0 && empty.leadCount === 0;
  })());

  /* ---------------------------------------------------------------- */
  console.log("\nFR-13 · persistence, and the brief stays untouched");
  await saveBrief({ ...conference, id: "leads-brief" });
  // Baseline read back through getBrief, so lazy schema migration (FR-9) has already been
  // applied — otherwise "unchanged" would trip on the migration rather than on a real write.
  const storedBrief = (await getBrief("leads-brief"))!;
  const versionBefore = storedBrief.version;
  const updatedBefore = storedBrief.updatedAt;

  const stored = await saveSession({ ...session, id: SESSION_ID, eventBriefId: "leads-brief" });
  await saveRubric(rubric);
  await saveLeadsBulk(finalLeads);
  check("the session round-trips", (await getSession(SESSION_ID))?.eventName === session.eventName);
  check(`leads round-trip (${(await listLeads(SESSION_ID)).length})`, (await listLeads(SESSION_ID)).length === finalLeads.length);
  check("a reloaded lead keeps its draft", (await listLeads(SESSION_ID)).every((l) => l.followUpDraft !== null));
  check("a reloaded lead keeps its owner", (await listLeads(SESSION_ID)).every((l) => l.ownerId !== null));

  // A merge removes a record — the store must not resurrect it.
  await replaceLeads(SESSION_ID, finalLeads.slice(0, 3));
  check(`replaceLeads deletes what a merge removed (${(await listLeads(SESSION_ID)).length})`,
    (await listLeads(SESSION_ID)).length === 3);

  const briefAfter = await getBrief("leads-brief");
  check("the linked EventBrief version is unchanged", briefAfter?.version === versionBefore,
    `${versionBefore} → ${briefAfter?.version}`);
  check("…and its updatedAt is unchanged", briefAfter?.updatedAt === updatedBefore);
  check("the whole brief document is byte-identical",
    JSON.stringify(briefAfter) === JSON.stringify(storedBrief));

  const otherSession = await saveSession(standaloneSession("Other event", "2026-01-01T12:00"));
  check("a second session sees none of the first's leads", (await listLeads(otherSession.id)).length === 0);
  check("stored session status is preserved", stored.status === "importing");

  /* ---------------------------------------------------------------- */
  if (failures > 0) {
    console.error(`\n${failures} lead triage check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll lead triage checks passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
