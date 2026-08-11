// packages/sync-engine/src/kinds.ts
//
// PRD 9 §2 — what a syncable unit *is*.
//
// The load-bearing decision in this file: `LogisticsPack` syncs at sub-document granularity, and
// nothing else does.
//
// It is the only genuinely multi-user document in the suite. On event day a planner edits the run
// of show, a coordinator ticks the checklist and on-site staff log issues — simultaneously,
// often offline, all into one record. Record-level optimistic concurrency would make the
// highest-value multi-user scenario the most broken one: every person conflicting with every
// other, constantly, over parts of the document they never touched.
//
// So at the sync boundary only, the pack's six arrays explode into one record per item. **The
// document shape the UI sees never changes** — `getPack()` still returns a whole `LogisticsPack`,
// and no tool knows this file exists.

import type {
  ChecklistItem,
  IssueLogEntry,
  LogisticsPack,
  OnSiteContact,
  Session,
  ShippingManifestItem,
  StaffAssignment,
} from "@event-toolkit/logistics";

export interface SyncKind {
  kind: string;
  /** The IndexedDB store this kind lives in locally. */
  store: string;
  /**
   * Union rather than conflict when two people edit against a stale base.
   *
   * Two coordinators logging different issues offline must both keep theirs. Losing one is
   * unacceptable; a duplicate is merely untidy. That asymmetry is the whole justification.
   */
  appendOnly: boolean;
}

/** The six arrays inside a pack, and the kind each explodes into. */
export const PACK_ITEM_KINDS = {
  "logisticsPack.session": "sessions",
  "logisticsPack.staff": "staffAssignments",
  "logisticsPack.shipping": "shippingItems",
  "logisticsPack.checklist": "venueChecklist",
  "logisticsPack.contact": "contacts",
  "logisticsPack.issue": "issueLog",
} as const satisfies Record<string, keyof LogisticsPack>;

export type PackItemKind = keyof typeof PACK_ITEM_KINDS;

type PackItem =
  | Session
  | StaffAssignment
  | ShippingManifestItem
  | ChecklistItem
  | OnSiteContact
  | IssueLogEntry;

export const SYNC_KINDS: SyncKind[] = [
  { kind: "briefs", store: "briefs", appendOnly: false },
  { kind: "promoAssetSets", store: "promoAssetSets", appendOnly: false },
  { kind: "pacingEntries", store: "pacingEntries", appendOnly: true },
  { kind: "pacingConfigs", store: "pacingConfigs", appendOnly: false },

  // Scalars only — the arrays live in the six kinds below.
  { kind: "logisticsPack", store: "logisticsPacks", appendOnly: false },
  { kind: "logisticsPack.session", store: "logisticsPacks", appendOnly: false },
  { kind: "logisticsPack.staff", store: "logisticsPacks", appendOnly: false },
  { kind: "logisticsPack.shipping", store: "logisticsPacks", appendOnly: false },
  { kind: "logisticsPack.checklist", store: "logisticsPacks", appendOnly: false },
  { kind: "logisticsPack.contact", store: "logisticsPacks", appendOnly: false },
  { kind: "logisticsPack.issue", store: "logisticsPacks", appendOnly: true },

  { kind: "budgetLineItems", store: "budgetLineItems", appendOnly: false },
  { kind: "budgetSettings", store: "budgetSettings", appendOnly: false },

  { kind: "triageSessions", store: "triageSessions", appendOnly: false },
  { kind: "importBatches", store: "importBatches", appendOnly: true },
  { kind: "leadRecords", store: "leadRecords", appendOnly: true },
  { kind: "scoringRubrics", store: "scoringRubrics", appendOnly: false },
  { kind: "followUpTemplates", store: "followUpTemplates", appendOnly: false },
  { kind: "duplicateCandidates", store: "duplicateCandidates", appendOnly: false },

  { kind: "roiReports", store: "roiReports", appendOnly: false },
  { kind: "attributionSettings", store: "attributionSettings", appendOnly: false },
  { kind: "pipelineOpportunities", store: "pipelineOpportunities", appendOnly: true },
  { kind: "pipelineImportBatches", store: "pipelineImportBatches", appendOnly: true },
  { kind: "surveyResponses", store: "surveyResponses", appendOnly: true },
  { kind: "surveyImportBatches", store: "surveyImportBatches", appendOnly: true },

  { kind: "retros", store: "retros", appendOnly: false },
];

const BY_KIND = new Map(SYNC_KINDS.map((k) => [k.kind, k]));

export function syncKind(kind: string): SyncKind | undefined {
  return BY_KIND.get(kind);
}

/** Unknown kinds are not append-only: the safe default is to surface a conflict, not to merge. */
export function isAppendOnly(kind: string): boolean {
  return BY_KIND.get(kind)?.appendOnly ?? false;
}

/* -------------------------------------------------------------------------- */
/* Explode / reassemble                                                        */
/* -------------------------------------------------------------------------- */

export interface ExplodedRecord {
  kind: string;
  documentId: string;
  document: unknown;
}

/** The pack minus its six arrays — what kind `logisticsPack` actually stores. */
export type PackScalars = Omit<
  LogisticsPack,
  "sessions" | "staffAssignments" | "shippingItems" | "venueChecklist" | "contacts" | "issueLog"
>;

/**
 * One pack in → one scalar record plus one record per item.
 *
 * Item records carry `packId` so reassembly needs no separate index, and so a record pulled on
 * its own knows where it belongs.
 */
export function explodePack(pack: LogisticsPack): ExplodedRecord[] {
  const {
    sessions,
    staffAssignments,
    shippingItems,
    venueChecklist,
    contacts,
    issueLog,
    ...scalars
  } = pack;

  const out: ExplodedRecord[] = [
    { kind: "logisticsPack", documentId: pack.id, document: scalars satisfies PackScalars },
  ];

  for (const [kind, field] of Object.entries(PACK_ITEM_KINDS) as [PackItemKind, keyof LogisticsPack][]) {
    for (const item of (pack[field] ?? []) as PackItem[]) {
      out.push({ kind, documentId: item.id, document: { ...item, packId: pack.id } });
    }
  }

  return out;
}

/**
 * Item records back into a whole pack.
 *
 * Order is preserved from the incoming record list rather than re-sorted here: `packages/logistics`
 * owns what order a run of show is displayed in, and duplicating that rule at the sync boundary is
 * how the two quietly disagree.
 */
export function reassemblePack(
  scalars: PackScalars,
  items: ExplodedRecord[],
): LogisticsPack {
  const pack = {
    ...scalars,
    sessions: [],
    staffAssignments: [],
    shippingItems: [],
    venueChecklist: [],
    contacts: [],
    issueLog: [],
  } as unknown as LogisticsPack;

  for (const record of items) {
    const field = PACK_ITEM_KINDS[record.kind as PackItemKind];
    if (!field) continue;
    const { packId: _packId, ...item } = record.document as Record<string, unknown>;
    // Items belonging to another pack are ignored rather than merged in — a mis-keyed record
    // must not silently graft one event's run of show onto another's.
    if (_packId !== undefined && _packId !== scalars.id) continue;
    (pack[field] as unknown[]).push(item);
  }

  return pack;
}
