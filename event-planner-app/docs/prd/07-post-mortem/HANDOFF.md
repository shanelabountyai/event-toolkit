# HANDOFF: Post-Mortem Generator (PRD 7) — Claude Code Kickoff Brief

Paste this whole file into a fresh Claude Code session to start building immediately. You do not need to read the PRD first — everything required is inlined below. This session adds a **new tool/route to the existing "Event Planner Productivity Suite" monorepo** — it does not create a new app, a new repo, or touch PRD 1/3/4/6's existing UI code except via the specific read-only imports and one small, deliberate additive schema change named below.

**This is the seventh and final tool in the suite.** It is the mechanism that closes the suite's lifecycle loop — read §7 before writing any code, since it explains the one thing this build absolutely must get right.

## 1. Project Summary

We're building the "Event Planner Productivity Suite," a standalone-first web app suite for corporate/field marketing event planners, built as **one Next.js (App Router) + TypeScript + Tailwind monorepo**, with each tool as a route/module inside the same app, all sharing one canonical "Event Brief" data schema (`packages/schema`) and one local-first IndexedDB persistence layer (`packages/local-store`). PRD 1 (Event Brief Generator), PRD 3 (Run-of-Show / Logistics Pack), PRD 4 (Budget Builder & Tracker), and PRD 6 (Event ROI & Attribution Report) already exist and are working — assume all four are built. (PRD 2, Promo Campaign Kit, and PRD 5, Lead Triage & Follow-Up Engine, may or may not exist yet; this session does not depend on either.)

**This session builds PRD 7: the Post-Mortem Generator.** Problem it solves: post-event retrospectives are the step planners skip most often — they're unstructured, start from a blank page, and the lessons they do produce never make it into the next event's plan. This tool assembles a structured retro **automatically** from data the suite already has — PRD 3's issue log, PRD 4's budget variance, PRD 6's ROI scorecard — pre-drafts categorized lesson candidates (repeat / fix / drop), and, on completion, writes the lessons a planner chooses to keep into `EventBrief.carryForwardLessons`. The next time a brief is created in PRD 1's already-built intake flow, those lessons resurface as suggested constraints — **with zero code changes required in PRD 1.** That write-then-read handoff is the entire suite's lifecycle loop, and this tool is the writer half of it.

**Standalone-first constraint (binding, same as the rest of the suite):** no CRM/martech/event-platform integrations. This tool needs no new CSV/XLSX import at all — everything it ingests already lives in the local IndexedDB store, written by tools already built.

## 2. Where This Slots Into the Existing Monorepo

Do **not** create a new Next.js app. Add to the existing structure:

