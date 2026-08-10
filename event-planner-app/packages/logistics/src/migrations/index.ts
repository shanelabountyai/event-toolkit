// packages/logistics/src/migrations/index.ts
//
// Mirrors packages/schema's migration seam. v1 has nothing to upgrade yet, but the function
// exists and is called on every read in `logisticsRepository`, so the first real migration is
// a table entry rather than a retrofit across every call site (FR-15).

import {
  CURRENT_LOGISTICS_SCHEMA_VERSION,
  type LogisticsPack,
} from "../logistics-pack";

export interface LogisticsMigrationStep {
  from: string;
  to: string;
  migrate: (pack: LogisticsPack) => LogisticsPack;
}

export const LOGISTICS_MIGRATIONS: LogisticsMigrationStep[] = [];

/**
 * Upgrade a stored pack to the current schema version, and defensively default any array the
 * stored document is missing — a pack written by an older build should never crash a view by
 * having `undefined` where a list is expected.
 */
export function migrateLogisticsPack(raw: LogisticsPack): LogisticsPack {
  let pack: LogisticsPack = {
    ...raw,
    sessions: raw.sessions ?? [],
    staffAssignments: raw.staffAssignments ?? [],
    shippingItems: raw.shippingItems ?? [],
    venueChecklist: raw.venueChecklist ?? [],
    contacts: raw.contacts ?? [],
    issueLog: raw.issueLog ?? [],
  };

  let guard = 0;
  while (pack.schemaVersion !== CURRENT_LOGISTICS_SCHEMA_VERSION) {
    const step = LOGISTICS_MIGRATIONS.find((m) => m.from === pack.schemaVersion);
    if (!step) {
      // Unknown version: stamp it current rather than refusing to open the planner's data.
      pack = { ...pack, schemaVersion: CURRENT_LOGISTICS_SCHEMA_VERSION };
      break;
    }
    pack = { ...step.migrate(pack), schemaVersion: step.to };
    guard += 1;
    if (guard > LOGISTICS_MIGRATIONS.length + 1) break;
  }

  return pack;
}
