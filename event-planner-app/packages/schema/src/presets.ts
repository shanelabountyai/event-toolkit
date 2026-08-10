/**
 * Event-type presets (FR-1).
 *
 * Each preset supplies real, opinionated starting content for an event type — success
 * metrics, risk register entries, timeline milestones, budget categories, suggested
 * stakeholder roles and a starter persona — so a planner never begins from zero. Every
 * default is a suggestion: all of it is editable and removable in the brief view (FR-5).
 *
 * Milestone target dates are expressed as day offsets against the event's start or end
 * date and materialised once the planner enters real dates during intake.
 */

import { addDaysToIsoDate, newId } from "./ids";
import type {
  BudgetAllocation,
  EventPhase,
  EventType,
  LikertLevel,
  Milestone,
  Persona,
  RaciRole,
  RiskItem,
  Stakeholder,
  SuccessMetric,
} from "./event-brief";

export interface PresetMetric {
  metric: string;
  target: number;
  unit?: string;
  notes?: string;
}

export interface PresetRisk {
  risk: string;
  likelihood: LikertLevel;
  impact: LikertLevel;
  mitigation?: string;
  owner?: string;
}

export interface PresetMilestone {
  label: string;
  phase: EventPhase;
  /** Days relative to `anchor`. Negative = before. */
  offsetDays: number;
  /** Which event date the offset is measured from. */
  anchor: "start" | "end";
  owner?: string;
  notes?: string;
}

export interface PresetStakeholder {
  role: string;
  raci: RaciRole;
  department?: string;
}

export interface EventPreset {
  type: EventType;
  label: string;
  /** One-line description shown on the preset chooser card (UX flow step 1). */
  tagline: string;
  /** Longer explanation of what this preset pre-fills. */
  description: string;
  primaryObjectivePlaceholder: string;
  audiencePlaceholder: string;
  successMetrics: PresetMetric[];
  risks: PresetRisk[];
  milestones: PresetMilestone[];
  budgetCategories: string[];
  stakeholders: PresetStakeholder[];
  personas: Persona[];
  /** Default delivery mode this event type usually takes. */
  defaultDeliveryMode: "in_person" | "virtual" | "hybrid";
}

