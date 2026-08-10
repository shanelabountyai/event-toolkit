/**
 * IndexedDB setup for the Event Planner Productivity Suite.
 *
 * This file (and its siblings in this package) are the ONLY place in the monorepo that
 * touch IndexedDB. Every tool reads and writes through the repository functions so a
 * future backend can be swapped in by re-implementing this package's interface.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { EventBrief } from "@event-toolkit/schema";

export const DB_NAME = "event-toolkit";
export const DB_VERSION = 1;

export const STORE_BRIEFS = "briefs";
export const STORE_USAGE_EVENTS = "usageEvents";
export const STORE_INTAKE_PROGRESS = "intakeProgress";

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
  | "tool_opened_direct";

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
