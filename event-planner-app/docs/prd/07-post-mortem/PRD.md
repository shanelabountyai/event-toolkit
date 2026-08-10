# PRD 7: Post-Mortem Generator

## Metadata

| Field | Value |
|---|---|
| **Owner** | Product (Event Planner Productivity Suite) |
| **Status** | Approved for build |
| **Date** | 2026-08-09 |
| **Version** | 1.0 |
| **Suite position** | Seventh and **final** PRD in the suite. Depends on PRD 1 (Event Brief Generator / `packages/schema`) for the `EventBrief` this retro is built against and is the **primary writer of `carryForwardLessons`**; depends on PRD 3 (Run-of-Show / Logistics Pack) for `LogisticsPack.issueLog`; depends on PRD 4 (Budget Builder & Tracker) for `computeBudgetActualsSummary()` (imported directly, no re-derivation); depends on PRD 6 (Event ROI & Attribution Report) for the finalized `RoiReport`'s scorecard and recommendation. Per `schema/event-brief-schema.md`'s confirmed PRD numbering table, this PRD is the sole writer of `EventBrief.carryForwardLessons` and is authorized to make **final retro adjustments** to `EventBrief.successMetrics[].actual`. **This is the PRD that closes the suite's lifecycle loop** — see §16. |

---

## 1. Problem Statement

Post-event retrospectives are the step planners skip most often — not because they don't matter, but because by the time an event closes, the planner is already three deadlines into the next event, and running a retro means starting from a blank page: hunting through a shipping-issue Slack thread, guessing at what the budget actually did, and trying to remember what went wrong three weeks after it happened. When a retro does happen, it produces unstructured notes in a doc that gets shared once, read never again, and forgotten by the time the next event is planned — so the same AV vendor gets rebooked, the same headcount estimate gets fumbled, and the same catering overrun recurs, because nothing about last time's lessons made it into this time's plan. The organizational memory a retro is supposed to create simply doesn't persist between planning cycles.

## 2. Goals & Non-Goals

### Goals

1. **Make starting a retro cheap, not blank-page.** Assemble a structured retro automatically from data the suite already has — the Logistics Pack's issue log, the Budget Builder's variance, and the ROI Report's scorecard — so a planner opens the tool to a pre-populated draft, not an empty document.
2. **Turn raw incidents into decisions.** Every lesson gets a clear, categorized disposition (repeat / fix / drop, see §11) instead of an unstructured bullet point, so the retro produces something actionable, not just a record of what happened.
3. **Close the lifecycle loop.** Lessons a planner flags to carry forward are written into `EventBrief.carryForwardLessons`, which PRD 1's guided intake reads the very next time a brief is created — this is the mechanism, already declared in the schema doc, that makes the suite a genuine lifecycle tool rather than seven disconnected apps.
4. **Make the retro fast enough to actually get done.** Because the inputs are pre-ingested and lesson candidates are pre-drafted, a planner should be able to review, adjust dispositions, and complete a retro in well under an hour for a typical event — the single biggest lever against the "retros get skipped" problem named in the source brief.
5. **Give the retro a final say on the record.** Because a retro often surfaces context an automated ROI computation couldn't have known (a metric was mismeasured, a target was hit by an unreported channel), this PRD is the suite's designated place to make a final, explicit, reasoned correction to `successMetrics[].actual` — not a re-run of PRD 6's math, but a documented last word.

### Non-Goals (v1)

| Non-goal | Rationale |
|---|---|
| **Facilitation tooling** (live meeting mode, agenda timer, shared real-time whiteboard/session) | Explicitly named as a v1 non-goal in the source brief. This is a document-assembly and lesson-categorization tool, not a meeting-running tool; a planner can still run a live retro meeting off the exported document, they just don't run the meeting *inside* this app. |
| **Team voting / scoring** (star ratings, anonymous ballot, multi-participant weighting) | Explicitly named as a v1 non-goal. Dispositions are single-planner-assigned (mirroring every other status/toggle decision in this suite — draft/complete, reconciled, final), not a group-voted outcome, since v1 has no multi-user accounts to vote with in the first place. |
| **Multi-user / real-time collaborative editing** | Same binding standalone-first, single-editor constraint as every other tool in the suite (PRD 1 §"no real-time multi-user collaborative editing"). |
| **AI/LLM-generated lesson text** | Continues the suite's established no-AI-generation convention (PRD 1, PRD 5, PRD 6). Auto-generated lesson *candidates* are template strings built from structured source data (an issue's description, a variance percentage, a scorecard verdict), not freeform generated prose — the planner always edits the final wording. |
| **Cross-event lesson analytics** (e.g., "top 10 most common lessons across all events this year") | Valuable, but requires the portfolio-level view every prior PRD in this suite has deferred for the same reason (PRD 1 §"no multi-event portfolio dashboard"); a natural P1 once there's a real body of completed retros to analyze. |
| **Email/Slack delivery of the retro-prompt reminder or the completed retro** | No backend, no notification surface in v1 — same constraint as PRD 3's non-goal on push/SMS/email alerting. The prompt is an in-app banner; sharing the completed retro is export-and-send-manually, same as every other export in the suite. |
| **Configurable/pluggable disposition-suggestion rules** | The repeat/fix/drop auto-suggestion heuristics (§11) are fixed logic in v1, not a rule-builder a planner can customize — keeps the mechanism legible and consistent with PRD 6's decision not to build a scorecard rule-builder in v1 for the same reason. |
| **Multiple retros per event** | v1 assumes one `RetroDocument` per `EventBrief` (find-or-create), matching the 1:1 pattern PRD 3 and PRD 6 both already established for their own per-brief documents. |

## 3. Target Users & Persona

**Primary persona: Dana, the corporate/field marketing event planner** (same persona as PRD 1, 4, 5, 6). Opens this tool once budget actuals have mostly settled and (ideally, but not necessarily) once the ROI report exists — typically 1–4 weeks after event close. Wants the retro to take minutes to review, not hours to build, because she's already deep into planning the next event by the time this one's dust has settled.

**Secondary persona: Sam, Field Marketing Manager (stakeholder/approver).** May review the exported retro as a record for the event, and cares most about the repeat/fix/drop summary at a glance — same "wants to spot-check, not read every row" behavior described in PRD 3.

**Tertiary, and the whole point of this PRD: Dana-of-the-future.** The same planner, weeks or months later, starting the *next* event's brief in PRD 1. She never opens this tool again for the event this retro was about — she benefits from it entirely passively, as suggested constraints surfaced during PRD 1's guided intake (see §10). Every functional requirement in this PRD ultimately exists to serve this persona's moment, not the retro-authoring moment.

## 4. User Stories