const CONFERENCE: EventPreset = {
  type: "conference",
  label: "Conference",
  tagline:
    "Pre-fills metrics like registrations, attendance rate and NPS; risks like venue capacity and speaker no-shows.",
  description:
    "Multi-track or single-track conference with a registration funnel, a speaker lineup and an on-site production plan. Pre-fills 5 success metrics, 5 risks, a 10-milestone timeline from venue contract to post-event retro, 7 budget categories and a starter RACI roster.",
  primaryObjectivePlaceholder:
    "e.g. Generate 150 qualified pipeline opportunities from 500 customer and prospect attendees",
  audiencePlaceholder:
    "e.g. Existing enterprise customers and late-stage prospects in North America — practitioners plus their executive sponsors",
  defaultDeliveryMode: "in_person",
  successMetrics: [
    { metric: "Registrations", target: 500, unit: "count", notes: "Total confirmed registrations by event day" },
    { metric: "Attendance rate", target: 70, unit: "%", notes: "Checked-in attendees ÷ registrations" },
    { metric: "Average session attendance", target: 120, unit: "count", notes: "Mean attendees per breakout session" },
    { metric: "Attendee NPS", target: 40, unit: "score", notes: "From the post-event survey" },
    { metric: "Pipeline influenced", target: 750000, unit: "$", notes: "Opportunity value touched within 90 days" },
  ],
  risks: [
    {
      risk: "Registrations exceed venue capacity, or fall so far short the room looks empty",
      likelihood: "medium",
      impact: "high",
      mitigation:
        "Set a hard registration cap at 90% of fire-code capacity and review pacing weekly from 8 weeks out; hold a waitlist.",
    },
    {
      risk: "Keynote or headline speaker cancels close to the event",
      likelihood: "medium",
      impact: "high",
      mitigation:
        "Confirm speakers in writing 90 days out, keep two vetted backup speakers warm, and pre-record a fallback session.",
    },
    {
      risk: "Registration falls short of target because promotion starts too late",
      likelihood: "medium",
      impact: "high",
      mitigation:
        "Lock the promo calendar before registration opens; hold a mid-campaign checkpoint at 50% of target with paid budget in reserve.",
    },
    {
      risk: "AV or production failure during a main-stage session",
      likelihood: "low",
      impact: "high",
      mitigation:
        "Full technical rehearsal the day before, redundant mics and laptops on site, and a named AV vendor contact on the run of show.",
    },
    {
      risk: "Catering headcount mismatch (over- or under-ordering)",
      likelihood: "medium",
      impact: "medium",
      mitigation:
        "Base the guarantee on historical check-in rate (typically 70–75% of registrations) and confirm the final count 14 days out.",
    },
  ],
  milestones: [
    { label: "Venue contract signed", phase: "pre_event", offsetDays: -120, anchor: "start" },
    { label: "Speaker lineup confirmed", phase: "pre_event", offsetDays: -90, anchor: "start" },
    { label: "Registration opens", phase: "pre_event", offsetDays: -60, anchor: "start" },
    { label: "Agenda published and promotion campaign live", phase: "pre_event", offsetDays: -45, anchor: "start" },
    { label: "Final headcount and catering guarantee to venue", phase: "pre_event", offsetDays: -14, anchor: "start" },
    { label: "Run of show finalised and AV rehearsal complete", phase: "pre_event", offsetDays: -2, anchor: "start" },
    { label: "Event day — registration desk opens", phase: "during_event", offsetDays: 0, anchor: "start" },
    { label: "Post-event survey sent to attendees", phase: "post_event", offsetDays: 2, anchor: "end" },
    { label: "Leads handed off to sales with follow-up owners", phase: "post_event", offsetDays: 5, anchor: "end" },
    { label: "Retro complete and ROI report published", phase: "post_event", offsetDays: 21, anchor: "end" },
  ],
  budgetCategories: [
    "Venue",
    "Catering",
    "AV & production",
    "Speaker fees & travel",
    "Promotion",
    "Swag & printed collateral",
    "Staff travel & lodging",
  ],
  stakeholders: [
    { role: "Event Lead", raci: "A", department: "Events" },
    { role: "Marketing Ops", raci: "R", department: "Marketing Ops" },
    { role: "Content / Speaker Manager", raci: "R", department: "Product Marketing" },
    { role: "Sales Lead", raci: "C", department: "Sales" },
    { role: "Executive Sponsor", raci: "I", department: "Executive" },
  ],
  personas: [
    {
      name: "Practitioner attendee",
      title: "Manager / Senior IC in the buying team",
      description:
        "Attends for hands-on sessions and peer conversations; influences the purchase but rarely signs.",
      painPoints: [
        "Needs concrete implementation guidance, not a product pitch",
        "Has to justify two days away from the desk",
      ],
    },
    {
      name: "Executive sponsor",
      title: "VP / Director",
      description:
        "Attends the keynote and executive track; cares about strategy, benchmarks and peer credibility.",
      painPoints: ["Limited time on site", "Wants proof of business outcomes, not features"],
    },
  ],
};

