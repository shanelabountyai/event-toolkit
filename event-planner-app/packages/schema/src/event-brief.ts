// packages/schema/src/event-brief.ts
//
// Canonical Event Brief types — the data spine of the Event Planner Productivity Suite.
// This file is the TypeScript source of truth; `event-brief.schema.json` is its JSON Schema
// twin and `event-brief-schema.md` is the human-readable field-by-field reference
// (including PRD read/write ownership and the versioning policy).
//
// This module MUST stay free of React/Next/DOM dependencies — every tool package in the
// suite depends on it.

/** Semver version of the schema documents produced by this package. */
export const CURRENT_SCHEMA_VERSION = "1.2.0";

/** Event-type preset selected during intake. */
export type EventType = "conference" | "webinar" | "trade_show" | "custom";

/** Lifecycle state of the brief document itself (not the event). Self-declared; no approval workflow in v1. */
export type BriefStatus = "draft" | "complete";

/** How the event is delivered. */
export type FormatMode = "in_person" | "virtual" | "hybrid";

/** Responsible / Accountable / Consulted / Informed. One value per person for the event as a whole. */
export type RaciRole = "R" | "A" | "C" | "I";

/** Three-point Likert scale used for risk likelihood and impact. */
export type LikertLevel = "low" | "medium" | "high";

/** Risk lifecycle. PRD 1 only ever writes "open"; PRD 3/PRD 7 transition it. */
export type RiskStatus = "open" | "mitigated" | "occurred" | "closed";

/** Which phase of the event lifecycle a milestone belongs to. */
export type EventPhase = "pre_event" | "during_event" | "post_event";

/** Milestone lifecycle. PRD 1 only ever writes "not_started"; PRD 3 transitions it. */
export type MilestoneStatus = "not_started" | "in_progress" | "done" | "at_risk";

/** Export formats recorded in `EventBrief.exportHistory`. v1 implements markdown + html. */
export type ExportFormat = "markdown" | "pdf" | "docx" | "html";

/** A target-audience persona the event is designed for. */
export interface Persona {
  /** Persona label, e.g. "VP of Marketing, Mid-Market SaaS." */
  name: string;
  /** Job title/role this persona represents. */
  title?: string;
  /** Free-text description. */
  description?: string;
  /** Problems this persona has that the event addresses. */
  painPoints?: string[];
}

/** Why the event exists. */
export interface Goals {
  /** The single most important reason this event exists. Required. */
  primaryObjective: string;
  /** Secondary objectives supporting the primary one. */
  objectives?: string[];
  /** Why this event, why now, tie to broader company/marketing goals. */
  businessJustification?: string;
}

/**
 * Whether this company is running the event or turning up to somebody else's.
 *
 * The distinction is invisible in the rest of the brief and decisive for anything customer-facing:
 * an exhibitor cannot write "registration closes this week" or "we're running this", because they
 * control neither. Promo copy generated without it addressed a trade-show booth brief in the voice
 * of the conference organiser.
 */
export type ParticipationRole = "host" | "exhibitor" | "sponsor" | "speaker";

/**
 * What the *attendee* gets — the only fields in this brief written in their language.
 *
 * Everything under `Goals` is internal: revenue targets, lead counts, pipeline. Those must never
 * reach customer-facing copy, and before this existed the promo templates had nothing else to draw
 * on, so they rendered "capture 60 qualified leads and influence $900K of pipeline" as the reason
 * a prospect should come to the booth.
 */
export interface AttendeeValue {
  /** One sentence, in the attendee's language, on why this is worth their time. */
  promise?: string;
  /** What they leave with. Rendered as the "what you'll get" bullets in promo copy. */
  takeaways?: string[];
}

/** Who the event is for. */
export interface Audience {
  /** Free-text summary of the target audience. Required. */
  description: string;
  /** Repeatable persona cards. */
  targetPersonas?: Persona[];
  /** Planner's estimate of headcount/attendees at brief time. */
  estimatedSize?: number;
  /** Named audience segments, e.g. "existing customers", "prospects". */
  segments?: string[];
  /**
   * The attendee-facing promise. Optional, and when absent the promo generator emits a visible
   * placeholder rather than substituting an internal objective.
   */
  attendeeValue?: AttendeeValue;
}

