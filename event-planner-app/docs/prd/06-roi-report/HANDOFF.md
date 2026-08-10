# HANDOFF: Event ROI & Attribution Report (PRD 6) — Claude Code Kickoff Brief

Paste this whole file into a fresh Claude Code session to start building immediately. You do not need to read the PRD first — everything required is inlined below. This session adds a **new tool/route to the existing "Event Planner Productivity Suite" monorepo** — it does not create a new app, a new repo, or touch PRD 1/4/5's existing code except via the specific read-only imports named below.

## 1. Project Summary

We're building the "Event Planner Productivity Suite," a standalone-first web app suite for corporate/field marketing event planners, built as **one Next.js (App Router) + TypeScript + Tailwind monorepo**, with each tool as a route/module inside the same app, all sharing one canonical "Event Brief" data schema (`packages/schema`) and one local-first IndexedDB persistence layer (`packages/local-store`). PRD 1 (Event Brief Generator), PRD 4 (Budget Builder & Tracker), and PRD 5 (Lead Triage & Follow-Up Engine) already exist and are working — assume all three are built.

**This session builds PRD 6: the Event ROI & Attribution Report.** Problem it solves: after an event closes, the evidence a planner needs to defend or kill next year's budget for it — cost, pipeline generated, attendee sentiment — lives in three disconnected places (a budget tracker, a CRM export, a survey export) that never get assembled into one credible report, or get assembled so late the numbers stop being useful in a budget conversation. This tool combines **budget actuals** (computed directly from PRD 4's own function, not re-entered), **lead/tier outcomes** (read directly from PRD 5's local data), **pipeline/opportunity outcomes** (a new CSV import this session builds), and **survey/NPS results** (another new CSV import this session builds) into one standardized report with cost-per-lead/meeting/opportunity, a configurable sourced-vs-influenced pipeline split, a year-over-year comparison when prior data exists, and a transparent, rules-based repeat/kill/change recommendation. It closes the suite's data loop by being the primary writer of `EventBrief.successMetrics[].actual`.

**Standalone-first constraint (binding, same as the rest of the suite):** no CRM/martech/survey-tool integration of any kind. Pipeline and survey data enter via CSV/XLSX import only, exported by the planner from whatever CRM/survey tool they already use. No live dashboards, no automated distribution, no multi-touch attribution modeling — this tool computes a binary sourced/influenced split by timing rules, not a weighted multi-touch model, because v1 has no cross-channel touchpoint history to model against.

**Known, accepted limitation of this Fast-Follow tier PRD:** because the report is meant to be produced within ~30 days of event close, and most B2B opportunity cycles run longer than that, this tool leans on **pipeline** dollars (opportunities created/associated, whether or not they've closed) rather than **closed/won** dollars as its primary ROI signal. Won-revenue figures are still captured and shown, just not weighted into the P0 scorecard. This is a deliberate design choice, documented in the PRD — don't try to "fix" it by defaulting to won-revenue in the scorecard.

## 2. Where This Slots Into the Existing Monorepo

Do **not** create a new Next.js app. Add to the existing structure:

```
event-toolkit/
├── apps/
│   └── web/
│       └── app/
│           └── (tools)/
│               ├── brief/                      # PRD 1 — already exists, don't touch
│               ├── budget/                     # PRD 4 — already exists, don't touch
│               ├── leads/                      # PRD 5 — already exists, don't touch
│               └── roi/                        # <-- THIS SESSION'S SCOPE
│                   ├── page.tsx                 # report list across all local briefs
│                   ├── new/
│                   │   └── page.tsx             # brief picker → creates or opens the brief's report
│                   ├── [reportId]/
│                   │   ├── page.tsx             # main report dashboard (default landing — all sections)
│                   │   ├── import-pipeline/
│                   │   │   └── page.tsx         # pipeline-outcomes CSV import wizard
│                   │   ├── import-survey/
│                   │   │   └── page.tsx         # survey-export CSV import wizard
│                   │   ├── settings/
│                   │   │   └── page.tsx         # AttributionSettings editor (+ scorecard thresholds)
│                   │   ├── yoy/
│                   │   │   └── page.tsx         # YoY comparator picker (or render as a panel/modal — your call)
│                   │   └── export/
│                   │       └── page.tsx         # full-report / exec-summary export dialog
│                   └── _components/
│                       ├── ReportList.tsx
│                       ├── BriefPicker.tsx
│                       ├── BudgetSection.tsx            # renders BudgetActualsSummary, "not available" state
│                       ├── LeadsSection.tsx              # auto/picker/manual lead-source resolution
│                       ├── PipelineImportWizard/
│                       │   ├── UploadStep.tsx
│                       │   ├── ColumnMappingStep.tsx
│                       │   ├── PreviewStep.tsx
│                       │   └── ImportSummary.tsx
│                       ├── SurveyImportWizard/
│                       │   ├── UploadStep.tsx
│                       │   ├── ColumnMappingStep.tsx
│                       │   ├── PreviewStep.tsx
│                       │   └── ImportSummary.tsx
│                       ├── AttributionSettingsPanel.tsx
│                       ├── CostSummaryPanel.tsx
│                       ├── YoyComparisonPanel.tsx
│                       ├── ScorecardPanel.tsx             # shows all 5 dimensions with raw values + thresholds, never just a color
│                       ├── ExecutiveSummaryPreview.tsx
│                       ├── ExportDialog.tsx
│                       └── FinalizeFlow.tsx               # successMetrics write-back confirmation UI
├── packages/
│   ├── schema/                    # PRD 1 — already exists, DEPENDENCY (types only), do not modify
│   ├── budget-calc/                # PRD 4 — already exists, DEPENDENCY — import computeBudgetActualsSummary directly
│   ├── local-store/                # PRD 1/4/5 — already exists, EXTEND (see §3)
│   ├── lead-triage-core/           # PRD 5 — already exists, DEPENDENCY (types only, read-only)
│   ├── ui/                         # already exists, reuse shared primitives
│   └── roi-report-core/            # <-- NEW PACKAGE, build this session
│       ├── package.json            # depends on @event-toolkit/schema, @event-toolkit/budget-calc (types + function import)
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # public exports
│           ├── types.ts            # PipelineOpportunity, SurveyResponse, AttributionSettings, RoiReport, Scorecard, etc. — see §5
│           ├── csvParser.ts        # parse CSV (papaparse) / XLSX (xlsx/SheetJS) -> raw headers + rows (mirror PRD 5's pattern)
│           ├── pipelineMapping.ts  # suggestPipelineColumnMapping(headers)
│           ├── surveyMapping.ts    # suggestSurveyColumnMapping(headers)
│           ├── attribution.ts      # classifyAttribution(opportunity, settings, eventDates) — see §6 for the exact rule
│           ├── costs.ts            # computeCostSummary(budgetSummary, totalLeads, pipelineSummary)
│           ├── nps.ts              # computeSurveySummary(responses)
│           ├── scorecard.ts        # computeScorecard(report inputs, thresholds) — see §7
│           ├── yoy.ts              # findEligibleComparators(), computeYoyDeltas()
│           ├── execSummary.ts      # renderExecutiveSummary(report) — deterministic template, NOT AI-generated
│           └── successMetricMatch.ts # matchSuccessMetrics(brief.successMetrics, report) — synonym-table matcher, see §8
└── fixtures/
    ├── roi-prior-event-brief.json           # older same-type brief with a finalized RoiReport, for YoY testing
    ├── roi-current-event-brief.json         # newer same-type brief to build the new report against
    ├── roi-sample-pipeline.csv               # sample CRM opportunity export
    └── roi-sample-survey.csv                 # sample NPS/survey export
```

**Why a new package instead of putting logic in `apps/web`:** CSV parsing, attribution classification, cost math, scorecard scoring, and executive-summary rendering are pure-TypeScript, framework-independent logic that should be unit-testable without React/Next — same rationale PRD 4 used for `packages/budget-calc` and PRD 5 used for `packages/lead-triage-core`. `packages/roi-report-core` only ever *reads* types/functions from `packages/schema`, `packages/budget-calc`, and `packages/lead-triage-core` — it never writes to their underlying data.

**Import rule:** `apps/web`'s `roi/` route imports from `packages/roi-report-core` (business logic), `packages/local-store` (persistence, extended per §3), `packages/schema` (EventBrief types + the `successMetrics` write path), `packages/budget-calc` (the `computeBudgetActualsSummary` function — call it, don't reimplement it), and `packages/ui` (shared components). Never duplicate types that already exist in those packages.

## 3. Extending `packages/local-store`

Add a new repository file, following the exact pattern of `briefRepository.ts` / `budgetRepository.ts` / the lead-triage repository — do not touch how those tools store their own data.

**New IndexedDB object stores** (add to `db.ts`'s schema/upgrade logic):
- `roiReports` (keyed by `id`, indexed by `eventBriefId` — enforce one active report per brief at the repository layer, per FR-1)
- `pipelineOpportunities` (keyed by `id`, indexed by `roiReportId`, `recordId` — used for dedupe on re-import)
- `pipelineImportBatches` (keyed by `id`, indexed by `roiReportId`)
- `surveyResponses` (keyed by `id`, indexed by `roiReportId`)
- `surveyImportBatches` (keyed by `id`, indexed by `roiReportId`)
- `attributionSettings` (keyed by `id` — v1 has exactly one row, `id: "default"`)

**New file `packages/local-store/src/roiReportRepository.ts`** exporting: `getReportByBriefId(briefId)`, `getReport(id)`, `listReports()`, `saveReport`, `deleteReport`, `listPipelineOpportunities(reportId)`, `savePipelineOpportunitiesBulk(rows[])`, `savePipelineImportBatch`, `listSurveyResponses(reportId)`, `saveSurveyResponsesBulk(rows[])`, `saveSurveyImportBatch`, `getAttributionSettings()` (returns default settings if none exist yet — lazily create on first read, don't require a separate init step), `saveAttributionSettings`.

**Reading upstream data — call existing functions, don't build parallel read paths:**
- **Brief data:** call the *existing* `getBrief(id)` / `listBriefs()` from `briefRepository.ts` (PRD 1). Never write to a brief through any path except the one described in §8 for `successMetrics[].actual`.
- **Budget data:** call the *existing* `getLineItems(briefId)` / `getBudgetSettings(briefId)` from `budgetRepository.ts` (PRD 4), then call `computeBudgetActualsSummary(lineItems, budgetSettings, brief)` imported from `@event-toolkit/budget-calc`. **Do not reimplement any variance/spend math** — that function is the entire point of PRD 4's ROI seam.
- **Lead data:** call the *existing* lead-triage repository's `listSessions()` / `listLeads(sessionId)` (PRD 5), filtered client-side by `eventBriefId === briefId`. Never call any lead-triage *write* method from this tool's code — this tool must be as strictly read-only against Lead Triage data as PRD 5 is against the Event Brief.

## 4. Tech Stack Additions

Everything from PRD 1/4/5's stack applies unchanged (Next.js App Router, TypeScript, Tailwind, pnpm workspaces, `idb`, `zod`, `crypto.randomUUID()`, no backend/auth/database). No new runtime dependencies are needed — reuse `papaparse` and `xlsx` (SheetJS), both already added to the workspace by PRD 4/5, for this session's two new CSV import wizards. Do not add a second CSV/XLSX library.

## 5. Key Types (inline, canonical — put in `packages/roi-report-core/src/types.ts`)

```typescript
// packages/roi-report-core/src/types.ts

export type PipelineRecordType = "opportunity" | "meeting";
export type AttributionType = "sourced" | "influenced";
export type PipelineImportSource = "csv_import" | "xlsx_import";

export interface PipelineOpportunity {
  id: string;
  roiReportId: string;
  recordId: string;                      // required — used for dedupe across re-imports
  recordType: PipelineRecordType;        // default "opportunity"
  opportunityName?: string;
  contactName?: string;
  contactEmail?: string;                 // optional — informational lead cross-check only, never gating
  company?: string;
  createdDate: string;                   // ISO date — required, drives attribution
  amount: number;                        // default 0
  stage?: string;
  isWon?: boolean;
  closeDate?: string;
  importedAttributionType?: AttributionType | null;
  computedAttributionType: AttributionType | "outside_window";
  effectiveAttributionType: AttributionType | "outside_window";
  leadMatchStatus: "matched" | "unmatched" | "not_checked";
  source: PipelineImportSource;
  sourceImportBatchId: string;
  createdAt: string;
  updatedAt: string;
}

export type PipelineField =
  | "recordId" | "recordType" | "opportunityName" | "contactName" | "contactEmail" | "company"
  | "createdDate" | "amount" | "stage" | "isWon" | "closeDate" | "attributionType";

export interface PipelineImportBatch {
  id: string;
  roiReportId: string;
  filename: string;
  columnMapping: { sourceColumn: string; targetField: PipelineField | "ignore"; confidence: "auto" | "manual" }[];
  rowCount: number;
  importedAt: string;
}

export interface SurveyResponse {
  id: string;
  roiReportId: string;
  respondentId?: string;
  respondentEmail?: string;
  respondentType?: "attendee" | "speaker" | "sponsor" | "exhibitor" | "other";
  npsScore?: number | null;              // 0-10
  csatScore?: number | null;
  comment?: string;
  respondedAt?: string;
  sourceImportBatchId: string;
  createdAt: string;
}

export type SurveyField =
  | "respondentId" | "respondentEmail" | "respondentType" | "npsScore" | "csatScore" | "comment" | "respondedAt";

export interface SurveyImportBatch {
  id: string;
  roiReportId: string;
  filename: string;
  columnMapping: { sourceColumn: string; targetField: SurveyField | "ignore"; confidence: "auto" | "manual" }[];
  rowCount: number;
  importedAt: string;
}

export interface AttributionSettings {
  id: string;                            // "default" in v1
  sourcedWindowDays: number;             // default 30
  influencedWindowDays: number;          // default 90
  useExplicitAttributionTypeColumn: boolean; // default true
  updatedAt: string;
}

export interface PipelineSummary {
  opportunitiesCount: number;
  meetingsCount: number;
  sourcedCount: number;
  sourcedAmount: number;
  influencedCount: number;
  influencedAmount: number;
  outsideWindowCount: number;
  wonCount: number;
  wonAmount: number;
  leadMatchRatePct: number | null;
}

export interface SurveySummary {
  responseCount: number;
  npsScore: number | null;
  npsSmallSample: boolean;               // true if responses-with-score < 5
  csatAverage: number | null;
}

export interface CostSummary {
  costPerLead: number | null;
  costPerMeeting: number | null;
  costPerOpportunity: number | null;
  totalLeads: number | null;
  leadSourceMode: "auto_single_session" | "planner_selected_session" | "manual_entry" | "unavailable";
}

export interface DeltaFigure {
  current: number | null;
  prior: number | null;
  deltaAbsolute: number | null;
  deltaPct: number | null;
}

export interface YoyComparison {
  comparatorEventBriefId: string;
  comparatorEventName: string;
  selectionMode: "auto_suggested" | "planner_selected";
  deltas: {
    totalActual: DeltaFigure;
    costPerLead: DeltaFigure;
    costPerOpportunity: DeltaFigure;
    sourcedAmount: DeltaFigure;
    influencedAmount: DeltaFigure;
    npsScore: DeltaFigure;
  };
}

export type ScorecardVerdict = "green" | "yellow" | "red" | "insufficient_data";

export interface ScorecardDimension {
  id: "roi_ratio" | "sourced_coverage" | "nps" | "budget_discipline" | "success_metrics_hit_rate";
  label: string;
  verdict: ScorecardVerdict;
  rawValue: number | null;
  thresholdsApplied: string;
  points: number | null;
}

export interface Scorecard {
  dimensions: ScorecardDimension[];
  scoreableDimensionCount: number;
  totalPoints: number;
  maxPossiblePoints: number;
  scorePct: number | null;
  recommendation: "repeat" | "change" | "kill" | "insufficient_data";
  recommendationRationale: string;
}

export interface RoiReport {
  id: string;
  eventBriefId: string;
  eventName: string;
  status: "draft" | "final";
  finalizedAt: string | null;
  budgetSummary: unknown | null;         // type as BudgetActualsSummary from @event-toolkit/budget-calc at import time
  pipelineSummary: PipelineSummary | null;
  surveySummary: SurveySummary | null;
  costSummary: CostSummary;
  yoyComparison: YoyComparison | null;
  scorecard: Scorecard | null;
  executiveSummaryText: string | null;
  successMetricWriteBacks: { metricId: string; metricName: string; matchedField: string; valueWritten: number; writtenAt: string }[];
  createdAt: string;
  updatedAt: string;
}
```

## 6. Attribution Classification — Implement Exactly This Rule

In `packages/roi-report-core/src/attribution.ts`:

```
Given an opportunity's createdDate, and the linked EventBrief's dates.eventStartDate / dates.eventEndDate,
and AttributionSettings.sourcedWindowDays / influencedWindowDays:

sourcedWindowEnd    = eventEndDate + sourcedWindowDays
influencedWindowEnd = eventEndDate + influencedWindowDays

computedAttributionType =
  createdDate >= eventStartDate AND createdDate <= sourcedWindowEnd       → "sourced"
  : createdDate <= influencedWindowEnd (includes any date before eventStartDate, i.e. pre-existing pipeline) → "influenced"
  : "outside_window"

effectiveAttributionType =
  (settings.useExplicitAttributionTypeColumn AND row.importedAttributionType is not null)
    ? row.importedAttributionType
    : computedAttributionType   // note: computedAttributionType can be "outside_window", which is NOT a valid AttributionType —
                                  // if computed lands outside_window, effectiveAttributionType is also "outside_window"
                                  // regardless of the override setting (an explicit override should never resurrect
                                  // a row the timing rule considers untethered from the event; if a planner's CRM
                                  // insists it's sourced/influenced anyway, that's a data-quality flag to show, not silently trust)
```

Always retain `computedAttributionType` even when `importedAttributionType` is used, so the UI can show "computed: influenced, CRM says: sourced" as a visible disagreement, not hide it. Rows outside both windows are never dropped from `pipelineOpportunities` — they're counted in `PipelineSummary.outsideWindowCount` and remain visible in the UI under an explicit "outside attribution window" grouping.

Defaults: `sourcedWindowDays = 30`, `influencedWindowDays = 90`. Both are edited via the Attribution Settings panel and must trigger a **live recompute** of every already-imported row's classification — do not require re-import when settings change.

## 7. Repeat/Kill/Change Scorecard — Implement Exactly This Table

In `packages/roi-report-core/src/scorecard.ts`, five dimensions, each 0/1/2 points or `null` (insufficient data):

| # | id | Formula | Green (2) | Yellow (1) | Red (0) | Requires (else insufficient_data) |
|---|---|---|---|---|---|---|
| 1 | `roi_ratio` | `(sourcedAmount + influencedAmount) / totalActual` | ≥ 3.0 | 1.0 – <3.0 | < 1.0 | budgetSummary present AND pipelineSummary present |
| 2 | `sourced_coverage` | `sourcedAmount / totalActual` | ≥ 1.0 | 0.25 – <1.0 | < 0.25 | same as above |
| 3 | `nps` | `npsScore` | ≥ 30 | 0 – <30 | < 0 | surveySummary present AND responseCount-with-score ≥ 5 |
| 4 | `budget_discipline` | `abs(varianceAtClose.variancePct)` | ≤ 10 | >10 – 25 | > 25 | `budgetSummary.varianceAtClose.isFinal === true` (unreconciled budget = insufficient data, not a penalty) |
| 5 | `success_metrics_hit_rate` | `% of successMetrics with actual != null where actual >= target` | ≥ 75% | 40–74% | < 40% | ≥ 1 successMetric with non-null `actual` |

```
totalPoints = sum of points across scoreable dimensions
maxPossiblePoints = 2 * scoreableDimensionCount
scorePct = scoreableDimensionCount > 0 ? totalPoints / maxPossiblePoints : null

recommendation =
  scoreableDimensionCount < 2 ? "insufficient_data"
  : scorePct >= 0.75 ? "repeat"
  : scorePct >= 0.40 ? "change"
  : "kill"
```

`recommendationRationale` must be a generated string, not hardcoded per branch — for `"change"`, it must explicitly name which dimension(s) scored yellow/red as "what to change." Every `ScorecardDimension.thresholdsApplied` string must describe the exact bands used (e.g. `"green ≥3.0x, yellow 1.0–3.0x, red <1.0x"`) so the UI never shows a color with no explanation attached. This is the whole point of the PRD's "transparent, not a black box" requirement — don't collapse it into a single opaque numeric score anywhere in the UI.

## 8. `successMetrics[].actual` Write-Back — Synonym Matching

In `packages/roi-report-core/src/successMetricMatch.ts`, implement a keyword-substring matcher (mirrors PRD 4's allocation-category synonym mapping) against each `successMetric.metric` string (case-insensitive):

| Metric name contains | Matches to |
|---|---|
| "nps" | `surveySummary.npsScore` |
| "pipeline" | `pipelineSummary.sourcedAmount + pipelineSummary.influencedAmount` |
| "opportunit" | `pipelineSummary.opportunitiesCount` |
| "lead" | `costSummary.totalLeads` |
| "meeting" | `pipelineSummary.meetingsCount` |
| "revenue" or "won" | `pipelineSummary.wonAmount` |
| "roi" | `roi_ratio` scorecard dimension's `rawValue` |
| "cost per lead" | `costSummary.costPerLead` |
| "cost per opportunity" | `costSummary.costPerOpportunity` |
| "cost per meeting" | `costSummary.costPerMeeting` |

Match longest/most-specific pattern first (e.g. check "cost per lead" before the bare "lead" substring, or a metric literally named "Cost per Lead" will incorrectly match on `totalLeads` instead). Every match must be shown to the planner for individual accept/skip **before** any write occurs (FR-13) — never write silently, even on "finalize." Unmatched metrics are left untouched, never zeroed or nulled.

## 9. P0 Feature Checklist

Derived directly from the PRD's functional requirements (FR-1 through FR-15). Check these off as you build.

- [ ] **FR-1** Report creation requires selecting an existing `EventBrief` (no standalone mode); one active report per brief; pre-fills `eventName` and shows the brief's current `successMetrics` as read-only context.
- [ ] **FR-2** Budget section calls `computeBudgetActualsSummary` (PRD 4) directly; shows "not available" (not a zero/error) when no `BudgetSettings` exists for the brief.
- [ ] **FR-3** Leads section auto-resolves a single linked `TriageSession` by `eventBriefId`, prompts a picker on 0/multiple matches, or accepts manual entry — clearly labels which source mode is active.
- [ ] **FR-4** Pipeline-outcomes CSV/XLSX import: upload → auto-suggested/editable column mapping → 5-row preview → confirm; multi-file import deduped by `recordId`; nothing writes before confirm.
- [ ] **FR-5** `AttributionSettings` (sourcedWindowDays/influencedWindowDays/useExplicitAttributionTypeColumn) editable from a Settings panel; editing recomputes every imported row's classification live, no re-import required.
- [ ] **FR-6** Attribution classification computed per §6's exact rule; explicit CRM-column override respected when enabled, but never resurrects an `outside_window` row; computed value always retained/visible even when overridden.
- [ ] **FR-7** Survey-export CSV/XLSX import (same upload/mapping/preview/confirm pattern); NPS computed as %promoters − %detractors; small-sample flag at n<5; CSAT average if present.
- [ ] **FR-8** `costPerLead`/`costPerMeeting`/`costPerOpportunity` computed against `totalActual`; each `null`/"unavailable" (never a division-by-zero or silent zero) when its input is missing.
- [ ] **FR-9** YoY comparator auto-suggested (same `type`, most recent brief with a **finalized** report), planner-overridable to any finalized report regardless of type; deltas for 6 named figures; graceful "no prior data" state.
- [ ] **FR-10** Five-dimension scorecard per §7's table, every dimension showing raw value + thresholds + verdict; recommendation mapped from `scorePct`; "insufficient_data" state when <2 dimensions are scoreable.
- [ ] **FR-11** Deterministic (non-AI), template-based executive-summary text generation; idempotent regeneration as data changes.
- [ ] **FR-12** Two separate P0 export actions — full report (Markdown + HTML, all 6 sections) and standalone executive summary (Markdown + HTML, ~1 page, no "see full report" dependency).
- [ ] **FR-13** `successMetrics[].actual` write-back on finalize only, via §8's synonym matcher, with mandatory per-metric planner confirmation before any write; unmatched metrics untouched; brief `version`/`updatedAt` bumped correctly.
- [ ] **FR-14** Draft/final status toggle; only finalized reports are eligible YoY comparators; reverting to draft does not retroactively null prior write-backs (see PRD §15 Q4).
- [ ] **FR-15** Local usage-event log (10 named events) with CSV export, same mechanism as PRD 1/4/5.

## 10. Key UX Flows to Implement

1. **Report list/entry** (`/roi`) → all local reports (event name, status, recommendation badge) + "New Report" → brief picker (required selection, no standalone path).
2. **Report dashboard** (`[reportId]/page.tsx`) → the default landing view showing all sections at once: Budget (auto), Leads (auto/picker/manual), Pipeline (import CTA → summary once imported), Survey (import CTA → summary once imported), Cost-per-Outcome, YoY, Scorecard, Executive Summary preview — each empty section shows a clear call-to-action, not a blank/broken-looking gap.
3. **Pipeline import wizard** → Upload → Column Mapping (auto-suggested, editable, `amount`-unmapped loudly warned) → Preview (5 rows, shows computed `effectiveAttributionType` per row so the planner sees classification *before* committing) → Confirm/Summary.
4. **Survey import wizard** → same 4-step pattern, computing NPS/CSAT on confirm.
5. **Attribution Settings panel** → two day-count inputs + the override toggle, each with a one-line inline rationale (not a tooltip) — editing live-recomputes all pipeline rows.
6. **YoY panel** → auto-suggested comparator shown by default; "change comparator" opens a full picker (any brief with a finalized report, not just same-`type`); 6-figure delta table.
7. **Scorecard panel** → all 5 dimensions always visible, each showing raw value / threshold band / verdict color / points; overall recommendation with a generated rationale naming the specific weak dimensions when the verdict is "change."
8. **Export dialog** → two distinct buttons (Full Report / Executive Summary), each → format choice (Markdown/HTML) → download, logged.
9. **Finalize flow** → opens the `successMetrics` match-and-confirm screen (accept-all / accept-individually / skip) before flipping `status` to `"final"` and stamping `finalizedAt`.

## 11. Acceptance Criteria / How to Verify Each P0 Item

Use these as your own manual QA pass before calling this session done — they mirror the PRD's acceptance criteria:

- Create a report on a brief with existing, reconciled PRD 4 budget data — confirm `totalActual`/`spendByCategory`/`varianceAtClose` match the Budget Builder exactly, with zero re-derivation.
- Create a report on a brief with **no** budget data — confirm the Budget section and all cost-per-outcome figures show "not available," never `$0` or a crash.
- Create a report on a brief with exactly one linked `TriageSession` — confirm leads auto-populate; create one with two linked sessions — confirm a picker appears; test manual entry and confirm it's visibly labeled as manual everywhere it's displayed.
- Import a sample pipeline CSV (include one in fixtures) with a header like "Opp ID" — confirm it auto-maps to `recordId`; re-import a modified file with an overlapping `recordId` — confirm it updates the existing row, not duplicates it.
- Set `sourcedWindowDays = 30`: confirm an opportunity created 20 days after event end classifies "sourced," one at 45 days classifies "influenced," one at 120 days (beyond default `influencedWindowDays = 90`) classifies "outside_window" and is shown in a distinct grouping, not dropped.
- Change `sourcedWindowDays` to 14 without re-importing — confirm the 20-day-after opportunity above reclassifies to "influenced" live.
- Import a sample survey CSV with 40 responses (20 promoters/15 passives/5 detractors) — confirm NPS computes to 38 (rounded); import a 3-response survey — confirm the "small sample" flag shows.
- With `totalActual = $50,000`, 250 leads, 40 opportunity rows, 10 meeting rows — confirm `costPerLead = $200`, `costPerOpportunity = $1,250`, `costPerMeeting = $5,000`; remove the pipeline import — confirm opportunity/meeting cost figures become "unavailable," not `$50,000/0`.
- Set up two same-`type` fixture briefs where the older has a finalized report — confirm the newer report auto-suggests it as YoY comparator with correct deltas; confirm the picker also surfaces finalized reports of a *different* type when manually browsing.
- Feed fixture data producing scorecard inputs that land in each of green/yellow/red for at least one dimension, and inputs producing "insufficient data" for at least one dimension — confirm each renders the correct verdict, raw value, and threshold text; confirm the overall recommendation matches the `scorePct` bands (≥75% repeat, 40–74% change, <40% kill, <2 scoreable dimensions → insufficient_data).
- Export both the full report and the executive summary — confirm the executive summary is materially shorter, self-contained (no "see full report" dependency for its headline claims), and both contain real computed numbers, not template tokens.
- Finalize a report against a brief with a metric named "NPS," one named "MQLs generated," and one named "Swag budget" — confirm NPS and MQLs generated show as matched with proposed values, "Swag budget" shows unmatched; accept both matches and confirm exactly those two `successMetrics[].actual` values update and the brief's `version` increments; confirm "Swag budget" stays `null`.
- Revert a finalized report to draft — confirm it disappears from *future* YoY comparator suggestions but any `successMetrics` values already written are not retroactively nulled.
- Trigger all 10 FR-15 logged actions, download the usage-log CSV, confirm accurate rows for each with correct timestamps.
- **Inspect IndexedDB before and after a full report-building run and confirm neither the linked `TriageSession`/`LeadRecord` data nor the `BudgetLineItem`/`BudgetSettings` data was modified** — this tool must be strictly read-only against both PRD 4 and PRD 5's data.
- Run through the whole flow once in Chrome and once in Firefox — zero console errors.

## 12. Explicit Non-Goals (do not build these — prevent scope creep)

- **No multi-touch attribution modeling** — sourced/influenced is a binary, timing-rule-based split, not a weighted linear/U-shaped/time-decay model. Do not build a "credit percentage" field or a weighting UI.
- **No live dashboards** — this is a point-in-time report built from CSV snapshots; no auto-refresh, no polling, no webhook ingestion.
- **No CRM/survey-tool integration of any kind** — not even a stubbed OAuth button. CSV/XLSX import is the entire data-entry path for pipeline and survey data.
- **No automated report distribution** — no emailing, no Slack/webhook delivery of the exec summary. Export-and-share-manually only.
- **No cross-event credit-splitting** — if the same opportunity shows up in two different events' pipeline imports, this tool does not adjudicate or split credit between them.
- **No custom/user-authorable scorecard dimensions** — the five dimensions in §7 are fixed; only their numeric thresholds are configurable (as a P1 nicety, not required this session — v1 can ship with the thresholds as constants if a full settings UI for them isn't reached, so long as they're not scattered as magic numbers throughout the codebase).
- **No PDF export** — Markdown + printable HTML only, same as PRD 1's export precedent.
- **No writes to `packages/schema/src/event-brief.ts`, no writes to any `EventBrief` field other than `successMetrics[].actual`**, and that only via the explicit, planner-confirmed finalize flow (§8/FR-13).
- **No writes of any kind to Lead Triage (PRD 5) or Budget Builder (PRD 4) data** — this tool reads both, writes to neither.
- **No AI/LLM-generated executive-summary copy** — deterministic template + merge-token rendering only, same convention PRD 1 and PRD 5 already established for this suite.
- **No backend server, no database, no authentication/accounts, no cross-device sync** — IndexedDB + Markdown/HTML export is the entire v1 persistence and handoff story.

## 13. Suggested Build Order

1. **`packages/roi-report-core/src/types.ts`** — write all types from §5. Confirm `@event-toolkit/schema`, `@event-toolkit/budget-calc`, and `@event-toolkit/lead-triage-core` are all installable as workspace deps and their existing types import cleanly.
2. **`attribution.ts`** — implement §6's exact classification rule as a pure function, unit-test it against hand-built date fixtures spanning sourced/influenced/outside_window/override-disagreement before touching anything else. This is the single most load-bearing piece of new logic in this session.
3. **`csvParser.ts` + `pipelineMapping.ts` + `surveyMapping.ts`** — reuse the `papaparse`/`xlsx` wrapping pattern already established in PRD 4/5's equivalent files; write the two synonym-mapping tables from PRD §7 verbatim.
4. **`costs.ts`, `nps.ts`** — pure functions, straightforward given inputs; sanity-test against the PRD's worked examples (§FR-7/FR-8 acceptance criteria numbers).
5. **`scorecard.ts`** — implement §7's table exactly, including the `insufficient_data` branch and the generated (not hardcoded) `recommendationRationale`. Unit test all 5 dimensions independently at their boundary values.
6. **`yoy.ts`** — `findEligibleComparators()` (query `briefRepository` + `roiReportRepository`, filter by `type` and finalized status) and `computeYoyDeltas()`.
7. **`execSummary.ts` + `successMetricMatch.ts`** — the two remaining pure-function pieces; write the exec-summary template with real, non-lorem-ipsum default copy per section.
8. **Extend `packages/local-store`**: the 6 new object stores + `roiReportRepository.ts`, wiring in the read-only calls to `briefRepository`, `budgetRepository`, and the lead-triage repository per §3. Test in isolation before wiring to UI.
9. **Report dashboard shell** (`[reportId]/page.tsx`) — get Budget/Leads sections auto-populating first (no import UI needed, just the function calls), since this proves the PRD 4/5 seams work before building any new import UI.
10. **Pipeline import wizard**, then **survey import wizard** — these are the most fiddly new UI pieces; budget real time here, mirror PRD 4/5's import-wizard UX patterns closely rather than inventing a new one.
11. **Attribution Settings panel** — wire live recompute of already-imported rows when settings change; this is easy to get subtly wrong (e.g. forgetting to recompute `effectiveAttributionType` alongside `computedAttributionType`) — test explicitly.
12. **Cost summary, YoY panel, Scorecard panel, Executive Summary preview** — these are mostly read-only renderings of what steps 4-7's pure functions already computed; build once the underlying data is flowing correctly.
13. **Export dialog** (full report + exec summary, Markdown + HTML) — share formatting logic between the two where reasonable, same pattern PRD 1 used for its own two export formats.
14. **Finalize flow** (`successMetrics` write-back confirmation) — build last, since it depends on every other section's data being correct first.
15. **Usage log + fixtures + polish** — wire FR-15 logging into every action already built, then assemble the fixture pair (`roi-prior-event-brief.json` + `roi-current-event-brief.json` + sample pipeline/survey CSVs) needed to exercise YoY end to end, empty states, loading states, cross-browser check, final pass against the PRD's Release Criteria checklist — including the explicit "confirm zero writes to Budget Builder or Lead Triage data" check.

Build `packages/roi-report-core` solidly and test its pure functions in isolation before touching UI, same discipline every prior PRD in this suite has used — attribution classification and scorecard scoring are the entire credibility of this tool's output, and they're far easier to get right (and to unit test against the PRD's worked examples) as pure functions than after they're wired into forms and panels.
