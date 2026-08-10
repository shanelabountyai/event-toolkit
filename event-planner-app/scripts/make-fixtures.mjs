/**
 * Regenerates the two worked example briefs in `fixtures/`.
 *
 * Kept as a script (rather than hand-edited JSON) so every `id` is a real UUID and the
 * milestone dates stay consistent with the event dates. Run with:
 *   node scripts/make-fixtures.mjs
 */

import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(root, "fixtures");
mkdirSync(fixturesDir, { recursive: true });

const metric = (m, target, unit, notes) => ({
  id: randomUUID(),
  metric: m,
  target,
  unit,
  actual: null,
  ...(notes ? { notes } : {}),
});

const risk = (r, likelihood, impact, mitigation, owner) => ({
  id: randomUUID(),
  risk: r,
  likelihood,
  impact,
  ...(mitigation ? { mitigation } : {}),
  ...(owner ? { owner } : {}),
  status: "open",
});

const milestone = (label, phase, targetDate, owner, notes) => ({
  id: randomUUID(),
  label,
  phase,
  targetDate,
  ...(owner ? { owner } : {}),
  status: "not_started",
  ...(notes ? { notes } : {}),
});

const stakeholder = (name, role, raci, department, email) => ({
  id: randomUUID(),
  name,
  role,
  raci,
  ...(email ? { email } : {}),
  ...(department ? { department } : {}),
});

const allocation = (category, plannedAmount, notes) => ({
  id: randomUUID(),
  category,
  plannedAmount,
  actualAmount: null,
  ...(notes ? { notes } : {}),
});