/** A high-level planned budget category. PRD 4 owns detailed vendor-level budgets. */
export interface BudgetAllocation {
  id: string;
  /** e.g. "Venue", "Catering", "AV". Free text in v1 (not an enum). */
  category: string;
  /** Planned spend for this category. */
  plannedAmount: number;
  /** Actual spend — written by PRD 4 (Budget & Vendor Tracker), never by PRD 1. */
  actualAmount?: number | null;
  notes?: string;
}

/** High-level budget shell. Detailed budgets live in PRD 4. */
export interface Budget {
  /** Total planned budget. Omit if not yet known at brief time. */
  totalBudget?: number;
  /** ISO 4217 code. Required, defaults to "USD". */
  currency: string;
  allocations?: BudgetAllocation[];
  notes?: string;
}

/** When the event happens. Milestones live in `Timeline`, deliberately not duplicated here. */
export interface Dates {
  /** IANA tz name, e.g. "America/New_York". */
  timezone: string;
  /** ISO 8601 date, YYYY-MM-DD. */
  eventStartDate: string;
  /** ISO 8601 date. Equal to `eventStartDate` for single-day events. */
  eventEndDate: string;
}

/** Venue (in-person/hybrid) or platform (virtual/hybrid) details. Intentionally shallow in v1. */
export interface VenueOrPlatform {
  /** Venue name or platform name, e.g. "Moscone Center", "Zoom Webinar". */
  name?: string;
  /** Physical address or platform URL. */
  locationOrUrl?: string;
  capacity?: number;
  notes?: string;
}

/** How the event is delivered, and where. */
export interface Format {
  deliveryMode: FormatMode;
  venueOrPlatform?: VenueOrPlatform;
  /**
   * Host by default. `trade_show` defaults to `exhibitor`, because a booth brief is almost always
   * somebody else's conference — see `createEmptyBrief`.
   */
  participationRole?: ParticipationRole;
}

/** A person with a stake in the event, plus their overall RACI designation. */
export interface Stakeholder {
  id: string;
  name: string;
  /** Title/function, e.g. "Field Marketing Manager". */
  role: string;
  raci: RaciRole;
  email?: string;
  department?: string;
}

/** A measurable definition of success, defined at brief time; `actual` is filled in post-event. */
export interface SuccessMetric {
  id: string;
  /** e.g. "Registrations", "MQLs generated", "NPS". */
  metric: string;
  target: number;
  /** e.g. "count", "%", "$", "score". */
  unit?: string;
  /** Written by PRD 6 / PRD 7, never by PRD 1. */
  actual?: number | null;
  notes?: string;
}

/** An entry in the event's risk register. */
export interface RiskItem {
  id: string;
  risk: string;
  likelihood: LikertLevel;
  impact: LikertLevel;
  mitigation?: string;
  /** Free text in v1 (not a foreign key into `stakeholders`). */
  owner?: string;
  /** Defaults to "open". Transitioned by PRD 3 / PRD 7. */
  status: RiskStatus;
}

/** A high-level milestone on the event timeline. */
export interface Milestone {
  id: string;
  /** e.g. "Venue contract signed", "Invitations sent". */
  label: string;
  phase: EventPhase;
  /** ISO 8601 date, YYYY-MM-DD. */
  targetDate: string;
  /** Free-text name; MAY match a `stakeholders[].name`. */
  owner?: string;
  /** Defaults to "not_started". Transitioned by PRD 3. */
  status: MilestoneStatus;
  notes?: string;
}

/**
 * Flat list of milestones spanning all phases. The brief document groups/renders them by
 * `phase` — one list, so "key milestones" and "high-level timeline" can never drift apart.
 */
export interface Timeline {
  milestones: Milestone[];
}

/** Things that limit how the event can be planned or run. */
export interface Constraints {
  items?: string[];
  notes?: string;
}

