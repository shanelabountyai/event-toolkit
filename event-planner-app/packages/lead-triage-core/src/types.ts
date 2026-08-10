// packages/lead-triage-core/src/types.ts
//
// PRD 5 (Lead Triage & Follow-Up Engine) domain types.
//
// This package holds personal data — names, emails, phone numbers of real attendees. It never
// leaves the browser: no network calls, no enrichment, no CRM write-back. The only way data
// exits is a file the planner explicitly exports.
//
// `eventBriefId` is a *soft* reference. This tool is strictly read-only against EventBrief in
// v1, so nothing here can be used to write one back.

export type TriageSessionStatus = "importing" | "triaging" | "routed" | "archived";
export type LeadStatus = "new" | "routed" | "draft_ready" | "contacted" | "closed";
export type LeadTier = "hot" | "warm" | "cold";
export type ScoringSignal =
  | "sessionsAttended"
  | "boothInteractions"
  | "demoRequested"
  | "personaTitleMatch"
  | "customSignal";
export type AssignmentMethod = "column_mapped" | "round_robin" | "manual";
export type TemplateVariant = "in_person" | "virtual" | "hybrid" | "generic";

export interface TriageSession {
  id: string;
  /** Soft reference to `EventBrief.id` — never a hard FK, never written back to. */
  eventBriefId: string | null;
  eventName: string;
  /** ISO datetime — anchors the 24-48 hour success metric. */
  eventClosedAt: string;
  status: TriageSessionStatus;
  /** Sales owners configured for this session, used by round-robin assignment. */
  owners: SessionOwner[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionOwner {
  id: string;
  name: string;
  email?: string;
}

export type LeadField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "company"
  | "jobTitle"
  | "phone"
  | "sessionsAttended"
  | "sessionsAttendedCount"
  | "boothInteractions"
  | "demoRequested"
  | "registrationStatus"
  | "owner";

export interface ColumnMapping {
  sourceColumn: string;
  targetField: LeadField | "customSignal" | "ignore";
  customSignalKey?: string;
  confidence: "auto" | "manual";
}

export interface ImportBatch {
  id: string;
  triageSessionId: string;
  filename: string;
  sourceType?: "badge_scan" | "registrant_list" | "demo_requests" | "other";
  columnMapping: ColumnMapping[];
  rowCount: number;
  importedAt: string;
}

export interface LeadContact {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
}

export interface LeadSignals {
  sessionsAttended: string[];
  sessionsAttendedCount: number;
  boothInteractions: number;
  demoRequested: boolean;
  registrationStatus?: "registered" | "attended" | "no_show";
  customSignals?: Record<string, string | number | boolean>;
}

export interface ScoreBreakdownEntry {
  ruleId: string;
  label: string;
  points: number;
}

export interface FollowUpDraft {
  templateId: string;
  subject: string;
  body: string;
  generatedAt: string;
  editedAt?: string;
  /** True once the planner has changed the copy — regeneration must not clobber it. */
  edited: boolean;
}

export interface LeadRecord {
  id: string;
  triageSessionId: string;
  dedupeKey: string;
  contact: LeadContact;
  signals: LeadSignals;
  score: number;
  scoreBreakdown: ScoreBreakdownEntry[];
  tier: LeadTier;
  ownerId: string | null;
  ownerName: string | null;
  assignmentMethod: AssignmentMethod | null;
  status: LeadStatus;
  followUpDraft: FollowUpDraft | null;
  sourceRows: { importBatchId: string; rowIndex: number }[];
  mergedFrom?: string[];
  /**
   * Fields where an auto-merge found two different non-empty values. Never silently resolved —
   * the planner picks a winner in merge review.
   */
  conflicts?: FieldConflict[];
  createdAt: string;
  updatedAt: string;
}

export interface FieldConflict {
  field: keyof LeadContact;
  kept: string;
  discarded: string;
}

export interface ScoringRule {
  id: string;
  signal: ScoringSignal;
  label: string;
  pointsPerUnit?: number;
  cap?: number;
  flatPoints?: number;
  customSignalKey?: string;
  enabled: boolean;
}

export interface ScoringRubric {
  id: string;
  triageSessionId: string;
  rules: ScoringRule[];
  tierThresholds: { hot: number; warm: number };
  updatedAt: string;
}

export interface FollowUpTemplate {
  id: string;
  triageSessionId: string;
  tier: LeadTier | "all";
  deliveryModeVariant: TemplateVariant;
  subjectTemplate: string;
  bodyTemplate: string;
  updatedAt: string;
}

/** A possible-duplicate pair awaiting the planner's decision. Fuzzy matches never auto-merge. */
export interface DuplicateCandidate {
  id: string;
  triageSessionId: string;
  leadAId: string;
  leadBId: string;
  /** 0-1 combined name + company similarity. */
  similarity: number;
  reason: string;
  status: "pending" | "merged" | "rejected";
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

export const LEAD_TIER_LABELS: Record<LeadTier, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export const LEAD_TIERS: LeadTier[] = ["hot", "warm", "cold"];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  routed: "Routed",
  draft_ready: "Draft ready",
  contacted: "Contacted",
  closed: "Closed",
};

export const LEAD_STATUSES: LeadStatus[] = ["new", "routed", "draft_ready", "contacted", "closed"];

export const LEAD_FIELD_LABELS: Record<LeadField | "customSignal" | "ignore", string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name",
  email: "Email",
  company: "Company",
  jobTitle: "Job title",
  phone: "Phone",
  sessionsAttended: "Sessions attended (list)",
  sessionsAttendedCount: "Sessions attended (count)",
  boothInteractions: "Booth interactions",
  demoRequested: "Demo requested",
  registrationStatus: "Registration status",
  owner: "Owner",
  customSignal: "Custom signal",
  ignore: "Ignore this column",
};

export const LEAD_FIELDS: Array<LeadField | "customSignal" | "ignore"> = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "company",
  "jobTitle",
  "phone",
  "sessionsAttended",
  "sessionsAttendedCount",
  "boothInteractions",
  "demoRequested",
  "registrationStatus",
  "owner",
  "customSignal",
  "ignore",
];

export const TRIAGE_STATUS_LABELS: Record<TriageSessionStatus, string> = {
  importing: "Importing",
  triaging: "Triaging",
  routed: "Routed",
  archived: "Archived",
};
