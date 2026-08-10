# @event-toolkit/schema — Changelog

All notable changes to the canonical Event Brief schema. The schema is versioned with
semver, independently of the app release version. See `event-brief-schema.md` §Versioning
policy for the rules (PATCH = docs only, MINOR = backwards-compatible additive changes,
MAJOR = breaking changes + a migration function in `src/migrations/`).

## 1.0.0 — 2026-08-10

Initial approved schema. Frozen for v1.

- `EventBrief` top-level object with `schemaVersion`, `id`, `name`, `type`, `status`,
  `version`, `createdAt`, `updatedAt`, `createdBy`, `goals`, `audience`, `budget`,
  `dates`, `format`, `stakeholders`, `successMetrics`, `riskRegister`, `timeline`,
  `constraints`, `carryForwardLessons`, `exportHistory`.
- Nested types: `Goals`, `Audience`, `Persona`, `Budget`, `BudgetAllocation`, `Dates`,
  `Format`, `VenueOrPlatform`, `Stakeholder`, `SuccessMetric`, `RiskItem`, `Timeline`,
  `Milestone`, `Constraints`, `LessonLearned`, `ExportRecord`.
- `CURRENT_SCHEMA_VERSION = "1.0.0"`.
- `migrateBrief(brief: unknown): EventBrief` — no-op passthrough at v1 that stamps a
  missing `schemaVersion` and back-fills missing optional collections with defaults.
- Event-type presets for Conference, Webinar and Trade Show Booth (`presets.ts`).
- JSON Schema twin at `src/event-brief.schema.json` (draft 2020-12).