const WEBINAR: EventPreset = {
  type: "webinar",
  label: "Webinar",
  tagline:
    "Pre-fills metrics like registrations, live attendance rate and SQLs; risks like low registration and platform failure.",
  description:
    "Single-session virtual event on a webinar platform with an email-driven promotion funnel. Pre-fills 4 success metrics, 4 risks, a 9-milestone timeline from topic lock to ROI report, 4 budget categories and a starter RACI roster.",
  primaryObjectivePlaceholder:
    "e.g. Generate 300 registrants and 50 sales-qualified leads from the mid-market segment",
  audiencePlaceholder:
    "e.g. Mid-market marketing operations leads evaluating automation tooling in the next two quarters",
  defaultDeliveryMode: "virtual",
  successMetrics: [
    { metric: "Registrations", target: 300, unit: "count", notes: "Total form completions before air date" },
    { metric: "Live attendance rate", target: 40, unit: "%", notes: "Live attendees ÷ registrations" },
    { metric: "Sales-qualified leads", target: 50, unit: "count", notes: "Accepted by sales within 14 days" },
    { metric: "On-demand views (first 30 days)", target: 150, unit: "count" },
  ],
  risks: [
    {
      risk: "Registration volume falls short because the topic or promo list is too narrow",
      likelihood: "medium",
      impact: "high",
      mitigation:
        "Confirm list size supports the target at a 2–3% conversion rate before committing; add a partner or paid channel if pacing is behind at T-14.",
    },
    {
      risk: "Webinar platform outage or streaming failure during the live session",
      likelihood: "low",
      impact: "high",
      mitigation:
        "Run a full dry run on the production account 3 days out, keep a backup host and a pre-recorded cut ready, and prepare a 'we'll email the recording' comms template.",
    },
    {
      risk: "Speaker cancels or is unavailable close to air date",
      likelihood: "medium",
      impact: "high",
      mitigation:
        "Confirm the speaker in writing 4 weeks out, share slides a week ahead, and name an internal backup presenter who has rehearsed the deck.",
    },
    {
      risk: "High registration but low live attendance (weak reminder sequence)",
      likelihood: "high",
      impact: "medium",
      mitigation:
        "Send reminders at 1 week, 1 day and 15 minutes; add a calendar invite on registration; promote the on-demand path for no-shows.",
    },
  ],
  milestones: [
    { label: "Topic, abstract and speaker confirmed", phase: "pre_event", offsetDays: -35, anchor: "start" },
    { label: "Landing page live and registration opens", phase: "pre_event", offsetDays: -28, anchor: "start" },
    { label: "Promotion email 1 sent", phase: "pre_event", offsetDays: -21, anchor: "start" },
    { label: "Slides final and platform configured", phase: "pre_event", offsetDays: -7, anchor: "start" },
    { label: "Dry run / technical check complete", phase: "pre_event", offsetDays: -3, anchor: "start" },
    { label: "24-hour reminder email sent", phase: "pre_event", offsetDays: -1, anchor: "start" },
    { label: "Live webinar broadcast", phase: "during_event", offsetDays: 0, anchor: "start" },
    { label: "Recording published and follow-up email sent", phase: "post_event", offsetDays: 2, anchor: "end" },
    { label: "Leads scored, routed to sales, and ROI report published", phase: "post_event", offsetDays: 14, anchor: "end" },
  ],
  budgetCategories: ["Platform & tooling", "Promotion", "Speaker fees", "Production"],
  stakeholders: [
    { role: "Event Lead", raci: "A", department: "Events" },
    { role: "Demand Generation Manager", raci: "R", department: "Marketing" },
    { role: "Presenter / Speaker", raci: "R", department: "Product Marketing" },
    { role: "Sales Development Lead", raci: "C", department: "Sales" },
    { role: "Executive Sponsor", raci: "I", department: "Executive" },
  ],
  personas: [
    {
      name: "Hands-on evaluator",
      title: "Marketing Operations Manager",
      description:
        "Registers to learn whether the approach solves a live problem; will trade an email address for a practical walkthrough.",
      painPoints: [
        "Sat through too many webinars that were 45 minutes of product pitch",
        "Needs something they can act on the same week",
      ],
    },
  ],
};