```
event-toolkit/
├── apps/
│   └── web/
│       └── app/
│           └── (tools)/
│               ├── brief/                      # PRD 1 — already exists, DO NOT modify except the one stub link
│               ├── logistics/                  # PRD 3 — already exists, don't touch
│               ├── budget/                     # PRD 4 — already exists, don't touch
│               ├── roi/                        # PRD 6 — already exists, don't touch
│               └── retro/                      # <-- THIS SESSION'S SCOPE
│                   ├── page.tsx                 # retro list across all local briefs
│                   ├── new/
│                   │   └── page.tsx             # brief picker → find-or-creates that brief's retro
│                   ├── [retroId]/
│                   │   ├── page.tsx             # Retro Dashboard (default landing — all sections)
│                   │   ├── export/
│                   │   │   └── page.tsx         # export dialog (or render as a modal — your call)
│                   │   └── print/
│                   │       └── page.tsx         # chrome-free print/HTML export view
│                   └── _components/
│                       ├── RetroList.tsx
│                       ├── BriefPicker.tsx
│                       ├── RetroPromptBanner.tsx        # the FR-2 auto-prompt, rendered on brief view + suite home
│                       ├── IngestionStatusPanel.tsx      # 3 tiles: Issue Log / Budget Variance / ROI Scorecard
│                       ├── LessonWorkspace.tsx           # the 3-column Repeat/Fix/Drop view (FR-9)
│                       ├── LessonCard.tsx                # single lesson: text, category, disposition, carryForward toggle, source badge
│                       ├── AddManualLessonForm.tsx
│                       ├── SuccessMetricsPanel.tsx        # FR-10 adjust flow
│                       ├── SuccessMetricAdjustDialog.tsx
│                       ├── CompleteRetroFlow.tsx          # disposition-completeness check + carry-forward confirmation summary
│                       ├── ExportDialog.tsx
│                       └── PrintLayout.tsx
├── packages/
│   ├── schema/src/
│   │   └── event-brief.ts                       # ONE ADDITIVE EDIT — see §4, add 2 optional fields to LessonLearned ONLY
│   ├── logistics/                                # PRD 3 — already exists, DEPENDENCY (types only, read-only)
│   ├── budget-calc/                              # PRD 4 — already exists, DEPENDENCY — import computeBudgetActualsSummary directly
│   ├── roi-report-core/                          # PRD 6 — already exists, DEPENDENCY (types only, read-only)
│   ├── local-store/src/
│   │   └── retroRepository.ts                    # NEW — getRetro, getRetroByBriefId, listRetros, saveRetro, deleteRetro
│   ├── ui/                                       # already exists, reuse shared primitives
│   └── postmortem-core/                          # <-- NEW PACKAGE, build this session
│       ├── package.json                          # depends on @event-toolkit/schema, @event-toolkit/logistics,
│       │                                          # @event-toolkit/budget-calc, @event-toolkit/roi-report-core
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                          # public exports
│           ├── retro.ts                          # all TS types — see §5
│           ├── ingestion.ts                       # ingestIssueLog(), ingestBudgetVariance(), ingestRoiScorecard()
│           ├── candidateLessons.ts                 # generateCandidateLessons() — the §6 rule table, pure function
│           ├── carryForward.ts                     # mapLessonsToLessonLearned(), the write-back logic (id reuse for idempotency)
│           └── migrations/
│               └── index.ts                        # CURRENT_RETRO_SCHEMA_VERSION, migrateRetroDocument()
└── fixtures/
    └── retro-example.json                         # fixture RetroDocument with a mix of dispositions, for dev/testing
```

**Do not** create a new Next.js app, a new repo, or introduce a backend/database/auth. **Do not** modify any file in `packages/logistics`, `packages/budget-calc`, or `packages/roi-report-core` — this tool only reads from them. **Do not** modify any other field in `packages/schema/src/event-brief.ts` besides the two new optional fields on `LessonLearned` described in §4 — that is the one, deliberate, additive exception, not a general license to touch the schema.

## 3. Tech Stack (already decided — do not re-litigate)

Everything from PRD 1/3/4/6's stack applies unchanged: Next.js App Router, TypeScript, Tailwind CSS, pnpm workspaces, `idb`, `zod`, `crypto.randomUUID()`, no backend/auth/database. **No new runtime dependencies are needed at all** — this tool ingests data that's already local; it does not parse any new CSV/XLSX, so you do not need `papaparse` or `xlsx` in `packages/postmortem-core` (though the workspace already has them from PRD 4/6 if some incidental use arises).

## 4. The One Schema Change This Session Makes — Read Carefully

`packages/schema/src/event-brief.ts` currently defines:

```typescript
export interface LessonLearned {
  id: string;
  sourceEventId?: string;
  category?: string;
  lesson: string;
  addedAt: string;
}
```

Per the schema doc's own ownership table, PRD 7 (this session) is the sole writer of `LessonLearned` entries and of `EventBrief.carryForwardLessons`. Add **exactly two new optional fields**, and nothing else, anywhere else in that file:

```typescript
// packages/schema/src/event-brief.ts — ADD, do not remove or change any existing line

export type LessonDisposition = "repeat" | "fix" | "drop"; // NEW type export

export interface LessonLearned {
  id: string;
  sourceEventId?: string;
  category?: string;
  lesson: string;
  addedAt: string;
  disposition?: LessonDisposition;   // NEW — optional, so pre-existing entries with no value still validate
  sourceType?: "issue_log" | "budget_variance" | "roi_scorecard" | "manual"; // NEW — optional
}
```

