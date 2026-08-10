/**
 * @event-toolkit/lead-triage-core — PRD 5 domain logic.
 *
 * Pure TypeScript: CSV parsing, column mapping, dedupe, scoring, templates, owner assignment
 * and export shaping. No React, no IndexedDB, no network. It holds attendees' personal data
 * in memory only — nothing here can send it anywhere.
 *
 * Strictly read-only against EventBrief: it imports the type for brief-linked features and
 * never a write path.
 */

export * from "./types";
export * from "./session";
export * from "./csvParser";
export * from "./columnMapping";
export * from "./dedupe";
export * from "./scoring";
export * from "./templates";
export * from "./ownerAssignment";
export * from "./exportLeads";
