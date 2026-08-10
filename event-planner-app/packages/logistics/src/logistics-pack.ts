// packages/logistics/src/logistics-pack.ts
//
// PRD 3 (Run-of-Show / Logistics Pack) domain types.
//
// The whole tool rests on one rule, enforced by these types: a session's time, label and
// location exist in exactly one place — `sessions[]`. Every other record that needs to know
// "when" or "where" holds a *reference* (`sessionId`, `dueSessionId`, `availabilitySessionId`,
// `relatedSessionId`), never a copy. That is what makes "edit once, everything updates" true
// by construction rather than by remembering to sync.
//
// Like packages/schema: pure TypeScript, no React, no DOM.

export const CURRENT_LOGISTICS_SCHEMA_VERSION = "1.0.0";

export type SessionType = "session" | "break" | "setup" | "teardown" | "other";
export type ShippingStatus = "not_shipped" | "shipped" | "delivered" | "confirmed_onsite";
export type ChecklistStatus = "todo" | "in_progress" | "done" | "blocked";
export type ContactOrgType = "internal" | "vendor" | "venue";
export type IssueSeverity = "low" | "medium" | "high";
export type IssueStatus = "open" | "resolved";
export type RelatedArtifact =
  | "run_of_show"
  | "staffing"
  | "shipping"
  | "checklist"
  | "contacts"
  | "other";

export interface Session {
  id: string;
  label: string;
  /** ISO 8601 datetime, interpreted in the linked EventBrief's `dates.timezone`. */
  startTime: string;
  endTime: string;
  location?: string;
  owner?: string;
  type: SessionType;
  notes?: string;
}

export interface StaffAssignment {
  id: string;
  personName: string;
  /** FK into `sessions[]` — THE canonical time source when present. */
  sessionId?: string;
  /** Only used when `sessionId` is absent. Independent by design; a session edit must not touch it. */
  customStartTime?: string;
  customEndTime?: string;
  assignmentRole: string;
  notes?: string;
}

export interface ShippingManifestItem {
  id: string;
  item: string;
  quantity: number;
  shipTo: string;
  carrier?: string;
  trackingNumber?: string;
  /** ISO date. */
  shipByDate?: string;
  status: ShippingStatus;
  owner?: string;
  notes?: string;
}

export interface ChecklistItem {
  id: string;
  /** Free text. The UI suggests defaults but deliberately does not lock an enum. */
  category: string;
  item: string;
  status: ChecklistStatus;
  owner?: string;
  dueSessionId?: string;
  dueNote?: string;
  notes?: string;
}

export interface OnSiteContact {
  id: string;
  name: string;
  role: string;
  orgType: ContactOrgType;
  phone?: string;
  email?: string;
  availabilitySessionId?: string;
  availabilityNote?: string;
  notes?: string;
}

export interface IssueLogEntry {
  id: string;
  timestamp: string;
  loggedBy?: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  relatedArtifact?: RelatedArtifact;
  relatedSessionId?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
}

export interface LogisticsPack {
  schemaVersion: string;
  id: string;
  /** FK into `EventBrief.id`. */
  eventBriefId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  sessions: Session[];
  staffAssignments: StaffAssignment[];
  shippingItems: ShippingManifestItem[];
  venueChecklist: ChecklistItem[];
  contacts: OnSiteContact[];
  issueLog: IssueLogEntry[];
}

/* -------------------------------------------------------------------------- */
/* Labels — shared by every view so wording never drifts between them          */
/* -------------------------------------------------------------------------- */

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  session: "Session",
  break: "Break",
  setup: "Setup",
  teardown: "Teardown",
  other: "Other",
};

export const SHIPPING_STATUS_LABELS: Record<ShippingStatus, string> = {
  not_shipped: "Not shipped",
  shipped: "Shipped",
  delivered: "Delivered",
  confirmed_onsite: "Confirmed on site",
};

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

export const CONTACT_ORG_TYPE_LABELS: Record<ContactOrgType, string> = {
  internal: "Internal team",
  vendor: "Vendor",
  venue: "Venue",
};

export const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const ARTIFACT_LABELS: Record<RelatedArtifact, string> = {
  run_of_show: "Run of show",
  staffing: "Staffing",
  shipping: "Shipping",
  checklist: "Venue checklist",
  contacts: "Contacts",
  other: "Other",
};

export const SESSION_TYPES: SessionType[] = ["session", "break", "setup", "teardown", "other"];
export const SHIPPING_STATUSES: ShippingStatus[] = [
  "not_shipped",
  "shipped",
  "delivered",
  "confirmed_onsite",
];
export const CHECKLIST_STATUSES: ChecklistStatus[] = ["todo", "in_progress", "done", "blocked"];
export const CONTACT_ORG_TYPES: ContactOrgType[] = ["internal", "vendor", "venue"];
export const ISSUE_SEVERITIES: IssueSeverity[] = ["low", "medium", "high"];

/** Suggested checklist categories. Suggestions only — `category` stays free text. */
export const SUGGESTED_CHECKLIST_CATEGORIES = [
  "Setup",
  "AV/Tech",
  "Signage",
  "Catering",
  "Teardown",
  "Other",
];

/** Print sections, in the fixed order the full-pack print view concatenates them. */
export const PRINT_ARTIFACTS = [
  "run-of-show",
  "staffing",
  "shipping",
  "checklist",
  "contacts",
  "issues",
] as const;

export type PrintArtifact = (typeof PRINT_ARTIFACTS)[number];

export const PRINT_ARTIFACT_LABELS: Record<PrintArtifact, string> = {
  "run-of-show": "Run of show",
  staffing: "Staffing",
  shipping: "Shipping manifest",
  checklist: "Venue checklist",
  contacts: "On-site contacts",
  issues: "Issue log",
};
