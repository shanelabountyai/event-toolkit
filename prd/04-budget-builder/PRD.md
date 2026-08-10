# PRD 4: Budget Builder & Tracker

**Owner:** Product (Event Planner Productivity Suite)
**Status:** Approved for build
**Date:** 2026-08-09
**Version:** 1.0
**Suite position:** Fourth of 7 PRDs. Depends on PRD 1 (Event Brief Generator / `packages/schema`) for the `EventBrief` object this tool reads and reconciles against. Its output (budget actuals) is a **direct upstream dependency for PRD 6** (Post-Event ROI Report & Retro) — see §11 "ROI Seam," which is binding for how this tool must shape its data.

---

## 1. Problem Statement

Event budgets today live in one-off spreadsheets that a planner rebuilds (or copies and half-updates) for every event, with no standard set of line items across events. Because there's no shared structure, "committed" spend (a signed contract or PO) and "actual" spend (an invoice or payment that's actually landed) get conflated or reconciled only when someone finally sits down after the event to figure out what really happened — by which point overruns are locked in and unrecoverable. Scope changes (a bigger venue, a longer event, a headcount jump) rarely trigger anyone to go back and reforecast the budget, so the gap between what was planned and what's actually going to be spent widens silently until it surfaces as a surprise at or after event close. Finance, meanwhile, has no standard export to review spend against, so every event's budget review is a bespoke conversation.

## 2. Goals & Non-Goals

### Goals
- Give every event a standardized, category-based line-item budget (not a blank spreadsheet) so budgets are comparable across events and nothing common gets forgotten.
- Separate **budgeted / committed / actual** as three distinct, always-visible numbers per line item, so a planner (and finance) can see spend risk before it's locked in, not just after.
- Surface variance automatically, at both the commitment stage (pre-event, early warning) and the actual stage (post-event, final), instead of requiring a manual reconciliation pass.
- Detect when the Event Brief's own scope has changed (headcount, dates, delivery mode, capacity, total budget) and prompt a reforecast, so budgets don't go stale silently.
- Produce a finance-reviewable export and a clean, well-shaped actuals summary that PRD 6 (ROI Report) can consume directly without re-deriving budget math.

### Non-Goals (v1)
- **PO / invoice processing.** No PO generation, no invoice ingestion/OCR, no approval routing for spend. Rationale: this is a budget *tracking* tool, not a procurement system; that's a materially different, heavier product with its own compliance requirements.
- **Accounting-system integration.** No QuickBooks/NetSuite/SAP sync, no GL coding. Rationale: binding suite-wide standalone-first constraint — all data enters via manual input or CSV/XLSX import in v1.
- **Multi-currency.** A budget is denominated in the single currency set on its Event Brief (`budget.currency`); no per-line-item currency, no FX conversion. Rationale: explicitly out of scope per the stakeholder brief; the vast majority of single-event budgets are single-currency, and multi-currency correctness (FX rate sourcing, rate-date policy) is a real feature, not a small addition.
- **Vendor master data / contract management.** `vendor` is a free-text field on a line item, not a managed vendor record with its own contact/contract history. Rationale: avoid building a second CRM-shaped object; revisit if vendor reuse across events becomes a validated need.
- **Full line-item edit history / audit trail.** v1 tracks reforecast events (before/after totals, reason, timestamp) but not a field-level undo/audit log of every edit to every line item. Rationale: reforecast-level history covers the stated need ("reforecast on scope change"); full versioning is meaningfully more storage/UI complexity for a v1 that's still local-first.
- **Multi-user approval workflow for budget changes.** Consistent with PRD 1's non-goal — single planner owns and edits the budget; no sign-off routing.

## 3. Target Users & Primary Persona

**Primary persona: same "Dana" as PRD 1** — the corporate/field marketing event planner who created the Event Brief and now needs to build and track the budget for that same event. She typically opens this tool right after (or while) finalizing the brief, and returns to it repeatedly through the planning cycle as vendor quotes turn into signed contracts turn into paid invoices.

**Secondary users:**
- **Finance/FP&A reviewer** — does not use the tool directly in v1, but receives the finance export (§10) to review spend against plan. Their needs (clear budgeted/committed/actual/variance columns, no jargon, exportable to their own tools) shape the export format.
- **Event manager / Dana's boss** — spot-checks variance flags and the reforecast prompt outcome rather than line-item detail.

## 4. User Stories

