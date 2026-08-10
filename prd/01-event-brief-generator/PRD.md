# PRD 1: Event Brief Generator

**Owner:** Product (Event Planner Productivity Suite)
**Status:** Approved for build
**Date:** 2026-08-09
**Version:** 1.0
**Suite position:** First of 7 PRDs, dependency root — defines the shared Event Brief schema (`packages/schema`) every other tool in the suite consumes.

---

## 1. Problem Statement

Every event starts with a blank document. Corporate and field marketing planners re-invent goals, success metrics, stakeholder roles, and risk lists for every single event, often working from a stale slide template or nothing at all. Because there's no consistent structure, briefs vary planner to planner and event to event — sales, executives, and vendors receive inconsistent information about what an event is for, who's accountable, and what success looks like, which causes downstream misalignment (wrong audience targeting, missed risks, unclear ownership) that surfaces late, when it's expensive to fix. There is currently no single artifact that captures a complete, structured picture of an event early enough to drive everything that follows.

## 2. Goals & Non-Goals

### Goals
- Reduce the time and effort to produce a complete, structured event brief from "blank page" to a guided, preset-driven flow that a planner can finish in one sitting.
- Establish a single structured brief (objectives, audience, budget shell, dates, format, RACI, success metrics, risk register, timeline) as the mandatory starting point for every event in the suite.
- Produce a versioned, machine-readable brief schema that PRDs 2–7 can build against immediately, without waiting on this tool's UI to be finished.
- Make the brief genuinely reusable: editable after generation, exportable to a shareable document, and carried forward via "lessons learned" into future briefs.

### Non-Goals (v1)
- **Approval workflows.** No multi-step sign-off, no routing to a manager for approval, no "approved" status distinct from the planner's own "complete" marking. Rationale: adds process/role complexity (who approves? what if they reject?) with no validated demand yet; the brief is useful as a planning artifact even without formal approval.
- **Multi-event portfolio views.** No dashboard listing/comparing all of a planner's events. Rationale: this PRD is about producing one good brief; a portfolio view is a natural PRD 8+ candidate once there's brief volume to look across.
- **CRM / martech / event-platform sync.** No HubSpot, Marketo, Cvent, Splash, or similar integration. Rationale: binding architecture constraint for the whole suite — standalone-first, all data via user input or file import.
- **Real-time multi-user collaborative editing** (e.g. Google-Docs-style simultaneous cursors). See Open Questions — resolved as single-planner-owned for v1.
- **Auth/accounts/user management.** No login system in v1; `createdBy` is free text. Rationale: local-first persistence means there's no server to authenticate against yet.

## 3. Target Users & Primary Persona

**Primary persona: Corporate/Field Marketing Event Planner ("Dana").** Owns end-to-end planning for 4–12 events per year (conferences, webinars, trade show booths). Works across marketing, sales, and exec stakeholders. Currently plans in a mix of Google Docs, spreadsheets, and email threads. Not deeply technical, but comfortable with structured forms (has used Airtable/Asana/similar). Wants to look organized and be able to answer "what's this event for and how will we know it worked?" instantly when a VP asks.

