/**
 * @event-toolkit/local-store — public API.
 *
 * The single persistence seam for the whole suite. UI code imports these functions and
 * never touches IndexedDB (or `idb`) directly.
 */

export {
  DB_NAME,
  DB_VERSION,
  STORE_BRIEFS,
  STORE_BUDGET_LINE_ITEMS,
  STORE_BUDGET_SETTINGS,
  STORE_DUPLICATE_CANDIDATES,
  STORE_FOLLOWUP_TEMPLATES,
  STORE_IMPORT_BATCHES,
  STORE_LEAD_RECORDS,
  STORE_ATTRIBUTION_SETTINGS,
  STORE_PIPELINE_IMPORT_BATCHES,
  STORE_PIPELINE_OPPORTUNITIES,
  STORE_OUTBOX,
  STORE_RETROS,
  STORE_ROI_REPORTS,
  STORE_SCORING_RUBRICS,
  STORE_SURVEY_IMPORT_BATCHES,
  STORE_SURVEY_RESPONSES,
  STORE_TRIAGE_SESSIONS,
  STORE_INTAKE_PROGRESS,
  STORE_LOGISTICS_PACKS,
  STORE_PACING_CONFIGS,
  STORE_PACING_ENTRIES,
  STORE_PROMO_ASSET_SETS,
  STORE_USAGE_EVENTS,
  getDb,
  isStorageAvailable,
  resetDbConnection,
  type IntakeProgress,
  type UsageEvent,
  type UsageEventType,
} from "./db";

export {
  deleteAssetSet,
  generateAssetSet,
  getAssetSet,
  planRegeneration,
  regenerateAssetSet,
  revertAsset,
  saveAssetSet,
  updateAssetBody,
  type RegenerateOutcome,
  type RegeneratePlanRow,
} from "./promoKitRepository";

export {
  deleteBudgetForBrief,
  deleteLineItem,
  findOrCreateBudget,
  getBudgetSettings,
  getLineItems,
  saveBudgetSettings,
  saveLineItem,
  saveLineItems,
  syncActualsToBrief,
  type BudgetBootstrap,
} from "./budgetRepository";

export {
  deletePack,
  deletePacksForBrief,
  findOrCreatePackForBrief,
  getPack,
  getPackByBriefId,
  listPacks,
  savePack,
} from "./logisticsRepository";

export {
  DEFAULT_PACING_CONFIG,
  addEntry,
  deleteEntry,
  deletePacingData,
  getConfig,
  importCsv,
  listEntries,
  saveConfig,
  type ImportCsvResult,
} from "./pacingRepository";

export {
  deleteBrief,
  deleteIntakeProgress,
  getBrief,
  getIntakeProgress,
  listBriefs,
  queryLessons,
  saveBrief,
  saveBriefRaw,
  saveIntakeProgress,
  type LessonSuggestion,
} from "./briefRepository";

export {
  clearUsageEvents,
  exportUsageLogCsv,
  listUsageEvents,
  logUsageEvent,
  usageEventsToCsv,
  type LogEventInput,
} from "./usageLog";

export {
  deleteLead,
  deleteSession,
  getLead,
  getRubric,
  getSession,
  listDuplicateCandidates,
  listImportBatches,
  listLeads,
  listSessions,
  listTemplates,
  replaceLeads,
  saveDuplicateCandidates,
  saveImportBatch,
  saveLead,
  saveLeadsBulk,
  saveRubric,
  saveSession,
  saveTemplate,
  saveTemplates,
} from "./leadRepository";

export {
  deleteReport,
  getAttributionSettings,
  getReport,
  getReportByBriefId,
  listPipelineImportBatches,
  listPipelineOpportunities,
  listReports,
  listSurveyImportBatches,
  listSurveyResponses,
  loadBudgetSummary,
  loadLeadSources,
  saveAttributionSettings,
  savePipelineImportBatch,
  savePipelineOpportunitiesBulk,
  saveReport,
  saveSurveyImportBatch,
  saveSurveyResponsesBulk,
  type LeadSourceOption,
} from "./roiReportRepository";

export {
  deleteRetro,
  findOrCreateRetro,
  getRetro,
  getRetroByBriefId,
  ingestBudgetVariance,
  ingestIssueLog,
  ingestRoiScorecard,
  listRetros,
  refreshIngestion,
  saveRetro,
} from "./retroRepository";

/**
 * PRD 8 §7 — workspace context. Local-only mode is the default and needs none of this.
 */
export {
  assertStoreAccess,
  capabilityForStore,
  databaseName,
  getStoreContext,
  LocalStorePermissionError,
  onStoreContextChange,
  resetStoreContext,
  setStoreContext,
  STORE_TOOLS,
  UNGATED_STORES,
  type StoreContext,
  type StoreVerb,
} from "./context";

/** PRD 9 FR-2 — the durable outbox. No-ops entirely in local-only mode. */
export {
  clearOutbox,
  enqueue,
  hasPendingWrites,
  listPending,
  markFailed,
  markSynced,
  pendingCount,
  type EnqueueInput,
  type OutboxEntry,
} from "./outbox";

/** PRD 8 FR-9 — the read half of local-data migration. Uploads nothing. */
export {
  collectLocalRecords,
  countLocalEvents,
  DEVICE_LOCAL_STORES,
  unknownKinds,
  type CollectedData,
  type MigrationPreview,
} from "./migration";
