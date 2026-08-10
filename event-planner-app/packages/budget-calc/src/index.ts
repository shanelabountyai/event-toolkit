/**
 * @event-toolkit/budget-calc — PRD 4 domain logic.
 *
 * Pure TypeScript: variance, presets, allocation reconciliation, reforecast triggers, the
 * import/export plumbing, and `computeBudgetActualsSummary` — the seam PRD 6 (ROI Report)
 * imports directly. No React, no IndexedDB, no spreadsheet library.
 */

export * from "./variance";
export * from "./presets";
export * from "./reconcile";
export * from "./reforecast";
export * from "./summary";
export * from "./import-export";