**Secondary users (read the brief, don't create it in v1):**
- Sales stakeholders who need to know audience/goals to plan follow-up.
- Executives who sponsor or attend and want a one-page summary.
- Vendors/agencies who receive the brief as a shareable doc for scoping.

## 4. User Stories

1. As a planner, I want to select an event-type preset (conference, webinar, trade show booth) so that the intake form asks me relevant questions instead of a generic blank form.
2. As a planner, I want a guided, step-by-step intake flow so that I don't have to figure out what information a "complete" brief needs on my own.
3. As a planner, I want the tool to generate a structured brief (objectives, audience, success metrics, RACI, risk register, timeline) from my intake answers so that I get a complete document without writing it from scratch.
4. As a planner, I want to edit any part of the generated brief so that I can correct, refine, or add detail the guided flow didn't capture.
5. As a planner, I want to export the brief to a shareable document format so that I can send it to execs, sales, or vendors who don't use this tool.
6. As a planner, I want my brief saved automatically and locally so that I don't lose work if I close the tab.
7. As a planner starting a new event, I want to see relevant lessons learned from my past events during intake so that I don't repeat the same mistakes.
8. As a planner, I want default success metrics and risks suggested based on my event type so that I don't start from zero even on the parts I'm least experienced with.
9. As a downstream tool (e.g. Timeline & Task Planner), I want to read a well-defined brief schema so that I can build a working plan without asking the planner to re-enter information.
10. As a planner, I want to see a completeness indicator so that I know whether my brief has gaps before I share it.
11. As a planner, I want to start a brief and abandon/resume it later so that an interrupted planning session isn't lost work.

## 5. Functional Requirements (P0)

Numbered, testable requirements. Each maps to acceptance criteria a QA pass (manual or automated) can verify directly.

**FR-1 — Event-type preset selection.** On starting a new brief, the planner must choose one of three presets: Conference, Webinar, Trade Show Booth (or "Custom" with no preset defaults). The selected preset sets `EventBrief.type` and pre-populates default `successMetrics`, `riskRegister` entries, and `timeline.milestones` appropriate to that event type (see §9 UX Flow for the specific defaults per preset).
*Acceptance:* Selecting each of the 4 options creates a brief with `type` set correctly and at least 3 pre-populated success metrics and 3 pre-populated risk items appropriate to that type.

**FR-2 — Guided multi-step intake.** The intake flow presents these steps in order, one topic per screen: (1) Event basics (name, type, dates, timezone, format/delivery mode), (2) Goals & objectives, (3) Target audience & personas, (4) Budget (total + top-level category placeholders), (5) Stakeholders & RACI, (6) Constraints. Planner can move forward/back between steps without losing entered data.
*Acceptance:* All 6 steps are reachable in order and via back navigation; data entered in an earlier step persists when the planner navigates to a later step and back.

**FR-3 — Required-field validation before brief generation.** The intake enforces required fields per the schema (`name`, `type`, `goals.primaryObjective`, `audience.description`, `dates.timezone`, `dates.eventStartDate`, `dates.eventEndDate`, `format.deliveryMode`, `budget.currency`) before allowing generation of the brief document. Optional fields (budget total, stakeholders, personas, constraints) can be skipped.
*Acceptance:* Attempting to generate a brief with a missing required field blocks generation and highlights the specific missing field(s); generation succeeds once all required fields are filled.

**FR-4 — Brief generation.** On completing intake, the tool assembles a complete `EventBrief` object conforming to the current schema version, including preset-driven defaults for `successMetrics`, `riskRegister`, and `timeline.milestones`, merged with anything the planner explicitly entered/edited during intake.
*Acceptance:* The generated object validates against `event-brief.schema.json`; every P0-required field per the schema is present.

**FR-5 — Editable output.** After generation, every field of the brief (objectives, audience, budget, dates, format, stakeholders/RACI, success metrics, risk register, timeline, constraints) is editable in a brief-review/edit screen — not just re-runnable through intake. Planners can add/remove rows in list fields (stakeholders, metrics, risks, milestones).
*Acceptance:* Each field type (text, number, date, enum/select, list-of-objects) has a working edit control; edits persist after save and survive a page reload.

**FR-6 — Autosave / local persistence.** All brief data (in-progress intake and completed briefs) is saved to local browser storage automatically (no explicit "save" button required for data-loss prevention), debounced to avoid excessive writes. A brief can be closed mid-intake and resumed later from where it was left off.
*Acceptance:* Entering data, closing the tab without manually saving, and reopening the app restores the exact in-progress state (current step + all entered field values).

**FR-7 — Brief list / resume.** The app shows a list of all briefs stored locally (name, type, status, last updated) and lets the planner open any one to continue editing or view.
*Acceptance:* Creating 3 briefs and reloading the app shows all 3 in the list with correct name/status/last-updated; opening one restores its full content.

**FR-8 — Export to shareable document.** A completed (or in-progress) brief can be exported as a standalone Markdown file and as a printable/PDF-style HTML document, both suitable for pasting into an email or sharing outside the tool. Export must render all sections in readable prose/table form (not raw JSON).
*Acceptance:* Exporting a brief produces a downloadable `.md` file and a printable HTML/PDF view containing all populated sections, correctly formatted (tables for RACI/metrics/risks, prose for objectives/audience).

**FR-9 — Versioned, schema-conformant storage.** Every brief is stored with `schemaVersion` stamped on it. The app includes a migration utility that upgrades older-versioned briefs to the current schema on load, per the versioning policy in `schema/event-brief-schema.md`.
*Acceptance:* A hand-crafted brief JSON at a prior minor schema version (missing a newer optional field) loads without error and displays correctly with the missing field defaulted.

**FR-10 — Completeness indicator.** The brief list and the brief-edit screen show a completeness signal (e.g. "6/6 required sections complete" or a percentage) based on whether required fields are populated and whether optional-but-recommended sections (stakeholders, risk register, success metrics) have at least one entry.
*Acceptance:* A brief missing stakeholders or risk entries shows a completeness value less than 100%; filling those sections increases it; a fully-populated brief shows 100%.

**FR-11 — Carry-forward lessons surfaced at intake.** During the Goals/Constraints steps of a new brief's intake, the tool queries all `carryForwardLessons` across every existing local brief and displays relevant ones (matched by event `type`, or shown as a general list if fewer than 3 type-matches exist) as dismissible suggestions the planner can accept into `constraints.items` or ignore.
*Acceptance:* With at least one prior brief containing `carryForwardLessons` of the same `type`, starting a new brief of that type surfaces at least one suggestion; accepting it adds it to the new brief's `constraints.items`.

**FR-12 — Manual brief status toggle.** The planner can mark a brief `"draft"` or `"complete"` explicitly (self-declared, not gated by validation beyond the FR-3 required fields).
*Acceptance:* Toggling status updates `EventBrief.status` and is reflected in the brief list.

**FR-13 — Local event log for success-metric measurement.** The app locally logs key lifecycle events (brief created, brief marked complete, export triggered, downstream-tool-launch link clicked — see §11) with timestamps, and offers a "export usage log as CSV" action. This is the only instrumentation mechanism in v1 (no analytics backend).
*Acceptance:* Performing each logged action produces a corresponding row in the exportable CSV with an accurate timestamp and event type.

## 6. P1 / Later (explicitly out of scope for v1)

- Collaborative real-time multi-planner editing (see Open Questions).
- Commenting/annotation on brief fields.
- Approval workflow with a distinct approver role and gated status transitions.
- Brief templates library beyond the 3 built-in presets (e.g. planner-saved custom presets).
- AI-assisted drafting of objectives/personas/risks from a free-text prompt (worth exploring once the structured schema is proven; deliberately deferred so v1 ships a deterministic, testable guided flow rather than a harder-to-test generative one).
- Multi-event portfolio dashboard.
- CRM/martech/event-platform integrations (binding suite-wide non-goal).
- Rich-text formatting within free-text fields (v1 is plain text).
- Server-side storage, accounts, and cross-device sync.

## 7. Data Model

The Event Brief Generator is the **owner** of the `EventBrief` object — it creates and edits every field. The full, authoritative field-by-field reference lives in:

- `/home/claude/event-toolkit/schema/event-brief-schema.md` (human-readable, includes PRD read/write ownership table and versioning policy)
- `/home/claude/event-toolkit/schema/event-brief.schema.json` (JSON Schema, machine-validated)

Summary of what this tool specifically reads/writes (all fields — this is the only PRD that writes the full object at creation time):

- **Writes at creation/edit:** `schemaVersion`, `id`, `name`, `type`, `status`, `version`, `createdAt`, `updatedAt`, `createdBy`, `goals`, `audience`, `budget` (planned figures only — never `actualAmount`), `dates`, `format`, `stakeholders`, `successMetrics` (`metric`/`target`/`unit` only — never `actual`), `riskRegister`, `timeline.milestones`, `constraints`, `exportHistory`.
- **Reads (never writes):** `carryForwardLessons` — written by PRD 7, consumed here during intake to suggest constraints/risks for new briefs (FR-11).
- **Deliberately leaves null/untouched for downstream tools:** `budget.allocations[].actualAmount`, `successMetrics[].actual`, `riskRegister[].status` transitions beyond initial `"open"`, `timeline.milestones[].status` transitions beyond initial `"not_started"`.

## 8. Suggested Architecture

**Decision: a single monorepo, one Next.js (App Router) + TypeScript + Tailwind application, with each of the 7 suite tools implemented as a route/module inside it — not 7 separately-deployed apps — plus a shared `packages/schema` package holding the canonical Event Brief TypeScript types and JSON Schema. Persistence for v1 is local-first via IndexedDB, accessed through a small typed repository wrapper (`packages/local-store`), with JSON export/import for portability.**

**Why one app, not seven.** The product thesis is that the Event Brief is a shared spine, not seven disconnected utilities — so the architecture has to make that true structurally, not just conceptually. A single Next.js app with per-tool routes (`/brief`, `/timeline`, `/registrations`, `/budget`, `/day-of`, `/feedback`, `/retro`) means every tool imports the exact same `EventBrief` TypeScript type from `packages/schema`, the exact same local-store repository, and the exact same UI primitives — there is no possibility of the brief schema drifting between tools because there's only one copy of it in the dependency graph. It also means a planner's data lives in one browser storage origin: opening the Timeline tool for an event created in the Brief Generator just works, with no export/import handoff required between "apps." Seven separately-deployed apps would each need their own copy (or a published package + version-pinning discipline) of the schema, their own storage origin (breaking the "one browser storage, one event" model unless everything is manually synced), and seven deploy pipelines for what is, from the user's perspective, one product. A monorepo with one deployable app is simpler to build, simpler to keep in sync, and is the standard, well-supported pattern for this kind of multi-module SaaS suite — Next.js App Router route groups (`app/(tools)/brief/...`, `app/(tools)/timeline/...`) give each tool its own URL space and can lazy-load their own code without needing separate deployments.

**Why local-first with IndexedDB, not a backend.** The binding constraint is standalone-first with no martech/event-platform integrations in v1, and there's no stated requirement for a server in this phase. Given that, running a Node/Express or Next.js API-route backend just to persist JSON to a database would add real infrastructure (hosting, migrations, auth to protect that data) with no corresponding v1 requirement it serves — collaborative editing, cross-device sync, and multi-user auth are all explicitly out of scope for v1. IndexedDB is the right concrete choice over `localStorage` because brief documents are structured, potentially large (many stakeholders/metrics/risks/milestones per event, many events per planner), and need to be queried (e.g. FR-11's "find all `carryForwardLessons` across all briefs") — `localStorage`'s 5–10MB string-only, synchronous-blocking model doesn't scale to that comfortably, while IndexedDB is built for structured, indexed, asynchronous storage of exactly this shape of data and is supported in every evergreen browser with no extra runtime dependency. We wrap it in a small typed repository (`packages/local-store`, built on top of the `idb` library for ergonomic promises over the raw IndexedDB API) so every tool reads/writes through the same `getBrief(id)`, `listBriefs()`, `saveBrief(brief)`, `deleteBrief(id)` functions rather than touching IndexedDB directly — this is also the seam where a future backend sync layer gets bolted in later (swap the repository's implementation, keep every call site the same). Every brief is additionally exportable/importable as a plain JSON file (separate from the FR-8 human-readable Markdown/HTML export) so a planner's data isn't trapped in one browser profile and so tools/agents can hand-author or fixture-load brief data during development and testing.

**Why this doesn't box in future integrations.** Because the schema lives in its own package with an explicit versioning/migration policy (§ schema doc), and because all persistence goes through the repository abstraction rather than being called ad hoc from UI components, adding a real backend or a martech/event-platform integration later is additive: implement a new repository (e.g. a REST-backed one) satisfying the same interface, add sync/conflict-resolution logic at that seam, and none of the 7 tools' UI or business logic needs to change. This is the concrete mechanism behind the suite's binding "design so integrations can be bolted on later without rework" requirement.

## 9. UX Flow

**Step 0 — Brief list (home).** Planner lands on a list of their existing briefs (name, type badge, status badge, completeness %, last updated) with a prominent "New Brief" button. Empty state (no briefs yet) shows a short explainer and the same CTA.

**Step 1 — New brief: choose preset.** A card-based chooser: Conference / Webinar / Trade Show Booth / Custom (blank). Selecting a preset shows a one-line description of what it pre-fills (e.g. "Conference: pre-fills metrics like registrations, session attendance, and NPS; risks like venue capacity and speaker no-shows"). Selecting Custom skips defaults entirely.

**Step 2 — Guided intake, screen 1: Event basics.** Name, event type (locked to the chosen preset, editable), start/end date, timezone (auto-detected from browser, editable), delivery mode (in-person/virtual/hybrid), and — if in-person or hybrid — venue name/location, or — if virtual or hybrid — platform name/URL.

**Step 3 — Guided intake, screen 2: Goals & objectives.** Primary objective (single required text field, with placeholder examples per preset, e.g. webinar: "Generate 300 registrants and 50 sales-qualified leads"), secondary objectives (add/remove list), business justification (optional textarea). If `carryForwardLessons` exist for this event type, a sidebar panel shows up to 3 relevant lessons as suggestions (FR-11), each with "Add as constraint" / "Dismiss."

**Step 4 — Guided intake, screen 3: Target audience.** Audience description (required textarea), estimated size (optional number), segments (tag-style multi-add), personas (repeatable card: name, title, description, pain points) — planner can add 0+ personas; preset provides one starter persona template per type (e.g. trade show: "Booth visitor — evaluating vendors").

**Step 5 — Guided intake, screen 4: Budget.** Total budget (optional number + currency selector, defaulting USD), a pre-populated table of budget categories appropriate to the preset (e.g. webinar: Platform/Tooling, Promotion, Speaker fees, Production) each with a planned-amount field the planner fills or leaves at 0, and a free-text notes field. Explicitly labeled "high-level only — detailed vendor budgets are managed in the Budget & Vendor Tracker" to set expectations about scope.

**Step 6 — Guided intake, screen 5: Stakeholders & RACI.** A table the planner builds row by row: name, role, RACI select (R/A/C/I), email (optional), department (optional). Preset suggests common roles as empty starter rows (e.g. conference: "Event Lead (A)", "Marketing Ops (R)", "Exec Sponsor (I)") that the planner fills in or deletes.

**Step 7 — Guided intake, screen 6: Constraints.** Free-add list of constraints (one per line/chip) plus a notes field. Any accepted carry-forward lessons from Step 3 appear here pre-added.

**Step 8 — Review & generate.** A summary screen listing all 6 sections with a per-section completeness check; any missing required fields are flagged with a jump-back link. A "Generate Brief" button is disabled until required fields are satisfied (FR-3), then assembles the full brief including preset-driven `successMetrics`, `riskRegister`, and `timeline.milestones` defaults (FR-1/FR-4) and routes to the brief view.

**Step 9 — Brief view/edit.** The generated brief renders as a structured, readable document: header (name/type/status/dates), Objectives, Audience & Personas, Budget summary, Stakeholders/RACI table, Success Metrics table (metric/target/actual, actual shown as "—" until downstream tools populate it), Risk Register table, Timeline grouped by phase, Constraints. Every section has an inline "Edit" affordance that turns that section into its form equivalent without leaving the page. A persistent top bar shows completeness %, status toggle (draft/complete), "Export" button, and "Launch a tool from this brief" links (stubbed to the other 6 tools' routes once they exist — this is the FR-13-logged action that measures the "% of downstream tools launched from a brief" success signal).

**Step 10 — Export.** Clicking Export opens a small dialog: format choice (Markdown / Printable HTML), then triggers a browser download. The exported document mirrors the Step 9 read view exactly, with tables rendered as Markdown tables / HTML tables respectively.

## 10. Success Metrics

Per the stakeholder brief, three signals are in scope. Since there is no analytics backend in v1, every metric below is derived from the **locally logged event stream (FR-13)**, exportable as CSV, plus derivable fields already on the `EventBrief` object itself. This is intentionally a manual/CSV-based measurement approach for v1 — a defensible tradeoff given the standalone, no-backend constraint; revisit with real telemetry once/if a backend exists.

1. **Time from kickoff to approved brief.**
   - *Definition:* elapsed time between a brief's `createdAt` and the timestamp it's first set to `status: "complete"`.
   - *Measurement:* computed directly from stored brief data — no extra logging needed; exposed as a column when exporting the usage-log CSV (join brief `createdAt`/`updatedAt` against the logged `brief_marked_complete` event). Report as median and 90th-percentile across all local briefs.
   - *Target:* median under 45 minutes for a first-time preset-driven brief (assumption — pending validation, see §12).

2. **% of downstream tools launched from a brief (vs. cold-started).**
   - *Definition:* of all times a planner opens one of tools 2–7, what fraction were reached via the "Launch a tool from this brief" links on the Step 9 brief view versus navigating to that tool's route directly.
   - *Measurement:* FR-13 logs two distinct event types: `tool_launch_from_brief` (fired by the link, includes `briefId` and target tool) and `tool_opened_direct` (fired when a tool route mounts without a `briefId` in the navigation state). CSV export lets the planner (or us, if they share the export) compute the ratio. This requires PRDs 2–7 to each emit `tool_opened_direct` on cold entry and to honor a `?briefId=` query param passed by the brief view's launch links, firing `tool_launch_from_brief` instead when present — call this out explicitly in each downstream PRD's HANDOFF.
   - *Target:* ≥70% of downstream tool sessions originate from a brief within the first month of a planner using ≥2 tools (assumption — pending validation).

3. **Brief completeness rate.**
   - *Definition:* the FR-10 completeness percentage, aggregated across all briefs (mean, and % of briefs at 100%).
   - *Measurement:* computed live from stored brief data (no logging needed) and included in the CSV usage-log export as a snapshot at each `brief_marked_complete` event, so completeness-at-time-of-completion can be tracked over time.
   - *Target:* ≥90% mean completeness at the point a brief is marked `"complete"` (assumption — pending validation).

## 11. Risks & Assumptions

- **Risk:** IndexedDB storage limits/eviction (browsers may clear storage under disk pressure for infrequently-used sites) could cause data loss. *Mitigation:* FR-8/JSON export gives planners a manual backup path; consider a "remind me to export" nudge in a later iteration.
- **Risk:** Preset defaults (metrics/risks/timeline) that are too generic feel unhelpful; too specific feel wrong for a planner's actual event. *Mitigation:* every default is editable/removable (FR-5); defaults are explicitly framed as suggestions, not requirements.
- **Risk:** Without a backend, a planner switching browsers/devices loses access to their briefs unless they've exported JSON. *Mitigation:* explicitly a known v1 limitation, documented here and in onboarding copy; JSON export/import is the workaround until a sync backend exists.
- **Assumption — pending validation:** the 3 numeric success-metric targets in §10 (45 min median, 70% launch-from-brief, 90% mean completeness) are directive defaults, not research-backed numbers — no planner interviews were run to validate them. Revisit after the first cohort of real usage data.
- **Assumption — pending validation:** single-planner ownership per brief is sufficient for v1 (see Open Questions below).
- **Assumption:** the 7-PRD suite ordering and per-PRD read/write responsibilities assumed in the schema doc (§ Assumed PRD numbering) are this PRD's best inference from the source brief, not confirmed scope for PRDs 2–7. Those PRDs may refine their own responsibilities; any refinement should be additive to the schema (MINOR version bump) per the versioning policy, not a rewrite of it.

## 12. Open Questions and Documented Default Decisions

**Q1: Single-planner or collaborative editing in v1?** *(stakeholder's explicit open question)*
**Default decision: single-planner, single-editor-at-a-time in v1.** A brief has one implicit owner (`createdBy`); the app does not support concurrent multi-user editing, presence indicators, comments, or field-level locking. Rationale: this was meant to be validated via planner interviews we cannot currently run; defaulting to the simpler model avoids building real-time sync infrastructure (which is substantial — operational transforms or CRDTs, presence, conflict resolution) against a local-first, no-backend architecture where it would be especially costly to retrofit correctly. A planner can still *share* a brief by exporting it (FR-8) or, if we later add a lightweight backend, by sharing a link — but simultaneous co-editing is explicitly deferred to a future PRD once there's a backend to support it safely.
**Flagged as:** Assumption — pending validation.

**Q2: What exactly counts toward "brief completeness" beyond the FR-3 required fields?**
**Default decision:** completeness = (required fields populated, per FR-3) AND (at least 1 entry each in `stakeholders`, `successMetrics`, `riskRegister`, `timeline.milestones`) AND (`audience.targetPersonas` has at least 1 entry). Weighted evenly across these checks for the percentage shown in FR-10. Rationale: these are the sections most likely to be silently skipped since they're not hard-blocked by FR-3, but a brief missing all of them isn't meaningfully "complete" even if the top-level required text fields are filled.
**Flagged as:** Assumption — pending validation.

**Q3: Should `carryForwardLessons` matching in FR-11 be exact-type match only, or fuzzy/semantic?**
**Default decision:** exact `type` match only in v1 (e.g. webinar lessons only surface for new webinar briefs), falling back to "most recent 3 lessons regardless of type" if fewer than 3 type-matches exist. No NLP/semantic matching. Rationale: keeps this deterministic and testable without an AI dependency; revisit if lesson volume grows and exact-match feels too narrow.
**Flagged as:** Assumption — pending validation.

## 13. Release Criteria (Definition of Done for P0)

The Event Brief Generator P0 is done when all of the following are true:

- [ ] All 13 functional requirements (FR-1 through FR-13) pass their stated acceptance criteria.
- [ ] `packages/schema` exports the `EventBrief` TypeScript types and `event-brief.schema.json`, matching `schema/event-brief-schema.md` exactly, with `CURRENT_SCHEMA_VERSION = "1.0.0"` and a working (even if trivial/no-op at v1) `migrateBrief()` function.
- [ ] A planner can go from the brief list (empty state) through preset selection, all 6 intake steps, generation, and export, for each of the 3 presets plus Custom, without errors.
- [ ] Data persists across a page reload at every stage (mid-intake and post-generation).
- [ ] At least 2 fully worked example briefs (e.g. one Conference, one Webinar) exist as fixture data in the repo for manual QA and for other PRD-builders to develop against.
- [ ] Exported Markdown and HTML documents render correctly (spot-checked visually) and contain every populated section.
- [ ] The usage-log CSV export contains accurate rows for brief creation, completion, export, and tool-launch-link clicks.
- [ ] No console errors in a full click-through of the flow in Chrome and Firefox latest.
- [ ] `schema/event-brief-schema.md` and `event-brief.schema.json` are treated as frozen-for-v1 (no P0 work should require a breaking change) and are ready to hand to the builders of PRDs 2–7.
