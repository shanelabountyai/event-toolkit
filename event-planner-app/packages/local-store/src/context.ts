// packages/local-store/src/context.ts
//
// PRD 8 §7 — how seven tools become workspace-aware without any of them changing.
//
// The whole of this package was documented from the start as "the deliberate seam a future
// backend/sync layer replaces without touching any tool's UI code". This file is that promise
// being collected on: every tool keeps calling `getBrief`, `saveLineItems`, `listLeads` exactly
// as it does today, and the difference between local-only and workspace mode lives here.
//
// **Local-only mode is the default and stays a real product.** A planner who never signs in gets
// today's behaviour precisely: IndexedDB, no network, no account, no permission checks. That was
// a deliberate feature — zero-onboarding — not a stage on the way to requiring an account.

import { can, type Capability, type Role, type Tool } from "@event-toolkit/access";

export interface StoreContext {
  mode: "local" | "workspace";
  workspaceId?: string;
  userId?: string;
  /** The signed-in user's role in `workspaceId`. Null means "member of no workspace". */
  role?: Role | null;
}

const LOCAL: StoreContext = { mode: "local" };

let current: StoreContext = LOCAL;

/** Called when the workspace connection changes, so the open database handle can be dropped. */
type ChangeListener = () => void;
const listeners = new Set<ChangeListener>();

export function onStoreContextChange(fn: ChangeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStoreContext(): StoreContext {
  return current;
}

export function setStoreContext(ctx: StoreContext): void {
  const previous = current;
  current = ctx.mode === "local" ? LOCAL : { ...ctx };

  // Switching workspace switches database (see `databaseName`), so the cached connection to the
  // old one has to go. Leaving it open is how workspace B's writes land in workspace A.
  if (previous.mode !== current.mode || previous.workspaceId !== current.workspaceId) {
    for (const fn of listeners) fn();
  }
}

/** Test and sign-out helper. */
export function resetStoreContext(): void {
  setStoreContext(LOCAL);
}

/**
 * One IndexedDB database per workspace, rather than one database with namespaced keys.
 *
 * Namespacing keys would mean rewriting every key and every index across twenty-two stores, and
 * one missed index scan leaks another workspace's data. A separate database cannot leak by
 * construction, and it is a single line here instead of a change in every repository.
 */
export function databaseName(base: string): string {
  const ctx = current;
  return ctx.mode === "workspace" && ctx.workspaceId ? `${base}:${ctx.workspaceId}` : base;
}

/* -------------------------------------------------------------------------- */
/* Which permission governs which store                                        */
/* -------------------------------------------------------------------------- */

/**
 * Store name → the tool whose capability governs it.
 *
 * Two entries are deliberately not filed under the tool whose screen displays them:
 *
 *   `surveyResponses` and `pipelineOpportunities` are read by the ROI report, but they hold
 *   third-party personal data — survey free text can contain anything, including opinions about
 *   named people, and a pipeline row carries a contact's name and email. PRD 8 FR-5 says
 *   `leads:view` gates *all* attendee personal data, and PRD 10 classifies both of these as
 *   `third_party_personal`. So the capability follows the data, not the route: a Finance user
 *   sees the ROI scorecard and its aggregates, and does not see the rows behind them.
 *
 * Getting this table wrong is the leak this whole package exists to prevent, so it is exhaustive
 * and `workspace-store-check` fails if a store is missing from it.
 */
export const STORE_TOOLS: Record<string, Tool> = {
  briefs: "brief",
  intakeProgress: "brief",

  promoAssetSets: "promo",
  pacingEntries: "promo",
  pacingConfigs: "promo",

  logisticsPacks: "logistics",

  budgetLineItems: "budget",
  budgetSettings: "budget",

  triageSessions: "leads",
  importBatches: "leads",
  leadRecords: "leads",
  scoringRubrics: "leads",
  followUpTemplates: "leads",
  duplicateCandidates: "leads",

  roiReports: "roi",
  attributionSettings: "roi",
  pipelineImportBatches: "roi",
  surveyImportBatches: "roi",
  // Personal data — gated by `leads`, not `roi`. See the note above.
  surveyResponses: "leads",
  pipelineOpportunities: "leads",

  retros: "retro",
};

/**
 * Per-device diagnostics the planner generates about their own use of the app. Not workspace
 * data, and gating it would break the app for a role that can legitimately use it.
 */
export const UNGATED_STORES = new Set([
  "usageEvents",
  // The outbox holds the user's own pending writes across every kind. Permission was already
  // checked when each edit was made; gating the queue itself would mean a Coordinator could not
  // flush their own logistics edits because the same queue also holds a brief edit they may not
  // make. The queue is plumbing, not data.
  "outbox",
]);

export type StoreVerb = "read" | "write";

export function capabilityForStore(store: string, verb: StoreVerb): Capability | null {
  if (UNGATED_STORES.has(store)) return null;
  const tool = STORE_TOOLS[store];
  if (!tool) {
    // Unknown store in workspace mode: deny by refusing to name a capability nobody holds.
    // A new store added without a line in STORE_TOOLS must fail loudly, not default to open.
    return "workspace:delete";
  }
  return `${tool}:${verb === "write" ? "edit" : "view"}` as Capability;
}

export class LocalStorePermissionError extends Error {
  readonly store: string;
  readonly capability: Capability;
  constructor(store: string, capability: Capability) {
    super(
      `Not permitted: ${capability}. Your role in this workspace does not give you access to ${store}.`,
    );
    this.name = "LocalStorePermissionError";
    this.store = store;
    this.capability = capability;
  }
}

/**
 * The assertion the guarded database applies before every read and write.
 *
 * **A no-op in local mode**, which is not a loophole: with no workspace there is no one to be
 * separated from, and the data never left this browser.
 */
export function assertStoreAccess(store: string, verb: StoreVerb): void {
  const ctx = current;
  if (ctx.mode !== "workspace") return;

  const capability = capabilityForStore(store, verb);
  if (capability === null) return;

  const allowed = can(
    { userId: ctx.userId ?? "", workspaceId: ctx.workspaceId ?? "", role: ctx.role ?? null },
    capability,
  );
  if (!allowed) throw new LocalStorePermissionError(store, capability);
}
