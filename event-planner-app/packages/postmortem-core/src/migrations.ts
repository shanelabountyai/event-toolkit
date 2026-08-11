// packages/postmortem-core/src/migrations.ts
//
// FR-15 — the seam. Nothing to migrate at v1, but it exists and is called on every read, so
// the first real migration is a table entry rather than a retrofit.

import { CURRENT_RETRO_SCHEMA_VERSION, type RetroDocument } from "./retro";

export interface RetroMigrationStep {
  from: string;
  to: string;
  migrate: (retro: RetroDocument) => RetroDocument;
}

export const RETRO_MIGRATIONS: RetroMigrationStep[] = [];

export function migrateRetroDocument(raw: RetroDocument): RetroDocument {
  let retro: RetroDocument = {
    ...raw,
    lessons: raw.lessons ?? [],
    successMetricAdjustments: raw.successMetricAdjustments ?? [],
  };

  let guard = 0;
  while (retro.schemaVersion !== CURRENT_RETRO_SCHEMA_VERSION) {
    const step = RETRO_MIGRATIONS.find((m) => m.from === retro.schemaVersion);
    if (!step) {
      retro = { ...retro, schemaVersion: CURRENT_RETRO_SCHEMA_VERSION };
      break;
    }
    retro = { ...step.migrate(retro), schemaVersion: step.to };
    guard += 1;
    if (guard > RETRO_MIGRATIONS.length + 1) break;
  }
  return retro;
}
