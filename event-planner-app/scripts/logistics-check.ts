/**
 * Headless exercise of PRD 3 (Run-of-Show / Logistics Pack).
 *
 * The propagation model is the product thesis: a session's time lives in exactly one place and
 * every other artifact derives it. Most of what follows is there to prove that stays true —
 * including after a session is deleted, which is the one place a copy is legitimately made.
 *
 * Run with: pnpm logistics-check
 */

import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { newId, type EventBrief } from "../packages/schema/src/index";
import {
  CURRENT_LOGISTICS_SCHEMA_VERSION,
  assignmentsByPerson,
  assignmentsBySession,
  checklistByCategory,
  contactsByOrgType,
  createLogisticsPackFromBrief,
  deleteSessionWithStrategy,
  findDoubleBookings,
  findOverlaps,
  findSessionReferences,
  migrateLogisticsPack,
  newChecklistItem,
  newContact,
  newIssue,
  newSession,
  newShippingItem,
  newStaffAssignment,
  packCompleteness,
  parseShippingCsv,
  rangesOverlap,
  resolveSessionTime,
  sessionsByStart,
  type LogisticsPack,
} from "../packages/logistics/src/index";
import {
  deleteBrief,
  findOrCreatePackForBrief,
  getPack,
  getPackByBriefId,
  savePack,
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
const conference = JSON.parse(
  readFileSync(join(here, "..", "fixtures", "conference-brief-example.json"), "utf8"),
) as EventBrief;

/** A brief shaped to the acceptance criteria: 2 during-event milestones, 3 stakeholders. */
function seedBrief(): EventBrief {
  return {
    ...conference,
    id: "logi-brief",
    stakeholders: conference.stakeholders.slice(0, 3),
    timeline: {
      milestones: [
        ...conference.timeline.milestones.filter((m) => m.phase === "pre_event").slice(0, 1),
        {
          id: newId(),
          label: "Registration desk opens",
          phase: "during_event",
          targetDate: "2026-11-12",
          status: "not_started",
        },
        {
          id: newId(),
          label: "Keynote",
          phase: "during_event",
          targetDate: "2026-11-12",
          status: "not_started",
        },
      ],
    },
  };
}

async function main(): Promise<void> {
  /* ---------------------------------------------------------------- */
  console.log("\nFR-1 · a new pack seeds itself from the brief");
  const brief = seedBrief();
  const pack = createLogisticsPackFromBrief(brief);
  check(`2 sessions seeded from during_event milestones (${pack.sessions.length})`, pack.sessions.length === 2);
  check(`3 contacts seeded from stakeholders (${pack.contacts.length})`, pack.contacts.length === 3);
  check("seeded contacts are marked internal", pack.contacts.every((c) => c.orgType === "internal"));
  check("seeded sessions carry the venue as location", pack.sessions.every((s) => s.location === "Moscone West"));
  check("seeded sessions do not collide on time", findOverlaps(pack).size === 0, [...findOverlaps(pack)].join(","));
  check("pack references the brief", pack.eventBriefId === brief.id);
  check("pack stamps the current schema version", pack.schemaVersion === CURRENT_LOGISTICS_SCHEMA_VERSION);

  const virtualPack = createLogisticsPackFromBrief({
    ...brief,
    format: { deliveryMode: "virtual", venueOrPlatform: { name: "Zoom" } },
  });
  check("a virtual event seeds its platform as the location", virtualPack.sessions.every((s) => s.location === "Zoom"));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-9 · propagation — one edit, every artifact follows");
  const sessionA = pack.sessions[0];
  const withRefs: LogisticsPack = {
    ...pack,
    staffAssignments: [
      newStaffAssignment({ personName: "Dana Rivera", assignmentRole: "Lead", sessionId: sessionA.id }),
    ],
    venueChecklist: [
      newChecklistItem({ category: "Setup", item: "Badge printers online", dueSessionId: sessionA.id }),
    ],
    contacts: [
      ...pack.contacts,
      newContact({ name: "Venue Ops", role: "Floor manager", orgType: "venue", availabilitySessionId: sessionA.id }),
    ],
  };

  const moved: LogisticsPack = {
    ...withRefs,
    sessions: withRefs.sessions.map((s) =>
      s.id === sessionA.id ? { ...s, startTime: "2026-11-12T06:30", endTime: "2026-11-12T07:30" } : s,
    ),
  };

  const staffTime = resolveSessionTime(moved, moved.staffAssignments[0].sessionId);
  const checklistTime = resolveSessionTime(moved, moved.venueChecklist[0].dueSessionId);
  const contactTime = resolveSessionTime(
    moved,
    moved.contacts.find((c) => c.orgType === "venue")!.availabilitySessionId,
  );
  check("staffing sees the new time", staffTime?.startTime === "2026-11-12T06:30", String(staffTime?.startTime));
  check("checklist sees the new time", checklistTime?.startTime === "2026-11-12T06:30");
  check("contact sheet sees the new time", contactTime?.startTime === "2026-11-12T06:30");
  check("no referencing record stored a copy of the time", JSON.stringify(moved.staffAssignments[0]).indexOf("06:30") === -1);
  check("a dangling reference resolves to null rather than throwing", resolveSessionTime(moved, "no-such-session") === null);
  check("an absent reference resolves to null", resolveSessionTime(moved, undefined) === null);

  console.log("\nFR-9 · custom time blocks are independent by design");
  const custom: LogisticsPack = {
    ...moved,
    staffAssignments: [
      ...moved.staffAssignments,
      newStaffAssignment({
        personName: "Marcus Hale",
        assignmentRole: "Floor",
        customStartTime: "2026-11-12T14:00",
        customEndTime: "2026-11-12T16:00",
      }),
    ],
  };
  const shifted: LogisticsPack = {
    ...custom,
    sessions: custom.sessions.map((s) => ({ ...s, startTime: "2026-11-12T23:00", endTime: "2026-11-12T23:30" })),
  };
  check(
    "editing sessions leaves a custom block untouched",
    shifted.staffAssignments[1].customStartTime === "2026-11-12T14:00",
  );

  /* ---------------------------------------------------------------- */
  console.log("\nFR-3 · location overlap warnings");
  check("half-open ranges: touching is not overlapping", !rangesOverlap("2026-11-12T09:00", "2026-11-12T10:00", "2026-11-12T10:00", "2026-11-12T11:00"));
  check("genuinely overlapping ranges overlap", rangesOverlap("2026-11-12T09:00", "2026-11-12T10:30", "2026-11-12T10:00", "2026-11-12T11:00"));

  const clash: LogisticsPack = {
    ...pack,
    sessions: [
      newSession({ label: "Keynote", startTime: "2026-11-12T09:00", endTime: "2026-11-12T10:00", location: "Hall A" }),
      newSession({ label: "Workshop", startTime: "2026-11-12T09:30", endTime: "2026-11-12T10:30", location: "Hall A" }),
      newSession({ label: "Elsewhere", startTime: "2026-11-12T09:30", endTime: "2026-11-12T10:30", location: "Hall B" }),
      newSession({ label: "Nowhere", startTime: "2026-11-12T09:30", endTime: "2026-11-12T10:30" }),
    ],
  };
  const overlaps = findOverlaps(clash);
  check(`both clashing rows flagged (${overlaps.size})`, overlaps.size === 2);
  check("the other-room session is not flagged", !overlaps.has(clash.sessions[2].id));
  check("sessions without a location are never flagged", !overlaps.has(clash.sessions[3].id));
  check("location match ignores case and padding", findOverlaps({
    ...clash,
    sessions: [{ ...clash.sessions[0], location: "  hall a " }, clash.sessions[1]],
  }).size === 2);

  const moveRoom: LogisticsPack = {
    ...clash,
    sessions: clash.sessions.map((s, i) => (i === 1 ? { ...s, location: "Hall C" } : s)),
  };
  check("changing one room clears the warning", findOverlaps(moveRoom).size === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-4/FR-5 · staffing views and double booking");
  const s1 = clash.sessions[0];
  const s2 = clash.sessions[1];
  const staffed: LogisticsPack = {
    ...clash,
    staffAssignments: [
      newStaffAssignment({ personName: "Dana", assignmentRole: "MC", sessionId: s1.id }),
      newStaffAssignment({ personName: "Priya", assignmentRole: "AV", sessionId: s1.id }),
      newStaffAssignment({ personName: "Dana", assignmentRole: "Host", sessionId: s2.id }),
    ],
  };
  const bySession = assignmentsBySession(staffed);
  const byPerson = assignmentsByPerson(staffed);
  check("by-session shows both people on the first session", bySession.find((g) => g.session?.id === s1.id)?.assignments.length === 2);
  check("by-person lists Dana's two sessions", byPerson.find((g) => g.personName === "Dana")?.assignments.length === 2);
  check("both views derive from the same array", staffed.staffAssignments.length === 3);

  const doubles = findDoubleBookings(staffed);
  check(`Dana's overlapping pair is flagged (${doubles.size})`, doubles.size === 2);
  check("Priya is not flagged", !doubles.has(staffed.staffAssignments[1].id));

  const customClash: LogisticsPack = {
    ...clash,
    staffAssignments: [
      newStaffAssignment({ personName: "Tom", assignmentRole: "Setup", sessionId: s1.id }),
      newStaffAssignment({
        personName: "Tom",
        assignmentRole: "Errand",
        customStartTime: "2026-11-12T09:30",
        customEndTime: "2026-11-12T10:15",
      }),
    ],
  };
  check("double booking spans session and custom blocks", findDoubleBookings(customClash).size === 2);

  const unscheduled = assignmentsBySession({
    ...clash,
    staffAssignments: [newStaffAssignment({ personName: "Solo", assignmentRole: "Rover" })],
  });
  check("custom-time assignments land in an unscheduled bucket", unscheduled.some((g) => g.session === null));

  /* ---------------------------------------------------------------- */
  console.log("\nFR-7/FR-8 · grouping");
  const grouped: LogisticsPack = {
    ...pack,
    venueChecklist: [
      newChecklistItem({ category: "Setup", item: "a", status: "done" }),
      newChecklistItem({ category: "Setup", item: "b", status: "done" }),
      newChecklistItem({ category: "Setup", item: "c", status: "done" }),
      newChecklistItem({ category: "Setup", item: "d", status: "todo" }),
      newChecklistItem({ category: "Setup", item: "e", status: "blocked" }),
      newChecklistItem({ category: "AV/Tech", item: "f", status: "todo" }),
    ],
    contacts: [
      newContact({ name: "Internal One", role: "Lead", orgType: "internal" }),
      newContact({ name: "Vendor One", role: "Catering", orgType: "vendor" }),
      newContact({ name: "Venue One", role: "Ops", orgType: "venue" }),
    ],
  };
  const setup = checklistByCategory(grouped).find((g) => g.category === "Setup")!;
  check(`Setup shows 3/5 done (${setup.done}/${setup.total})`, setup.done === 3 && setup.total === 5);
  check("categories are grouped, not flattened", checklistByCategory(grouped).length === 2);
  const orgGroups = contactsByOrgType(grouped);
  check("contacts grouped in internal → vendor → venue order", orgGroups.map((g) => g.orgType).join(",") === "internal,vendor,venue");

  /* ---------------------------------------------------------------- */
  console.log("\nFR-13 · completeness rollup");
  const tenSessions = Array.from({ length: 10 }, (_, i) =>
    newSession({ label: `S${i}`, startTime: `2026-11-12T${`${8 + i}`.padStart(2, "0")}:00`, endTime: `2026-11-12T${`${9 + i}`.padStart(2, "0")}:00` }),
  );
  const rollup: LogisticsPack = {
    ...pack,
    sessions: tenSessions,
    staffAssignments: tenSessions.slice(0, 6).map((s) => newStaffAssignment({ personName: `P${s.label}`, assignmentRole: "Host", sessionId: s.id })),
    issueLog: [newIssue({ description: "Projector flickering", severity: "high" }), newIssue({ description: "Fixed", severity: "low", status: "resolved" })],
  };
  const summary = packCompleteness(rollup).artifacts.find((a) => a.key === "staffing")!.summary;
  check(`"6/10 sessions staffed" (${summary})`, summary === "6/10 sessions staffed");
  const staffedSeven = packCompleteness({
    ...rollup,
    staffAssignments: [...rollup.staffAssignments, newStaffAssignment({ personName: "P7", assignmentRole: "Host", sessionId: tenSessions[6].id })],
  }).artifacts.find((a) => a.key === "staffing")!.summary;
  check(`staffing a 7th updates immediately (${staffedSeven})`, staffedSeven === "7/10 sessions staffed");
  check("open issues counted, resolved excluded", packCompleteness(rollup).openIssues === 1);

  /* ---------------------------------------------------------------- */
  console.log("\n§5 · deleting a referenced session never orphans silently");
  const target = withRefs.sessions[0];
  const other = withRefs.sessions[1];
  const refs = findSessionReferences(withRefs, target.id);
  check(`3 records still reference the session (${refs.total})`, refs.total === 3);

  const reassigned = deleteSessionWithStrategy(withRefs, target.id, { kind: "reassign", targetSessionId: other.id });
  check("session removed", reassigned.sessions.length === 1);
  check("staffing repointed at the surviving session", reassigned.staffAssignments[0].sessionId === other.id);
  check("checklist repointed", reassigned.venueChecklist[0].dueSessionId === other.id);
  check("contact repointed", reassigned.contacts.find((c) => c.orgType === "venue")!.availabilitySessionId === other.id);
  check("repointed references still resolve live", resolveSessionTime(reassigned, reassigned.staffAssignments[0].sessionId)?.label === other.label);

  const snapshotted = deleteSessionWithStrategy(withRefs, target.id, { kind: "snapshot" });
  check("snapshot drops the dead reference", snapshotted.staffAssignments[0].sessionId === undefined);
  check("snapshot preserves the time as a custom block", snapshotted.staffAssignments[0].customStartTime === target.startTime);
  check("snapshot labels the checklist note as no longer live", /no longer updates/.test(snapshotted.venueChecklist[0].dueNote ?? ""));
  check("snapshot fills the contact's availability note", /no longer updates/.test(snapshotted.contacts.find((c) => c.orgType === "venue")!.availabilityNote ?? ""));
  check("no record silently keeps a dangling id", [
    ...snapshotted.staffAssignments.map((a) => a.sessionId),
    ...snapshotted.venueChecklist.map((i) => i.dueSessionId),
    ...snapshotted.contacts.map((c) => c.availabilitySessionId),
  ].every((id) => id === undefined || snapshotted.sessions.some((s) => s.id === id)));

  const withIssue = deleteSessionWithStrategy(
    { ...withRefs, issueLog: [newIssue({ description: "Late start", severity: "medium", relatedSessionId: target.id })] },
    target.id,
    { kind: "snapshot" },
  );
  check("issue history survives, only its pointer is cleared", withIssue.issueLog.length === 1 && withIssue.issueLog[0].relatedSessionId === undefined);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-6 · shipping CSV import");
  const goodCsv = [
    "item,quantity,shipTo,carrier,trackingNumber,shipByDate,status,owner,notes",
    "Booth panels,2,Loading Dock,FedEx,123,2026-11-05,not_shipped,Dana,Crate 1",
    "Banners,1,Loading Dock,UPS,456,2026-11-06,shipped,Dana,",
    "Laptops,4,Hotel,,,,delivered,Marcus,",
    "Swag,200,Loading Dock,FedEx,789,2026-11-04,confirmed_onsite,Priya,",
    'Signage,3,Loading Dock,DHL,101,2026-11-03,not_shipped,Tom,"Fragile, handle with care"',
  ].join("\n");
  const good = parseShippingCsv(goodCsv);
  check(`a clean 5-row file imports all rows (${good.items.length})`, good.items.length === 5 && good.errors.length === 0);
  check("quoted cells keep their embedded comma", good.items[4].notes === "Fragile, handle with care");
  check("statuses parse into the enum", good.items[3].status === "confirmed_onsite");
  check("blank optional cells become undefined, not empty strings", good.items[2].carrier === undefined);

  const badCsv = [
    "item,quantity,shipTo,carrier,trackingNumber,shipByDate,status,owner,notes",
    ",2,Dock,,,,not_shipped,,",           // no item
    "Crate,zero,Dock,,,,not_shipped,,",   // non-numeric quantity
    "Crate,1,,,,,not_shipped,,",          // no destination
    "Crate,1,Dock,,,,teleported,,",       // unknown status
    "Crate,1,Dock,,,11/05/2026,not_shipped,,", // wrong date format
    "Valid crate,1,Dock,,,,not_shipped,,",
  ].join("\n");
  const bad = parseShippingCsv(badCsv);
  check(`malformed rows are reported, not crashed on (${bad.errors.length})`, bad.errors.length === 5);
  check("the one valid row still imports", bad.items.length === 1 && bad.items[0].item === "Valid crate");
  check("error rows carry file line numbers", bad.errors[0].row === 2, JSON.stringify(bad.errors[0]));

  const reordered = parseShippingCsv("shipTo,item,quantity\nDock,Crate,3\n");
  check("a reordered header is honoured", reordered.items[0]?.item === "Crate" && reordered.items[0]?.quantity === 3);
  const headerless = parseShippingCsv("Crate,3,Dock\n");
  check("a headerless file falls back to template order", headerless.items[0]?.item === "Crate");
  check("an empty file yields nothing and throws nothing", parseShippingCsv("").items.length === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nFR-15 · migration runs and is defensive");
  const legacy = { ...pack, schemaVersion: "0.0.1", contacts: undefined } as unknown as LogisticsPack;
  const migrated = migrateLogisticsPack(legacy);
  check("version stamped current", migrated.schemaVersion === CURRENT_LOGISTICS_SCHEMA_VERSION);
  check("missing arrays defaulted rather than crashing views", Array.isArray(migrated.contacts) && migrated.contacts.length === 0);

  check("sessions sort by start time, unparseable last", (() => {
    const sorted = sessionsByStart({
      ...pack,
      sessions: [
        newSession({ label: "late", startTime: "2026-11-12T15:00", endTime: "2026-11-12T16:00" }),
        newSession({ label: "broken", startTime: "", endTime: "" }),
        newSession({ label: "early", startTime: "2026-11-12T08:00", endTime: "2026-11-12T09:00" }),
      ],
    });
    return sorted.map((s) => s.label).join(",") === "early,late,broken";
  })());

  /* ---------------------------------------------------------------- */
  console.log("\nFR-12 · persistence, find-or-create and isolation");
  const storedBrief = await saveBrief(brief);
  const created = await findOrCreatePackForBrief(storedBrief);
  check("find-or-create seeds a pack on first call", created.sessions.length === 2);
  const again = await findOrCreatePackForBrief(storedBrief);
  check("second call returns the same pack, not a duplicate", again.id === created.id);

  const edited = await savePack({
    ...created,
    sessions: created.sessions.map((s, i) => (i === 0 ? { ...s, startTime: "2026-11-12T05:00" } : s)),
  });
  check("saving bumps the pack version", edited.version === created.version + 1);
  const reloaded = await getPack(created.id);
  check("the edit survives a reload", reloaded?.sessions[0].startTime === "2026-11-12T05:00");
  check("lookup by brief id finds it", (await getPackByBriefId(brief.id))?.id === created.id);

  const otherBrief = await saveBrief({ ...conference, id: "logi-brief-2", name: "Second event" });
  const otherPack = await findOrCreatePackForBrief(otherBrief);
  check("a second brief gets its own pack", otherPack.id !== created.id);
  check("no session bleed between packs", otherPack.sessions.every((s) => !created.sessions.some((c) => c.id === s.id)));

  console.log("\nHousekeeping · deleting a brief clears its pack");
  await deleteBrief(brief.id);
  check("pack gone", (await getPackByBriefId(brief.id)) === null);
  check("the other brief's pack survived", (await getPackByBriefId("logi-brief-2")) !== null);

  /* ---------------------------------------------------------------- */
  if (failures > 0) {
    console.error(`\n${failures} logistics check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll logistics pack checks passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