1. As a planner, I want to open a retro for a closed event and see it already populated with issues, budget variance, and ROI scorecard data so that I'm not starting from a blank page.
2. As a planner, I want to be reminded to run a retro once an event has closed so that it doesn't quietly fall off my list the way it always used to.
3. As a planner, I want every lesson in the retro categorized as repeat, fix, or drop so that the retro produces a decision, not just a description of what happened.
4. As a planner, I want the tool to suggest a disposition for each auto-surfaced issue or variance based on clear rules so that I'm reviewing suggestions, not inventing categories from scratch every time.
5. As a planner, I want to add my own lessons that weren't captured by any automated source so that the retro isn't limited to what the tools happened to log.
6. As a planner, I want to choose which lessons carry forward into my next event's brief so that only the lessons worth remembering follow me, not every minor note.
7. As a planner, when I start my *next* event's brief, I want relevant lessons from past events to be suggested to me automatically so that I don't have to remember to go dig up an old retro.
8. As a planner, I want to correct a success metric's final value during the retro if I learn something the ROI report couldn't have known so that the brief's official record is accurate.
9. As a planner, I want to export the completed retro as a clean document so that I can share it with my manager or archive it.
10. As Sam (stakeholder), I want to see the repeat/fix/drop verdict and the headline numbers at a glance so that I can sanity-check the retro without reading every issue log entry.
11. As a planner, I want to mark a retro complete only when I'm confident it's done so that half-finished retros don't quietly count as done or silently carry forward incomplete lessons.

## 5. Functional Requirements (P0)

Numbered, testable requirements.

**FR-1 — Retro creation, required link to an Event Brief.** A planner creates a `RetroDocument` by selecting an existing `EventBrief` (required, no standalone mode — same pattern as PRD 6 FR-1, since a retro without a brief to write lessons back to has no purpose in this suite). One active `RetroDocument` exists per brief (find-or-create); if `EventBrief.dates.eventEndDate` is in the future, the tool still allows creation but shows a persistent "this event hasn't happened yet — some sections may be empty" banner rather than blocking.
*Acceptance:* Selecting a brief with no existing retro creates a new `RetroDocument` in `"draft"` status; selecting a brief that already has one opens the existing document instead of creating a duplicate; creating a retro on a brief whose `eventEndDate` is 10 days in the future shows the "hasn't happened yet" banner but does not block creation.

**FR-2 — Auto-prompt to start a retro.** Starting `eventEndDate + 3 days` (see §9 for the trigger-timing default and rationale), a dismissible banner appears on the linked brief's view and on the suite home/brief-list view for any past event with no `RetroDocument` in `"completed"` status: "It's been a few days since [Event Name] — ready to run the retro?" with a "Start Retro" action. The banner reappears on next visit if dismissed (not permanently silenced) until a retro is created for that brief. If no retro has been started by `eventEndDate + 14 days`, the banner escalates to a visually distinct "overdue" treatment (same styling severity as a red variance flag) purely as an attention cue — no functional gating.
*Acceptance:* A brief with `eventEndDate` 5 days in the past and no retro shows the banner; one with `eventEndDate` 1 day in the past does not yet; one with `eventEndDate` 20 days in the past and no retro shows the overdue-styled variant; a brief with a `"completed"` retro shows no banner regardless of date.

**FR-3 — Issue log ingestion (PRD 3 seam).** On retro open, the tool reads `LogisticsPack.issueLog` for the linked `eventBriefId` via the existing `logisticsRepository.getPackByBriefId()` (read-only — no writes to the Logistics Pack). Populates `ingestedIssueLogSummary`: total count, breakdown by severity, count still `"open"` at ingestion time, and the full entry list for reference in the UI. If no `LogisticsPack` exists for the brief, the section shows "No logistics pack found for this event — issue log unavailable" rather than an error or a misleading empty state.
*Acceptance:* A `LogisticsPack` with 5 issues (2 high, 2 medium, 1 low; 3 still open) populates counts exactly matching; a brief with no `LogisticsPack` shows the "unavailable" state and produces zero auto-generated issue-sourced lesson candidates without erroring.

**FR-4 — Budget variance ingestion (PRD 4 seam).** On retro open, the tool reads `BudgetLineItem[]`/`BudgetSettings` for the linked brief via the existing `budgetRepository`, then calls `computeBudgetActualsSummary(lineItems, budgetSettings, brief)` imported directly from `@event-toolkit/budget-calc` (PRD 4) — no budget math is re-derived. Populates `ingestedBudgetVarianceSummary` with total budgeted/actual, overall variance, the worst-variance categories (top 3 by absolute `variancePct`), and `varianceAtClose`. If no `BudgetSettings` exists, the section shows "Budget data not available — open Budget Builder for this event first."
*Acceptance:* A reconciled budget with F&B at +32% variance and AV at −5% populates the worst-category list with F&B first; a brief with no budget data shows "not available" and produces zero variance-sourced lesson candidates without erroring.

**FR-5 — ROI scorecard ingestion (PRD 6 seam).** On retro open, the tool reads the linked brief's `RoiReport` via the existing `roiReportRepository.getReportByBriefId()` (read-only). If found, populates `ingestedRoiScorecardSummary` with the scorecard's 5 dimensions (verdict, raw value, thresholds), the overall recommendation, its rationale, and the NPS score; the summary is labeled `"final"` or `"draft"` matching the source report's status (a draft-sourced summary carries a visible "based on a draft ROI report — figures may change" caveat). If no `RoiReport` exists, the section shows "No ROI report found for this event — scorecard unavailable."
*Acceptance:* A finalized `RoiReport` with recommendation `"change"` and two red dimensions populates the summary labeled `"final"` with both red dimensions visible; a brief with only a draft report shows the same data labeled `"draft"` with the caveat text; a brief with no report shows "unavailable" and produces zero scorecard-sourced lesson candidates.

