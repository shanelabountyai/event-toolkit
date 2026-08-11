/**
 * @event-toolkit/postmortem-core — PRD 7 domain logic.
 *
 * Pure TypeScript: retro types, candidate-lesson generation from the issue log, budget
 * variance and ROI scorecard, the retro-prompt timing rule, and the carry-forward write-back
 * that closes the suite's loop back into PRD 1's intake.
 */

export * from "./retro";
export * from "./candidateLessons";
export * from "./carryForward";
export * from "./prompt";
export * from "./exportRetro";
export { migrateRetroDocument, RETRO_MIGRATIONS, type RetroMigrationStep } from "./migrations";