Also required as part of this same change (all additive, per the schema's own documented versioning policy — no migration logic needed since both new fields are optional):

- Bump `CURRENT_SCHEMA_VERSION` from `"1.0.0"` to `"1.1.0"` in `packages/schema/src/migrations/index.ts`. The migration function itself stays a no-op passthrough — there is nothing to transform.
- Add a `CHANGELOG.md` entry in `packages/schema/` describing the addition.
- Update the `LessonLearned` row/section in `schema/event-brief-schema.md` (repo root, one level up from `event-toolkit/`) to document the two new fields, matching the existing documentation style for every other field in that file.

**Do not** touch any other interface, type, or field in `event-brief.ts`. **Do not** bump to a MAJOR version — this is a MINOR, backward-compatible addition by definition, and every other already-built tool in the suite (PRD 1, 3, 4, 6) needs zero code changes to keep working, per the schema's own forward-compatibility rule (readers ignore fields they don't recognize).

## 5. Key Types — Inline, Canonical for This Session

Put this in `packages/postmortem-core/src/retro.ts`. Import `LessonLearned`/`LessonDisposition` from `@event-toolkit/schema`, `IssueLogEntry` from `@event-toolkit/logistics`, `CategorySpend`/`BudgetActualsSummary` from `@event-toolkit/budget-calc`, and `ScorecardDimension` from `@event-toolkit/roi-report-core` — do not redefine any of these.

```typescript
// packages/postmortem-core/src/retro.ts
import type { LessonLearned, LessonDisposition } from "@event-toolkit/schema";
import type { IssueLogEntry } from "@event-toolkit/logistics";
import type { CategorySpend, BudgetActualsSummary } from "@event-toolkit/budget-calc";
import type { ScorecardDimension } from "@event-toolkit/roi-report-core";

export const CURRENT_RETRO_SCHEMA_VERSION = "1.0.0";

export type RetroStatus = "draft" | "completed";
export type RetroLessonSourceType = "issue_log" | "budget_variance" | "roi_scorecard" | "manual";

export interface RetroLesson extends LessonLearned {
  disposition: LessonDisposition;         // required here even though optional on the base type
  sourceType: RetroLessonSourceType;      // required here
  sourceRef?: string;                     // retro-local only — NOT written to the brief
  carryForward: boolean;                  // default true; planner-controlled — NOT written to the brief
  writtenLessonId?: string;               // set once carried forward; enables idempotent re-write
}

export interface IngestedIssueLogSummary {
  available: boolean;
  logisticsPackId: string | null;
  totalIssues: number;
  bySeverity: { low: number; medium: number; high: number };
  openAtIngestion: number;
  entries: IssueLogEntry[];
}

export interface IngestedBudgetVarianceSummary {
  available: boolean;
  totalBudgeted: number;
  totalActual: number;
  variancePct: number | null;
  worstCategoryVariances: CategorySpend[];  // top 3 by |variancePct|
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
  id: string;
  eventBriefId: string;
  eventName: string;
  status: RetroStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  version: number;
  ingestedIssueLogSummary: IngestedIssueLogSummary;
  ingestedBudgetVarianceSummary: IngestedBudgetVarianceSummary;
  ingestedRoiScorecardSummary: IngestedRoiScorecardSummary;
  lessons: RetroLesson[];
  notes?: string;
  successMetricAdjustments: SuccessMetricAdjustment[];
}
```

## 6. Candidate-Lesson Generation Rules — Implement Exactly This Table

In `packages/postmortem-core/src/candidateLessons.ts`, as a pure function `generateCandidateLessons(issueLog, budgetSummary, roiSummary): RetroLesson[]`:

