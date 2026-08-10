# PRD 6: Event ROI & Attribution Report

**Owner:** Product (Event Planner Productivity Suite)
**Status:** Approved for build
**Date:** 2026-08-09
**Version:** 1.0
**Suite position:** Fast-Follow Tier, sixth of 7 PRDs. Depends on PRD 1 (Event Brief Generator / `packages/schema`) for the `EventBrief` this report is built against and the primary writer of, depends on PRD 4 (Budget Builder & Tracker) for `computeBudgetActualsSummary()` (imported directly, no re-derivation of budget math), and depends on PRD 5 (Lead Triage & Follow-Up Engine) for lead/tier counts (read directly from PRD 5's local-first store). Per `schema/event-brief-schema.md`'s confirmed PRD numbering table, this PRD is the primary writer of `EventBrief.successMetrics[].actual`.
**Tier note (binding):** This PRD is explicitly acknowledged as weakened by the suite's standalone-first constraint — it depends on CSV import of pipeline/survey data from the planner's CRM and survey tool rather than a live integration. It is specced fully now per stakeholder decision, not deferred, precisely because the manual-assembly problem it solves is real today even without live data feeds.

---

## 1. Problem Statement

After an event closes, the evidence needed to defend (or kill) next year's budget for it is scattered across three places that never talk to each other: the budget tracker (what it cost), the CRM (what pipeline it generated), and a survey tool (how attendees felt about it). Assembling these into a single, credible story — cost-per-lead, cost-per-opportunity, pipeline sourced versus merely touched, NPS, and how this year compares to last year — is a manual, spreadsheet-and-copy-paste exercise that planners either skip entirely or do so late that the numbers stop being actionable. When a budget review comes up, planners without a report either overstate impact from memory, understate it because they can't produce the pipeline number quickly, or simply lose the argument to whichever channel *does* have a tidy dashboard. The event did its job; the planner just can't prove it fast enough for anyone to act on.

## 2. Goals & Non-Goals

### Goals
- Turn three disconnected inputs — budget actuals (computed, not re-entered), CRM pipeline/opportunity outcomes (CSV import), and survey results (CSV import) — into one standardized report a planner can produce without rebuilding a spreadsheet from scratch every time.
- Make "sourced" versus "influenced" pipeline a precise, computed, and org-configurable distinction instead of a fuzzy judgment call restated differently in every report.
- Turn cost-per-lead / cost-per-meeting / cost-per-opportunity into numbers a planner can pull up in seconds, not derive by hand from two spreadsheets.
- Give every report a transparent, rules-based repeat/kill/change recommendation the planner (and their boss) can inspect and argue with, not a black-box score.
- Close the loop on the suite's data spine: this report is the primary writer of `EventBrief.successMetrics[].actual`, so the metrics set at brief time actually get filled in, not left permanently blank.
- Compare this event to a prior comparable event (same type, or planner-selected) whenever that history exists locally, so "was this better or worse than last time" has a real answer.

### Non-Goals (v1)
- **Multi-touch attribution modeling.** No weighted/algorithmic multi-touch models (linear, U-shaped, time-decay, W-shaped). Rationale: explicitly named as a v1 non-goal in the source brief; multi-touch modeling requires a full cross-channel touchpoint history this standalone suite structurally doesn't have (no martech integration), and a fake multi-touch model built on incomplete data would be worse than a transparent binary sourced/influenced split.
- **Live dashboards.** No auto-refreshing, continuously-synced view of pipeline/revenue. Rationale: explicitly named as a v1 non-goal; this is a point-in-time report generated from CSV snapshots, consistent with the standalone-first, no-live-integration constraint.
- **CRM/survey-tool integration of any kind.** No OAuth connector to Salesforce/HubSpot/SurveyMonkey/Qualtrics — CSV/XLSX export-then-import is the entire v1 data path. Rationale: binding suite-wide constraint.
- **Automated report scheduling/distribution.** No emailing the report to stakeholders on a cadence, no Slack/webhook delivery. Rationale: no backend, no integration surface in v1; export-and-share-manually is the v1 handoff, same pattern as every other tool in the suite.
- **Multi-touch or account-based revenue attribution across multiple events for the same deal.** If a deal was influenced by three different events, this tool does not adjudicate credit-splitting across them — each event's report evaluates that deal independently against its own pipeline-outcomes import. Rationale: a de-duplication/credit-splitting model across events is a materially harder problem than this v1 is scoped to solve and depends on data (a full multi-event touchpoint history) this suite doesn't collect.
- **Custom scorecard rule authoring.** The repeat/kill/change scorecard's five dimensions and their thresholds are configurable numbers (see §12), not a rule-builder where planners define arbitrary new dimensions. Rationale: keeps the scorecard legible and comparable across events; a full rule-builder is meaningfully more UI/logic complexity for a v1 whose main job is proving the *concept* of a transparent scorecard.

## 3. Target Users & Personas

**Primary persona: Dana, the corporate/field marketing event planner** (same persona as PRD 1, 4, 5). Opens this tool 1-4 weeks after an event closes, once budget actuals have settled and CRM/survey exports are available. Is not a data analyst and does not want to hand-build attribution logic — needs the tool's defaults to be defensible out of the box, with room to correct them when her org's definitions differ. Needs to produce something she can paste into a slide or forward as a PDF before a budget review meeting, often under time pressure ("the QBR is Thursday").

**Secondary persona: Priya, VP of Marketing / event budget owner ("the exec audience").** Never opens this tool directly — receives the executive-summary export (§13) as a PDF/printed page or a forwarded link. Reads it in under two minutes. Needs, in order: the recommendation (repeat/kill/change) and why, the headline numbers (cost per opportunity, pipeline $ sourced vs. influenced, NPS), and enough YoY context to know if this event is trending better or worse. Does not want to see raw line items or CSV artifacts — the executive summary must stand alone without the full report attached. Cares about defensibility: if challenged in a budget meeting, Priya needs to be able to say *why* a number is what it is, which is exactly why the scorecard must be rules-based and inspectable rather than a single opaque score.

**Tertiary/implicit persona: Finance/FP&A**, who may receive the full report (not just the exec summary) as supporting evidence alongside PRD 4's finance export when a budget line is being reviewed. Not a distinct UX target in v1 — served by the same full-report export Dana already produces.

## 4. User Stories

1. As a planner, I want to generate an ROI report for a specific event brief so that I have one place assembling everything I need for a budget conversation.
2. As a planner, I want the report to pull budget actuals automatically from the Budget Builder so that I never re-enter or re-calculate spend figures.
3. As a planner, I want the report to pull lead and tier counts automatically from a linked Lead Triage session so that I don't have to re-count leads by hand.
4. As a planner, I want to import a CRM export of opportunities/pipeline tied to this event so that I can report real pipeline dollars, not estimates.
5. As a planner, I want the tool to classify each imported opportunity as "sourced" or "influenced" using a clear, consistent rule so that I'm not guessing which bucket a deal belongs in every time.
6. As a planner, I want to adjust how "sourced" and "influenced" are defined (the time windows and matching rules) so that the report matches how my own marketing ops team already defines these terms.
7. As a planner, I want to import a survey/NPS export so that attendee sentiment is part of the same report as the pipeline numbers.
8. As a planner, I want cost-per-lead, cost-per-meeting, and cost-per-opportunity computed automatically so that I can answer "was this worth it" in dollar terms without a calculator.
9. As a planner, I want to see this event compared to a prior comparable event when that data exists locally so that I can show a trend, not just a single snapshot.
10. As a planner, I want a transparent, rules-based repeat/kill/change recommendation — with the reasoning shown, not hidden — so that I can defend or challenge it in front of my boss.
11. As a planner, I want a one-page executive-summary export separate from the full report so that I can send something a VP will actually read.
12. As a planner, I want the report's key figures to write back into the Event Brief's success metrics so that the brief I started with ends up with real, filled-in `actual` values instead of permanently blank ones.
13. As an exec (Priya), I want to open a one-page export and immediately see the recommendation and the two or three numbers that justify it, without wading through raw data.
14. As a planner, I want to see how much of my imported pipeline data couldn't be matched or classified so that I know how much to trust the numbers before I present them.
15. As a planner, I want to mark a report "final" only when I'm confident in it, so that draft numbers don't get written back into the brief or count as this event's official record for next year's comparison.

## 5. Functional Requirements (P0)

Numbered, testable requirements.

**FR-1 — Report creation, required link to an Event Brief.** A planner creates a new ROI report by selecting an existing `EventBrief` (required — unlike PRD 5, a report has no standalone mode, since it is defined as the primary writer of that brief's `successMetrics[].actual` and needs `goals`, `budget`, and `dates` as context). Creating a report pre-fills `eventName`, `eventEndDate`, and a read-only reference panel showing `goals.primaryObjective` and the brief's current `successMetrics` list.
*Acceptance:* Attempting to create a report without selecting a brief is blocked with a clear prompt; selecting a brief with 3 existing `successMetrics` shows all 3 in the reference panel; only one active (non-archived) report exists per brief at a time (subsequent "new report" attempts on a brief with an existing report open that report instead of creating a duplicate).

**FR-2 — Budget-actuals integration (direct function import, PRD 4 seam).** On report open, the tool calls `computeBudgetActualsSummary(lineItems, budgetSettings, brief)` (imported from `@event-toolkit/budget-calc`, PRD 4's package) using the linked brief's `BudgetLineItem[]`/`BudgetSettings` read via `packages/local-store`'s `budgetRepository`. The resulting `BudgetActualsSummary` populates the report's Budget section verbatim — no budget math is re-derived in this tool. If no `BudgetSettings` exists for the brief (Budget Builder never opened for this event), the section renders "Budget data not available — open Budget Builder for this event first" and all cost-per-outcome figures (FR-8) that depend on `totalActual` are shown as "unavailable" rather than computed against a zero.
*Acceptance:* Linking a brief with an existing, reconciled budget populates `totalActual`, `spendByCategory`, and `varianceAtClose` in the report exactly matching what the Budget Builder shows for that brief; linking a brief with no budget data shows the "not available" state and disables cost-per-outcome figures without erroring.

**FR-3 — Lead/triage outcomes integration (direct read, PRD 5 seam).** On report open, the tool queries `packages/local-store`'s lead-triage repository for `TriageSession`s whose `eventBriefId` matches the linked brief. If exactly one is found, its leads are used automatically (total lead count, tier breakdown, `routed`/`draft_ready` completion). If zero or more than one is found, the planner is prompted to pick a session from a list of all local sessions (any brief link state) or to enter a total lead count manually. The chosen source is stored on the report so it doesn't need re-resolving on every open.
*Acceptance:* A brief with exactly one linked `TriageSession` auto-populates lead counts with no planner action; a brief with two linked sessions (e.g. a re-run) prompts a picker; a planner can always override with manual entry, and manual entry is clearly labeled as such (not presented as if it came from Lead Triage) everywhere it's displayed in the report.

**FR-4 — Pipeline-outcomes CSV import.** The planner uploads one or more CSV/XLSX files exported from their CRM's opportunity/pipeline report (this PRD's own import — distinct from and unrelated to PRD 5's lead list). The tool parses headers, auto-suggests a column mapping to the `PipelineOpportunity` fields (§7) via fuzzy header matching, shows a preview of the first 5 rows, and requires planner confirmation before writing. Multiple files import into the same report's pipeline pool, deduped by `recordId` (later imports update matching rows rather than duplicating them).
*Acceptance:* Uploading a CSV with headers like "Opp ID," "Created Date," "Amount," "Stage" auto-maps to `recordId`, `createdDate`, `amount`, `stage`; re-importing a file containing a `recordId` already present updates that row rather than creating a duplicate; nothing is written until the planner confirms the mapping/preview.

**FR-5 — Attribution settings (configurable, org-level default).** A single `AttributionSettings` record (documented as "default" in v1 — see §15 Q1 for the org-scoping open question) governs `sourcedWindowDays`, `influencedWindowDays`, and `useExplicitAttributionTypeColumn`, editable from a Settings panel accessible from any report. Editing settings recomputes every pipeline row's classification live, without requiring re-import.
*Acceptance:* Changing `sourcedWindowDays` from 30 to 14 immediately reclassifies any opportunity created 20 days after event end from "sourced" to "influenced" (per §14's rule) and updates all dependent totals without re-uploading the CSV; settings persist across sessions and apply to all reports until explicitly changed again.

**FR-6 — Attribution classification (computed, per §14 rules).** For every imported `PipelineOpportunity`, the tool computes `attributionType: "sourced" | "influenced"` per the rules in §14, unless `useExplicitAttributionTypeColumn` is enabled and the row's imported `attributionType` column is non-blank, in which case the imported value is used as-is and the computed value is retained alongside it for transparency (shown on hover/detail as "computed: X, using imported override: Y").
*Acceptance:* An opportunity with `createdDate` inside the event window classifies "sourced"; one created 45 days after event end (default `sourcedWindowDays` = 30, default `influencedWindowDays` = 90) classifies "influenced"; one created 120 days after event end (beyond both windows) classifies as neither and is excluded from both totals but still shown in a "outside attribution window" list for transparency, not silently dropped.

**FR-7 — Survey-export CSV import and NPS synthesis.** The planner uploads one or more CSV/XLSX survey exports (this PRD's own import, distinct from pipeline outcomes). Column mapping follows the same upload → auto-suggest → preview → confirm pattern as FR-4, mapping to the `SurveyResponse` fields (§7). The tool computes an NPS score (`% promoters [9-10] − % detractors [0-6]`, promoters/detractors as a percentage of responses with a non-null `npsScore`) and a response count. A CSAT average is computed if `csatScore` values are present. If fewer than 5 responses have a non-null `npsScore`, the NPS figure is still shown but flagged "small sample — n < 5."
*Acceptance:* A survey CSV with 40 responses, 20 promoters, 5 detractors, 15 passives computes NPS = (20/40 − 5/40) × 100 = 37.5, rounded to 38; a session with 3 responses shows the computed NPS with a visible "small sample" flag rather than hiding it.

**FR-8 — Cost-per-outcome calculations.** Using `BudgetActualsSummary.totalActual` (FR-2) as the cost basis, the tool computes: `costPerLead = totalActual / totalLeads` (FR-3's lead count), `costPerMeeting = totalActual / meetingsCount` (pipeline rows with `recordType = "meeting"`), `costPerOpportunity = totalActual / opportunitiesCount` (pipeline rows with `recordType = "opportunity"`, sourced + influenced combined). Each is `null` (rendered "unavailable," not zero or an error) when its denominator is 0 or its required input (FR-2/FR-3/FR-4) hasn't been supplied.
*Acceptance:* A report with `totalActual = $50,000`, 250 leads, 40 opportunity rows, 10 meeting rows shows `costPerLead = $200`, `costPerOpportunity = $1,250`, `costPerMeeting = $5,000`; a report with no pipeline import shows `costPerOpportunity`/`costPerMeeting` as "unavailable," not `$50,000 / 0`.

**FR-9 — YoY comparison.** On report creation, the tool queries all local `EventBrief`s via `briefRepository`, filters to `type === currentBrief.type` and `dates.eventEndDate < currentBrief.dates.eventEndDate`, sorted descending, and auto-suggests the most recent one that has a **finalized** ROI report (FR-15) as the YoY comparator. The planner can override this suggestion via a picker listing all local briefs with a finalized report (not restricted to matching `type`), or select "no comparison." When a comparator is set, the report shows side-by-side deltas for: `totalActual`, `costPerLead`, `costPerOpportunity`, sourced pipeline $, influenced pipeline $, NPS.
*Acceptance:* Given two local briefs of `type: "conference"` where the older one has a finalized report, creating a report on the newer one auto-suggests the older as comparator and shows correct deltas (e.g. "$1,250 cost/opp vs. $1,480 last year, −15.5%"); a brief with no eligible comparator shows "No prior event data available for comparison" rather than an empty/broken table.

**FR-10 — Repeat/kill/change scorecard.** The tool computes the five-dimension scorecard defined in §12 against the report's assembled data, producing a per-dimension score (green/yellow/red or "insufficient data"), a total score, and a recommendation (`"repeat" | "change" | "kill" | "insufficient_data"`). Every dimension's score is shown with the raw figure and threshold that produced it — never just a color with no number attached.
*Acceptance:* A report with all 5 dimensions scoreable and a computed `scorePct` of 80% shows recommendation "Repeat"; one at 55% shows "Change" with the specific red/yellow dimensions called out as "what to change"; one at 25% shows "Kill"; a report with fewer than 2 scoreable dimensions shows "Insufficient data" and does not display a repeat/kill/change verdict.

**FR-11 — Executive-summary generation (deterministic, template-based).** The tool generates a one-page executive summary — recommendation, 4-6 headline figures, one-sentence-per-dimension scorecard rationale, YoY delta if available — using deterministic text templates with data merge tokens, consistent with the suite's established no-AI-generation convention (PRD 1 §"AI/LLM-assisted drafting" non-goal; PRD 5 §9 explicitly continues this precedent). Regeneration is idempotent and safe to re-run as underlying data changes.
*Acceptance:* Generating the executive summary for a fully-populated report produces non-empty, grammatically complete sentences for every section with real computed numbers substituted in (not `{{token}}` literals); regenerating after an attribution-settings change (FR-5) updates the summary's figures to match.

**FR-12 — Full report export and executive-summary export (separate P0 artifacts).** The planner can export the full report (all sections: budget, pipeline/attribution, survey/NPS, YoY, scorecard, exec summary) as Markdown and printable HTML. Separately, the planner can export **just** the executive summary (FR-11) as its own standalone Markdown/HTML document, suitable for forwarding to an exec without the supporting detail attached.
*Acceptance:* Exporting the full report produces a document containing all 6 sections listed above in readable form; exporting the executive summary alone produces a materially shorter document (target: fits one printed page) that stands alone without referencing "see full report" for its headline claims.

**FR-13 — `successMetrics[].actual` write-back.** On marking a report **final** (FR-15), the tool attempts to match each of the linked brief's `successMetrics[].metric` strings against a synonym table (§16) mapping metric-name keywords to computed report figures (e.g. "NPS" → `npsScore`; "pipeline" → sourced+influenced $; "opportunit(y/ies)" → `opportunitiesCount`; "lead" → `totalLeads`; "meeting" → `meetingsCount`; "revenue"/"won" → `wonAmount`). Matched metrics are shown to the planner in a confirmation step ("Registrations: no match — leave as-is"; "MQLs generated → matched to Opportunities Count (42) — write this value?") before any write occurs; the planner can accept all, accept individually, or skip any. Confirmed writes set `successMetrics[].actual` and bump `EventBrief.version`/`updatedAt` per the schema's write-back convention. Unmatched metrics are left untouched (not zeroed).
*Acceptance:* Finalizing a report against a brief with metrics "NPS," "MQLs generated," and "Swag budget" shows NPS and MQLs generated as matched with proposed values and "Swag budget" as unmatched; accepting both matches updates `successMetrics[].actual` for exactly those two entries and increments the brief's `version`; declining a match leaves that metric's `actual` as `null`.

**FR-14 — Draft/final report status.** A report starts `"draft"` and can be explicitly marked `"final"` by the planner (self-declared, mirroring PRD 1's draft/complete and PRD 4's reconciled pattern), which triggers FR-13's write-back flow and makes the report eligible as a future event's YoY comparator (FR-9). A draft report can be freely edited/re-imported into; marking final is reversible (planner can revert to draft, which does not retract prior `successMetrics` writes automatically — see §15 Q4).
*Acceptance:* A draft report does not appear in another brief's YoY comparator picker; marking it final makes it immediately eligible; reverting to draft keeps it excluded from *future* comparator selections made after the revert but does not undo an already-selected comparison in another report.

**FR-15 — Local usage-event log.** Per the suite's local-only instrumentation pattern, the tool logs: `report_created`, `budget_linked`, `leads_linked`, `pipeline_import_performed` (row counts matched/created/skipped), `survey_import_performed`, `attribution_settings_changed`, `scorecard_computed`, `exec_summary_exported`, `full_report_exported`, `report_finalized`, each with a timestamp, into the same exportable usage-log CSV mechanism as the rest of the suite.
*Acceptance:* Performing each of the ten listed actions produces a corresponding row in the usage-log CSV export with accurate event type and timestamp; the log is sufficient to compute both §13 success metrics without additional instrumentation.

## 6. P1 / Later (explicitly out of scope for v1)

- **Org-level (multi-tenant) `AttributionSettings`** — v1 has exactly one global settings record shared by all reports on the device; per-org or per-team settings profiles are deferred (see §15 Q1).
- **Deal/opportunity-level credit splitting across multiple events** — if the same opportunity appears in two events' pipeline-outcomes imports, v1 does not adjudicate or split credit between them; each report treats its own imported pipeline as complete for its purposes.
- **Automatic re-import / live sync of pipeline or survey data** — each import is a manual, planner-triggered CSV upload; no scheduled or webhook-triggered refresh.
- **Configurable/custom scorecard dimensions** — planners can tune the five dimensions' thresholds (P1: currently fixed defaults, editable only via the same Settings mechanism as attribution — see §15 Q2) but cannot add or remove dimensions in v1.
- **PDF export** — v1 exports Markdown + printable HTML only, consistent with PRD 1's export precedent; true PDF generation (vs. print-to-PDF from HTML) is a P1 nicety.
- **Report versioning/history** — v1 keeps one active report per brief; there's no "see how this report looked 3 edits ago" timeline beyond the draft/final toggle.
- **Automated distribution** (email/Slack send of the exec summary) — export-and-share-manually only, per the non-goals.
- **Won-revenue-weighted ROI ratio as the primary scorecard signal** — v1's scorecard leans on pipeline $ rather than closed/won $ specifically because most B2B deal cycles won't have closed within the "report within 30 days" success window (see §16 Risk); a future version could re-weight once enough events have long-enough-elapsed data to make won-revenue comparisons meaningful.

## 7. Data Model

This tool defines its own local data model in a new package, `packages/roi-report-core`, persisted via new repository methods added to `packages/local-store`. It does **not** modify `packages/schema/src/event-brief.ts` — its only write surface against the canonical schema is the pre-declared `successMetrics[].actual` field (FR-13).

### Relationship to upstream PRDs

| Upstream | What PRD 6 does |
|---|---|
| PRD 1 (`EventBrief`) | Reads `id`, `name`, `type`, `dates`, `goals`, `budget.currency`, `successMetrics`. **Writes** `successMetrics[].actual` only (FR-13), on finalization. |
| PRD 4 (`budget-calc`) | Calls `computeBudgetActualsSummary(lineItems, budgetSettings, brief)` directly (function import, no re-implementation). Reads `BudgetLineItem[]`/`BudgetSettings` via `packages/local-store`'s existing `budgetRepository`. No writes. |
| PRD 5 (`lead-triage-core` / lead repository) | Reads `TriageSession`/`LeadRecord` data via `packages/local-store`'s existing lead-triage repository, matched by `eventBriefId`, or planner-selected/manually-entered as fallback (FR-3). No writes — this tool is as strictly read-only against Lead Triage data as PRD 5 is against the Event Brief. |

### New schema module: `packages/roi-report-core/src/types.ts`

```typescript
import type { EventType } from "@event-toolkit/schema"; // read-only reference, not redefinition

// ---------- Pipeline-outcomes CSV import ----------

export type PipelineRecordType = "opportunity" | "meeting";
export type AttributionType = "sourced" | "influenced";
export type PipelineImportSource = "csv_import" | "xlsx_import";

export interface PipelineOpportunity {
  id: string;                            // internal UUID
  roiReportId: string;
  recordId: string;                      // planner's CRM record id/opp id — required, used for dedupe across re-imports
  recordType: PipelineRecordType;        // default "opportunity" if column absent/blank
  opportunityName?: string;
  contactName?: string;
  contactEmail?: string;                 // optional; used only for the informational lead cross-check (§14), not a gating requirement
  company?: string;
  createdDate: string;                   // ISO date — required, drives attribution classification
  amount: number;                        // deal value; default 0 (meetings typically 0)
  stage?: string;                        // free text
  isWon?: boolean;
  closeDate?: string;                    // ISO date
  importedAttributionType?: AttributionType | null; // explicit CRM-exported override, if the source column exists
  computedAttributionType: AttributionType | "outside_window"; // always computed per §14, retained even when override is used
  effectiveAttributionType: AttributionType | "outside_window"; // = importedAttributionType if useExplicitAttributionTypeColumn and non-null, else computedAttributionType
  leadMatchStatus: "matched" | "unmatched" | "not_checked"; // informational cross-check against FR-3's lead pool by normalized email
  source: PipelineImportSource;
  sourceImportBatchId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineImportBatch {
  id: string;
  roiReportId: string;
  filename: string;
  columnMapping: { sourceColumn: string; targetField: PipelineField | "ignore"; confidence: "auto" | "manual" }[];
  rowCount: number;
  importedAt: string;
}

export type PipelineField =
  | "recordId" | "recordType" | "opportunityName" | "contactName" | "contactEmail" | "company"
  | "createdDate" | "amount" | "stage" | "isWon" | "closeDate" | "attributionType";

// ---------- Survey-export CSV import ----------

export interface SurveyResponse {
  id: string;
  roiReportId: string;
  respondentId?: string;                 // may be blank for anonymous surveys — a synthetic id is generated if absent
  respondentEmail?: string;
  respondentType?: "attendee" | "speaker" | "sponsor" | "exhibitor" | "other";
  npsScore?: number | null;              // 0-10
  csatScore?: number | null;             // scale as exported; averaged as-is, no normalization in v1
  comment?: string;
  respondedAt?: string;                  // ISO date
  sourceImportBatchId: string;
  createdAt: string;
}

export interface SurveyImportBatch {
  id: string;
  roiReportId: string;
  filename: string;
  columnMapping: { sourceColumn: string; targetField: SurveyField | "ignore"; confidence: "auto" | "manual" }[];
  rowCount: number;
  importedAt: string;
}

export type SurveyField =
  | "respondentId" | "respondentEmail" | "respondentType" | "npsScore" | "csatScore" | "comment" | "respondedAt";

// ---------- Attribution settings (configurable, org-level default) ----------

export interface AttributionSettings {
  id: string;                            // "default" in v1 — see Open Question Q1 for org-scoping
  sourcedWindowDays: number;             // default 30 — see §14
  influencedWindowDays: number;          // default 90 — see §14
  useExplicitAttributionTypeColumn: boolean; // default true
  updatedAt: string;
}

// ---------- ROI Report document ----------

export interface PipelineSummary {
  opportunitiesCount: number;
  meetingsCount: number;
  sourcedCount: number;
  sourcedAmount: number;
  influencedCount: number;
  influencedAmount: number;
  outsideWindowCount: number;            // rows classified "outside_window" — always surfaced, never silently dropped
  wonCount: number;
  wonAmount: number;
  leadMatchRatePct: number | null;       // % of rows with leadMatchStatus === "matched"; null if FR-3 lead pool unavailable
}

export interface SurveySummary {
  responseCount: number;
  npsScore: number | null;
  npsSmallSample: boolean;               // true if responseCount with non-null npsScore < 5
  csatAverage: number | null;
}

export interface CostSummary {
  costPerLead: number | null;
  costPerMeeting: number | null;
  costPerOpportunity: number | null;
  totalLeads: number | null;
  leadSourceMode: "auto_single_session" | "planner_selected_session" | "manual_entry" | "unavailable";
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

export interface DeltaFigure {
  current: number | null;
  prior: number | null;
  deltaAbsolute: number | null;
  deltaPct: number | null;
}

export type ScorecardVerdict = "green" | "yellow" | "red" | "insufficient_data";

export interface ScorecardDimension {
  id: "roi_ratio" | "sourced_coverage" | "nps" | "budget_discipline" | "success_metrics_hit_rate";
  label: string;
  verdict: ScorecardVerdict;
  rawValue: number | null;               // the actual computed figure, always shown alongside the verdict
  thresholdsApplied: string;             // human-readable description of the thresholds used, e.g. "green ≥3.0x, yellow 1.0-3.0x, red <1.0x"
  points: number | null;                 // 0/1/2, or null if insufficient_data
}

export interface Scorecard {
  dimensions: ScorecardDimension[];
  scoreableDimensionCount: number;
  totalPoints: number;
  maxPossiblePoints: number;
  scorePct: number | null;               // null if scoreableDimensionCount < 2
  recommendation: "repeat" | "change" | "kill" | "insufficient_data";
  recommendationRationale: string;       // deterministic, generated from the dimension verdicts — see §11/FR-11
}

export interface RoiReport {
  id: string;
  eventBriefId: string;
  eventName: string;                     // snapshot at creation, for display without re-reading the brief
  status: "draft" | "final";
  finalizedAt: string | null;
  budgetSummary: unknown | null;         // BudgetActualsSummary from @event-toolkit/budget-calc; typed as the imported type in implementation, not redefined here
  pipelineSummary: PipelineSummary | null;
  surveySummary: SurveySummary | null;
  costSummary: CostSummary;
  yoyComparison: YoyComparison | null;
  scorecard: Scorecard | null;
  executiveSummaryText: string | null;   // generated by FR-11, cached until inputs change
  successMetricWriteBacks: { metricId: string; metricName: string; matchedField: string; valueWritten: number; writtenAt: string }[];
  createdAt: string;
  updatedAt: string;
}
```

### Pipeline-outcomes CSV — column synonym mapping (auto-suggestion targets, FR-4)

| Header text contains (case-insensitive substring) | Maps to |
|---|---|
| "opp id", "record id", "deal id" | `recordId` |
| "type", "record type" | `recordType` |
| "opp name", "opportunity name", "deal name" | `opportunityName` |
| "contact", "name" (and not "company"/"account") | `contactName` |
| "email" | `contactEmail` |
| "company", "account" | `company` |
| "created", "create date" | `createdDate` |
| "amount", "value", "deal size" | `amount` |
| "stage" | `stage` |
| "won", "closed won", "is won" | `isWon` |
| "close date" | `closeDate` |
| "attribution", "source type", "touch type" | `attributionType` |

`recordId` and `createdDate` are the only required mappings to proceed; `amount` defaults to 0 if unmapped (with a visible warning, since it silently zeroes pipeline $ — the preview step must flag this loudly).

### Survey-export CSV — column synonym mapping (auto-suggestion targets, FR-7)

| Header text contains | Maps to |
|---|---|
| "email" | `respondentEmail` |
| "respondent id", "response id" | `respondentId` |
| "type", "role", "audience" | `respondentType` |
| "nps", "likelihood to recommend", "recommend" | `npsScore` |
| "csat", "satisfaction" | `csatScore` |
| "comment", "feedback", "verbatim" | `comment` |
| "date", "submitted" | `respondedAt` |

No column is strictly required — a survey with only `npsScore` values and no identifying info is a fully valid anonymous NPS import.

### YoY comparison data source

No new store beyond what's read: the tool queries the existing `briefRepository.listBriefs()` (PRD 1) filtered by `type` and prior `eventEndDate`, and the new `roiReportRepository.listReports()` (this PRD) filtered by `status === "final"`, to find eligible comparators. There is no separate "YoY index" table — comparator eligibility is computed live from these two existing/new repositories each time the picker opens, since the data volume (local briefs on one device) makes this trivially cheap.

## 8. UX Flow

**Step 0 — Entry.** Reached via the "Launch ROI Report" link on a brief's view (`?briefId=...`, disabled/"coming soon" stub PRD 1 already built for this slot) or from a standalone `/roi` list of reports across all local briefs (event name, status, recommendation badge if scored, last updated).

**Step 1 — New report.** Planner selects an existing brief (required, FR-1). Landing view shows the report shell with 4 sections visibly "not yet populated": Budget, Pipeline, Survey, Leads — each with a clear call-to-action.

**Step 2 — Budget auto-populates.** No action needed if Budget Builder data exists for this brief (FR-2) — the Budget section fills in immediately with a "from Budget Builder" provenance label; if absent, an inline prompt links to launch Budget Builder first.

**Step 3 — Leads auto-populate or prompt.** Same pattern for Lead Triage (FR-3): auto-fills if exactly one linked session exists; otherwise shows a picker or a manual-entry field, clearly labeled by source.

**Step 4 — Pipeline import.** "Import Pipeline Data" opens the upload → column-mapping → preview → confirm wizard (§7/FR-4). After the first successful import, the Pipeline section shows opportunity/meeting counts and a "Import another file" affordance for multi-file sessions.

**Step 5 — Attribution settings (optional, before or after import).** A gear icon on the Pipeline section opens `AttributionSettings` (FR-5): two window-day inputs and the explicit-override toggle, each with its current default and a one-line rationale shown inline (not hidden in a tooltip) so the planner understands what they're changing.

**Step 6 — Survey import.** "Import Survey Data" opens the same upload → mapping → preview → confirm pattern for `SurveyResponse` (FR-7). NPS and CSAT compute immediately on confirm.

**Step 7 — Cost & scorecard auto-compute.** As soon as enough inputs exist, the Cost-per-Outcome panel (FR-8) and the Scorecard panel (FR-10) compute live, each showing which inputs are still missing if a figure is unavailable (never a blank or a misleading zero).

**Step 8 — YoY comparison.** A YoY panel shows the auto-suggested comparator (FR-9) with an "change comparator" link opening the full picker; deltas render immediately once a comparator is set.

**Step 9 — Executive summary review.** A live-updating executive-summary preview (FR-11) sits alongside the full report, so the planner can see exactly what a VP will read before exporting it.

**Step 10 — Export.** Two distinct export actions: "Export Full Report" and "Export Executive Summary" (FR-12), each opening a format choice (Markdown/HTML) and triggering a download.

**Step 11 — Finalize.** "Mark Report Final" opens the `successMetrics` write-back confirmation (FR-13), then flips `status` to `"final"` and stamps `finalizedAt`, making the report eligible as a future YoY comparator.

## 9. Attribution Default Definitions

**Assumption — pending validation.** Attribution definitions genuinely vary by organization (the source brief's explicit open question), and we cannot run planner interviews right now. The definitions below are the shipped v1 defaults — precise, computable from CSV data alone, and fully overridable via `AttributionSettings` (FR-5) without a code change. They are deliberately closer to how mid-market B2B marketing ops teams commonly define these terms than to any single CRM vendor's exact proprietary model, since v1 has no CRM API to inherit a vendor-specific definition from.

- **Sourced pipeline:** an opportunity whose `createdDate` falls on or after the event's `eventStartDate` and on or before `eventEndDate + sourcedWindowDays` (default **30 days**). Plain-language meaning: *the event directly generated a new opportunity that didn't exist before it* — the strongest, least ambiguous form of credit an event can claim.
- **Influenced pipeline:** an opportunity present in the imported pipeline-outcomes CSV that is **not** classified "sourced," and whose `createdDate` is on or before `eventEndDate + influencedWindowDays` (default **90 days**) — this covers both opportunities that already existed before the event (an event that helped move stalled or pre-existing pipeline forward) and opportunities created shortly after the event but outside the tighter sourced window. Plain-language meaning: *an opportunity this event's contacts were meaningfully associated with, even if the event didn't originate it.*
- **Outside attribution window:** an opportunity created more than `influencedWindowDays` after `eventEndDate` (or, for a pre-existing opportunity, effectively unbounded in the past — v1 does not impose a "how old is too old to count as pre-existing" floor, since the planner has already scoped the CSV export to opportunities they consider event-associated). These rows are always shown in the report (never silently dropped) as a distinct "outside window" count, so the planner can see how much of their import didn't classify either way.
- **Why the CSV import itself is the event-association signal, not a computed contact match:** v1 assumes the planner has already exported an opportunity report from their CRM scoped to opportunities associated with this event (e.g. a campaign-influence report, a "deals with contact = event attendee" filter) — that scoping decision happens in the planner's CRM, not in this tool. This tool's job is only to split an already-event-scoped set into sourced vs. influenced by timing. The optional `contactEmail` field and `leadMatchRatePct` (§7) exist as a **data-quality cross-check** against the Lead Triage pool, not as a gating requirement for inclusion — a low match rate is a signal to the planner that their CRM export may be scoped too broadly, not an automatic exclusion.
- **Explicit override:** if the planner's CRM export already includes its own attribution-type column (common in CRM native attribution/campaign-influence reports, which often distinguish "first touch"/"created" from "influenced"), and `useExplicitAttributionTypeColumn` is enabled (default: on), that imported value is used as the `effectiveAttributionType` instead of the computed one — but the computed value is always retained and viewable, so a planner can spot-check disagreement between their CRM's own attribution logic and this tool's default rule.

## 10. Repeat/Kill/Change Scorecard Logic

The scorecard is **rules-based and fully transparent** — every dimension shows its raw number and the exact thresholds applied, never a hidden weighting or an opaque single score with no explanation. It has five dimensions. Each scores **0 (red) / 1 (yellow) / 2 (green)**, or is marked **insufficient data** and excluded from scoring entirely when its required inputs aren't available.

| # | Dimension | Formula | Green (2 pts) | Yellow (1 pt) | Red (0 pts) | Requires |
|---|---|---|---|---|---|---|
| 1 | **ROI ratio** | `(sourcedAmount + influencedAmount) / totalActual` | ≥ 3.0× | 1.0× – < 3.0× | < 1.0× | Budget (FR-2) + Pipeline import (FR-4) |
| 2 | **Sourced pipeline coverage** | `sourcedAmount / totalActual` | ≥ 1.0× | 0.25× – < 1.0× | < 0.25× | Budget (FR-2) + Pipeline import (FR-4) |
| 3 | **NPS / sentiment** | `npsScore` | ≥ 30 | 0 – < 30 | < 0 | Survey import (FR-7) with ≥ 5 responses (otherwise insufficient data, not just "small sample") |
| 4 | **Budget discipline** | `\|varianceAtClose.variancePct\|` from PRD 4's summary | ≤ 10% | > 10% – 25% | > 25% | Budget marked reconciled (`varianceAtClose.isFinal === true`) — an unreconciled budget is insufficient data for this dimension, not penalized |
| 5 | **Success-metrics hit rate** | % of the brief's `successMetrics` with non-null `actual` where `actual ≥ target` | ≥ 75% | 40% – 74% | < 40% | ≥ 1 `successMetric` with non-null `actual` (v1 treats every metric as "higher is better" — a documented simplification, see §15 Q5) |

**Scoring:** `totalPoints` = sum of points across all *scoreable* dimensions. `maxPossiblePoints` = 2 × (count of scoreable dimensions). `scorePct = totalPoints / maxPossiblePoints`.

**Recommendation mapping:**
- `scorePct ≥ 75%` → **Repeat**
- `40% ≤ scorePct < 75%` → **Change** — the report names the specific red/yellow dimensions as "what to change" (e.g. "NPS was strong, but sourced pipeline coverage was red — reconsider audience targeting or format before repeating as-is").
- `scorePct < 40%` → **Kill**
- Fewer than 2 dimensions scoreable → **Insufficient data** — the tool explicitly declines to render a repeat/kill/change verdict rather than guessing from too little information, and tells the planner which imports/actions would unlock scoring (e.g. "Import pipeline data and mark the budget reconciled to unlock a full scorecard").

**Why five dimensions and these specific thresholds:** ROI ratio and sourced coverage are kept as two separate dimensions (rather than one blended figure) because a healthy influenced number can mask a genuinely weak sourced number, and the whole point of a transparent scorecard is to not let a good aggregate hide a bad detail. Budget discipline and success-metrics hit rate are included so the scorecard reflects execution quality, not just pipeline outcome — an event that generated great pipeline but blew its budget by 60% is a different conversation than one that didn't. All five thresholds are **Assumption — pending validation** (see §15 Q2) and are stored in the same `AttributionSettings`-adjacent settings surface as a single editable block, not hardcoded in a way that requires a code change to tune.

## 11. Success Metrics & How Measured

Both are the exact two named in the source stakeholder brief. Measured from local data (report records + the FR-15 usage log), consistent with the suite's no-backend v1 pattern.

1. **% of events with an ROI report within 30 days.**
   - *Definition:* of all briefs whose `dates.eventEndDate` is in the past, the fraction with an associated `RoiReport` (any status, draft or final — the "report exists and work has started" signal, not the stricter "finalized" bar) whose `createdAt` is within 30 days of `eventEndDate`.
   - *Measurement:* computed directly from stored `RoiReport.createdAt` vs. the linked brief's `dates.eventEndDate`; no additional logging required beyond what FR-15 already captures via `report_created`.
   - *Target:* ≥ 70% of past events have a report started within 30 days of close (assumption — pending validation).

2. **Report production time.**
   - *Definition:* elapsed time from `report_created` to the first `full_report_exported` or `report_finalized` event (whichever comes first) for that report, per the FR-15 usage log.
   - *Measurement:* derived directly from usage-log timestamps, exportable as a CSV column; report as median and 90th percentile across all local reports.
   - *Target:* median ≤ 3 hours of active session time (using the same idle-gap session-boundary heuristic PRD 4 §13 established), 90th percentile ≤ 2 business days elapsed wall-clock (assumption — pending validation). **Caveat, matching PRD 4's precedent:** this is a proxy for "time saved vs. manual spreadsheet assembly" with no local baseline to compare against — a self-reported "how long did this used to take you" question in a future PRD 7 (Post-Mortem) retro is the natural complementary data point.

## 12. Risks & Assumptions

- **Risk:** The report's core value proposition — proving ROI — is structurally limited by v1's 30-day-ish measurement window, while most B2B opportunity cycles take materially longer than 30 days to close. *Mitigation:* the scorecard and headline figures lean on **pipeline** (sourced/influenced $) rather than **won/closed** $ as the primary signal precisely because pipeline is observable early; `wonAmount`/`wonCount` are still captured and shown, but explicitly not weighted into the P0 scorecard (see §6 P1 note) — this is a deliberate, documented tradeoff, not an oversight.
- **Risk:** Attribution defaults (§9) won't match every org's existing definitions, and a planner presenting a report with the "wrong" definition risks it being challenged or dismissed in a budget review. *Mitigation:* FR-5/FR-6 make sourced/influenced fully configurable and every classification shows its computed basis on demand — nothing is hidden, and the defaults are explicitly flagged in-product as assumptions, not asserted as an industry standard.
- **Risk:** CSV import quality is entirely dependent on what the planner's CRM/survey tool exports, and header/format variance across tools will cause auto-mapping misfires. *Mitigation:* same pattern as PRD 4/5 — nothing writes until the planner confirms the column mapping and preview; `amount`-unmapped and `outside_window` rows are always surfaced, never silently dropped or zeroed without a visible warning.
- **Risk:** The five-dimension scorecard's thresholds are unvalidated guesses dressed up as defaults. *Mitigation:* every threshold is shown alongside its raw figure (FR-10), so a planner or exec can immediately see *why* a verdict landed where it did and argue with the threshold itself rather than trusting an opaque score — this is the entire design intent behind "transparent, rules-based, not a black box."
- **Risk:** `successMetrics[].actual` write-back (FR-13) depends on a keyword-synonym match against free-text metric names set by a different tool (PRD 1) at brief-creation time, months earlier — mismatches are likely for oddly-worded metrics. *Mitigation:* every match is planner-confirmed before writing (never silent), and unmatched metrics are left `null` rather than guessed at.
- **Assumption — pending validation:** the attribution window defaults (30/90 days) — see §15 Q3.
- **Assumption — pending validation:** the scorecard's five thresholds — see §15 Q2.
- **Assumption — pending validation:** both §11 success-metric numeric targets are directive defaults, not research-backed — no planner interviews were run, consistent with every other PRD in this suite's Fast-Follow/standalone tier.
- **Assumption:** treating every `successMetric` as "higher is better" for the hit-rate dimension (§10 dimension 5) is a v1 simplification — see §15 Q5.

## 13. Open Questions and Documented Default Decisions

**Q1: Attribution definitions vary by org — should `AttributionSettings` be configurable, and at what scope?** *(stakeholder's explicit open question)*
**Default decision:** Yes — fully configurable (`sourcedWindowDays`, `influencedWindowDays`, `useExplicitAttributionTypeColumn`), but scoped as a **single global default** shared across all reports on one device in v1, not a per-org or per-report-instance setting. Rationale: v1 has no concept of "org" (no accounts/auth — see PRD 1's binding non-goals), so there's no natural boundary to scope settings to below "everything on this device," which in practice usually *is* one planner/one team's device. A future multi-user or account-aware version could scope this per-org without a breaking change, since the settings object is already its own record, not baked into report generation logic.
**Flagged as:** Assumption — pending validation.

**Q2: What should the scorecard's five dimension thresholds be, absent real outcome data correlating them to actual repeat/kill decisions?**
**Default decision:** the specific green/yellow/red bands in §10's table (3.0×/1.0× ROI ratio; 1.0×/0.25× sourced coverage; 30/0 NPS; 10%/25% budget variance; 75%/40% success-metric hit rate). Rationale: these are directionally standard-ish B2B marketing benchmarks (NPS 30 as a commonly cited "good" bar; 3:1 pipeline-to-cost as a widely used marketing-efficiency rule of thumb) chosen for plausibility and round-number legibility rather than derived from this suite's own event data, which doesn't exist yet. Because every threshold is shown alongside its raw figure (FR-10), a wrong threshold is *visible and arguable* rather than silently distorting the verdict.
**Flagged as:** Assumption — pending validation.

**Q3: What attribution window lengths (days) should the sourced/influenced defaults use?**
**Default decision:** 30 days (sourced) / 90 days (influenced), both counted from `eventEndDate`. Rationale: 30 days approximates a typical "hot pipeline" window where a new opportunity can still be plausibly credited to a single recent event without much confounding; 90 days is a common quarter-length window marketing ops teams already use informally for campaign-influence reporting. Both are planner-editable per FR-5 with no re-import required.
**Flagged as:** Assumption — pending validation.

**Q4: Should reverting a report from "final" to "draft" retract previously-written `successMetrics[].actual` values?**
**Default decision:** No — reverting to draft stops the report from being a *future* YoY comparator or re-triggering write-back, but does not automatically null out values already written to the brief. Rationale: silently retracting a value from a shared, canonical object (`EventBrief`) as a side effect of a status toggle in a *different* tool is a surprising, hard-to-reason-about behavior; a planner who wants to correct a bad write-back can do so explicitly by editing the metric directly on the brief (PRD 1's inline edit), which is already an existing, well-understood affordance.
**Flagged as:** Assumption — pending validation.

**Q5: How should the success-metrics hit-rate dimension (§10, dimension 5) handle metrics where lower is better (e.g. a cost or a no-show rate)?**
**Default decision:** v1 treats every `successMetric` as "higher is better" (`actual ≥ target` counts as a hit). Rationale: `EventBrief.successMetrics` has no `direction`/`polarity` field in the frozen v1 schema (per `schema/event-brief-schema.md`), and adding one would require a schema change outside this PRD's write ownership; treating all metrics uniformly is the only option that doesn't require guessing a per-metric convention from free text. This will misclassify a "lower is better" metric (e.g. "cost per attendee ≤ $200") as a miss when it's actually a hit if `actual` comes in below `target` — a known, documented v1 limitation.
**Flagged as:** Assumption — pending validation. **Recommend as a MINOR schema addition** (`SuccessMetric.direction?: "higher_is_better" | "lower_is_better"`, default `"higher_is_better"`) the next time `packages/schema` is revisited, following the additive-only versioning policy in `schema/event-brief-schema.md`.

## 14. Release Criteria (Definition of Done for P0)

The Event ROI & Attribution Report P0 is done when all of the following are true:

- [ ] All 15 functional requirements (FR-1 through FR-15) pass their stated acceptance criteria.
- [ ] `packages/roi-report-core` exists, exports `PipelineOpportunity`, `PipelineImportBatch`, `SurveyResponse`, `SurveyImportBatch`, `AttributionSettings`, `RoiReport`, `Scorecard`, and pure functions for CSV/XLSX parsing, column-mapping suggestion, attribution classification, cost calculation, scorecard computation, and executive-summary text rendering — all independently unit-testable without React/Next.
- [ ] `packages/roi-report-core` imports `computeBudgetActualsSummary` from `@event-toolkit/budget-calc` (PRD 4) rather than re-implementing any budget math, and imports `EventBrief`/lead-triage types read-only from `packages/schema`/`packages/local-store` rather than redefining them.
- [ ] `packages/local-store` is extended with a `roiReportRepository` (report/pipeline/survey/settings CRUD) following the same repository-wrapper pattern as `briefRepository`/`budgetRepository`/lead-triage's repository, with no direct IndexedDB access from `apps/web` UI code.
- [ ] A planner can go end-to-end — create a report linked to a brief with existing budget and lead-triage data → import ≥1 pipeline CSV and ≥1 survey CSV → see attribution classification, cost-per-outcome, and a scored scorecard → set/see a YoY comparison against a fixture prior event → generate and export both the full report and the standalone executive summary → finalize and confirm `successMetrics[].actual` write-back — without errors.
- [ ] Data persists across a page reload at every stage of that flow.
- [ ] At least one fixture pair exists in the repo: two same-`type` fixture briefs (one older, with a finalized `RoiReport`) plus sample pipeline and survey CSVs, sufficient to exercise the YoY comparison end to end without manual setup.
- [ ] Editing `AttributionSettings` recomputes all pipeline rows' classification and all dependent totals live, without requiring re-import (spot-checked against hand-calculated values for at least 3 rows spanning sourced/influenced/outside-window).
- [ ] The scorecard's 5 dimensions each independently produce the correct verdict against hand-calculated fixture values at both the exact threshold boundary and clearly inside each band (green/yellow/red), and correctly report "insufficient data" when a dimension's inputs are missing.
- [ ] Exported full report and executive summary (both Markdown and HTML) open correctly and contain accurate, non-placeholder figures matching the in-app values.
- [ ] `EventBrief.successMetrics[].actual` write-back only occurs after explicit planner confirmation per metric, correctly leaves unmatched metrics untouched, and correctly bumps `EventBrief.version`/`updatedAt`.
- [ ] This tool makes zero writes to any Lead Triage (`TriageSession`/`LeadRecord`) or Budget Builder (`BudgetLineItem`/`BudgetSettings`) data at any point (verified by inspecting IndexedDB before/after a full report-building run) — enforcing its read-only boundary against both upstream tools.
- [ ] The usage-log CSV export contains accurate rows for all 10 FR-15-listed actions, sufficient to compute both §11 success metrics without additional instrumentation.
- [ ] No console errors in a full click-through (create → link budget/leads → import pipeline → import survey → adjust attribution settings → review scorecard → set YoY comparator → export both artifacts → finalize) in Chrome and Firefox latest.