const conference = {
  schemaVersion: "1.0.0",
  id: randomUUID(),
  name: "Q4 Customer Summit 2026",
  type: "conference",
  status: "complete",
  version: 7,
  createdAt: "2026-05-04T16:12:03.000Z",
  updatedAt: "2026-05-29T21:40:11.000Z",
  createdBy: "Dana Rivera",
  goals: {
    primaryObjective:
      "Generate 150 qualified pipeline opportunities from 500 customer and prospect attendees, and give the platform team a public roadmap moment.",
    objectives: [
      "Recruit 10 customers willing to be named references or case studies",
      "Drive 40% of attendees into a hands-on product workshop",
      "Give regional sales 25 pre-booked executive meetings on site",
    ],
    businessJustification:
      "Renewals in the enterprise segment slipped 6 points last year, and win/loss interviews point to weak awareness of the platform roadmap among existing accounts. A single flagship in-person moment is the cheapest way to reach the top 200 accounts with both product depth and executive access before the FY27 planning cycle.",
  },
  audience: {
    description:
      "Existing enterprise customers and late-stage prospects across North America — platform practitioners plus the executive sponsors who own their budget. Roughly 70% customer, 30% prospect.",
    targetPersonas: [
      {
        name: "Practitioner attendee",
        title: "Platform Engineering Manager",
        description:
          "Runs the day-to-day implementation. Comes for hands-on sessions, migration guidance and peer conversations; strongly influences renewal but does not sign.",
        painPoints: [
          "Needs concrete migration guidance, not a product pitch",
          "Has to justify two days away from an on-call rotation",
        ],
      },
      {
        name: "Executive sponsor",
        title: "VP Engineering / CTO",
        description:
          "Attends the keynote and the executive track. Cares about roadmap credibility, benchmarks and peer conversation.",
        painPoints: [
          "Limited time on site — will skip anything that feels like a demo",
          "Wants evidence of business outcomes from comparable companies",
        ],
      },
    ],
    estimatedSize: 500,
    segments: ["existing customers", "late-stage prospects", "partners"],
  },
  budget: {
    totalBudget: 285000,
    currency: "USD",
    allocations: [
      allocation("Venue", 78000, "Moscone West, two days including move-in"),
      allocation("Catering", 52000, "Breakfast, lunch and one evening reception"),
      allocation("AV & production", 61000, "Main stage plus three breakout rooms"),
      allocation("Speaker fees & travel", 24000, "Two external keynotes"),
      allocation("Promotion", 32000, "Paid social, email and field outreach"),
      allocation("Swag & printed collateral", 14000),
      allocation("Staff travel & lodging", 21000, "14 staff, three nights"),
    ],
    notes:
      "High-level only — vendor-level detail and commitments are tracked in the Budget Builder. 8% contingency is held centrally and is not shown here.",
  },
  dates: {
    timezone: "America/Los_Angeles",
    eventStartDate: "2026-11-12",
    eventEndDate: "2026-11-13",
  },
  format: {
    deliveryMode: "in_person",
    venueOrPlatform: {
      name: "Moscone West",
      locationOrUrl: "800 Howard St, San Francisco, CA 94103",
      capacity: 600,
      notes: "Level 2 for the main stage, Level 3 for breakouts and the sponsor lounge.",
    },
  },
  stakeholders: [
    stakeholder("Dana Rivera", "Event Lead", "A", "Events", "dana.rivera@example.com"),
    stakeholder("Marcus Hale", "Marketing Ops", "R", "Marketing Ops", "marcus.hale@example.com"),
    stakeholder("Priya Nair", "Content & Speaker Manager", "R", "Product Marketing"),
    stakeholder("Tom Alvarez", "Regional Sales Director", "C", "Sales"),
    stakeholder("Erin Chao", "Executive Sponsor", "I", "Executive"),
  ],
  successMetrics: [
    metric("Registrations", 500, "count", "Total confirmed registrations by event day"),
    metric("Attendance rate", 70, "%", "Checked-in attendees ÷ registrations"),
    metric("Average session attendance", 120, "count", "Mean attendees per breakout session"),
    metric("Attendee NPS", 40, "score", "From the post-event survey"),
    metric("Pipeline influenced", 750000, "$", "Opportunity value touched within 90 days"),
    metric("Executive meetings booked", 25, "count", "Pre-booked 1:1s with target accounts"),
  ],
  riskRegister: [
    risk(
      "Registrations exceed venue capacity, or fall so far short the room looks empty",
      "medium",
      "high",
      "Hard cap registration at 540 (90% of fire-code capacity) and review pacing weekly from 8 weeks out; hold a waitlist.",
      "Dana Rivera",
    ),
    risk(
      "Keynote speaker cancels close to the event",
      "medium",
      "high",
      "Confirm speakers in writing by 14 Aug, keep two vetted backups warm, and pre-record a fallback session by 20 Oct.",
      "Priya Nair",
    ),
    risk(
      "Registration falls short of target because promotion starts too late",
      "medium",
      "high",
      "Lock the promo calendar before registration opens; mid-campaign checkpoint at 50% of target with $8k paid budget in reserve.",
      "Marcus Hale",
    ),
    risk(
      "AV or production failure during a main-stage session",
      "low",
      "high",
      "Full technical rehearsal on 11 Nov, redundant mics and laptops on site, named AV vendor contact on the run of show.",
      "Dana Rivera",
    ),
    risk(
      "Catering headcount mismatch",
      "medium",
      "medium",
      "Base the guarantee on a 72% historical check-in rate and confirm the final count on 29 Oct.",
    ),
  ],
  timeline: {
    milestones: [
      milestone("Venue contract signed", "pre_event", "2026-07-15", "Dana Rivera"),
      milestone("Speaker lineup confirmed", "pre_event", "2026-08-14", "Priya Nair"),
      milestone("Registration opens", "pre_event", "2026-09-13", "Marcus Hale"),
      milestone("Agenda published and promotion campaign live", "pre_event", "2026-09-28", "Marcus Hale"),
      milestone("Final headcount and catering guarantee to venue", "pre_event", "2026-10-29", "Dana Rivera"),
      milestone("Run of show finalised and AV rehearsal complete", "pre_event", "2026-11-10", "Dana Rivera"),
      milestone("Event day — registration desk opens", "during_event", "2026-11-12", "Dana Rivera"),
      milestone("Post-event survey sent to attendees", "post_event", "2026-11-15", "Marcus Hale"),
      milestone("Leads handed off to sales with follow-up owners", "post_event", "2026-11-18", "Tom Alvarez"),
      milestone("Retro complete and ROI report published", "post_event", "2026-12-04", "Dana Rivera"),
    ],
  },
  constraints: {
    items: [
      "Executive sponsor is only on site for the morning of day one",
      "No budget for a second evening event — reception is the only social moment",
      "Registration data must stay in the US region for enterprise customer contracts",
      "Book the AV vendor 90 days out — 60 was too late last year",
    ],
    notes:
      "Two competitor conferences fall in the same month; the date is fixed by the executive calendar and cannot move.",
  },
  carryForwardLessons: [
    {
      id: randomUUID(),
      sourceEventId: randomUUID(),
      category: "Vendor",
      lesson: "Book the AV vendor 90 days out — 60 was too late and cost us the preferred rate.",
      addedAt: "2026-01-19T15:02:44.000Z",
    },
    {
      id: randomUUID(),
      sourceEventId: randomUUID(),
      category: "Content",
      lesson:
        "Breakout rooms sized on registration interest, not room availability — two sessions turned people away last year.",
      addedAt: "2026-01-19T15:06:12.000Z",
    },
  ],
  exportHistory: [
    {
      id: randomUUID(),
      format: "markdown",
      generatedAt: "2026-05-29T21:41:02.000Z",
      filename: "q4-customer-summit-2026-brief.md",
    },
  ],
};

