/**
 * IndexedDB setup for the Event Planner Productivity Suite.
 *
 * This file (and its siblings in this package) are the ONLY place in the monorepo that
 * touch IndexedDB. Every tool reads and writes through the repository functions so a
 * future backend can be swapped in by re-implementing this package's interface.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  EventBrief,
  PacingConfig,
  PacingEntry,
  PromoAssetSet,
} from "@event-toolkit/schema";
import type { LogisticsPack } from "@event-toolkit/logistics";
import type {
  DuplicateCandidate,
  FollowUpTemplate,
  ImportBatch,
  LeadRecord,
  ScoringRubric,
  TriageSession,
} from "@event-toolkit/lead-triage-core";
import type {
  AttributionSettings,
  PipelineImportBatch,
  PipelineOpportunity,
  RoiReport,
  SurveyImportBatch,
  SurveyResponse,
} from "@event-toolkit/roi-report-core";
import type { BudgetLineItem, BudgetSettings } from "@event-toolkit/schema";

export const DB_NAME = "event-toolkit";
/**
 * v2 adds the PRD 2 (Promo Campaign Kit) stores, v3 the PRD 3 (Logistics Pack) store, and
 * v4 the PRD 4 (Budget Builder) stores, v5 the PRD 5 (Lead Triage) stores and v6 the
 * PRD 6 (ROI Report) stores.
 * Every upgrade so far is purely additive — no data migration, and each `createObjectStore`
 * is guarded so a database at any earlier version upgrades in place.
 */
export const DB_VERSION = 6;

export const STORE_BRIEFS = "briefs";
export const STORE_USAGE_EVENTS = "usageEvents";
export const STORE_INTAKE_PROGRESS = "intakeProgress";
export const STORE_PROMO_ASSET_SETS = "promoAssetSets";
export const STORE_PACING_ENTRIES = "pacingEntries";
export const STORE_PACING_CONFIGS = "pacingConfigs";
export const STORE_LOGISTICS_PACKS = "logisticsPacks";
export const STORE_BUDGET_LINE_ITEMS = "budgetLineItems";
export const STORE_BUDGET_SETTINGS = "budgetSettings";
export const STORE_TRIAGE_SESSIONS = "triageSessions";
export const STORE_IMPORT_BATCHES = "importBatches";
export const STORE_LEAD_RECORDS = "leadRecords";
export const STORE_SCORING_RUBRICS = "scoringRubrics";
export const STORE_FOLLOWUP_TEMPLATES = "followUpTemplates";
export const STORE_DUPLICATE_CANDIDATES = "duplicateCandidates";
export const STORE_ROI_REPORTS = "roiReports";
export const STORE_PIPELINE_OPPORTUNITIES = "pipelineOpportunities";
export const STORE_PIPELINE_IMPORT_BATCHES = "pipelineImportBatches";
export const STORE_SURVEY_RESPONSES = "surveyResponses";
export const STORE_SURVEY_IMPORT_BATCHES = "surveyImportBatches";
export const STORE_ATTRIBUTION_SETTINGS = "attributionSettings";

/** Where the intake wizard left off, so a closed tab resumes on the right step (FR-6). */
export interface IntakeProgress {
  briefId: string;
  /** Zero-based index of the wizard screen (0-5 = the six intake steps, 6 = review). */
  stepIndex: number;
  /** Carry-forward lesson ids the planner dismissed (FR-11). */
  dismissedLessonIds: string[];
  /** True once the brief has been generated from intake. */
  generated: boolean;
  updatedAt: string;
}

/** An append-only local analytics row (FR-13). */
export interface UsageEvent {
  id: string;
  /** ISO 8601 datetime. */
  timestamp: string;
  type: UsageEventType;
  briefId?: string;
  briefName?: string;
  /** Free-form extra columns flattened into the CSV export. */
  details?: Record<string, string | number | null>;
}

export type UsageEventType =
  | "brief_created"
  | "brief_marked_complete"
  | "brief_marked_draft"
  | "export_triggered"
  | "tool_launch_from_brief"
  | "tool_opened_direct"
  // PRD 4 (FR-12)
  | "budget_generated"
  | "import_performed"
  | "reforecast_triggered"
  | "reforecast_completed"
  | "reforecast_dismissed"
  | "budget_reconciled"
  | "variance_flag_first_triggered"
  // PRD 5 (FR-12)
  | "triage_session_created"
  | "lead_import_completed"
  | "dedupe_resolved"
  | "rubric_edited"
  | "assignment_run"
  | "drafts_generated"
  | "session_routed"
  // PRD 6 (FR-15)
  | "roi_report_created"
  | "pipeline_imported"
  | "survey_imported"
  | "attribution_settings_changed"
  | "yoy_comparator_selected"
  | "scorecard_computed"
  | "report_finalized"
  | "report_reverted_to_draft"
  | "success_metrics_written";