1. As a planner, I want a standard budget template generated from my Event Brief so that I don't start from a blank spreadsheet and don't forget a category I've forgotten before.
2. As a planner, I want to see budgeted, committed, and actual amounts side by side for every line item so that I know not just what I planned to spend but what's already locked in versus what's actually landed.
3. As a planner, I want variance flagged automatically once a line item crosses a threshold so that I find out about overruns from the tool, not from finance after the event.
4. As a planner, I want an early-warning flag as soon as I mark something "committed" (before the invoice even arrives) so that I can catch a problem while there's still time to act on it.
5. As a planner, I want to import a vendor's invoice/actuals spreadsheet instead of retyping every number so that reconciling actuals doesn't become its own multi-hour chore.
6. As a planner, I want to be prompted to reforecast when my event's scope changes (bigger audience, different dates, switched from in-person to virtual) so that my budget doesn't quietly go stale.
7. As a planner, I want to export a clean budget-vs-actual sheet so that I can hand it to finance without reformatting anything myself.
8. As a planner, I want to mark a budget "reconciled" once the event has closed and all actuals are in so that I have a clear record of what actually happened, for this event and to reference for the next one.
9. As the ROI Report tool (PRD 6), I want a clean, pre-computed summary of total spend, spend by category, and variance-at-close so that I can build the ROI report without re-implementing budget math.
10. As a planner, I want line items I add beyond the standard template (a one-off cost specific to this event) to be tracked with the same rigor as the template items so that the standard categories don't become a straitjacket.

## 5. Functional Requirements (P0)

Numbered, testable requirements.

**FR-1 — Standardized line-item template generation.** On first opening the Budget Builder for a brief with no existing budget, the tool auto-generates a line-item budget seeded with the 8 standard categories — Venue, AV, F&B, Travel, Promo, Staffing, Swag, Contingency — pre-populated with typical line-item names for the brief's `type` (see §9 for the per-type seed list), each starting at `budgetedAmount: 0` unless a matching category can be reconciled from `EventBrief.budget.allocations` (see FR-2).
*Acceptance:* Opening the Budget Builder for a brief with no prior budget data creates a line-item set covering all 8 categories with at least 1 seeded line item name each (Custom-type briefs get the 8 empty categories with no seeded names); reopening does not regenerate/duplicate the template.