| Source | Condition | Suggested `disposition` |
|---|---|---|
| Issue log entry | `severity: "low"` | `repeat` (lesson text frames it as "generally worked — minor note: …") |
| Issue log entry | `severity: "medium"` | `fix` |
| Issue log entry | `severity: "high"` | `fix` |
| Issue log entries (clustered) | ≥2 entries share the same non-empty `relatedArtifact`, all `severity: "high"` | **Additional** consolidated pattern-level lesson (`sourceRef` = the shared `relatedArtifact` string), suggested `drop` — generated **in addition to** the individual per-entry candidates above, not instead of them |
| Budget category (`CategorySpend`) | flag `"amber"` (compute the same amber/red logic PRD 4 uses: `abs(variancePct) >= threshold` amber, `>= 2×threshold` red — reuse `budgetSettings.defaultVarianceThresholdPct`, read via `budgetRepository`, not re-invented) | `fix` |
| Budget category | flag `"red"`, `budgeted > 0` | `fix` |
| Budget category | flag `"red"`, `budgeted === 0` (unbudgeted spend) | `drop` |
| Budget category | flag `"none"` with `actual > 0` | `repeat` |
| ROI scorecard dimension | `verdict: "green"` | `repeat` |
| ROI scorecard dimension | `verdict: "yellow"` | `fix` |
| ROI scorecard dimension | `verdict: "red"` | `fix` |
| ROI scorecard overall `recommendation` | `"repeat"` | one summary lesson, `repeat` |
| ROI scorecard overall `recommendation` | `"change"` | one summary lesson, `fix` — text must name the specific yellow/red dimensions, mirroring `Scorecard.recommendationRationale`'s own language |
| ROI scorecard overall `recommendation` | `"kill"` | one summary lesson, `drop` |

Every generated `RetroLesson` gets: `id` (new UUID), `sourceEventId` = the retro's `eventBriefId`, `category` inferred loosely from source (e.g. issue-log-sourced → `"Logistics"`, budget-sourced → `"Budget"`, ROI-sourced → `"Strategy"` — planner can freely edit), `lesson` text built from a template string with real figures merged in (no AI generation — deterministic string templates only, same convention as PRD 1/5/6's exports and PRD 6's executive summary), `addedAt` = now, `carryForward: true` by default, and the appropriate `sourceType`/`sourceRef`. **`disposition` is always a suggestion, never final** — the UI must present it as an editable, pre-selected dropdown, not a locked value.

## 7. The Carry-Forward Write-Back — This Is the Whole Point of This Session

Read this before writing any UI code. Everything else in this session is in service of this one mechanism.

**On marking a retro `"completed"`:**

1. Filter `retro.lessons` to those with `carryForward === true`.
2. For each, produce a bare `LessonLearned` object: `{ id: lesson.writtenLessonId ?? crypto.randomUUID(), sourceEventId: lesson.sourceEventId, category: lesson.category, lesson: lesson.lesson, addedAt: lesson.addedAt, disposition: lesson.disposition, sourceType: lesson.sourceType }` — note this **drops** `sourceRef` and `carryForward`, which are retro-local fields not part of the canonical `LessonLearned` shape.
3. Load the linked `EventBrief` via the *existing* `briefRepository.getBrief(eventBriefId)`.
4. For each produced `LessonLearned`: if its `id` already exists in `brief.carryForwardLessons` (i.e. `lesson.writtenLessonId` was already set from a prior write), **replace** that array entry in place; otherwise **append** a new entry.
5. For any `RetroLesson` that previously had a `writtenLessonId` but now has `carryForward === false` (planner un-flagged it after a prior completion), **remove** the matching entry from `brief.carryForwardLessons` by `id`.
6. Save the mutated brief via the *existing* `briefRepository.saveBrief(brief)` — this bumps `EventBrief.version` and `updatedAt` automatically, the same write path every other PRD's write-back (PRD 3's risk/milestone status, PRD 4's actuals roll-up, PRD 6's `successMetrics`) already uses. **Do not build a new/parallel write path.**
7. Set `lesson.writtenLessonId` on each `RetroLesson` that was written/updated (for future idempotency), and save the `RetroDocument` itself via `retroRepository.saveRetro`.

**Why idempotency matters here specifically:** a planner may re-open a completed retro, tweak a lesson's wording, and re-complete. Without the `writtenLessonId` tracking in step 4, this would silently duplicate entries in `EventBrief.carryForwardLessons` every time — a subtle bug that would only surface as "why does my brief have the same lesson five times" much later. Implement and test this deliberately, not as an afterthought.

