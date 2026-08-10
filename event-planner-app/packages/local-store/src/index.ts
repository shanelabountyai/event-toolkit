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
  STORE_INTAKE_PROGRESS,
  STORE_USAGE_EVENTS,
  getDb,
  isStorageAvailable,
  resetDbConnection,
  type IntakeProgress,
  type UsageEvent,
  type UsageEventType,
} from "./db";

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
