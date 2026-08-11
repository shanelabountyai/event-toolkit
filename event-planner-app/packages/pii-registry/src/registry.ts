// packages/pii-registry/src/registry.ts
//
// PRD 10 §3 — where personal data lives, described as data.
//
// Subject search, export and deletion are implemented **once** against this description rather
// than seven times, once per tool. That is not tidiness: hand-writing the same traversal seven
// times means missing one, and the one missed is a whole category of personal data that is
// invisible to every privacy operation the product offers. When PRD 11 adds an eighth tool it
// adds a row here, not three more code paths.
//
// `scripts/pii-check.ts` fails the build if a sync kind appears in neither this registry nor the
// NO_PII allowlist below. Forgetting is the failure mode this file exists to make impossible.

import { SYNC_KINDS } from "@event-toolkit/sync-engine";

export type Sensitivity =
  /** A colleague or vendor acting in a professional capacity. */
  | "business_contact"
  /**
   * Somebody who never asked to be in this system — an attendee whose badge was scanned, a
   * survey respondent. This is the classification with a legal consequence attached.
   */
  | "third_party_personal";

export interface PiiLocation {
  /** The sync `kind` from PRD 9, so the two descriptions of the same data cannot drift. */
  kind: string;
  /** Dotted paths to email fields — what subject search matches on. */
  emailPaths: string[];
  /** Dotted paths to every other personal field, for export and redaction. */
  personalPaths: string[];
  sensitivity: Sensitivity;
  /**
   * What deletion does.
   *
   * `record` removes the whole row — correct when the record *is* about a person.
   * `fields` blanks the personal paths and keeps the row — correct when the record is about
   * something else and merely names someone. Deleting a pipeline opportunity because a contact
   * asked to be forgotten would destroy the revenue figure the whole ROI report rests on.
   */
  eraseStrategy: "record" | "fields";
  /** Subject to the retention policy (FR-4). Briefs, budgets and retros are not. */
  retained: boolean;
  /** Shown in subject-search results so an admin can see what they are looking at. */
  label: string;
}

export const PII_REGISTRY: PiiLocation[] = [
  {
    kind: "leadRecords",
    label: "Attendee lead record",
    emailPaths: ["contact.email"],
    personalPaths: [
      "contact.firstName",
      "contact.lastName",
      "contact.fullName",
      "contact.phone",
      "contact.company",
      "contact.jobTitle",
      "signals",
    ],
    sensitivity: "third_party_personal",
    eraseStrategy: "record",
    retained: true,
  },
  {
    kind: "surveyResponses",
    label: "Survey response",
    emailPaths: ["respondentEmail"],
    // Free text can contain literally anything, including opinions about named staff, so the
    // comment is treated as personal data regardless of what any given one happens to say.
    personalPaths: ["respondentId", "comment"],
    sensitivity: "third_party_personal",
    eraseStrategy: "record",
    retained: true,
  },
  {
    kind: "pipelineOpportunities",
    label: "Pipeline opportunity",
    emailPaths: ["contactEmail"],
    personalPaths: ["contactName"],
    // The record is about a deal, not a person. Keep the deal and its amount; drop the person.
    sensitivity: "third_party_personal",
    eraseStrategy: "fields",
    retained: true,
  },
  {
    kind: "logisticsPack.contact",
    label: "On-site contact",
    emailPaths: ["email"],
    personalPaths: ["name", "phone"],
    sensitivity: "business_contact",
    eraseStrategy: "record",
    retained: false,
  },
  {
    kind: "briefs",
    label: "Event brief stakeholder",
    emailPaths: ["stakeholders[].email"],
    personalPaths: ["stakeholders[].name"],
    // The brief is about an event. A stakeholder leaving must not delete the event.
    sensitivity: "business_contact",
    eraseStrategy: "fields",
    retained: false,
  },
  {
    kind: "budgetLineItems",
    label: "Budget line item vendor",
    emailPaths: [],
    personalPaths: ["vendor"],
    sensitivity: "business_contact",
    eraseStrategy: "fields",
    retained: false,
  },
];

/**
 * Sync kinds that hold no personal data, listed explicitly.
 *
 * An allowlist rather than a default: "this kind is not in the registry" and "somebody forgot to
 * add this kind to the registry" look identical from the outside, and only one of them is safe.
 * Adding a kind here is a claim someone has to make on purpose.
 */
export const NO_PII: string[] = [
  "promoAssetSets",
  "pacingEntries",
  "pacingConfigs",
  "logisticsPack",
  "logisticsPack.session",
  "logisticsPack.staff",
  "logisticsPack.shipping",
  "logisticsPack.checklist",
  // Issue text is written by staff about equipment and rooms, not about attendees.
  "logisticsPack.issue",
  "budgetSettings",
  "triageSessions",
  "importBatches",
  "scoringRubrics",
  // Templates are drafted *for* people, not *about* them; the recipient lives on the lead record.
  "followUpTemplates",
  // Pairs of lead ids and a similarity score. The people themselves are in leadRecords.
  "duplicateCandidates",
  "roiReports",
  "attributionSettings",
  "pipelineImportBatches",
  "surveyImportBatches",
  "retros",
];

const BY_KIND = new Map(PII_REGISTRY.map((l) => [l.kind, l]));

export function piiLocation(kind: string): PiiLocation | undefined {
  return BY_KIND.get(kind);
}

/** Locations holding data about people who never opted in. PRD 10 FR-6 logs every read of these. */
export function thirdPartyKinds(): string[] {
  return PII_REGISTRY.filter((l) => l.sensitivity === "third_party_personal").map((l) => l.kind);
}

/** Locations the retention purge applies to (FR-4). */
export function retainedKinds(): string[] {
  return PII_REGISTRY.filter((l) => l.retained).map((l) => l.kind);
}

/**
 * Every sync kind that is described by neither the registry nor the allowlist.
 *
 * The single highest-value thing in PRD 10: a new tool that forgets to register fails the build
 * rather than silently leaking a category of data out of every privacy operation.
 */
export function unregisteredKinds(): string[] {
  const described = new Set([...BY_KIND.keys(), ...NO_PII]);
  return SYNC_KINDS.map((k) => k.kind).filter((k) => !described.has(k));
}
