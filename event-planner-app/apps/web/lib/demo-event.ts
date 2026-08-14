// apps/web/lib/demo-event.ts
//
// One click, one fully-populated event.
//
// Without this, the first thing anyone sees is an empty list and a form. The suite's whole claim
// is that seven tools share one event and feed each other, and that claim is invisible until there
// is an event to look at.
//
// Deliberately seeds only the **brief and its budget**. Every other tool builds itself from the
// brief on first visit — logistics seeds a run of show from the milestones, the budget shell comes
// from the brief's allocations, the retro reads the issue log and the ROI scorecard. Seeding those
// directly would be writing a second, parallel version of the propagation this demo exists to
// show, and the two would drift.

import { createEmptyBrief, type BudgetLineItem, type EventBrief } from "@event-toolkit/schema";
import { roundMoney } from "@event-toolkit/budget-calc";
import { listBriefs, saveBriefRaw, saveLineItems, saveBudgetSettings } from "@event-toolkit/local-store";

export const DEMO_BRIEF_ID = "demo-northgate-summit";

/**
 * A trade-show booth, because it is the case the product handles least generically: the company is
 * exhibiting at somebody else's conference, which changes the promo voice, and the numbers are big
 * enough that budget variance and ROI attribution have something to say.
 */
function demoBrief(): EventBrief {
  const base = createEmptyBrief("trade_show");

  return {
    ...base,
    id: DEMO_BRIEF_ID,
    name: "Northgate Manufacturing Summit 2026",
    status: "in_planning",
    goals: {
      primaryObjective:
        "Capture 60 qualified leads and influence $900,000 of pipeline from mid-market manufacturers",
      objectives: [
        "Book 15 on-site meetings with named target accounts",
        "Fill the Room 24A speaking session to 80% of its 150 seats",
      ],
      businessJustification:
        "Northgate is where our three largest competitors exhibit. Not being there reads as absence.",
    },
    audience: {
      description: "Operations and plant leaders at mid-market manufacturers, 200–2,000 employees",
      estimatedSize: 3200,
      // The two attendee-facing fields. Everything under `goals` above is internal and never
      // reaches generated copy — see packages/schema/src/promo-kit-templates.ts.
      attendeeValue: {
        promise: "See what three plants did to cut changeover time by half, with the numbers",
        takeaways: [
          "A benchmark of your changeover times against comparable plants",
          "A teardown of a retrofit that paid back in 14 months",
          "A one-page checklist for scoping your own line upgrade",
        ],
      },
      targetPersonas: [
        { id: "p-1", name: "Plant operations director", title: "Director of Manufacturing Operations" },
        { id: "p-2", name: "Automation engineering lead", title: "Automation Engineering Manager" },
      ],
      segments: ["Existing customers", "Competitive displacement targets"],
    },
    format: {
      ...base.format,
      deliveryMode: "in_person",
      participationRole: "exhibitor",
      venueOrPlatform: { name: "San Diego Convention Center", locationOrUrl: "San Diego, CA" },
    },
    dates: {
      ...base.dates,
      eventStartDate: "2026-05-12",
      eventEndDate: "2026-05-13",
      timezone: "America/Los_Angeles",
    },
    stakeholders: [
      { id: "s-1", name: "Sam Reyes", role: "Field Marketing Lead", raci: "accountable", email: "sam@example.com" },
      { id: "s-2", name: "Dana Okoro", role: "Demand Generation", raci: "responsible", email: "dana@example.com" },
      { id: "s-3", name: "Priya Raman", role: "Sales Director", raci: "consulted", email: "priya@example.com" },
      { id: "s-4", name: "Alex Whitfield", role: "VP Marketing", raci: "informed", email: "alex@example.com" },
    ],
    successMetrics: [
      { id: "m-1", name: "Qualified leads", target: 60, unit: "count", actual: null },
      { id: "m-2", name: "Influenced pipeline", target: 900000, unit: "currency", actual: null },
      { id: "m-3", name: "On-site meetings booked", target: 15, unit: "count", actual: null },
      // Named so the pacing tool can find it — it keys on "registration" in the metric name.
      { id: "m-4", name: "Happy hour registrations", target: 120, unit: "count", actual: null },
    ],
  } as unknown as EventBrief;
}

/** A budget with deliberate variance: one category well over, one under. */
function demoLineItems(): BudgetLineItem[] {
  const rows: Array<[string, string, string, number, number, number]> = [
    ["Booth space rental", "venue", "Northgate Events Ltd", 42000, 42000, 42000],
    ["Booth design & build", "production", "Bright Stage Productions", 32000, 34600, 34600],
    ["Booth AV & lighting", "production", "Moscone West AV", 5600, 6280, 6280],
    ["Freight & drayage", "logistics", "Ridgeway Freight", 8400, 11900, 11900],
    ["Lead retrieval licences", "technology", "Northgate Events Ltd", 2400, 2400, 2400],
    ["Sponsored happy hour", "catering", "Cedar & Vine Hospitality", 18500, 19750, 19750],
    ["Staff travel & hotel", "travel", "Corporate Travel Desk", 21000, 19200, 19200],
    ["Print & collateral", "content", "Snapprint", 3600, 2950, 2950],
    ["Promotional items", "content", "OnPoint Swag", 6500, 5330, 5330],
    ["Speaking slot fee", "sponsorship", "Northgate Events Ltd", 5000, 5000, 5000],
  ];

  return rows.map(([lineItemName, category, vendor, budgeted, committed, actual], i) => ({
    id: `demo-line-${i + 1}`,
    eventBriefId: DEMO_BRIEF_ID,
    briefId: DEMO_BRIEF_ID,
    lineItemName,
    category,
    vendor,
    budgetedAmount: roundMoney(budgeted),
    committedAmount: roundMoney(committed),
    actualAmount: roundMoney(actual),
    status: actual > 0 ? "reconciled" : "planned",
    notes: "",
  })) as unknown as BudgetLineItem[];
}

export async function demoEventExists(): Promise<boolean> {
  return (await listBriefs()).some((b) => b.id === DEMO_BRIEF_ID);
}

/**
 * Write the demo event.
 *
 * `saveBriefRaw` rather than `saveBrief`, so the fixture keeps its stated `updatedAt` and revision
 * rather than looking like it was authored this second.
 */
export async function loadDemoEvent(): Promise<string> {
  await saveBriefRaw(demoBrief());
  await saveLineItems(demoLineItems());
  await saveBudgetSettings({
    eventBriefId: DEMO_BRIEF_ID,
    currency: "USD",
    varianceAmberPct: 10,
    contingencyPct: 5,
  } as never);
  return DEMO_BRIEF_ID;
}