interface EventToolkitDB extends DBSchema {
  [STORE_BRIEFS]: {
    key: string;
    value: EventBrief;
    indexes: { updatedAt: string; type: string; status: string };
  };
  [STORE_USAGE_EVENTS]: {
    key: string;
    value: UsageEvent;
    indexes: { timestamp: string; type: string };
  };
  [STORE_INTAKE_PROGRESS]: {
    key: string;
    value: IntakeProgress;
  };
  /** One promo asset set per brief; overwritten wholesale on regenerate (PRD 2). */
  [STORE_PROMO_ASSET_SETS]: {
    key: string;
    value: PromoAssetSet;
  };
  [STORE_PACING_ENTRIES]: {
    key: string;
    value: PacingEntry;
    indexes: { eventBriefId: string };
  };
  /**
   * Pacing config, one record per brief.
   *
   * PRD 2's handoff names two new stores; this is a third, because `PacingConfig` has to
   * survive a reload and neither of the other two is a sane home for it (asset sets are
   * replaced wholesale on regenerate, which would drop the planner's curve choice).
   */
  [STORE_PACING_CONFIGS]: {
    key: string;
    value: PacingConfig;
  };
  /** One logistics pack per brief in practice, but keyed by its own id and indexed on the brief. */
  [STORE_LOGISTICS_PACKS]: {
    key: string;
    value: LogisticsPack;
    indexes: { eventBriefId: string };
  };
  [STORE_BUDGET_LINE_ITEMS]: {
    key: string;
    value: BudgetLineItem;
    indexes: { eventBriefId: string };
  };
  /** One settings record per brief — the budget's own key. */
  [STORE_BUDGET_SETTINGS]: {
    key: string;
    value: BudgetSettings;
  };
  /**
   * PRD 5 stores. These hold attendees' personal data, so they live in the same local-only
   * database as everything else — nothing here is ever synced anywhere.
   */
  [STORE_TRIAGE_SESSIONS]: {
    key: string;
    value: TriageSession;
    indexes: { eventBriefId: string };
  };
  [STORE_IMPORT_BATCHES]: {
    key: string;
    value: ImportBatch;
    indexes: { triageSessionId: string };
  };
  [STORE_LEAD_RECORDS]: {
    key: string;
    value: LeadRecord;
    indexes: { triageSessionId: string; dedupeKey: string; ownerId: string };
  };
  [STORE_SCORING_RUBRICS]: {
    key: string;
    value: ScoringRubric;
    indexes: { triageSessionId: string };
  };
  [STORE_FOLLOWUP_TEMPLATES]: {
    key: string;
    value: FollowUpTemplate;
    indexes: { triageSessionId: string };
  };
  [STORE_DUPLICATE_CANDIDATES]: {
    key: string;
    value: DuplicateCandidate;
    indexes: { triageSessionId: string };
  };
  /** PRD 6 stores. One report per brief is enforced at the repository layer. */
  [STORE_ROI_REPORTS]: {
    key: string;
    value: RoiReport;
    indexes: { eventBriefId: string };
  };
  [STORE_PIPELINE_OPPORTUNITIES]: {
    key: string;
    value: PipelineOpportunity;
    indexes: { roiReportId: string; recordId: string };
  };
  [STORE_PIPELINE_IMPORT_BATCHES]: {
    key: string;
    value: PipelineImportBatch;
    indexes: { roiReportId: string };
  };
  [STORE_SURVEY_RESPONSES]: {
    key: string;
    value: SurveyResponse;
    indexes: { roiReportId: string };
  };
  [STORE_SURVEY_IMPORT_BATCHES]: {
    key: string;
    value: SurveyImportBatch;
    indexes: { roiReportId: string };
  };
  /** Exactly one row in v1, id "default". */
  [STORE_ATTRIBUTION_SETTINGS]: {
    key: string;
    value: AttributionSettings;
  };
}

let dbPromise: Promise<IDBPDatabase<EventToolkitDB>> | null = null;

/** True when running in a browser context with IndexedDB available. */
export function isStorageAvailable(): boolean {
  return typeof globalThis !== "undefined" && typeof globalThis.indexedDB !== "undefined";
}