**The verification that actually proves this session is done** (not just that the UI looks right): complete a retro with a mix of `carryForward: true`/`false` lessons, then **open PRD 1's existing, unmodified intake flow on a brand-new brief of the same event `type`** and confirm the carried-forward lessons appear as suggestions in the Goals step, exactly as PRD 1's own FR-11 already implements it. If this doesn't work, or requires you to modify any PRD 1 code, something in this session's write-back is wrong — PRD 1's read side needs zero changes, by design, because it was already built to read `LessonLearned` entries generically.

## 8. What This Tool Reads From Upstream — Call Existing Functions, Don't Rebuild Read Paths

- **Brief data:** call the *existing* `getBrief(id)` / `listBriefs()` from `briefRepository.ts` (PRD 1). The only write path against a brief is the carry-forward write-back (§7) and the success-metric adjustment (§9) — both go through the *existing* `saveBrief`.
- **Issue log:** call the *existing* `logisticsRepository.getPackByBriefId(eventBriefId)` (PRD 3), read `.issueLog`. Never write to a `LogisticsPack`.
- **Budget variance:** call the *existing* `budgetRepository.getLineItems(briefId)` / `getBudgetSettings(briefId)` (PRD 4), then call `computeBudgetActualsSummary(lineItems, budgetSettings, brief)` imported from `@event-toolkit/budget-calc`. **Do not reimplement any variance math.** Never write to `BudgetLineItem`/`BudgetSettings`.
- **ROI scorecard:** call the *existing* `roiReportRepository.getReportByBriefId(briefId)` (PRD 6), read `.scorecard`, `.surveySummary.npsScore`, `.status`. Never write to a `RoiReport`.

This tool must be **strictly read-only** against `LogisticsPack`, `BudgetLineItem`/`BudgetSettings`, and `RoiReport` data — verify with an IndexedDB before/after inspection as your final QA pass, same discipline PRD 6 used to verify its own read-only boundary against PRD 4/5.

## 9. Success-Metric Adjustment (FR-10) — Small But Real

The schema doc explicitly names this PRD as authorized to make "final retro adjustments" to `EventBrief.successMetrics[].actual` (alongside PRD 6, which is the *primary* writer). Implement a small, optional flow: planner picks a metric from the brief's existing `successMetrics`, enters a new value + a required reason string, confirms → writes `successMetrics[i].actual = newValue` via the existing `briefRepository.saveBrief`, bumps `version`/`updatedAt`, and appends a `SuccessMetricAdjustment` record to the retro's own `successMetricAdjustments` array (previous value, new value, reason, timestamp) so the correction is permanently visible in the retro's own history — never a silent overwrite.

## 10. Retro-Trigger Timing — Implement These Exact Defaults

A dismissible banner (`RetroPromptBanner.tsx`) appears on the linked brief's view and on the suite home/brief-list for any past-dated event with no `"completed"` retro:

- **`eventEndDate + 3 days`**: banner appears, standard styling, "It's been a few days since [Event Name] — ready to run the retro?"
- **`eventEndDate + 14 days`**, still no completed retro: same banner, visually escalated (use the same red/urgent styling convention PRD 4 uses for its red variance flag) — this is a visual cue only, never a functional block on anything.
- Before `eventEndDate + 3 days`, or once a retro reaches `"completed"` status: no banner.

Implement both day thresholds as named constants in `packages/postmortem-core` (e.g. `RETRO_PROMPT_DELAY_DAYS = 3`, `RETRO_PROMPT_ESCALATION_DAYS = 14`), not hardcoded inline — these are documented assumptions pending validation and should be a one-line change later.

## 11. Categorization Taxonomy — Definitions for UI Copy

Use these exact definitions in any UI copy/tooltips explaining the three dispositions to a planner:

- **Repeat** — this worked. Keep doing it exactly as-is.
- **Fix** — worth keeping, but something specific about execution needs to change (vendor, timing, budget line).
- **Drop** — don't repeat this in its current form. Structural problem, not a tuning problem.