**FR-6 — Auto-generated lesson candidates.** Immediately after ingestion (FR-3/FR-4/FR-5), the tool generates draft `RetroLesson` candidates per the deterministic rules in §11's taxonomy table — one candidate per qualifying issue-log entry, one per qualifying budget category, and up to three summary-level candidates derived from the ROI scorecard's dimension verdicts and overall recommendation. Every candidate is pre-filled with `lesson` text (a template string with the source's actual figures merged in, e.g. "AV vendor arrived 20 minutes late, delaying the opening session — flagged high severity."), a suggested `disposition`, `sourceType`, `sourceRef`, and `carryForward` defaulted to `true`. Nothing is written anywhere outside the `RetroDocument` at this stage — these are drafts within the retro only.
*Acceptance:* A `LogisticsPack` with 2 high-severity issues sharing `relatedArtifact: "shipping"` produces 2 individual candidate lessons (each suggested `"fix"`) plus 1 additional consolidated pattern-level candidate suggested `"drop"` (per §11's clustering rule); a budget category flagged `"red"` with `budgetedAmount > 0` produces 1 candidate suggested `"fix"`; a category flagged red with `budgetedAmount === 0` (unbudgeted spend) produces 1 candidate suggested `"drop"`; an ROI report with overall recommendation `"kill"` produces exactly one summary-level candidate suggested `"drop"`.

**FR-7 — Manual lesson entry.** A planner can add a `RetroLesson` not derived from any automated source (`sourceType: "manual"`), entering `lesson` text, `category` (free text, e.g. "Budget," "Vendor," "Logistics," "Content" — consistent with the existing `LessonLearned.category` precedent), and `disposition` directly, with no suggested default to accept or reject.
*Acceptance:* Adding a manual lesson with disposition `"repeat"` and category `"Content"` appears in the Repeat column alongside any auto-generated repeat lessons, indistinguishable in structure (only `sourceType` differs).

**FR-8 — Lesson review and editing.** Every lesson (auto-generated or manual) has an editable `lesson` text field, `category`, `disposition` (repeat/fix/drop — required before the retro can be marked complete, FR-11), and a `carryForward` toggle. Auto-generated lessons retain their `sourceType`/`sourceRef` for traceability (shown on hover/detail, e.g. "from Issue Log: AV delay") even after editing.
*Acceptance:* Editing an auto-generated lesson's text and changing its suggested disposition from `"fix"` to `"drop"` persists both changes and does not alter `sourceType`/`sourceRef`; deleting a lesson removes it from all downstream calculations (carry-forward write-back, disposition summary) without needing a page reload.

**FR-9 — Categorized lesson view.** The retro's lesson workspace groups all lessons into three visually distinct sections — Repeat / Fix / Drop — with a count badge per section, so the categorization required by the source brief's core capability is the primary way lessons are browsed, not an afterthought field on a flat list.
*Acceptance:* A retro with 4 repeat, 3 fix, and 2 drop lessons shows exactly those counts in each section's badge; changing a lesson's disposition moves it to the correct section immediately.

**FR-10 — Success-metric final adjustment.** A planner can, from the retro, propose an adjustment to any of the linked brief's `successMetrics[].actual` values, entering a new value and a required free-text reason (e.g. "ROI report used a lead-triage count that excluded 40 badge-scan-only leads discovered post-report"). Each confirmed adjustment writes to `EventBrief.successMetrics[].actual` via the existing `briefRepository.saveBrief` path, bumps `EventBrief.version`/`updatedAt`, and is recorded in the retro's own `successMetricAdjustments` history (previous value, new value, reason, timestamp) so the correction itself is auditable. This is optional per metric — a retro with zero adjustments is a fully valid, completable retro.
*Acceptance:* Adjusting a metric named "MQLs generated" from `38` to `42` with a reason recorded writes `42` to the brief's `successMetrics[].actual` for that metric, increments `EventBrief.version`, and the retro shows the adjustment (previous `38` → new `42`, reason, timestamp) in its history; a retro with no adjustments completes normally.

**FR-11 — Mark retro complete.** A planner explicitly marks the retro `"completed"` (self-declared, mirroring PRD 1's draft/complete, PRD 4's reconciled, and PRD 6's final patterns). Completion requires every lesson to have a non-null `disposition` (the tool blocks completion and lists any lesson still missing one) but does **not** require at least one lesson to exist — a retro with zero lessons and a note explaining why (e.g., "no issues logged, no notable variance") is a valid, completable retro. Completion stamps `completedAt` and triggers FR-12's carry-forward write-back.
*Acceptance:* Attempting to complete a retro with one lesson still missing a disposition is blocked with that lesson highlighted; completing a retro with all dispositions set stamps `completedAt` and triggers the write-back; completing an empty retro (zero lessons) succeeds without error.

**FR-12 — Carry-forward write-back (the suite-closing mechanic).** On marking the retro complete (FR-11), every lesson with `carryForward === true` is converted into a `LessonLearned` object — `id` (new UUID), `sourceEventId` = the linked `EventBrief.id`, `category`, `lesson` (the lesson's final edited text), `addedAt` (current timestamp), plus the two additive fields this PRD introduces to the schema, `disposition` and `sourceType` (§10) — and appended to `EventBrief.carryForwardLessons` via the existing `briefRepository.saveBrief` path, bumping `EventBrief.version`/`updatedAt`. The write is idempotent: re-opening a completed retro and editing a lesson that was already written (tracked via a stored mapping from `RetroLesson.id` to the `LessonLearned.id` it produced) updates the existing brief entry rather than appending a duplicate; toggling `carryForward` from `true` to `false` after completion removes the corresponding entry from `carryForwardLessons` on next save. Lessons with `carryForward === false` are never written to the brief at all — they remain visible only within the `RetroDocument`.
*Acceptance:* Completing a retro with 3 repeat, 2 fix, and 1 drop lesson, all `carryForward: true`, appends exactly 6 new entries to `EventBrief.carryForwardLessons` with correct `disposition` values and increments `EventBrief.version`; re-opening the retro, editing one lesson's text, and re-completing updates that same brief entry's `lesson` text rather than adding a 7th entry; toggling one lesson's `carryForward` to `false` and re-saving removes exactly that one entry from the brief.

**FR-13 — Retro export.** The planner can export the full retro as Markdown and printable HTML, containing: event header, ingestion-status summary (what was/wasn't available), the three disposition sections with full lesson detail, the success-metric adjustment history, and the ROI scorecard recommendation if available — following the same export precedent as every other tool in the suite (PRD 1 §FR-8, PRD 6 §FR-12).
*Acceptance:* Exporting a fully-populated retro produces a document containing all listed sections in readable form with real data, not placeholder text; exporting an empty/minimal retro (FR-11's zero-lesson case) still produces a valid, non-broken document.

**FR-14 — Local usage-event log.** Per the suite's local-only instrumentation pattern, the tool logs: `retro_created`, `retro_prompt_shown`, `issue_log_ingested`, `budget_variance_ingested`, `roi_scorecard_ingested`, `lesson_added_manual`, `lesson_disposition_changed`, `success_metric_adjusted`, `retro_completed`, `carry_forward_written` (with count of lessons written), `retro_exported`, each with a timestamp, into the same exportable usage-log CSV mechanism as the rest of the suite.
*Acceptance:* Performing each of the eleven listed actions produces a corresponding row in the usage-log CSV export with accurate event type and timestamp; `carry_forward_written` rows include the correct written-lesson count.

**FR-15 — Schema versioning for the retro document.** Every `RetroDocument` carries `schemaVersion`; a `migrateRetroDocument()` function (no-op passthrough acceptable for v1, but must exist and be called on every read) runs before use, mirroring the discipline established by every prior document type in this suite (`LogisticsPack`, budget/ROI records).
*Acceptance:* A `RetroDocument` fixture missing `schemaVersion` (simulating a pre-migration document) loads without error and is stamped with the current version on next save.

## 6. P1 / Later

- **Facilitation mode** — a guided, timed live-meeting flow with an agenda, presenter view, and a "next topic" advance control, for planners who want to run the retro meeting itself inside the tool rather than off an exported doc.
- **Team voting/scoring** — lightweight multi-participant input on disposition (e.g., a simple upvote on a proposed lesson) once the suite has any concept of multiple accounts/users to vote with.
- **Email/reminder delivery of the retro-prompt** — a scheduled digest email instead of relying on the planner opening the app; blocked on the suite having any backend/notification surface at all.
- **Cross-event lesson analytics** — "which lessons recur across 3+ events," a natural candidate once there's a real body of completed retros, using the same portfolio-view infrastructure every prior PRD in this suite has deferred.
- **Configurable disposition-suggestion rules** — letting a planner or org tune the §11 heuristics (e.g., their own severity/variance thresholds) instead of the fixed v1 defaults.
- **AI-assisted lesson drafting** — suggesting lesson phrasing from an issue's freeform description using an LLM, once the suite's no-AI-generation convention is revisited as a deliberate, separate decision (not something to slip in here).
- **Retro templates per event type** — pre-seeded prompt questions specific to Conference/Webinar/Trade Show (e.g., "how was booth traffic vs. expectation" for trade shows only), extending the preset pattern PRD 1 established.
- **Multiple retros per event / retro history** — supporting a mid-planning "hot debrief" plus a later "cold debrief" as two distinct documents, instead of v1's single find-or-create retro.

## 7. Data Model

### 7.1 Schema extension this PRD makes to `packages/schema`

Per `schema/event-brief-schema.md`'s ownership table, PRD 7 is the sole writer of `EventBrief.carryForwardLessons` and its element type, `LessonLearned`. Consistent with the schema's own versioning policy ("open the change against `packages/schema`, add the field as optional... bump MINOR"), this PRD adds **two new optional fields** to the existing `LessonLearned` interface in `packages/schema/src/event-brief.ts` — it does not redefine the type, does not touch any other field, and does not touch any other interface in that file:

```typescript
// packages/schema/src/event-brief.ts — ADDITIVE CHANGE ONLY, bump to schemaVersion "1.1.0"

export type LessonDisposition = "repeat" | "fix" | "drop"; // NEW

export interface LessonLearned {
  id: string;
  sourceEventId?: string;
  category?: string;
  lesson: string;
  addedAt: string;
  disposition?: LessonDisposition;   // NEW, optional — set by PRD 7 on write; undefined on any pre-1.1.0 entry
  sourceType?: "issue_log" | "budget_variance" | "roi_scorecard" | "manual"; // NEW, optional
}
```

This requires: bumping `CURRENT_SCHEMA_VERSION` to `"1.1.0"` in `packages/schema/src/migrations/index.ts` (the migration itself remains a no-op passthrough — both new fields are optional, so no existing brief document needs transformation), a `CHANGELOG.md` entry, and updating the `LessonLearned` row in `schema/event-brief-schema.md` to document the two new fields. **No other file in `packages/schema` changes.** Every other tool in the suite (PRD 1–6) is unaffected — per the schema's own forward-compatibility rule, readers ignore fields they don't recognize, and PRD 1's intake flow (the consumer of `carryForwardLessons`) needs no code change to keep working; it simply gains the ability to display `disposition` if/when its own UI is later updated to do so (a natural, non-blocking P1 for PRD 1, not required for this PRD's own release).

### 7.2 What this tool reads from upstream PRDs

| Source | What's read | How |
|---|---|---|
| `EventBrief` (PRD 1) | `id`, `name`, `type`, `dates.eventEndDate`, `successMetrics` (for FR-10), `carryForwardLessons` (to avoid re-suggesting lessons already written by a *different* retro on the same brief, an edge case guard) | `briefRepository.getBrief()` — existing, read (and the single write path for FR-10/FR-12) |
| `LogisticsPack.issueLog` (PRD 3) | Full `IssueLogEntry[]` | `logisticsRepository.getPackByBriefId()` — existing, read-only |
| `BudgetLineItem[]` / `BudgetSettings` (PRD 4) | Full line items + settings, passed into `computeBudgetActualsSummary()` | `budgetRepository` — existing, read-only; `computeBudgetActualsSummary` imported from `@event-toolkit/budget-calc` — function call, not re-derivation |
| `RoiReport` (PRD 6) | `scorecard`, `surveySummary.npsScore`, `status` | `roiReportRepository.getReportByBriefId()` — existing, read-only |

This tool makes **zero writes** to `LogisticsPack`, `BudgetLineItem`/`BudgetSettings`, or `RoiReport` data at any point — it is as strictly read-only against those three tools' data as PRD 6 is against PRD 4/5's.

### 7.3 New document: `RetroDocument`

Stored in a new `packages/postmortem-core` workspace package (pure TypeScript domain types + pure functions, zero React/Next dependency — mirrors every prior domain package's shape) and persisted via a new `retroRepository.ts` in `packages/local-store`, in a new `retroDocuments` IndexedDB object store keyed by `id`, indexed by `eventBriefId`.

```typescript
// packages/postmortem-core/src/retro.ts
import type { LessonLearned, LessonDisposition } from "@event-toolkit/schema";
import type { IssueLogEntry } from "@event-toolkit/logistics";
import type { CategorySpend, BudgetActualsSummary } from "@event-toolkit/budget-calc";
import type { ScorecardDimension } from "@event-toolkit/roi-report-core";

export const CURRENT_RETRO_SCHEMA_VERSION = "1.0.0";

export type RetroStatus = "draft" | "completed";
export type RetroLessonSourceType = "issue_log" | "budget_variance" | "roi_scorecard" | "manual";

// A RetroLesson is a LessonLearned plus retro-authoring-time fields.
// Only `disposition` and `sourceType` (both now part of LessonLearned itself, §7.1)
// travel into EventBrief.carryForwardLessons on write-back; `sourceRef` and
// `carryForward` are retro-local only.
export interface RetroLesson extends LessonLearned {
  disposition: LessonDisposition;         // required at the retro-authoring level (base type keeps it optional for backward compat)
  sourceType: RetroLessonSourceType;      // required at the retro-authoring level
  sourceRef?: string;                     // e.g. IssueLogEntry.id, a BudgetLineItemCategory value, or a ScorecardDimension.id — retro-local only, not written to the brief
  carryForward: boolean;                  // default true; planner-controlled
  writtenLessonId?: string;               // set once carried forward — the id of the LessonLearned entry this produced in EventBrief.carryForwardLessons, used for idempotent re-write (FR-12)
}

export interface IngestedIssueLogSummary {
  available: boolean;
  logisticsPackId: string | null;
  totalIssues: number;
  bySeverity: { low: number; medium: number; high: number };
  openAtIngestion: number;
  entries: IssueLogEntry[];               // full pass-through for reference/detail views
}

export interface IngestedBudgetVarianceSummary {
  available: boolean;
  totalBudgeted: number;
  totalActual: number;
  variancePct: number | null;
  worstCategoryVariances: CategorySpend[]; // top 3 by |variancePct|
  varianceAtClose: BudgetActualsSummary["varianceAtClose"] | null;
}

export interface IngestedRoiScorecardSummary {
  available: boolean;
  roiReportId: string | null;
  reportStatus: "draft" | "final" | null;
  recommendation: "repeat" | "change" | "kill" | "insufficient_data" | null;
  recommendationRationale: string | null;
  scorePct: number | null;
  dimensions: ScorecardDimension[];
  npsScore: number | null;
}

export interface SuccessMetricAdjustment {
  metricId: string;
  metricName: string;
  previousActual: number | null;
  adjustedActual: number;
  reason: string;
  adjustedAt: string;
}

export interface RetroDocument {
  schemaVersion: string;
  id: string;                             // UUID
  eventBriefId: string;                   // FK into EventBrief.id
  eventName: string;                      // snapshot at creation, for display without re-reading the brief
  status: RetroStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  version: number;                        // revision counter, same discipline as every other suite document
  ingestedIssueLogSummary: IngestedIssueLogSummary;
  ingestedBudgetVarianceSummary: IngestedBudgetVarianceSummary;
  ingestedRoiScorecardSummary: IngestedRoiScorecardSummary;
  lessons: RetroLesson[];
  notes?: string;                          // freeform overflow, e.g. why a retro has zero lessons
  successMetricAdjustments: SuccessMetricAdjustment[];
}
```

### 7.4 How the three upstream seams feed the retro template, concretely

- **Issue log → lessons (FR-3, FR-6):** every `IssueLogEntry` becomes a candidate `RetroLesson` with `sourceType: "issue_log"`, `sourceRef: entry.id`. Severity drives the suggested `disposition` per §11. Entries sharing the same non-empty `relatedArtifact` with severity `"high"`, when there are ≥2 such entries, additionally produce one consolidated pattern-level candidate (`sourceRef` = the shared `relatedArtifact` string) suggested `"drop"`.
- **Budget variance → lessons (FR-4, FR-6):** every category in `BudgetActualsSummary.spendByCategory` with a non-`"none"` flag (amber/red, computed the same way PRD 4's UI computes it, re-derived here only for display grouping — the underlying `variancePct` numbers themselves come verbatim from `computeBudgetActualsSummary`) becomes a candidate `RetroLesson` with `sourceType: "budget_variance"`, `sourceRef: category`. Disposition suggestion per §11.
- **ROI scorecard → lessons (FR-5, FR-6):** the overall `recommendation` produces at most one summary-level candidate (`sourceType: "roi_scorecard"`, `sourceRef: "overall"`); any individual dimension scoring `"red"` produces its own candidate (`sourceRef` = the dimension's `id`). Disposition suggestion per §11.
- **Carry-forward, exactly as declared in the schema doc (FR-12):** on retro completion, every `RetroLesson` with `carryForward === true` is mapped down to a bare `LessonLearned` (dropping `sourceRef` and `carryForward`, which are retro-local) and appended to `EventBrief.carryForwardLessons` via `briefRepository.saveBrief`. This is the exact mechanism `schema/event-brief-schema.md`'s "Suite mechanic" note under `LessonLearned` describes: *"During PRD 1's guided intake, the tool queries the local store for `LessonLearned` entries across all prior briefs... and surfaces relevant ones as suggested constraints/risks for the new brief."* This PRD is the writer half of that mechanic; PRD 1 (already built) is the reader half — no changes to PRD 1's code are required for the loop to close, because PRD 1's FR-11 already queries `carryForwardLessons` across all local briefs filtered by `type`.

## 8. UX Flow

1. **Entry.** Reached via the "Post-Mortem" tool link on a brief's view (a disabled/"coming soon" stub PRD 1 already built for this slot — now wired to real find-or-create behavior) or from a standalone `/retro` list of retros across all local briefs (event name, status, lesson-disposition counts, last updated). Also reachable via the FR-2 auto-prompt banner.
2. **Retro creation / open.** Selecting a brief with no existing retro creates one and immediately runs ingestion (FR-3/FR-4/FR-5) and candidate generation (FR-6), landing on the **Retro Dashboard**.
3. **Retro Dashboard** (`/retro/[retroId]`): header (event name/dates); an **Ingestion Status** panel with 3 tiles (Issue Log / Budget Variance / ROI Scorecard), each showing a summary figure or an "unavailable — [launch that tool]" call-to-action; the **Lesson Workspace** (FR-9's three-column Repeat/Fix/Drop view) with an "Add lesson" control; a **Success Metrics** panel (brief's current metrics + an "Adjust" action per metric, FR-10); "Mark Retro Complete" action; "Export" action.
4. **Reviewing a candidate lesson.** Each auto-generated candidate shows its source (e.g. "From Issue Log: AV delay, high severity"), pre-filled text, and suggested disposition as an editable dropdown pre-selected to the suggestion — planner accepts (leaves as-is), edits the text, or changes the disposition; a per-lesson `carryForward` checkbox defaults checked.
5. **Adding a manual lesson.** "Add lesson" opens an inline form: text, category, disposition (no default) — appears in the correct column immediately on save.
6. **Adjusting a success metric.** Clicking "Adjust" next to a metric in the Success Metrics panel opens a small form: new value + required reason; confirming writes back to the brief and logs the adjustment in the retro's visible history beneath that metric.
7. **Completing the retro.** "Mark Retro Complete" runs the FR-11 disposition-completeness check; if all lessons have a disposition, it proceeds to a confirmation summary ("6 lessons will carry forward to your next event's brief — 3 repeat, 2 fix, 1 drop") before committing FR-12's write-back, then stamps `completedAt`.
8. **Export.** "Export" opens a format choice (Markdown/HTML) and triggers a download, logged per FR-14.
9. **The payoff, weeks later, in a different tool.** The planner starts a brand-new brief in PRD 1 of the same `type`. During the Goals/Constraints intake step, PRD 1's existing FR-11 (already built, unmodified) surfaces this retro's carried-forward lessons — including their `disposition` and `sourceType`, now present on those `LessonLearned` entries — as dismissible suggestions the planner can accept into the new brief's `constraints.items`. Nothing in this step required opening the Post-Mortem tool again.

## 9. Retro-Trigger Timing — Default Decision

**This is one of the two explicit judgment calls this PRD's assignment flagged as needing a documented default** (the source brief did not specify when a planner should be prompted into a retro).

> **Default decision (Assumption — pending validation): prompt at `eventEndDate + 3 days`, escalate visually (not functionally) at `eventEndDate + 14 days`.**
>
> **Rationale:**
> - *Not immediately at `eventEndDate`:* budget actuals (FR-4) and any ROI report (FR-5) are very unlikely to be settled the moment an event ends — invoices haven't landed, surveys haven't closed. Prompting on day 0 would train planners to either ignore the prompt (because the retro would be mostly "unavailable" sections) or run a retro too early to be useful, undermining the tool's core promise of a pre-populated, data-rich starting point.
> - *3 days, not 7 or 14:* the source brief's own problem statement is explicit that retros get skipped the longer they're delayed — "lessons are lost between cycles" — so the default should err toward *soon*, not toward waiting for every input to be perfectly settled. Issue-log data (FR-3) is available immediately at event close regardless of budget/ROI timing, so a retro started at day 3 is never actually empty even if the other two sections are still "unavailable" — it degrades gracefully by design (§7.2's "not available" states), which is what makes prompting early defensible rather than premature.
> - *14-day escalation, visual only, not a hard block:* mirrors the variance-flag red/amber pattern already established in PRD 4 — a familiar, low-effort way to convey urgency without inventing a new UI pattern, and explicitly non-blocking because forcing completion would contradict FR-11's requirement that a retro can be legitimately completed even when some inputs never arrive (e.g., a webinar with no logistics pack at all).
> - **How to validate:** the first round of real planner interviews should directly ask "when after an event do you actually have enough information/headspace to do a retro, and when would a reminder feel helpful vs. annoying?" — if the answer clusters meaningfully earlier or later than day 3, or the 14-day escalation point feels wrong, adjust both constants (they are implemented as named constants in `packages/postmortem-core`, not hardcoded inline, specifically so this is a one-line change once validated).

## 10. Success-Metric Instrumentation Note (dependency on PRD 1)

The second §11 success metric below ("% of next-event briefs that consume carry-forward items") is precisely measurable only if PRD 1's intake flow logs when a suggested carry-forward lesson is *accepted* into `constraints.items` — and PRD 1's existing usage-log event list (FR-13 there: `brief created`, `brief marked complete`, `export triggered`, `tool-launch-link clicked`) does not currently include that event. Consistent with the pattern PRD 4 and PRD 6 already used when they needed a small additive instrumentation change to an earlier, already-built PRD (PRD 4 §13's `variance_flag_first_triggered` addition to its own log; PRD 6 recommending an additive `SuccessMetric.direction` field to PRD 1's schema), **this PRD recommends one small additive change to PRD 1**: a new usage-log event type, `carry_forward_lesson_accepted` (fired when a suggested lesson is accepted into `constraints.items` during intake, capturing the source `LessonLearned.id`). This is a pure logging addition — no UI or schema change — and does not block this PRD's own release; §11's measurement approach below describes the fallback in its absence.

## 11. Categorization Taxonomy — Repeat / Fix / Drop

**This is the second explicit judgment call this PRD's assignment flagged as needing a documented default** (the source brief named the three categories but not the criteria for assigning them).

**Definitions:**

- **Repeat** — this specific element worked and should be preserved as-is next time. No corrective action implied; carrying it forward is a reminder of what to keep doing, not a warning.
- **Fix** — this element is fundamentally worth keeping, but something about *how* it was executed needs a specific, nameable change next time (a different vendor, an earlier lead time, a tighter budget line). The underlying activity continues; the execution changes.
- **Drop** — this element should not be repeated in its current form at all — not a tuning problem, a structural one (a chronically underperforming vendor relationship, a format/venue choice that's now shown a pattern of failure, a budget category that shouldn't exist unplanned).

**Auto-suggestion rules** (deterministic, implemented in `packages/postmortem-core`, always editable by the planner before completion — these are suggestions, never silent assignments):

| Source | Condition | Suggested disposition |
|---|---|---|
| Issue log entry | `severity: "low"` | `repeat` (the underlying element still worked; the issue is noted as a minor caveat in the generated lesson text, e.g. "generally smooth — watch for X") |
| Issue log entry | `severity: "medium"` | `fix` |
| Issue log entry | `severity: "high"` | `fix` |
| Issue log entries (clustered) | ≥2 entries share the same non-empty `relatedArtifact`, both/all `severity: "high"` | An **additional** consolidated pattern-level lesson is generated, suggested `drop` — repeated high-severity failure in the same artifact is treated as a structural signal, not a one-off to merely fix |
| Budget category | flag `"amber"` | `fix` |
| Budget category | flag `"red"`, `budgetedAmount > 0` | `fix` |
| Budget category | flag `"red"`, `budgetedAmount === 0` (unbudgeted spend) | `drop` — an entirely unplanned category is either formally budgeted for or eliminated, not quietly repeated |
| Budget category | flag `"none"` with `actualAmount > 0` | `repeat` |
| ROI scorecard dimension | verdict `"green"` | `repeat` |
| ROI scorecard dimension | verdict `"yellow"` | `fix` |
| ROI scorecard dimension | verdict `"red"` | `fix` |
| ROI scorecard overall recommendation | `"repeat"` | `repeat` (one summary-level lesson: "[event] scored well overall — repeat this format") |
| ROI scorecard overall recommendation | `"change"` | `fix` (one summary-level lesson naming the specific weak dimensions, mirroring PRD 6's own `recommendationRationale` language) |
| ROI scorecard overall recommendation | `"kill"` | `drop` (one summary-level lesson: "[event] scored poorly overall — consider discontinuing this event/format") |

**Rationale for this taxonomy over alternatives:** a two-bucket "good/bad" taxonomy (considered and rejected) collapses the genuinely different actions "keep doing this exactly" and "keep doing this but change how" into one bucket, losing the actionability the source brief explicitly asked for ("categorized lessons"). A finer taxonomy (5+ buckets, e.g. separating "vendor issue" from "process issue" as top-level dispositions) was also considered and rejected as over-engineering for v1 — `category` (free text) already captures that dimension orthogonally, so disposition stays a clean three-way action verdict, not a blended action-plus-domain taxonomy.

**How to validate:** the first round of planner interviews should walk through 5–10 real historical issues/variances with a planner and ask them to independently assign repeat/fix/drop, then compare against what these rules would have suggested — disagreement patterns (e.g., planners treating a "high severity but one-off" issue as `repeat` more often than these rules predict) should directly inform adjusting the severity/flag thresholds in the table above, which are implemented as the sole source of truth for suggestion logic (not scattered inline), specifically so they're a contained, low-risk change once validated.

## 12. Success Metrics & How Measured

The exact two named in the source stakeholder brief.

1. **% of events with a completed retro.**
   - *Definition:* of all briefs whose `dates.eventEndDate` is in the past, the fraction with an associated `RetroDocument` in `status: "completed"`.
   - *Measurement:* computed directly from stored `RetroDocument.status`/`completedAt` against the linked brief's `eventEndDate`; no additional logging required beyond FR-14's `retro_completed` event, which provides the timestamp for a secondary "time from event close to retro completion" diagnostic.
   - *Target:* ≥65% of past events show a completed retro within 30 days of `eventEndDate` (assumption — pending validation; set intentionally lower than PRD 4's reconciled-budget target or PRD 6's report-started target, because the source brief itself identifies retros as the step most often skipped in current practice — this metric's honest job in v1 is to establish a real baseline, not assume this tool alone fixes years of retro-avoidance).

2. **% of next-event briefs that consume carry-forward items.**
   - *Definition:* of all new briefs created where ≥1 prior local brief of the same `type` has a non-empty `carryForwardLessons` array, the fraction where ≥1 suggested lesson was accepted into that new brief's `constraints.items` during PRD 1's intake.
   - *Measurement (primary):* once the §10 additive PRD 1 logging change (`carry_forward_lesson_accepted`) lands, this is a direct count from the usage log: briefs with ≥1 such event, divided by briefs eligible to have seen the prompt at all. *(Fallback, if that logging change hasn't landed yet):* a local, manually-run comparison script that diffs each new brief's `constraints.items` text against the `lesson` text of `carryForwardLessons` entries from same-`type` prior briefs, counting a substantive text match as evidence of acceptance — an approximate proxy, explicitly weaker than the logged version, and should be replaced by the real instrumentation as soon as practical.
   - *Target:* ≥40% (assumption — pending validation; set lower than metric 1 because this event happens in a *different tool session*, often weeks or months later, entirely dependent on a planner noticing and accepting a passive suggestion rather than taking a direct in-the-moment action).

## 13. Risks & Assumptions

- **Risk:** This is explicitly the step planners already skip most, per the source brief's own problem statement — no amount of good tooling guarantees adoption. *Mitigation:* the entire design (auto-ingestion, pre-drafted lessons, a low completion bar that doesn't require inputs to be perfect) is aimed at minimizing the activation energy to *start*, since the source brief frames the core failure as "retros are skipped," not "retros are done badly" — reducing friction to start is the highest-leverage lever this PRD can pull.
- **Risk:** Auto-suggested dispositions (§11) are unvalidated heuristics; a planner who rubber-stamps every suggestion without engaging could produce a retro that looks structured but reflects lazy categorization rather than real reflection. *Mitigation:* every suggestion is visibly editable and requires an explicit "complete" action; this is an accepted, honest limitation of any default-assisted workflow, not something a UI pattern alone can fully prevent.
- **Risk:** Degraded/partial retros (missing Logistics Pack, Budget, or ROI data) are structurally common in v1, since not every planner will have used all three upstream tools for every event. *Mitigation:* every ingestion section has an explicit, non-alarming "not available" state (§7.2) and FR-11 explicitly permits completing a retro with zero auto-generated lessons — the tool must remain useful and completable for a planner who only ever used the Event Brief and nothing else, not just for the "full suite" power user.
- **Risk:** The `successMetrics[].actual` final-adjustment power (FR-10) could be misused to quietly rewrite an unfavorable ROI figure rather than genuinely correct it. *Mitigation:* every adjustment requires a free-text reason and is permanently visible in the retro's own history (never a silent overwrite) — the same transparency principle PRD 6 applied to its own write-back (FR-13 there).
- **Risk:** The schema extension to `LessonLearned` (§7.1), while additive and backward-compatible per the schema's own versioning policy, is still a change to a type five other PRDs' documentation references. *Mitigation:* the change is strictly additive (two new optional fields, no existing field touched), matches the exact process the schema doc itself prescribes for this situation, and was anticipated by the schema's ownership table, which already names PRD 7 as `LessonLearned`'s sole writer — no other PRD's code needs to change for this to be safe.
- **Assumption — pending validation:** the retro-trigger timing defaults (day 3 prompt / day 14 escalation) — see §9.
- **Assumption — pending validation:** the repeat/fix/drop auto-suggestion rules — see §11.
- **Assumption — pending validation:** both §12 success-metric numeric targets — no planner interviews were run, consistent with every other PRD in this suite.

## 14. Open Questions and Documented Default Decisions

**Q1: When should a planner be prompted into a retro?** *(explicitly flagged in this PRD's assignment as a judgment call with no validated input)*
**Default decision:** `eventEndDate + 3 days`, non-blocking visual escalation at `+14 days`. Full rationale in §9.
**Flagged as:** Assumption — pending validation.

**Q2: What are the criteria for repeat vs. fix vs. drop?** *(explicitly flagged in this PRD's assignment as a judgment call with no validated input)*
**Default decision:** the severity/flag/verdict-driven rule table in §11, with a structural-pattern escalation rule for clustered high-severity issues.
**Flagged as:** Assumption — pending validation.

**Q3: Should a retro be allowed to complete with zero lessons?**
**Default decision:** yes (FR-11). Rationale: forcing a minimum lesson count would either block a legitimately uneventful, well-run event's retro from ever completing, or worse, pressure planners into inventing padding lessons just to satisfy a rule — directly undermining the "retro produces real signal" goal. A `notes` field exists for the planner to explain a sparse retro in their own words.
**Flagged as:** low-risk, not requiring validation — mirrors PRD 4's identical reasoning for not requiring 100% actuals coverage before allowing "reconciled."

**Q4: Should the retro be blocked from being created before an event has actually happened?**
**Default decision:** no — allowed with a persistent warning banner (FR-1). Rationale: a planner may reasonably want to pre-stage a retro shell (e.g., jot a note the day something goes wrong mid-event) rather than being forced to wait; blocking creation adds friction without a clear benefit, and every ingestion section already degrades gracefully when its source data doesn't exist yet regardless of the reason.
**Flagged as:** low-risk, not requiring validation.

**Q5: Should `disposition`/`sourceType` be added to the canonical `LessonLearned` type, or kept entirely local to this PRD's own `RetroDocument`?**
**Default decision:** added to `LessonLearned` itself, as two new optional fields (§7.1), so they travel with the lesson into `EventBrief.carryForwardLessons` and are available to PRD 1 (or any future consumer) without needing a second lookup into retro-specific storage. Rationale: `sourceRef` and `carryForward` stay retro-local because they're only meaningful during retro authoring (a pointer to a since-possibly-deleted issue log entry; a toggle that's already been "resolved" into the write-back decision by the time the lesson exists on the brief) — but `disposition` and `sourceType` are exactly the kind of durable, meaningful-forever metadata the schema's own additive-field mechanism exists to support.
**Flagged as:** Assumption — pending validation (specifically: whether PRD 1's UI should be updated to *display* `disposition` when surfacing suggestions, which this PRD deliberately leaves as a non-blocking P1 for PRD 1 rather than in scope here).

## 15. Release Criteria (Definition of Done)

- [ ] All 15 P0 functional requirements (FR-1 through FR-15) implemented and pass their stated test in this document.
- [ ] `packages/schema/src/event-brief.ts`'s `LessonLearned` interface carries the two new optional fields (`disposition`, `sourceType`) and nothing else in that file changed; `CURRENT_SCHEMA_VERSION` bumped to `"1.1.0"`; `CHANGELOG.md` and `schema/event-brief-schema.md`'s `LessonLearned` table row updated to match.
- [ ] `packages/postmortem-core` exists, has zero React/Next dependency, exports `RetroDocument` and all sub-types, `CURRENT_RETRO_SCHEMA_VERSION`, a `migrateRetroDocument()` function, and pure functions for candidate-lesson generation (§11's rule table) and carry-forward mapping — all independently unit-testable.
- [ ] `packages/postmortem-core` imports `computeBudgetActualsSummary` from `@event-toolkit/budget-calc` (PRD 4) rather than re-implementing any budget math, and imports `IssueLogEntry`/`RoiReport`/scorecard types read-only from `@event-toolkit/logistics`/`@event-toolkit/roi-report-core` rather than redefining them.
- [ ] `packages/local-store` has a `retroRepository.ts` with CRUD for `RetroDocument`, keyed by `id`, queryable by `eventBriefId`.
- [ ] The three ingestion seams (issue log, budget variance, ROI scorecard) are manually verified end-to-end, including each seam's graceful "not available" state when its upstream document doesn't exist.
- [ ] The clustering rule (≥2 same-`relatedArtifact` high-severity issues → consolidated `drop`-suggested lesson) is verified with a true-positive and a true-negative case.
- [ ] The carry-forward write-back (FR-12) is manually verified end-to-end: complete a retro with a mix of dispositions and `carryForward` values, confirm `EventBrief.carryForwardLessons` contains exactly the flagged lessons with correct `disposition`/`sourceType`; re-open and edit a written lesson, re-complete, confirm the existing brief entry updates rather than duplicating; then **open a brand-new brief of the same `type` in the already-built PRD 1 intake flow and confirm the carried-forward lessons appear as suggestions with zero code changes required in PRD 1** — this is the single most important acceptance check in this PRD, since it is the entire suite's lifecycle loop made concrete.
- [ ] Success-metric adjustment (FR-10) verified: an adjustment writes to `EventBrief.successMetrics[].actual`, bumps `version`, and is visible in the retro's own adjustment history.
- [ ] Retro completion correctly blocks on any lesson missing a disposition and correctly allows completion with zero lessons.
- [ ] Export (Markdown + HTML) verified for both a fully-populated and a minimal/empty retro.
- [ ] Autosave/reload verified for the full retro document.
- [ ] Zero console errors in a full click-through (create → ingest → review/edit candidates → add manual lesson → adjust a metric → complete → export) in Chrome and Firefox latest.
- [ ] The "Post-Mortem" launch link on the Event Brief view (previously a disabled "coming soon" stub from PRD 1) is wired to real find-or-create behavior and no longer disabled.
- [ ] The FR-2 auto-prompt banner is verified at all three date thresholds (not-yet-due, due, overdue) and correctly suppressed once a retro is completed.
- [ ] This tool makes zero writes to `LogisticsPack`, `BudgetLineItem`/`BudgetSettings`, or `RoiReport` data at any point (verified by inspecting IndexedDB before/after a full retro-building run).
- [ ] The usage-log CSV export contains accurate rows for all 11 FR-14-listed actions.
- [ ] This PRD's Open Questions (§14) are visibly flagged as "Assumption — pending validation" in-repo, consistent with the practice every prior PRD in this suite has followed.

## 16. Closing: How This PRD Completes the Suite's Lifecycle Loop

The Event Planner Productivity Suite was built on one binding thesis, stated in every PRD in this series: **the Event Brief is the data spine — one structured brief feeds every downstream tool.** Six PRDs built that spine outward:

1. **PRD 1 (Event Brief Generator)** creates the spine itself — the structured `EventBrief` every other tool reads and extends.
2. **PRD 2 (Promo Campaign Kit)** reads the brief to generate promotional assets and track registration pacing.
3. **PRD 3 (Run-of-Show / Logistics Pack)** reads the brief to generate day-of logistics, and is the first tool to *write back* into the brief (`riskRegister[].status`, `timeline.milestones[].status`) — and, critically for this PRD, it is where the `issueLog` this retro depends on is born.
4. **PRD 4 (Budget Builder & Tracker)** reads the brief's budget shell to build a full tracked budget, writes actuals back into `budget.allocations[].actualAmount`, and exposes the `computeBudgetActualsSummary()` function this retro calls directly.
5. **PRD 5 (Lead Triage & Follow-Up Engine)** reads the brief's audience/goals to triage and route registrant leads.
6. **PRD 6 (Event ROI & Attribution Report)** combines PRD 4's budget actuals, PRD 5's lead outcomes, and its own CRM/survey CSV imports into a standardized ROI report, writing the first real values into `successMetrics[].actual` and producing the transparent repeat/kill/change scorecard this retro's ROI ingestion seam consumes.

Every one of those six tools made the brief richer, but none of them closed the loop back to where the suite started. An event's data spine, however well-built, would otherwise dead-end at "the event is over" — exactly the failure this suite exists to fix.

**PRD 7 (Post-Mortem Generator) — this PRD — is what closes that loop.** It pulls together PRD 3's issue log, PRD 4's budget variance, and PRD 6's ROI scorecard into one structured retro, forces every finding into a categorized, actionable disposition (repeat / fix / drop), and — this is the mechanism that makes the whole suite a *lifecycle* tool rather than seven independent apps — writes the lessons a planner chooses to keep into `EventBrief.carryForwardLessons`. The very next time that planner (or any planner on the same device) creates a new brief of the same event type in PRD 1's already-built, unmodified intake flow, those lessons resurface automatically as suggested constraints. Nothing about last time gets lost between cycles; nothing requires a backend, an integration, or a planner's memory to survive the handoff — only the same local-first data store every tool in this suite already shares.

The brief that PRD 1 generates for a planner's *next* event is, in a very literal sense, partly written by the retro on their *last* one. That is the full lifecycle: **brief → promo/logistics/budget → leads/ROI → retro → next brief** — and with this PRD, the loop is complete.