const TRADE_SHOW: EventPreset = {
  type: "trade_show",
  label: "Trade Show Booth",
  tagline:
    "Pre-fills metrics like badge scans, qualified leads and meetings booked; risks like low booth traffic and shipping delays.",
  description:
    "Booth presence at a third-party trade show, with pre-show outreach, on-site staffing and lead capture. Pre-fills 4 success metrics, 4 risks, a 10-milestone timeline from booth contract to ROI report, 6 budget categories and a starter RACI roster.",
  primaryObjectivePlaceholder:
    "e.g. Capture 120 qualified leads and book 25 meetings with target accounts attending the show",
  audiencePlaceholder:
    "e.g. Show attendees from target accounts in manufacturing and logistics who are actively evaluating vendors",
  defaultDeliveryMode: "in_person",
  successMetrics: [
    { metric: "Badge scans / booth visitors", target: 400, unit: "count" },
    { metric: "Qualified leads", target: 120, unit: "count", notes: "Meets the agreed qualification bar with sales" },
    { metric: "Meetings booked with target accounts", target: 25, unit: "count" },
    { metric: "Pipeline influenced", target: 500000, unit: "$", notes: "Opportunity value touched within 90 days" },
  ],
  risks: [
    {
      risk: "Low booth traffic because of poor floor position or weak pre-show outreach",
      likelihood: "medium",
      impact: "high",
      mitigation:
        "Book floor position early, run a pre-show meeting campaign to target accounts from T-21, and plan an in-booth draw (demo theatre or giveaway).",
    },
    {
      risk: "Booth materials or shipment delayed / damaged in transit",
      likelihood: "medium",
      impact: "high",
      mitigation:
        "Ship to the advance warehouse with a 5-day buffer, keep a printed backup graphic and tracking numbers with the on-site lead.",
    },
    {
      risk: "Insufficient booth staffing coverage during peak hours",
      likelihood: "medium",
      impact: "medium",
      mitigation:
        "Build a shift schedule with two staff minimum per slot, confirm travel 3 weeks out, and identify one local backup.",
    },
    {
      risk: "Lead capture fails (scanner not configured, or scans not exported before teardown)",
      likelihood: "low",
      impact: "high",
      mitigation:
        "Test the scanner on move-in day, export scans at the end of every show day, and keep a paper fallback form in the booth.",
    },
  ],
  milestones: [
    { label: "Booth space contracted and floor position confirmed", phase: "pre_event", offsetDays: -150, anchor: "start" },
    { label: "Booth design and messaging approved", phase: "pre_event", offsetDays: -75, anchor: "start" },
    { label: "Shipping and drayage booked", phase: "pre_event", offsetDays: -45, anchor: "start" },
    { label: "Booth staff schedule and training complete", phase: "pre_event", offsetDays: -21, anchor: "start" },
    { label: "Pre-show meeting outreach sent to target accounts", phase: "pre_event", offsetDays: -14, anchor: "start" },
    { label: "Booth setup / move-in complete", phase: "pre_event", offsetDays: -1, anchor: "start" },
    { label: "Show floor open — booth staffed", phase: "during_event", offsetDays: 0, anchor: "start" },
    { label: "Teardown and return shipping confirmed", phase: "post_event", offsetDays: 1, anchor: "end" },
    { label: "Scans deduped, uploaded and routed to sales owners", phase: "post_event", offsetDays: 3, anchor: "end" },
    { label: "Retro complete and ROI report published", phase: "post_event", offsetDays: 21, anchor: "end" },
  ],
  budgetCategories: [
    "Booth space",
    "Booth design & build",
    "Shipping & drayage",
    "Staff travel & lodging",
    "Swag & collateral",
    "Pre-show promotion",
  ],
  stakeholders: [
    { role: "Event Lead", raci: "A", department: "Events" },
    { role: "Field Marketing Manager", raci: "R", department: "Field Marketing" },
    { role: "Booth Staff Lead", raci: "R", department: "Sales" },
    { role: "Regional Sales Director", raci: "C", department: "Sales" },
    { role: "Executive Sponsor", raci: "I", department: "Executive" },
  ],
  personas: [
    {
      name: "Booth visitor — evaluating vendors",
      title: "Operations or IT decision influencer",
      description:
        "Walking the floor with a shortlist in mind; gives you 3 minutes to prove you are worth a follow-up meeting.",
      painPoints: [
        "Every booth claims the same differentiators",
        "No time on the floor for a long demo",
      ],
    },
  ],
};