**FR-2 — Reconciliation with Event Brief budget allocations.** At template generation, each entry in `EventBrief.budget.allocations[]` (the high-level categories from PRD 1's intake) is matched to one of the 9 line-item categories (8 standard + `other`) via a synonym mapping (e.g., "Catering" → F&B, "A/V"/"Production" → AV, "Speaker fees" → Staffing); its `plannedAmount` seeds that category's total `budgetedAmount` (split across seeded line items or placed on a single "Imported from Event Brief" line if no obvious split exists). Any allocation category that doesn't match a known synonym creates an `other`-category line item retaining the original category text as its name.
*Acceptance:* A brief with `budget.allocations` containing "Venue," "Catering," and "Speaker fees" produces line items whose categories are `venue`, `f_and_b`, and `staffing` respectively, each with `budgetedAmount` equal to the source `plannedAmount`; an allocation with an unrecognized category (e.g. "Photobooth") produces an `other` line item named "Photobooth."

**FR-3 — Budgeted / Committed / Actual columns.** Every line item has three independently editable numeric fields — `budgetedAmount`, `committedAmount`, `actualAmount` — each defaulting to 0 except `budgetedAmount`, which is either seeded (FR-1/FR-2) or planner-entered. All three are visible in the same row in the main table view.
*Acceptance:* Editing any of the three fields on a line item persists independently of the other two and is reflected immediately in that row's variance calculation (FR-4).

**FR-4 — Variance calculation and threshold flagging.** For every line item, the tool computes: `actualVarianceAmount = actualAmount − budgetedAmount`; `actualVariancePct = budgetedAmount ≠ 0 ? (actualVarianceAmount / budgetedAmount) × 100 : null`; and analogously `committedVarianceAmount` / `committedVariancePct` using `committedAmount`. A line item is flagged **amber** if the relevant variance (actual if `actualAmount > 0`, else committed if `committedAmount > 0`) meets or exceeds the applicable threshold (event default or per-line override, see §12 Q1), and **red** if it meets or exceeds 2× that threshold. A line item with `budgetedAmount = 0` and any positive `committedAmount`/`actualAmount` is always flagged red as "unbudgeted spend" regardless of threshold math. Category and budget-total rows show an aggregated worst-flag rollup.
*Acceptance:* A line item budgeted at $1,000 with `actualAmount = $1,150` shows `actualVariancePct = 15%`; at the default 10% threshold this flags amber; raising `actualAmount` to $1,300 (30%) flags red. A line item with `budgetedAmount = 0` and `committedAmount = $200` flags red immediately regardless of any threshold setting.

**FR-5 — Custom line items.** Planners can add, edit, and delete line items beyond the seeded template, assigning any of the 9 categories (8 standard + `other`), so one-off costs specific to an event are tracked identically to template items (same three amount fields, same variance/flag treatment).
*Acceptance:* Adding a custom line item under any category, entering budgeted/committed/actual values, produces the same variance calculation and flag behavior as a seeded line item; deleting a custom line item removes it from all totals.

**FR-6 — CSV/XLSX import of actuals.** Planners can upload a CSV or XLSX file containing vendor/finance data and map its columns to line-item fields (line item name, category, vendor, committed amount, actual amount, notes) via a column-mapping UI (see §10). Matched rows update existing line items' `committedAmount`/`actualAmount`; unmatched rows are offered as new line items (planner confirms or skips each). Every value written by import is tagged `source: "csv_import"` or `"xlsx_import"` for provenance.
*Acceptance:* Importing a CSV with columns `Item, Category, Actual Spend` correctly maps to `lineItemName`, `category`, `actualAmount` when mapped by the planner (or auto-suggested and accepted); a row matching an existing line item by name+category updates that item's `actualAmount`; a row with no match is shown in an "unmatched — create new?" list and only written on explicit confirmation.

**FR-7 — Reforecast trigger detection.** Each time the Budget Builder is opened (or the underlying brief changes while it's open), the tool compares the current values of five watched Event Brief fields — `audience.estimatedSize`, `dates.eventStartDate`, `dates.eventEndDate`, `format.deliveryMode`, `format.venueOrPlatform.capacity` — plus `budget.totalBudget`, against the last-seen snapshot of those same fields stored with the budget. If `audience.estimatedSize` or `venueOrPlatform.capacity` changed by ≥15%, or `deliveryMode`/`eventStartDate`/`eventEndDate`/`totalBudget` changed at all, a dismissible reforecast banner appears at the top of the Budget Builder.
*Acceptance:* Changing a brief's `audience.estimatedSize` from 300 to 400 (33% increase) and reopening the Budget Builder shows the reforecast banner; changing it from 300 to 320 (6.7%) does not; changing `format.deliveryMode` from `in_person` to `hybrid` shows the banner regardless of magnitude.

**FR-8 — Reforecast flow.** Accepting the reforecast prompt opens a flow that highlights the categories most likely affected by the detected change (e.g., F&B/Staffing/Swag for headcount changes; Venue/AV/Travel for date/mode/capacity changes), lets the planner edit `budgetedAmount` values inline, and on save records a `ReforecastEvent` (timestamp, trigger reason, brief `version` at trigger, before/after total budgeted amount) and updates the stored scope snapshot so the same change doesn't re-trigger the banner. Dismissing without reforecasting also updates the snapshot but logs the event as `"dismissed"` rather than `"reforecasted"`.
*Acceptance:* Completing a reforecast changes at least one line item's `budgetedAmount`, closes the banner, and adds a `ReforecastEvent` with `action: "reforecasted"` to the budget's history; dismissing instead adds one with `action: "dismissed"` and also closes the banner without changing any amounts.

**FR-9 — Roll-up write-back to the Event Brief.** Whenever line-item `actualAmount` values change, the tool recomputes actual spend per category and writes it back into the corresponding `EventBrief.budget.allocations[].actualAmount` (creating an allocation entry if none exists for that category), then bumps `EventBrief.version` and `updatedAt` per the schema's write-back convention. Planner-entered `plannedAmount` on existing allocations is never overwritten by this tool.
*Acceptance:* Setting F&B line items' actuals to sum to $12,400 updates the brief's F&B allocation `actualAmount` to $12,400 and increments the brief's `version`; the F&B allocation's `plannedAmount` is unchanged.

**FR-10 — Finance export.** Planners can export the full budget as an XLSX workbook (preferred) or flat CSV, containing a per-line-item sheet/table (category, line item, vendor, budgeted, committed, actual, variance $, variance %, flag, status, notes) and, for XLSX, an additional summary-by-category sheet with subtotals and a total row.
*Acceptance:* Exporting a budget with line items across all 8 categories produces a file whose per-line-item rows sum to the same category and grand totals shown in the app; the XLSX summary sheet's subtotals match the sum of that category's line items.

**FR-11 — Reconciled-at-close marking.** A planner can explicitly mark a budget "reconciled" (self-declared, similar in spirit to PRD 1's draft/complete toggle), which stamps a `reconciledAt` timestamp, freezes the budget's role in success-metric reporting as "closed," and makes the `varianceAtClose` figure in the ROI seam (§11) final. Unreconciled budgets still expose a live (non-final) variance figure.
*Acceptance:* Marking a budget reconciled sets `reconciledAt` to the current timestamp and the ROI-seam summary's `varianceAtClose.isFinal` to `true`; unmarking (if the planner needs to correct something) clears both.

**FR-12 — Local usage-event log.** Per the suite's local-only instrumentation pattern (PRD 1 FR-13), the tool logs: `budget_generated`, `import_performed` (with row counts matched/created/skipped), `reforecast_triggered`, `reforecast_completed`, `reforecast_dismissed`, `export_triggered`, `budget_reconciled`, each with a timestamp, into the same exportable usage-log CSV mechanism as the rest of the suite.
*Acceptance:* Performing each of the seven listed actions produces a corresponding row in the usage-log CSV export with accurate event type and timestamp.

**FR-13 — Budget-actuals summary function (ROI seam).** The tool exposes a pure, synchronously-callable function `computeBudgetActualsSummary(lineItems, budgetSettings, brief): BudgetActualsSummary` (see §11 for the exact shape) that any other tool in the monorepo — specifically PRD 6 — can import directly to get total spend, spend by category, and variance-at-close without re-deriving budget math.
*Acceptance:* Calling `computeBudgetActualsSummary` against a fixture budget produces `totalActual` equal to the sum of all line items' `actualAmount`, `spendByCategory` entries summing to the same total, and `varianceAtClose.isFinal` matching the budget's `reconciledAt` state.

## 6. P1 / Later (explicitly out of scope for v1)

- Vendor master data (reusable vendor records with contact/contract history across events).
- PO generation and invoice ingestion/OCR.
- Accounting-system integration (QuickBooks, NetSuite, etc.) — binding suite-wide non-goal until integrations are revisited post-v1.
- Multi-currency budgets with FX conversion.
- Field-level edit history / full undo log beyond reforecast events.
- Budget templates the planner can save/customize beyond the 8 standard categories (a fully custom taxonomy).
- Approval workflow / sign-off routing on budget changes.
- Cross-event budget benchmarking/analytics (e.g., "average AV cost across all conferences") — natural candidate once there's a body of reconciled budgets to compare, but requires the portfolio-level view PRD 1 also deferred.
- Automatic bank/card-feed reconciliation.

## 7. Data Model

**Ownership note (per `schema/event-brief-schema.md`):** PRD 1 pre-declared `BudgetAllocation.actualAmount` and `.notes` specifically so PRD 4 could write actuals back without a breaking schema change (FR-9). This PRD does **not** modify `packages/schema/src/event-brief.ts` — it adds a new, additive sibling module for its own richer domain model, and treats `EventBrief.budget.allocations[]` as a summary view it reconciles with, not its primary store.

### New schema module: `packages/schema/src/budget-tracker.ts`

```typescript
export type BudgetLineItemCategory =
  | "venue" | "av" | "f_and_b" | "travel" | "promo"
  | "staffing" | "swag" | "contingency" | "other";

export type LineItemStatus = "planned" | "committed" | "invoiced" | "paid";
export type LineItemSource = "manual" | "csv_import" | "xlsx_import";

export interface BudgetLineItem {
  id: string;                          // UUID
  eventBriefId: string;                // FK to EventBrief.id (free-form reference, no enforced referential integrity — consistent with the schema's local-first pattern, e.g. RiskItem.owner)
  category: BudgetLineItemCategory;
  lineItemName: string;                // e.g. "Keynote AV package", "Hotel block — speakers"
  vendor?: string;                     // free text; no vendor master data in v1
  budgetedAmount: number;              // planner's planned figure for this line, default 0
  committedAmount: number;             // contractually committed (PO/contract signed), default 0
  actualAmount: number;                // actually invoiced/paid, default 0
  varianceThresholdPct: number | null; // per-line override; null = use BudgetSettings.defaultVarianceThresholdPct
  status: LineItemStatus;              // default "planned"
  notes?: string;
  source: LineItemSource;              // provenance of the most recent committed/actual write
  createdAt: string;                   // ISO datetime
  updatedAt: string;
}

export interface ReforecastEvent {
  id: string;
  triggeredAt: string;                 // ISO datetime
  triggerReason: string;               // e.g. "audience.estimatedSize changed from 300 to 450 (+50%)"
  briefVersionAtTrigger: number;       // EventBrief.version that caused this trigger
  action: "reforecasted" | "dismissed";
  totalBudgetedBefore?: number;        // only set when action === "reforecasted"
  totalBudgetedAfter?: number;
}

export interface ScopeSnapshot {
  estimatedSize?: number;
  eventStartDate: string;
  eventEndDate: string;
  deliveryMode: FormatMode;            // imported from event-brief.ts
  venueCapacity?: number;
  totalBudget?: number;
}

export interface BudgetSettings {
  eventBriefId: string;                // one BudgetSettings per brief
  currency: string;                    // snapshot of EventBrief.budget.currency at generation time
  defaultVarianceThresholdPct: number; // default 10 (see §12 Q1)
  lastSeenBriefVersion: number;
  lastSeenScopeSnapshot: ScopeSnapshot;
  reforecastHistory: ReforecastEvent[];
  reconciledAt: string | null;         // set by FR-11; null = not yet reconciled
}
```

### Variance calculation formula (FR-4)

For a given `BudgetLineItem`:

```
actualVarianceAmount    = actualAmount − budgetedAmount
actualVariancePct       = budgetedAmount !== 0 ? (actualVarianceAmount / budgetedAmount) × 100 : null
committedVarianceAmount = committedAmount − budgetedAmount
committedVariancePct    = budgetedAmount !== 0 ? (committedVarianceAmount / budgetedAmount) × 100 : null

effectiveVariancePct = actualAmount > 0 ? actualVariancePct : (committedAmount > 0 ? committedVariancePct : null)
threshold = lineItem.varianceThresholdPct ?? budgetSettings.defaultVarianceThresholdPct

flag =
  budgetedAmount === 0 && (committedAmount > 0 || actualAmount > 0) ? "red"  // unbudgeted spend, always red
  : effectiveVariancePct === null ? "none"
  : abs(effectiveVariancePct) >= threshold * 2 ? "red"
  : abs(effectiveVariancePct) >= threshold ? "amber"
  : "none"
```

Tracking `committedVariancePct` as a distinct, earlier-available signal (flaggable before `actualAmount` is ever populated) is the concrete mechanism behind the "variance detected pre-event vs. post-event" success metric in §12 — a line item can flag amber/red the moment a contract is signed, well before an invoice lands.

### Which Event Brief fields trigger a reforecast prompt, and how it's detected (FR-7)

**Watched fields** (all read-only from this tool's perspective — it never edits the brief's own fields, only reads them):

| Field | Trigger condition |
|---|---|
| `audience.estimatedSize` | \|Δ\| ≥ 15% vs. last-seen snapshot value |
| `format.venueOrPlatform.capacity` | \|Δ\| ≥ 15% vs. last-seen snapshot value |
| `format.deliveryMode` | Any change (e.g. `in_person` → `hybrid`) |
| `dates.eventStartDate` / `dates.eventEndDate` | Any change |
| `budget.totalBudget` | Any change |

**Detection mechanism:** `BudgetSettings.lastSeenBriefVersion` and `lastSeenScopeSnapshot` are updated every time the planner sees and dismisses/acts on a reforecast prompt (or on first budget generation). On each Budget Builder page load, the tool first cheaply compares `EventBrief.version` to `lastSeenBriefVersion` — if unchanged, skip the diff entirely (no version bump, brief hasn't been touched, so nothing to check). If the version differs, the tool diffs the six current field values above against `lastSeenScopeSnapshot`. Only an actual difference in a watched field trips the prompt; other brief edits (e.g. adding a stakeholder, editing goals text) bump `version` but produce no scope-field diff and so surface no prompt. **Note:** this tool's own FR-9 write-back also bumps `EventBrief.version`, which is why the design checks specific field values rather than treating any version change as a trigger — otherwise the tool would self-trigger a reforecast prompt every time it wrote actuals back.

## 8. UX Flow

**Step 0 — Entry.** Reached via the "Launch Budget Builder" link on a brief's view (PRD 1's Step 9, `?briefId=...`) or from a standalone `/budget` list of budgets across all local briefs (name, type, total budgeted/committed/actual, worst-flag indicator, reconciled status).

**Step 1 — First open: template generated automatically.** No separate "generate" click is required (unlike PRD 1's intake) — opening the Budget Builder for a brief with no existing `BudgetSettings` immediately runs FR-1/FR-2 and lands the planner on the main table, pre-populated. A one-time toast explains what happened ("We've set up a standard budget for this [Conference/Webinar/Trade Show] — edit any line, add your own, or remove what doesn't apply").

**Step 2 — Main table view.** Line items grouped by category (collapsible sections), each row showing: line item name, vendor, budgeted, committed, actual, variance $ and %, flag icon (amber/red/none/unbudgeted), status, and a row-level "..." menu (edit, delete, override threshold). A sticky header row shows grand totals and the overall worst-flag rollup. A "+ Add line item" control sits at the bottom of each category section (FR-5).

**Step 3 — Reforecast banner (conditional).** If FR-7 detects a trigger, a dismissible banner appears above the table: "Your event's [scope field] changed — review your budget?" with "Review now" / "Dismiss" actions.

**Step 4 — Reforecast flow (if accepted).** A focused view lists only the categories flagged as likely-affected (visually distinguished from unaffected categories, which remain visible but collapsed), each line item's current `budgetedAmount` editable inline with the trigger reason shown as context ("Audience size increased from 300 → 450 (+50%)"). "Save reforecast" logs the `ReforecastEvent` and returns to Step 2.

**Step 5 — Import actuals.** "Import Actuals" button opens the import wizard (§9): Upload → Column Mapping → Preview → Match/Confirm → Summary ("14 line items updated, 2 new line items created, 1 skipped").

**Step 6 — Export for finance.** "Export" button opens a dialog: format choice (XLSX with summary sheet / flat CSV), triggers download, logs the export event.

**Step 7 — Mark reconciled.** Once the event has passed (`dates.eventEndDate` in the past, surfaced as a hint but not enforced), a "Mark budget reconciled" action is available in the same top-bar location as PRD 1's status toggle; confirms with a summary of final totals before stamping `reconciledAt`.

## 9. Standard Line-Item Templates by Event Type (FR-1 seed data)

| Category | Conference | Webinar | Trade Show |
|---|---|---|---|
| Venue | Venue rental | *(none seeded — $0 placeholder)* | Booth space rental |
| AV | General session AV package | Webinar platform & production | Booth AV / monitors |
| F&B | Breakfast/lunch/breaks; Reception catering | *(none seeded)* | *(none seeded)* |
| Travel | Staff travel; Speaker travel | *(none seeded)* | Staff travel & booth shipping |
| Promo | Digital promotion; Print signage | Email / paid promotion | Pre-show promotion |
| Staffing | Temp/contract staff; Registration desk staff | Speaker honoraria | Booth staff |
| Swag | Attendee swag bags | Digital swag / incentive | Booth giveaways |
| Contingency | Contingency reserve | Contingency reserve | Contingency reserve |

Custom-type briefs get all 8 category headers with no seeded line-item names — planner builds from a blank slate within the standard taxonomy. Every seeded name is fully editable/removable per FR-5; these are starting points, not requirements.

## 10. Import Approach — CSV/XLSX Column Mapping UX

1. **Upload.** Planner selects or drags a `.csv` or `.xlsx` file. The tool parses the header row (first sheet only for XLSX in v1) and shows up to 10 preview data rows.
2. **Column mapping.** For each source column, the tool auto-suggests a target field by matching header text (case-insensitive substring match against a synonym list — e.g. headers containing "item"/"description" → `lineItemName`; "actual"/"spend"/"paid" → `actualAmount`; "committed"/"po"/"contract" → `committedAmount`; "category"/"type" → `category`; "vendor"/"supplier" → `vendor`; "note"/"memo" → `notes`). Every suggestion is shown in an editable dropdown so the planner can correct or set "Ignore this column." `lineItemName` is the only required mapping to proceed.
3. **Preview.** A live-updating preview table shows the first 5 rows as they'll be interpreted post-mapping (correct types, category resolved), with inline warnings for unparseable numbers or unrecognized category text (falls back to `other`, original text kept in `notes`).
4. **Matching.** Each row is matched against existing line items by case-insensitive `(category, lineItemName)` pair; exact matches are marked "update existing," near-misses (name similarity within a simple normalized-string comparison) are shown as suggested matches the planner can accept or reject, and everything else is marked "create new line item" by default. The planner reviews the full match list (grouped: Will Update / Will Create / Skipped) before committing — nothing is written until this step is confirmed.
5. **Commit & summary.** On confirm, all rows write in a single batch (FR-6/FR-9 both fire: line items update, then category roll-ups sync to the brief), and a summary screen reports counts (updated / created / skipped) plus a link to review the affected rows directly in the table.

## 11. Export Approach for Finance Review

- **Formats:** XLSX (primary/recommended) or flat CSV.
- **XLSX workbook contents:**
  - **Sheet 1 — Line Items:** one row per line item — Category, Line Item, Vendor, Budgeted, Committed, Actual, Variance $, Variance %, Flag, Status, Notes — sorted by category then name, with a totals row.
  - **Sheet 2 — Summary by Category:** one row per of the 9 categories with Budgeted/Committed/Actual subtotals, variance $/%, and flag rollup, plus a grand-total row.
  - **Sheet 3 — Budget vs. Brief:** compares `EventBrief.budget.totalBudget` against the sum of all line items' `budgetedAmount`, flags a mismatch beyond a small tolerance (>2%) so finance can see immediately if the detailed budget has drifted from the top-line number set in the brief.
- **CSV export** is the Sheet 1 equivalent only (flat, single table) for finance tools that prefer plain CSV ingestion.
- Every export is timestamped in its filename (`{event-name}-budget-{YYYY-MM-DD}.xlsx`) and logged via FR-12.

## 12. ROI Seam — Data Shape PRD 6 Depends On

**This is the explicit seam PRD 6 (Post-Event ROI Report & Retro) depends on.** PRD 6 must not re-implement variance/spend math — it imports and calls this function directly (same monorepo, no API boundary needed).

**Location:** `packages/budget-calc/src/summary.ts`, exported as `computeBudgetActualsSummary`.

```typescript
export interface CategorySpend {
  category: BudgetLineItemCategory;
  budgeted: number;
  committed: number;
  actual: number;
  varianceAmount: number;   // actual − budgeted
  variancePct: number | null;
}

export interface BudgetActualsSummary {
  eventBriefId: string;
  currency: string;
  generatedAt: string;               // ISO datetime this summary was computed
  totalBudgeted: number;
  totalCommitted: number;
  totalActual: number;
  varianceAmount: number;            // totalActual − totalBudgeted
  variancePct: number | null;
  spendByCategory: CategorySpend[];  // one entry per category with any activity
  varianceAtClose: {
    isFinal: boolean;                // true once the budget has been marked reconciled (FR-11)
    varianceAmount: number;
    variancePct: number | null;
    reconciledAt: string | null;
  };
  lineItemCount: number;
  reconciledLineItemPct: number;     // % of line items with actualAmount > 0, a rough "how much of this budget is actually known" signal
}

export function computeBudgetActualsSummary(
  lineItems: BudgetLineItem[],
  budgetSettings: BudgetSettings,
  brief: Pick<EventBrief, "id" | "budget">
): BudgetActualsSummary;
```

`totalActual`, `spendByCategory[].actual` (summed), and `varianceAtClose` are the three fields the source brief specifically calls out ("total spend, spend by category, variance-at-close") — they're first-class, top-level fields in this shape specifically so PRD 6 doesn't need to walk `lineItems` itself. PRD 6's HANDOFF should import this type and function directly rather than redefining a parallel shape.

## 13. Success Metrics & How Measured

All measurement is local-log/derived-data based, consistent with the suite's no-backend v1 (per PRD 1 §10's precedent).

1. **% of events with a reconciled budget at close.**
   - *Definition:* of all briefs whose `dates.eventEndDate` is in the past, what fraction have a `BudgetSettings.reconciledAt` set (FR-11).
   - *Measurement:* computed directly from stored `BudgetSettings` + brief dates; no extra logging needed beyond FR-11's timestamp.
   - *Target:* ≥75% of past events show a reconciled budget within 14 days of `eventEndDate` (assumption — pending validation).

2. **Variance detected pre-event vs. post-event.**
   - *Definition:* for each event, whether the *first* line item to cross its variance threshold did so via a `committedVariancePct` flag (pre-event-capable signal) before `eventStartDate`, versus only via `actualVariancePct` after the event.
   - *Measurement:* FR-12's usage log should additionally capture a `variance_flag_first_triggered` event (line item id, flag basis — committed or actual, timestamp) the first time any line item crosses its threshold; comparing that timestamp to the brief's `eventStartDate` answers pre/post directly. *(Note: this specific log event is additive detail beyond the seven listed in FR-12 — implementers should add it as an eighth logged action.)*
   - *Target:* ≥60% of events with at least one variance flag have their first flag trigger pre-event (assumption — pending validation).

3. **Time spent on budget admin.**
   - *Definition:* proxy metric — cumulative session time in the Budget Builder per event (sum of time between a `budget_generated`/page-open event and the next 30-minutes-idle gap, across all sessions for that brief).
   - *Measurement:* derived from timestamps already in the usage log (session boundaries inferred from gaps, no new event type needed); exportable as part of the CSV.
   - *Target:* median cumulative time under 90 minutes per event across the full lifecycle (assumption — pending validation). **Caveat:** this is a weak proxy for "time saved vs. spreadsheets" since there's no spreadsheet baseline to compare against locally — recommend PRD 6 or a lightweight post-event survey question ask planners directly ("roughly how much time did budget tracking take this event?") as a complementary, self-reported data point once that tool exists.

## 14. Risks & Assumptions

- **Risk:** The free-text `category` values from PRD 1's `budget.allocations` (e.g. "Platform/Tooling" for webinars — see PRD 1 §9 Step 5) don't map cleanly onto this tool's 8 fixed categories. *Mitigation:* FR-2's synonym mapping falls back to `other` with the original text preserved, so nothing is silently dropped, but this is a known rough edge between PRD 1's free-text categories and PRD 4's controlled taxonomy — flagged here for awareness when PRD 1's presets are next revisited.
- **Risk:** CSV/XLSX files from different vendors/finance teams vary wildly in structure; auto-mapping heuristics will misfire on unusual headers. *Mitigation:* FR-6/§10's mapping and preview steps require explicit planner confirmation before any write — nothing auto-imports silently.
- **Risk:** Actual-spend accuracy is entirely dependent on planner-entered or imported data — there's no accounting-system source of truth in v1. *Mitigation:* the `source` field on every line item and `reconciledLineItemPct` in the ROI summary make data completeness visible rather than hiding it; this is a known, accepted v1 limitation given the standalone-first constraint, not something this PRD can fully solve.
- **Risk:** FR-9's write-back bumps `EventBrief.version` on every actuals sync, which could in theory create update contention if another tool is mid-edit on the same brief in the same browser tab. *Mitigation:* v1 is explicitly single-editor/single-tab per PRD 1's Open Question Q1 default; this is a non-issue under that constraint and should be revisited only if/when multi-editor support is ever built.
- **Assumption — pending validation:** the variance threshold defaults (10% amber / 20% red) — see §15 Q1, the source brief's explicit open question.
- **Assumption — pending validation:** the reforecast trigger sensitivities (15% for numeric fields, any change for enum/date/total-budget fields) — see §15 Q2.
- **Assumption — pending validation:** the 8-category-plus-other taxonomy is the right standardization level across all three event types, per the source brief's problem statement ("no standard line items") — see §15 Q3.
- **Assumption — pending validation:** all three §13 success-metric numeric targets are directive defaults, not research-backed — no planner interviews were run.

## 15. Open Questions and Documented Default Decisions

**Q1: Variance-flag thresholds — fixed % vs. user-set?** *(stakeholder's explicit open question)*
**Default decision:** a fixed **event-level default of 10%** (amber) / **20%** (red, defined as 2× the amber threshold) applies to every line item unless the planner sets a **per-line-item override** (`varianceThresholdPct`), and the event-level default itself is editable in Budget Settings (not hardcoded per event type). Rationale: a pure fixed global constant is too blunt (a $50 swag line and a $50,000 venue line shouldn't necessarily share the same sensitivity), but a fully user-set-per-line-item-with-no-default burdens the planner with a configuration decision before they've entered any data. A sensible default that's immediately overridable gives useful flagging out of the box while leaving planners full control where it matters. The 2×-for-red rule (rather than a second independently-set number) keeps the mental model simple: one number to reason about per line, not two.
**Flagged as:** Assumption — pending validation.

**Q2: What magnitude of scope change should trigger a reforecast prompt?**
**Default decision:** 15% change for the two continuously-numeric fields (`audience.estimatedSize`, `venueOrPlatform.capacity`); any change at all for the four fields where even a small change is materially budget-relevant (`deliveryMode`, both event dates, `totalBudget`). Rationale: headcount/capacity fluctuate in small ways throughout planning without necessarily warranting a reforecast conversation (10 more RSVPs isn't a scope change); a delivery-mode switch or a total-budget edit, by contrast, is inherently a deliberate, budget-relevant decision the moment it happens, so any change should surface the prompt.
**Flagged as:** Assumption — pending validation.

**Q3: Should the 8 standard categories be identical across all event types, or event-type-specific?**
**Default decision:** identical, fixed taxonomy (8 + `other`) across Conference, Webinar, and Trade Show. Rationale: the source brief's problem statement is specifically "no standard line items" — a fixed, cross-type taxonomy is what makes budgets comparable across events over time (the whole point), whereas per-type category sets would recreate the standardization problem one level down. Event-type differences are expressed through which line items are *seeded* under each category (§9), not through different categories.
**Flagged as:** Assumption — pending validation.

**Q4: What counts as "reconciled at close" — an explicit planner action, or an automatic rule (e.g., 100% of line items have a nonzero actual)?**
**Default decision:** explicit, self-declared planner action (FR-11), mirroring PRD 1's draft/complete pattern. Rationale: an automatic 100%-actuals rule would be wrong in normal cases — e.g., a contingency line is often intentionally left unspent — so forcing full actuals coverage before allowing "reconciled" would either block legitimate closes or push planners to enter fake data just to satisfy the rule.
**Flagged as:** Assumption — pending validation.

## 16. Release Criteria (Definition of Done for P0)

The Budget Builder & Tracker P0 is done when all of the following are true:

- [ ] All 13 functional requirements (FR-1 through FR-13) pass their stated acceptance criteria.
- [ ] `packages/schema/src/budget-tracker.ts` exists, exports `BudgetLineItem`, `BudgetSettings`, `ReforecastEvent`, `ScopeSnapshot`, and is re-exported from `packages/schema/src/index.ts` without any modification to `event-brief.ts`.
- [ ] `packages/budget-calc` exists with `computeVariance`/flag logic, `detectReforecastTriggers`, and `computeBudgetActualsSummary` as pure, independently unit-testable functions.
- [ ] A planner can open the Budget Builder for a fresh brief of each of the 3 presets (+ Custom) and see a correctly seeded template per §9.
- [ ] Editing budgeted/committed/actual on at least one line item in each category produces the correct variance $/%. and flag per the §7 formula, spot-checked against hand-calculated values.
- [ ] Triggering each of the 6 watched-field scope changes (§7 table) independently shows the reforecast banner; an unrelated brief edit (e.g. adding a stakeholder) does not.
- [ ] Completing a reforecast updates at least one `budgetedAmount` and records a `ReforecastEvent`; dismissing does not change any amount but does record a `ReforecastEvent` with `action: "dismissed"`.
- [ ] Importing a sample CSV and a sample XLSX file (both included as fixtures) through the full mapping/preview/match flow correctly updates and creates line items as expected, with no writes before final confirmation.
- [ ] Exporting XLSX produces a 3-sheet workbook whose totals reconcile with the in-app table; exporting CSV produces the flat line-item table.
- [ ] Marking a budget reconciled sets `reconciledAt` and flips `varianceAtClose.isFinal` to `true` in `computeBudgetActualsSummary`'s output.
- [ ] `EventBrief.budget.allocations[].actualAmount` correctly reflects category roll-ups after any actuals edit or import, and `EventBrief.version`/`updatedAt` update accordingly.
- [ ] At least 1 fully worked fixture budget (line items + settings + a completed reforecast + a reconciled state) exists in the repo for PRD 6's builder to develop against.
- [ ] The usage-log CSV export contains accurate rows for all logged actions (§ FR-12, plus the `variance_flag_first_triggered` event from §13).
- [ ] No console errors in a full click-through (template generation → edit → import → reforecast → export → reconcile) in Chrome and Firefox latest.