## 12. P0 Feature Checklist

Derived directly from the PRD's functional requirements (FR-1 through FR-15). Check these off as you build.

- [ ] **FR-1** Retro creation requires selecting an existing `EventBrief` (no standalone mode); one active retro per brief (find-or-create); allows creation before `eventEndDate` with a non-blocking warning banner.
- [ ] **FR-2** Auto-prompt banner per §10's exact day thresholds, on both the brief view and a suite-wide list; reappears until a retro is completed; never functionally blocking.
- [ ] **FR-3** Issue log ingestion via `logisticsRepository.getPackByBriefId()`; graceful "not available" state when no `LogisticsPack` exists.
- [ ] **FR-4** Budget variance ingestion via `budgetRepository` + `computeBudgetActualsSummary()` (PRD 4's function, not re-derived); graceful "not available" state.
- [ ] **FR-5** ROI scorecard ingestion via `roiReportRepository.getReportByBriefId()`; labeled `"draft"` or `"final"` matching the source report; graceful "not available" state.
- [ ] **FR-6** Candidate lesson auto-generation per §6's exact rule table, including the clustering escalation rule; every candidate is a pre-filled but fully editable draft.
- [ ] **FR-7** Manual lesson entry with no suggested disposition.
- [ ] **FR-8** Full editability of every lesson field; `sourceType`/`sourceRef` preserved through edits for traceability.
- [ ] **FR-9** Three-column Repeat/Fix/Drop lesson workspace with live count badges.
- [ ] **FR-10** Success-metric adjustment flow (§9) — reason required, writes to the brief, logged in retro history.
- [ ] **FR-11** Retro completion blocks on any lesson missing a `disposition`; allows completion with zero lessons; stamps `completedAt`.
- [ ] **FR-12** Carry-forward write-back exactly per §7 — idempotent, correctly adds/updates/removes entries in `EventBrief.carryForwardLessons` based on each lesson's `carryForward` flag.
- [ ] **FR-13** Full retro export (Markdown + HTML) covering all sections, including the minimal/empty-retro case.
- [ ] **FR-14** Local usage-event log: `retro_created`, `retro_prompt_shown`, `issue_log_ingested`, `budget_variance_ingested`, `roi_scorecard_ingested`, `lesson_added_manual`, `lesson_disposition_changed`, `success_metric_adjusted`, `retro_completed`, `carry_forward_written` (with lesson count), `retro_exported`.
- [ ] **FR-15** `RetroDocument.schemaVersion` + `migrateRetroDocument()` (no-op passthrough acceptable, but must exist and be called on every read).

## 13. Key UX Flows

1. **Entry**: Event Brief view → "Post-Mortem" link (previously a disabled "coming soon" stub from PRD 1) → find-or-create → redirect to `/retro/[retroId]`. Also reachable via `/retro` (list) and the FR-2 prompt banner.
2. **Retro Dashboard** (`/retro/[retroId]`): header (event name/dates), Ingestion Status panel (3 tiles), Lesson Workspace (3 columns), Success Metrics panel, "Mark Retro Complete" action, "Export" action.
3. **Reviewing a candidate lesson**: source badge ("From Issue Log: …"), editable text, disposition dropdown pre-selected to the suggestion, `carryForward` checkbox (default checked).
4. **Adding a manual lesson**: inline form — text, category, disposition (no default).
5. **Adjusting a success metric**: small dialog — new value + required reason → writes back, logged inline.
6. **Completing**: disposition-completeness check → confirmation summary ("N lessons will carry forward — X repeat, Y fix, Z drop") → commit write-back → stamp `completedAt`.
7. **Export**: format choice (Markdown/HTML) → download → logged.
8. **The payoff (verify, don't just build)**: open PRD 1's existing intake flow on a new same-`type` brief and confirm carried-forward lessons surface as suggestions with zero PRD 1 code changes.

## 14. Acceptance Criteria — How to Verify Each P0 Item

- Create a retro for a brief with a `LogisticsPack` (5 issues: 2 high sharing `relatedArtifact: "shipping"`, 1 high standalone, 1 medium, 1 low) → confirm 5 individual candidates + 1 consolidated `drop`-suggested pattern candidate = 6 total, with correct per-entry suggested dispositions.
- Create a retro for a brief with a reconciled budget where one category is red-unbudgeted and one is amber → confirm one `drop`-suggested and one `fix`-suggested budget candidate.
- Create a retro for a brief with a finalized `RoiReport` whose recommendation is `"change"` with 2 red dimensions → confirm exactly one `fix`-suggested summary candidate naming those dimensions, plus one candidate per red dimension.
- Create a retro for a brief with **no** `LogisticsPack`, **no** budget data, and **no** `RoiReport` → confirm all three ingestion tiles show "not available," zero auto-generated candidates, and the retro is still fully usable (manual lessons + completion work normally).
- Add a manual lesson, set disposition `"repeat"` → confirm it appears in the Repeat column, indistinguishable in structure from an auto-generated repeat lesson.
- Attempt to complete a retro with one lesson missing a disposition → confirm it's blocked with that lesson flagged; set the disposition → confirm completion now succeeds.
- Complete a retro with 3 `carryForward: true` lessons (mixed dispositions) → confirm `EventBrief.carryForwardLessons` gains exactly 3 new entries with correct `disposition`/`sourceType`, and `EventBrief.version` increments.
- Re-open that completed retro, edit one lesson's text, re-complete → confirm the corresponding brief entry updates in place (same count as before, not +1).
- Toggle one previously-written lesson's `carryForward` to `false`, re-complete → confirm that entry is removed from `EventBrief.carryForwardLessons`.
- **Open PRD 1's existing intake flow on a new brief of the same `type`** → confirm the carried-forward lessons surface as suggestions in the Goals step, with no PRD 1 code changes needed.
- Adjust a success metric with a reason → confirm `EventBrief.successMetrics[].actual` updates, `version` increments, and the adjustment appears in the retro's visible history.
- Verify the FR-2 banner at `eventEndDate + 2 days` (absent), `+3 days` (present, standard), `+14 days` (present, escalated styling), and absent once the retro is `"completed"`.
- Export a fully-populated retro and a minimal/empty one — confirm both produce valid, non-broken Markdown/HTML documents.
- Inspect IndexedDB before/after a full retro-building run — confirm zero writes to `LogisticsPack`, `BudgetLineItem`/`BudgetSettings`, or `RoiReport` stores.
- Trigger all 11 FR-14 logged actions, download the usage-log CSV, confirm accurate rows.
- Run through the whole flow once in Chrome and once in Firefox — zero console errors.

## 15. Explicit Non-Goals (do not build these — prevent scope creep)

- **No facilitation tooling** — no live meeting mode, agenda timer, or shared real-time session. This assembles and structures a document; running a meeting off it is the planner's job, outside this tool.
- **No team voting/scoring** — dispositions are single-planner-assigned, never a multi-participant vote or star rating.
- **No real-time multi-user collaboration** — single planner owns a retro, same as every other tool in this suite.
- **No AI/LLM-generated lesson text** — candidate lesson text is deterministic string templates with real data merged in, never a generative model call. Same convention as PRD 1/5/6.
- **No cross-event lesson analytics** (e.g. "most common lesson across all events") — a natural P1 once there's real data volume; not this session.
- **No email/Slack delivery of the prompt or the completed retro** — the prompt is an in-app banner only; sharing is export-and-send-manually.
- **No configurable/pluggable disposition-suggestion rules** — §6's table is fixed logic in v1, not a rule-builder.
- **No CSV/XLSX import of any kind in this tool** — everything it needs is already local, written by tools already built.
- **No multiple retros per brief** — one `RetroDocument` per `EventBrief`, find-or-create, same 1:1 pattern as PRD 3's `LogisticsPack` and PRD 6's `RoiReport`.
- **No writes of any kind to `LogisticsPack`, `BudgetLineItem`/`BudgetSettings`, or `RoiReport` data** — read-only against all three.
- **No changes to `packages/schema/src/event-brief.ts` beyond the two new optional fields on `LessonLearned`** (§4) — every other field, interface, and type in that file is off-limits this session.
- **No backend server, no database, no authentication/accounts, no cross-device sync** — IndexedDB + Markdown/HTML export is the entire v1 persistence and handoff story, same as every other tool in the suite.

## 16. Suggested Build Order

1. **The schema extension first, in isolation** (§4) — add the two optional fields to `LessonLearned`, bump the version, update the changelog/doc. Confirm every existing PRD 1/3/4/6 fixture and type still compiles cleanly with this change present (it should — it's purely additive). Do this before anything else so the rest of the session builds on a stable, already-verified foundation.
2. **`packages/postmortem-core/src/retro.ts`** — write all types from §5. Confirm `@event-toolkit/schema`, `@event-toolkit/logistics`, `@event-toolkit/budget-calc`, and `@event-toolkit/roi-report-core` all import cleanly as workspace deps.
3. **`ingestion.ts`** — three pure functions (`ingestIssueLog`, `ingestBudgetVariance`, `ingestRoiScorecard`), each taking already-fetched upstream data (not doing the fetching itself — keep repository calls in the UI/route layer or a thin wrapper, per this suite's established pattern of pure-function domain packages) and producing the `Ingested*Summary` shapes. Unit-test each against hand-built fixture data, including the "not available" branch.
4. **`candidateLessons.ts`** — implement §6's rule table as a pure function. This is the single most load-bearing piece of new logic in this session — unit-test every row of the table independently, plus the clustering escalation rule, before touching any UI.
5. **`carryForward.ts`** — implement §7's write-back logic (map lessons → `LessonLearned`, add/update/remove against `brief.carryForwardLessons` by id) as a pure function operating on an in-memory `EventBrief` + `RetroLesson[]`, so it's unit-testable without IndexedDB. Test the idempotency case explicitly (same lesson written twice should not duplicate).
6. **`packages/local-store/src/retroRepository.ts`** — add the `retroDocuments` object store and CRUD functions, following the exact pattern of `briefRepository`/`logisticsRepository`/`budgetRepository`/`roiReportRepository`. Test in isolation before wiring to UI.
7. **Retro Dashboard shell** (`[retroId]/page.tsx`) — wire up the three ingestion calls + candidate generation on retro creation, render the Ingestion Status panel and Lesson Workspace with real data. Get this solid before building completion/write-back UI on top.
8. **Lesson editing + manual add** (`LessonCard.tsx`, `AddManualLessonForm.tsx`) — full CRUD on `RetroDocument.lessons`, autosaved.
9. **Success Metrics panel + adjustment flow** (§9) — straightforward once the dashboard shell exists.
10. **Completion flow** (`CompleteRetroFlow.tsx`) — disposition-completeness check, confirmation summary, then call `carryForward.ts`'s write-back function against the real `briefRepository`. **This is the step to test most carefully** — verify against a real brief in IndexedDB, then verify PRD 1's intake flow actually surfaces the result, per §7's closing verification.
11. **Auto-prompt banner** (`RetroPromptBanner.tsx`) — implement the two date thresholds from §10, wire into the brief view and a suite-home/list location.
12. **Export + print views** — Markdown/HTML, reusing formatting patterns already established by PRD 1/3/6's own export code where reasonable.
13. **Usage log + fixtures + polish** — wire FR-14 logging into every action already built, assemble `fixtures/retro-example.json`, empty states, loading states, cross-browser check, final pass against the PRD's Release Criteria checklist — **especially the end-to-end PRD 1 verification, which is the actual definition of done for this entire suite, not just this session.**

Build `packages/postmortem-core`'s pure functions (ingestion, candidate generation, carry-forward mapping) solidly and unit-test them in isolation before touching any UI — same discipline every prior PRD in this suite has used, and especially important here because the carry-forward write-back is the one piece of code in the entire seven-PRD suite that, if subtly wrong, would fail silently: the retro would look complete, the UI would show no errors, and the only symptom would be that the next event's brief never got the lessons it should have. Test it directly against a real brief object, not just against a mock.