const CUSTOM: EventPreset = {
  type: "custom",
  label: "Custom",
  tagline: "Start from a blank brief — no pre-filled metrics, risks or milestones.",
  description:
    "A blank structure with the same required fields and sections, but no preset defaults. Choose this for event types the three presets do not describe well.",
  primaryObjectivePlaceholder: "e.g. What is the single most important reason this event exists?",
  audiencePlaceholder: "e.g. Who is this event for, and what do they care about?",
  defaultDeliveryMode: "in_person",
  successMetrics: [],
  risks: [],
  milestones: [],
  budgetCategories: [],
  stakeholders: [],
  personas: [],
};

export const PRESETS: Record<EventType, EventPreset> = {
  conference: CONFERENCE,
  webinar: WEBINAR,
  trade_show: TRADE_SHOW,
  custom: CUSTOM,
};

/** All presets in the order shown on the preset chooser. */
export const PRESET_LIST: EventPreset[] = [CONFERENCE, WEBINAR, TRADE_SHOW, CUSTOM];

export function getPreset(type: EventType): EventPreset {
  return PRESETS[type] ?? CUSTOM;
}

/** Materialise the preset's success metrics with fresh UUIDs (FR-1). */
export function presetSuccessMetrics(type: EventType): SuccessMetric[] {
  return getPreset(type).successMetrics.map((m) => ({
    id: newId(),
    metric: m.metric,
    target: m.target,
    ...(m.unit ? { unit: m.unit } : {}),
    actual: null,
    ...(m.notes ? { notes: m.notes } : {}),
  }));
}

/** Materialise the preset's risk register with fresh UUIDs, all at status "open" (FR-1). */
export function presetRiskRegister(type: EventType): RiskItem[] {
  return getPreset(type).risks.map((r) => ({
    id: newId(),
    risk: r.risk,
    likelihood: r.likelihood,
    impact: r.impact,
    ...(r.mitigation ? { mitigation: r.mitigation } : {}),
    ...(r.owner ? { owner: r.owner } : {}),
    status: "open" as const,
  }));
}

/**
 * Materialise the preset's milestones against real event dates (FR-1/FR-4).
 * Returns `[]` when no start date is known yet — the intake wizard calls this again as soon
 * as the planner enters dates on the Event Basics step.
 */
export function presetMilestones(
  type: EventType,
  eventStartDate: string,
  eventEndDate?: string,
): Milestone[] {
  if (!eventStartDate) return [];
  const end = eventEndDate || eventStartDate;
  return getPreset(type).milestones.map((m) => ({
    id: newId(),
    label: m.label,
    phase: m.phase,
    targetDate: addDaysToIsoDate(m.anchor === "end" ? end : eventStartDate, m.offsetDays),
    ...(m.owner ? { owner: m.owner } : {}),
    status: "not_started" as const,
    ...(m.notes ? { notes: m.notes } : {}),
  }));
}

/** Materialise the preset's budget categories as zero-amount allocations the planner fills in. */
export function presetBudgetAllocations(type: EventType): BudgetAllocation[] {
  return getPreset(type).budgetCategories.map((category) => ({
    id: newId(),
    category,
    plannedAmount: 0,
    actualAmount: null,
  }));
}

/**
 * Materialise the preset's suggested RACI roster as starter rows with an empty `name` for
 * the planner to fill in or delete (UX flow step 6). Rows left with an empty name are
 * pruned before validation/generation — see `pruneEmptyRows()` in `defaults.ts`.
 */
export function presetStakeholders(type: EventType): Stakeholder[] {
  return getPreset(type).stakeholders.map((s) => ({
    id: newId(),
    name: "",
    role: s.role,
    raci: s.raci,
    ...(s.department ? { department: s.department } : {}),
  }));
}

/** Materialise the preset's starter personas. */
export function presetPersonas(type: EventType): Persona[] {
  return getPreset(type).personas.map((p) => ({
    ...p,
    painPoints: p.painPoints ? [...p.painPoints] : [],
  }));
}
