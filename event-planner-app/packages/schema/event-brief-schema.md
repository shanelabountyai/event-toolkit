# Event Brief Schema — Canonical Reference

**Status:** Approved (v1.0.0)
**Owner:** Event Planner Productivity Suite — Platform/Schema
**Applies to:** All 7 tools in the Event Planner Productivity Suite
**Location of source of truth:** `packages/schema/src/event-brief.ts` (TypeScript types) and `schema/event-brief.schema.json` (JSON Schema, generated/kept in sync with the TS types)

## Purpose

The Event Brief is the **data spine** of the entire suite. One structured brief, created by PRD 1 (Event Brief Generator), is read and extended by PRDs 2–7. This document is the contract: every field, its type, whether it's required, what it means, and which PRD(s) read or write it. Any agent or engineer building a tool in this suite should treat this file (and its JSON Schema twin) as the single source of truth for the shape of an Event Brief.

**Confirmed PRD numbering** (per suite dependency order and each PRD's actual, as-written scope — this table is normative; if any other doc in this repo disagrees with it, this table wins):

| # | PRD | Role |
|---|-----|---------------|
| 1 | Event Brief Generator | Creates and owns the brief (this PRD). Read-only for all other tools with respect to the core identity/goals/dates fields. |
| 2 | Promo Campaign Kit | Generates promo assets (landing page, email sequence, social, sales snippets) from brief fields and tracks registration pacing. Read-only against `EventBrief` — writes only to its own sibling `promo-kit` data (`PromoAsset`, `PacingEntry`, etc. in `packages/schema/src/promo-kit.ts`). |
| 3 | Run-of-Show / Logistics Pack | Generates and maintains run-of-show, staffing, shipping manifest, venue checklist, and on-site contact sheet from one source of truth. Writes `riskRegister[].status` and `timeline.milestones[].status` back to the brief as the event approaches/runs; owns the `issueLog` seam PRD 7 depends on. |
| 4 | Budget Builder & Tracker | Expands `budget` with line-item detail, committed/actual tracking, variance flags, and reforecast prompts. Writes `budget.allocations[].actualAmount`; exposes a pure `computeBudgetActualsSummary()` function that PRD 6 imports directly. |
| 5 | Lead Triage & Follow-Up Engine | CSV import of badge scans/registrant lists → dedupe, score, route to sales owners with follow-up drafts. Read-only against `EventBrief` (reads `dates`, `goals`, `audience.targetPersonas`, `format.deliveryMode`); writes nothing back to the brief in v1. |
| 6 | Event ROI & Attribution Report | Combines PRD 4's budget-actuals summary, PRD 5's lead outcomes, and survey CSV import into a standardized ROI report. Writes `successMetrics[].actual` where a metric maps to a computed ROI figure. |
| 7 | Post-Mortem Generator | Structured retro assembled from PRD 3's `issueLog`, PRD 4's variance, and PRD 6's ROI report. Writes `carryForwardLessons`, which PRD 1 reads at intake time for the *next* event's brief — this is how the lifecycle loop closes without any backend or integration. |

---

## Top-level object: `EventBrief`

| Field | Type | Required | Description | Read by | Written by |
|---|---|---|---|---|---|
| `schemaVersion` | `string` (semver) | Yes | Version of this schema the brief document conforms to, e.g. `"1.0.0"`. Used for migration on load. | All PRDs | PRD 1 (set at creation); schema migration utility on read |
| `id` | `string` (UUID v4) | Yes | Globally unique identifier for this event/brief. Primary key used by all other tools to associate their data with this event. | All PRDs | PRD 1 (generated at creation, immutable) |
| `name` | `string` | Yes | Human-readable event name, e.g. "Q4 Customer Summit 2026". | All PRDs | PRD 1 |
| `type` | `EventType` enum: `"conference" \| "webinar" \| "trade_show" \| "custom"` | Yes | The event-type preset selected during intake. Drives default field templates (see UX flow). | All PRDs | PRD 1 |
| `status` | `BriefStatus` enum: `"draft" \| "complete"` | Yes | Lifecycle state of the brief itself (not the event). `"draft"` = still being edited; `"complete"` = planner has marked it ready to share/use downstream. No approval workflow in v1 — this is a self-declared status, not a gated one. | All PRDs (downstream tools should warn if launched from a `"draft"` brief) | PRD 1 |
| `version` | `integer` | Yes | Monotonically increasing revision counter for this specific brief document (not the schema version). Incremented every time the brief is saved. Lets downstream tools detect "this brief changed since I last read it." | All PRDs | PRD 1 (increments on every save) |
| `createdAt` | `string` (ISO 8601 datetime) | Yes | Timestamp the brief was first created. | All PRDs | PRD 1 |
| `updatedAt` | `string` (ISO 8601 datetime) | Yes | Timestamp of the most recent edit. | All PRDs | PRD 1 (and any tool that writes back to the brief must update this) |
| `createdBy` | `string` | No | Free-text name/email of the planner who created the brief. No auth system in v1, so this is self-reported. | PRD 1, PRD 7 | PRD 1 |
| `goals` | `Goals` object | Yes | See below. | All PRDs | PRD 1 |
| `audience` | `Audience` object | Yes | See below. | PRD 1, PRD 2, PRD 5, PRD 6 | PRD 1 (create/edit only — no other PRD writes to `audience` in v1) |
| `budget` | `Budget` object | Yes | See below. | PRD 1, PRD 4, PRD 6, PRD 7 | PRD 1 (planned figures); PRD 4 (actuals, vendor-level detail via `allocations[].actualAmount`) |
| `dates` | `Dates` object | Yes | See below. | All PRDs | PRD 1 |
| `format` | `Format` object | Yes | See below. | PRD 1, PRD 3, PRD 4, PRD 5 | PRD 1 |
| `stakeholders` | `Stakeholder[]` | Yes (may be empty array) | RACI roster. See below. | All PRDs | PRD 1 (create/edit) — no other PRD mutates this in v1 |
| `successMetrics` | `SuccessMetric[]` | Yes (may be empty array) | Metrics + targets defined at brief time; `actual` filled in later. See below. | All PRDs | PRD 1 (metric + target); PRD 6 (`actual`, computed from ROI analysis); PRD 7 (final retro adjustments) |
| `riskRegister` | `RiskItem[]` | Yes (may be empty array) | See below. | PRD 1, PRD 3, PRD 7 | PRD 1 (create/edit); PRD 3 (`status` updates during pre-event/live-event); PRD 7 (retro notes/closure) |
| `timeline` | `Timeline` object | Yes | High-level milestones, used both as "key milestones" and the "high-level timeline" surfaced in the generated brief. See below. | All PRDs | PRD 1 (create); PRD 3 (`milestones[].status` updates during pre-event/live-event) |
| `constraints` | `Constraints` object | Yes | See below. | All PRDs | PRD 1 |
| `carryForwardLessons` | `LessonLearned[]` | Yes (may be empty array) | Lessons learned from a *previous* event, surfaced during PRD 1's guided intake for a *new* brief. See below. | PRD 1 (reads at intake time to pre-fill suggestions), PRD 7 (writes) | PRD 7 |
| `exportHistory` | `ExportRecord[]` | No (defaults to `[]`) | Lightweight audit trail of generated exports (doc/PDF/markdown). Optional; not required for P0 but reserved so PRD 1's export feature has a place to log to without a future schema break. | PRD 1 | PRD 1 |

---

## `Goals`

| Field | Type | Required | Description |
|---|---|---|---|
| `primaryObjective` | `string` | Yes | The single most important reason this event exists, e.g. "Generate 150 qualified pipeline opportunities." |
| `objectives` | `string[]` | No (default `[]`) | Secondary objectives supporting the primary one. |
| `businessJustification` | `string` | No | Free text: why this event, why now, tie to broader company/marketing goals. |

## `Audience`

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | `string` | Yes | Free-text summary of the target audience. |
| `targetPersonas` | `Persona[]` | No (default `[]`) | See `Persona` below. |
| `estimatedSize` | `integer` | No | Planner's estimate of headcount/attendees at brief time. |
| `segments` | `string[]` | No (default `[]`) | Named audience segments, e.g. `"existing customers"`, `"prospects"`, `"partners"`. |

### `Persona`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Persona label, e.g. "VP of Marketing, Mid-Market SaaS." |
| `title` | `string` | No | Job title/role this persona represents. |
| `description` | `string` | No | Free-text description. |
| `painPoints` | `string[]` | No (default `[]`) | What problems this persona has that the event addresses. |

## `Budget`

| Field | Type | Required | Description |
|---|---|---|---|
| `totalBudget` | `number` | No | Total planned budget. Omit if not yet known at brief time. |
| `currency` | `string` (ISO 4217 code) | Yes (default `"USD"`) | Currency for all monetary fields in this brief. |
| `allocations` | `BudgetAllocation[]` | No (default `[]`) | High-level category placeholders. **PRD 4 owns the detailed, vendor-level budget model** and expands this array (or reads/reconciles against it) without requiring a schema-breaking change — `actualAmount` and `notes` are pre-declared for that purpose. |
| `notes` | `string` | No | Free-text budget notes/assumptions. |

### `BudgetAllocation`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | Stable id for this allocation line. |
| `category` | `string` | Yes | e.g. "Venue," "Catering," "AV," "Swag," "Travel." Free text in v1 (not an enum) so planners aren't blocked by a fixed taxonomy; PRD 4 may layer a controlled vocabulary on top. |
| `plannedAmount` | `number` | Yes | Planned spend for this category. |
| `actualAmount` | `number \| null` | No (default `null`) | Actual spend. Placeholder for PRD 4 to write; PRD 1 never sets this. |
| `notes` | `string` | No | Free text. |

## `Dates`

| Field | Type | Required | Description |
|---|---|---|---|
| `timezone` | `string` (IANA tz name, e.g. `"America/New_York"`) | Yes | Timezone all event dates/times in this brief are interpreted in. |
| `eventStartDate` | `string` (ISO 8601 date, `YYYY-MM-DD`) | Yes | First day of the event. |
| `eventEndDate` | `string` (ISO 8601 date) | Yes | Last day of the event. Equal to `eventStartDate` for single-day events. |

> **Design note:** "Key milestones" (a phrase used in the source brief alongside `dates`) are represented as `timeline.milestones` rather than duplicated here — see `Timeline` below. This avoids two competing lists of dates drifting out of sync.

## `Format`

| Field | Type | Required | Description |
|---|---|---|---|
| `deliveryMode` | `FormatMode` enum: `"in_person" \| "virtual" \| "hybrid"` | Yes | How the event is delivered. |
| `venueOrPlatform` | `VenueOrPlatform` object | No | Placeholder for venue (in-person/hybrid) or platform (virtual/hybrid) details. Intentionally shallow in v1 — no venue-booking or platform-integration logic. |

### `VenueOrPlatform`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | No | Venue name or platform name (e.g. "Moscone Center," "Zoom Webinar," "Hopin"). |
| `locationOrUrl` | `string` | No | Physical address or platform URL. |
| `capacity` | `integer` | No | Max capacity, if known. |
| `notes` | `string` | No | Free text. |

## `Stakeholder`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | Stable id. |
| `name` | `string` | Yes | Full name. |
| `role` | `string` | Yes | Title/function, e.g. "Field Marketing Manager." |
| `raci` | `RaciRole` enum: `"R" \| "A" \| "C" \| "I"` | Yes | This stakeholder's overall RACI designation for the event (Responsible / Accountable / Consulted / Informed). **v1 simplification:** one RACI value per person for the event as a whole, not per-task. PRD 2 may layer task-level RACI without changing this field. |
| `email` | `string` | No | Contact email. |
| `department` | `string` | No | e.g. "Sales," "Product Marketing," "Events." |

## `SuccessMetric`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | Stable id. |
| `metric` | `string` | Yes | e.g. "Registrations," "MQLs generated," "NPS." |
| `target` | `number` | Yes | Numeric target value. |
| `unit` | `string` | No | e.g. `"count"`, `"%"`, `"$"`, `"score"`. |
| `actual` | `number \| null` | No (default `null`) | Filled in post-event. PRD 1 never sets this; PRD 6 (ROI Report) is the primary writer, with PRD 7 (Post-Mortem) able to make final retro adjustments. |
| `notes` | `string` | No | Free text. |

## `RiskItem`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | Stable id. |
| `risk` | `string` | Yes | Description of the risk. |
| `likelihood` | `LikertLevel` enum: `"low" \| "medium" \| "high"` | Yes | |
| `impact` | `LikertLevel` enum: `"low" \| "medium" \| "high"` | Yes | |
| `mitigation` | `string` | No | Planned mitigation/contingency. |
| `owner` | `string` | No | Name of the stakeholder accountable for monitoring this risk. Free text in v1 (not a foreign key into `stakeholders`, to avoid referential-integrity requirements in a local-first app); tools MAY match on name. |
| `status` | `RiskStatus` enum: `"open" \| "mitigated" \| "occurred" \| "closed"` | Yes (default `"open"`) | PRD 3 (Logistics Pack) updates this during pre-event/live-event; PRD 7 closes out risks in the retro. |

## `Timeline`

| Field | Type | Required | Description |
|---|---|---|---|
| `milestones` | `Milestone[]` | Yes (may be empty array) | Flat list of high-level milestones spanning pre-event, during-event, and post-event phases. This single array satisfies both the "key milestones" and "high-level timeline" requirements — the generated brief document groups/renders it by phase using each milestone's `phase` field. |

### `Milestone`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | Stable id. |
| `label` | `string` | Yes | e.g. "Venue contract signed," "Invitations sent," "Post-event survey closed." |
| `phase` | `EventPhase` enum: `"pre_event" \| "during_event" \| "post_event"` | Yes | Which phase of the event lifecycle this milestone belongs to. |
| `targetDate` | `string` (ISO 8601 date) | Yes | Due/target date. |
| `owner` | `string` | No | Free-text name; MAY match a `stakeholders[].name`. |
| `status` | `MilestoneStatus` enum: `"not_started" \| "in_progress" \| "done" \| "at_risk"` | Yes (default `"not_started"`) | PRD 3 (Logistics Pack) is the primary writer once a brief moves into pre-event/live execution. |
| `notes` | `string` | No | Free text. |

## `Constraints`

| Field | Type | Required | Description |
|---|---|---|---|
| `items` | `string[]` | No (default `[]`) | Discrete constraints, one per entry, e.g. "Exec sponsor must be on-site," "No budget for swag," "Must comply with EU data residency for registration." |
| `notes` | `string` | No | Free-text overflow for anything not worth structuring. |

## `LessonLearned`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | Stable id. |
| `sourceEventId` | `string` (UUID) | No | `id` of the brief this lesson originated from, if applicable (a lesson can also be entered without a source, e.g. imported from a spreadsheet of historical lessons). |
| `category` | `string` | No | e.g. "Budget," "Vendor," "Logistics," "Content." |
| `lesson` | `string` | Yes | The lesson itself, written as an actionable statement, e.g. "Book AV vendor 90 days out — 60 was too late." |
| `addedAt` | `string` (ISO 8601 datetime) | Yes | When the lesson was recorded. |

> **Suite mechanic:** During PRD 1's guided intake, the tool queries the local store for `LessonLearned` entries across *all* prior briefs (not just this one) and surfaces relevant ones as suggested constraints/risks for the new brief. This is how PRD 7's retro output "feeds the next brief's intake" without any backend or integration — everything stays in the same local-first store.

## `ExportRecord`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | Stable id. |
| `format` | `ExportFormat` enum: `"markdown" \| "pdf" \| "docx" \| "html"` | Yes | |
| `generatedAt` | `string` (ISO 8601 datetime) | Yes | |
| `filename` | `string` | No | Filename used for the export, for reference. |

---

## Versioning policy

The schema is versioned independently from any individual brief document and independently from the app release version, using **semver** (`MAJOR.MINOR.PATCH`), stored in `packages/schema/package.json` and stamped onto every brief as `EventBrief.schemaVersion`.

**Rules:**

1. **PATCH** (`1.0.0` → `1.0.1`): Documentation/description fixes, typo corrections, tightening a JSDoc comment. No change to field names, types, required-ness, or enum values. Safe to ignore for compatibility purposes.
2. **MINOR** (`1.0.0` → `1.1.0`): Backward-compatible additive changes only:
   - Adding a new **optional** top-level or nested field.
   - Adding a new enum value to the **end** of an existing enum (never removing or renumbering existing values).
   - Adding a new optional array-of-objects field.
   Consuming tools MUST tolerate unknown/missing optional fields (treat missing as `undefined`/default; ignore fields they don't recognize). This is how PRDs 2–7 can be built after PRD 1 ships without requiring PRD 1 to be rebuilt, and how PRD 1 can gain fields later that PRDs 2-7 don't yet know about.
3. **MAJOR** (`1.x.x` → `2.0.0`): Any breaking change:
   - Renaming or removing a field.
   - Changing a field's type (e.g. `string` → `string[]`).
   - Changing a field from optional to required (or vice versa in a way that changes defaulting behavior).
   - Removing or renumbering an enum value.
   A MAJOR bump requires a migration function added to `packages/schema/src/migrations/` (e.g. `migrate_1_x_to_2_0.ts`) that transforms a brief document from the old shape to the new shape. The local-first store runs migrations lazily on read: when a brief with an older `schemaVersion` is loaded, the app runs it through the migration chain before use, then re-saves it at the current version.
4. **Every tool in the suite depends on `packages/schema` as a workspace package**, never redefines these types locally. `packages/schema` exports both the TypeScript types and the JSON Schema (`event-brief.schema.json`), plus a `CURRENT_SCHEMA_VERSION` constant and a `migrateBrief(brief: unknown): EventBrief` function.
5. **Change process for adding a field:** open the change against `packages/schema`, add the field as optional with a sensible default and full documentation in this file + the JSON Schema, bump MINOR, update this markdown table, update the JSON Schema file, add a changelog entry to `packages/schema/CHANGELOG.md`. Do not bump MAJOR for additive changes — this is the discipline that keeps the suite decoupled.
6. **Unknown fields on read:** all readers must be built to ignore fields present in a brief document that are not in their own copy of the schema (i.e., don't assume a `Object.keys()` strict match). This makes the local-first JSON storage forward-compatible: a brief edited by a newer app version, then opened by an older one, doesn't crash — it just doesn't display the newer fields.