/**
 * What to do with a lesson next time.
 *
 * repeat — this worked, keep doing it exactly as-is.
 * fix    — worth keeping, but something specific about execution needs to change.
 * drop   — don't repeat this in its current form; structural problem, not a tuning problem.
 */
export type LessonDisposition = "repeat" | "fix" | "drop";

/**
 * A lesson learned from a *previous* event. Written by PRD 7 (Post-Mortem Generator) and
 * read by PRD 1 during intake to suggest constraints for the next brief (FR-11).
 */
export interface LessonLearned {
  id: string;
  /** `id` of the brief this lesson originated from, if applicable. */
  sourceEventId?: string;
  /** e.g. "Budget", "Vendor", "Logistics", "Content". */
  category?: string;
  /** The lesson, written as an actionable statement. */
  lesson: string;
  /** ISO 8601 datetime. */
  addedAt: string;
  /** Added in 1.1.0. Optional, so documents written before it still validate. */
  disposition?: LessonDisposition;
  /** Added in 1.1.0. Where the lesson came from, for traceability. */
  sourceType?: "issue_log" | "budget_variance" | "roi_scorecard" | "manual";
}

/** Lightweight audit trail entry for a generated export. */
export interface ExportRecord {
  id: string;
  format: ExportFormat;
  /** ISO 8601 datetime. */
  generatedAt: string;
  filename?: string;
}

/** The canonical Event Brief document. */
export interface EventBrief {
  /** Semver, e.g. "1.0.0". Used for migration on load. */
  schemaVersion: string;
  /** UUID. Primary key used by every other tool to associate its data with this event. */
  id: string;
  name: string;
  type: EventType;
  status: BriefStatus;
  /** Monotonically increasing revision counter for this brief document. Increments on save. */
  version: number;
  /** ISO 8601 datetime. */
  createdAt: string;
  /** ISO 8601 datetime. */
  updatedAt: string;
  /** Free-text name/email of the planner. No auth system in v1. */
  createdBy?: string;
  goals: Goals;
  audience: Audience;
  budget: Budget;
  dates: Dates;
  format: Format;
  stakeholders: Stakeholder[];
  successMetrics: SuccessMetric[];
  riskRegister: RiskItem[];
  timeline: Timeline;
  constraints: Constraints;
  /** Written by PRD 7, read here at intake (FR-11). PRD 1 never writes this in normal use. */
  carryForwardLessons: LessonLearned[];
  exportHistory?: ExportRecord[];
}

/** Human-readable labels for each event type, used by preset pickers and badges. */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  conference: "Conference",
  webinar: "Webinar",
  trade_show: "Trade Show Booth",
  custom: "Custom",
};

export const DELIVERY_MODE_LABELS: Record<FormatMode, string> = {
  in_person: "In person",
  virtual: "Virtual",
  hybrid: "Hybrid",
};

export const RACI_LABELS: Record<RaciRole, string> = {
  R: "Responsible",
  A: "Accountable",
  C: "Consulted",
  I: "Informed",
};

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  open: "Open",
  mitigated: "Mitigated",
  occurred: "Occurred",
  closed: "Closed",
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  at_risk: "At risk",
};

export const EVENT_PHASE_LABELS: Record<EventPhase, string> = {
  pre_event: "Pre-event",
  during_event: "During event",
  post_event: "Post-event",
};

export const EVENT_TYPES: EventType[] = ["conference", "webinar", "trade_show", "custom"];
export const DELIVERY_MODES: FormatMode[] = ["in_person", "virtual", "hybrid"];
export const RACI_ROLES: RaciRole[] = ["R", "A", "C", "I"];
export const LIKERT_LEVELS: LikertLevel[] = ["low", "medium", "high"];
export const RISK_STATUSES: RiskStatus[] = ["open", "mitigated", "occurred", "closed"];
export const EVENT_PHASES: EventPhase[] = ["pre_event", "during_event", "post_event"];
export const MILESTONE_STATUSES: MilestoneStatus[] = [
  "not_started",
  "in_progress",
  "done",
  "at_risk",
];