/** Open (and lazily create/upgrade) the suite database. */
export function getDb(): Promise<IDBPDatabase<EventToolkitDB>> {
  if (!isStorageAvailable()) {
    return Promise.reject(
      new Error(
        "IndexedDB is not available in this environment. local-store may only be called from client components.",
      ),
    );
  }
  if (!dbPromise) {
    dbPromise = openDB<EventToolkitDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_BRIEFS)) {
          const briefs = db.createObjectStore(STORE_BRIEFS, { keyPath: "id" });
          briefs.createIndex("updatedAt", "updatedAt");
          briefs.createIndex("type", "type");
          briefs.createIndex("status", "status");
        }
        if (!db.objectStoreNames.contains(STORE_USAGE_EVENTS)) {
          const events = db.createObjectStore(STORE_USAGE_EVENTS, { keyPath: "id" });
          events.createIndex("timestamp", "timestamp");
          events.createIndex("type", "type");
        }
        if (!db.objectStoreNames.contains(STORE_INTAKE_PROGRESS)) {
          db.createObjectStore(STORE_INTAKE_PROGRESS, { keyPath: "briefId" });
        }
        // v2 — PRD 2. Guarded like the rest, so a v1 database upgrades in place.
        if (!db.objectStoreNames.contains(STORE_PROMO_ASSET_SETS)) {
          db.createObjectStore(STORE_PROMO_ASSET_SETS, { keyPath: "eventBriefId" });
        }
        if (!db.objectStoreNames.contains(STORE_PACING_ENTRIES)) {
          const pacing = db.createObjectStore(STORE_PACING_ENTRIES, { keyPath: "id" });
          pacing.createIndex("eventBriefId", "eventBriefId");
        }
        if (!db.objectStoreNames.contains(STORE_PACING_CONFIGS)) {
          db.createObjectStore(STORE_PACING_CONFIGS, { keyPath: "eventBriefId" });
        }
        // v3 — PRD 3.
        if (!db.objectStoreNames.contains(STORE_LOGISTICS_PACKS)) {
          const packs = db.createObjectStore(STORE_LOGISTICS_PACKS, { keyPath: "id" });
          packs.createIndex("eventBriefId", "eventBriefId");
        }
        // v4 — PRD 4.
        if (!db.objectStoreNames.contains(STORE_BUDGET_LINE_ITEMS)) {
          const lineItems = db.createObjectStore(STORE_BUDGET_LINE_ITEMS, { keyPath: "id" });
          lineItems.createIndex("eventBriefId", "eventBriefId");
        }
        if (!db.objectStoreNames.contains(STORE_BUDGET_SETTINGS)) {
          db.createObjectStore(STORE_BUDGET_SETTINGS, { keyPath: "eventBriefId" });
        }
        // v5 — PRD 5.
        if (!db.objectStoreNames.contains(STORE_TRIAGE_SESSIONS)) {
          const sessions = db.createObjectStore(STORE_TRIAGE_SESSIONS, { keyPath: "id" });
          sessions.createIndex("eventBriefId", "eventBriefId");
        }
        if (!db.objectStoreNames.contains(STORE_IMPORT_BATCHES)) {
          const batches = db.createObjectStore(STORE_IMPORT_BATCHES, { keyPath: "id" });
          batches.createIndex("triageSessionId", "triageSessionId");
        }
        if (!db.objectStoreNames.contains(STORE_LEAD_RECORDS)) {
          const leads = db.createObjectStore(STORE_LEAD_RECORDS, { keyPath: "id" });
          leads.createIndex("triageSessionId", "triageSessionId");
          leads.createIndex("dedupeKey", "dedupeKey");
          leads.createIndex("ownerId", "ownerId");
        }
        if (!db.objectStoreNames.contains(STORE_SCORING_RUBRICS)) {
          const rubrics = db.createObjectStore(STORE_SCORING_RUBRICS, { keyPath: "id" });
          rubrics.createIndex("triageSessionId", "triageSessionId");
        }
        if (!db.objectStoreNames.contains(STORE_FOLLOWUP_TEMPLATES)) {
          const templates = db.createObjectStore(STORE_FOLLOWUP_TEMPLATES, { keyPath: "id" });
          templates.createIndex("triageSessionId", "triageSessionId");
        }
        if (!db.objectStoreNames.contains(STORE_DUPLICATE_CANDIDATES)) {
          const dupes = db.createObjectStore(STORE_DUPLICATE_CANDIDATES, { keyPath: "id" });
          dupes.createIndex("triageSessionId", "triageSessionId");
        }
        // v6 — PRD 6.
        if (!db.objectStoreNames.contains(STORE_ROI_REPORTS)) {
          const reports = db.createObjectStore(STORE_ROI_REPORTS, { keyPath: "id" });
          reports.createIndex("eventBriefId", "eventBriefId");
        }
        if (!db.objectStoreNames.contains(STORE_PIPELINE_OPPORTUNITIES)) {
          const opps = db.createObjectStore(STORE_PIPELINE_OPPORTUNITIES, { keyPath: "id" });
          opps.createIndex("roiReportId", "roiReportId");
          opps.createIndex("recordId", "recordId");
        }
        if (!db.objectStoreNames.contains(STORE_PIPELINE_IMPORT_BATCHES)) {
          const batches = db.createObjectStore(STORE_PIPELINE_IMPORT_BATCHES, { keyPath: "id" });
          batches.createIndex("roiReportId", "roiReportId");
        }
        if (!db.objectStoreNames.contains(STORE_SURVEY_RESPONSES)) {
          const responses = db.createObjectStore(STORE_SURVEY_RESPONSES, { keyPath: "id" });
          responses.createIndex("roiReportId", "roiReportId");
        }
        if (!db.objectStoreNames.contains(STORE_SURVEY_IMPORT_BATCHES)) {
          const batches = db.createObjectStore(STORE_SURVEY_IMPORT_BATCHES, { keyPath: "id" });
          batches.createIndex("roiReportId", "roiReportId");
        }
        if (!db.objectStoreNames.contains(STORE_ATTRIBUTION_SETTINGS)) {
          db.createObjectStore(STORE_ATTRIBUTION_SETTINGS, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/** Test/tooling helper: forget the cached connection (does not delete data). */
export function resetDbConnection(): void {
  dbPromise = null;
}

export type { EventToolkitDB };