const webinar = {
  schemaVersion: "1.0.0",
  id: randomUUID(),
  name: "Marketing Ops Automation Webinar — June",
  type: "webinar",
  status: "draft",
  version: 3,
  createdAt: "2026-04-21T09:31:55.000Z",
  updatedAt: "2026-04-24T11:18:07.000Z",
  createdBy: "Dana Rivera",
  goals: {
    primaryObjective:
      "Generate 300 registrants and 50 sales-qualified leads from the mid-market marketing operations segment.",
    objectives: [
      "Produce three on-demand clips for the nurture sequence",
      "Test the new partner co-promotion motion on a low-risk event",
    ],
    businessJustification:
      "Mid-market pipeline is 22% below plan for the half and the segment responds better to practical tooling content than to product demos. A webinar is the cheapest repeatable format to test the co-promotion motion before committing to a field event.",
  },
  audience: {
    description:
      "Mid-market marketing operations leads and demand-gen managers evaluating automation tooling in the next two quarters, primarily in North America and the UK.",
    targetPersonas: [
      {
        name: "Hands-on evaluator",
        title: "Marketing Operations Manager",
        description:
          "Registers to learn whether the approach solves a live problem; will trade an email address for a practical walkthrough they can act on the same week.",
        painPoints: [
          "Has sat through too many webinars that were 45 minutes of product pitch",
          "Owns the tooling decision but has no budget authority",
        ],
      },
    ],
    estimatedSize: 300,
    segments: ["prospects", "existing customers", "partner audience"],
  },
  budget: {
    totalBudget: 12000,
    currency: "USD",
    allocations: [
      allocation("Platform & tooling", 2400, "Webinar platform seat and streaming overage"),
      allocation("Promotion", 6500, "Paid social plus partner list co-promotion"),
      allocation("Speaker fees", 1500, "External guest practitioner"),
      allocation("Production", 1600, "Editing the on-demand cut and three clips"),
    ],
    notes: "Partner covers half of the promotion spend against their own list.",
  },
  dates: {
    timezone: "America/New_York",
    eventStartDate: "2026-06-18",
    eventEndDate: "2026-06-18",
  },
  format: {
    deliveryMode: "virtual",
    venueOrPlatform: {
      name: "Zoom Webinar",
      locationOrUrl: "https://example.zoom.us/webinar/register/j/000000000",
      capacity: 1000,
      notes: "11:00–11:45 ET including 10 minutes of live Q&A.",
    },
  },
  stakeholders: [
    stakeholder("Dana Rivera", "Event Lead", "A", "Events", "dana.rivera@example.com"),
    stakeholder("Jules Okafor", "Demand Generation Manager", "R", "Marketing", "jules.okafor@example.com"),
    stakeholder("Sam Whitfield", "Presenter", "R", "Product Marketing"),
    stakeholder("Nina Petrova", "Sales Development Lead", "C", "Sales"),
  ],
  successMetrics: [
    metric("Registrations", 300, "count", "Total form completions before air date"),
    metric("Live attendance rate", 40, "%", "Live attendees ÷ registrations"),
    metric("Sales-qualified leads", 50, "count", "Accepted by sales within 14 days"),
    metric("On-demand views (first 30 days)", 150, "count"),
  ],
  riskRegister: [
    risk(
      "Registration volume falls short because the topic or promo list is too narrow",
      "medium",
      "high",
      "Confirm the combined list supports 300 at a 2.5% conversion rate before committing; add paid budget if pacing is behind at T-14.",
      "Jules Okafor",
    ),
    risk(
      "Webinar platform outage or streaming failure during the live session",
      "low",
      "high",
      "Dry run on the production account on 15 Jun, backup host assigned, pre-recorded cut ready, and a 'recording to follow' email drafted.",
      "Dana Rivera",
    ),
    risk(
      "Speaker cancels close to air date",
      "medium",
      "high",
      "Confirm in writing by 21 May, slides due 11 Jun, and Sam Whitfield rehearses as the internal backup.",
      "Sam Whitfield",
    ),
    risk(
      "High registration but low live attendance",
      "high",
      "medium",
      "Reminders at 1 week, 1 day and 15 minutes; calendar invite on registration; on-demand path promoted to no-shows within 48 hours.",
      "Jules Okafor",
    ),
  ],
  timeline: {
    milestones: [
      milestone("Topic, abstract and speaker confirmed", "pre_event", "2026-05-14", "Sam Whitfield"),
      milestone("Landing page live and registration opens", "pre_event", "2026-05-21", "Jules Okafor"),
      milestone("Promotion email 1 sent", "pre_event", "2026-05-28", "Jules Okafor"),
      milestone("Slides final and platform configured", "pre_event", "2026-06-11", "Sam Whitfield"),
      milestone("Dry run / technical check complete", "pre_event", "2026-06-15", "Dana Rivera"),
      milestone("24-hour reminder email sent", "pre_event", "2026-06-17", "Jules Okafor"),
      milestone("Live webinar broadcast", "during_event", "2026-06-18", "Dana Rivera"),
      milestone("Recording published and follow-up email sent", "post_event", "2026-06-20", "Jules Okafor"),
      milestone("Leads scored, routed to sales, and ROI report published", "post_event", "2026-07-02", "Nina Petrova"),
    ],
  },
  constraints: {
    items: [
      "Must air before the end of Q2 to count toward the half",
      "Partner co-promotion requires their brand review 10 days before launch",
      "No gated content beyond the registration form — legal signed off on one form only",
    ],
    notes: "Reuse the Q1 landing page template; no new design resource is available this quarter.",
  },
  carryForwardLessons: [
    {
      id: randomUUID(),
      sourceEventId: randomUUID(),
      category: "Promotion",
      lesson:
        "Send the 15-minute reminder — live attendance jumped 9 points the one time we did it.",
      addedAt: "2026-03-02T13:44:20.000Z",
    },
  ],
  exportHistory: [],
};

writeFileSync(
  join(fixturesDir, "conference-brief-example.json"),
  `${JSON.stringify(conference, null, 2)}\n`,
);
writeFileSync(
  join(fixturesDir, "webinar-brief-example.json"),
  `${JSON.stringify(webinar, null, 2)}\n`,
);

console.log("Wrote fixtures/conference-brief-example.json and fixtures/webinar-brief-example.json");
