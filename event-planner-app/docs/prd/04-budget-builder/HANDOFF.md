# HANDOFF: Budget Builder & Tracker (PRD 4) — Claude Code Kickoff Brief

Paste this whole file into a fresh Claude Code session to start building immediately. You do not need to read the PRD first — everything required is inlined below. This session adds a new tool **into the existing monorepo** built by PRD 1 (Event Brief Generator) — it does **not** create a new app, a new repo, or touch PRD 1's schema file.

## 1. Project Summary

We're building the "Event Planner Productivity Suite," a standalone web app suite for corporate/field marketing event planners covering the full event lifecycle. It is **standalone-first**: no HubSpot/Marketo/Cvent/Splash integrations in v1; all data enters via user input or CSV/XLSX import. The suite is one Next.js (App Router) + TypeScript + Tailwind monorepo, with each tool as a route/module inside the same app, sharing one canonical "Event Brief" data schema (`packages/schema`) and one local-first IndexedDB persistence layer (`packages/local-store`).

This session builds **PRD 4: Budget Builder & Tracker** — the tool that turns a brief's high-level, planner-entered budget shell into a standardized, category-based line-item budget with **budgeted / committed / actual** tracking, automatic variance flagging (including an early-warning signal at the commitment stage, before invoices even land), a reforecast prompt when the brief's own scope changes, CSV/XLSX import of actuals, and a finance-ready export. Its computed budget-actuals summary is a load-bearing dependency for a later tool (PRD 6, Post-Event ROI Report) — build the summary function as a clean, reusable, well-typed export from day one, not an afterthought.

**Problem this solves:** today's event budgets live in one-off spreadsheets with no standard line items; committed vs. actual gets reconciled late (if ever); scope changes almost never trigger anyone to revisit the budget, so overruns surface only after the event, when it's too late to act.

## 2. Where This Slots Into the Existing Monorepo

The monorepo already exists (built by the PRD 1 session) with this shape:

```
event-toolkit/
├── apps/web/                     # the single Next.js app — all 7 tools live here as routes
│   └── app/(tools)/
│       └── brief/                # PRD 1, already built
├── packages/
│   ├── schema/                   # canonical EventBrief types — DO NOT MODIFY event-brief.ts
│   ├── local-store/               # IndexedDB repository wrapper
│   └── ui/                        # shared UI primitives
└── fixtures/
```

**What you add, and nothing else:**

```
event-toolkit/
├── apps/web/app/(tools)/
│   └── budget/                                 # <-- THIS SESSION'S SCOPE
│       ├── page.tsx                            # budget list across all local briefs
│       ├── [briefId]/
│       │   ├── page.tsx                        # main line-item table (auto-generates template on first load)
│       │   ├── import/
│       │   │   └── page.tsx                    # CSV/XLSX import wizard
│       │   └── reforecast/
│       │       └── page.tsx                    # reforecast flow (or render as a modal on the main page — your call)
│       └── _components/
│           ├── BudgetTable.tsx
│           ├── CategorySection.tsx
│           ├── LineItemRow.tsx
│           ├── LineItemEditor.tsx               # add/edit line item form
│           ├── VarianceBadge.tsx                # amber/red/none/unbudgeted flag rendering
│           ├── ReforecastBanner.tsx
│           ├── ReforecastFlow.tsx
│           ├── ImportWizard/
│           │   ├── UploadStep.tsx
│           │   ├── ColumnMappingStep.tsx
│           │   ├── PreviewStep.tsx
│           │   ├── MatchingStep.tsx
│           │   └── ImportSummary.tsx
│           ├── ExportDialog.tsx
│           └── BudgetSettingsPanel.tsx
├── packages/
│   ├── schema/src/
│   │   └── budget-tracker.ts                    # NEW FILE — additive types, see §4. Also add one line to schema/src/index.ts re-exporting it. DO NOT touch event-brief.ts.
│   ├── budget-calc/                              # NEW PACKAGE — pure domain logic, zero React/Next dependency
│   │   ├── package.json                          # depends only on packages/schema
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                          # public exports
│   │       ├── variance.ts                       # computeVariance(), flag logic
│   │       ├── presets.ts                        # per-event-type seed line items, see §6
│   │       ├── reconcile.ts                       # matches EventBrief.budget.allocations → BudgetLineItemCategory
│   │       ├── reforecast.ts                      # detectReforecastTriggers()
│   │       ├── summary.ts                         # computeBudgetActualsSummary() — THE ROI SEAM, see §7
│   │       └── import-export.ts                   # CSV/XLSX parse + column-mapping helpers, XLSX/CSV writers
│   └── local-store/src/
│       └── budgetRepository.ts                   # NEW FILE — getLineItems, saveLineItem, deleteLineItem, getBudgetSettings, saveBudgetSettings. Add two new IndexedDB object stores: `budgetLineItems` (indexed by eventBriefId) and `budgetSettings` (keyed by eventBriefId).
└── fixtures/
    └── conference-budget-example.json            # NEW — fixture budget (line items + settings + one reforecast event + reconciled state) for this session and for PRD 6's builder
```

**Do not** create a new Next.js app, a new repo, or a new deployable artifact. **Do not** modify `packages/schema/src/event-brief.ts` or `schema/event-brief-schema.md` — those are frozen for v1. **Do** add the new `packages/schema/src/budget-tracker.ts` file and re-export it — that's additive and expected.

## 3. Tech Stack Additions for This Session

Everything from PRD 1's stack applies (Next.js App Router, TypeScript, Tailwind, pnpm workspaces, `idb`, `zod`, `crypto.randomUUID()`). Add exactly one new runtime dependency:

| Choice | Why |
|---|---|
| **`xlsx`** (SheetJS community edition) | Handles both CSV and XLSX parsing (upload → JSON) and generation (JSON → XLSX/CSV) with one library, avoiding a second dependency for the two formats. Used in both the import wizard (§9 of the PRD) and the finance export (§10/FR-10). Runs client-side on `ArrayBuffer`/`File` input — no server needed, consistent with the standalone-first, no-backend architecture. |

No new UI library, no backend, no database beyond the existing IndexedDB pattern.

## 4. Data Model — Inline, Canonical for This Session

Put this in `packages/schema/src/budget-tracker.ts` essentially verbatim. Import `FormatMode` and `EventBrief` from `./event-brief` as needed — do not redefine them.

```typescript
// packages/schema/src/budget-tracker.ts
import type { FormatMode } from "./event-brief";

export type BudgetLineItemCategory =
  | "venue" | "av" | "f_and_b" | "travel" | "promo"
  | "staffing" | "swag" | "contingency" | "other";

export type LineItemStatus = "planned" | "committed" | "invoiced" | "paid";
export type LineItemSource = "manual" | "csv_import" | "xlsx_import";

export interface BudgetLineItem {
  id: string;                          // UUID
  eventBriefId: string;                // FK to EventBrief.id, free-form reference (no enforced referential integrity)
  category: BudgetLineItemCategory;
  lineItemName: string;
  vendor?: string;
  budgetedAmount: number;              // default 0
  committedAmount: number;             // default 0
  actualAmount: number;                // default 0
  varianceThresholdPct: number | null; // per-line override; null = use BudgetSettings.defaultVarianceThresholdPct
  status: LineItemStatus;              // default "planned"
  notes?: string;
  source: LineItemSource;
  createdAt: string;
  updatedAt: string;
}

export interface ReforecastEvent {
  id: string;
  triggeredAt: string;
  triggerReason: string;
  briefVersionAtTrigger: number;
  action: "reforecasted" | "dismissed";
  totalBudgetedBefore?: number;
  totalBudgetedAfter?: number;
}

export interface ScopeSnapshot {
  estimatedSize?: number;
  eventStartDate: string;
  eventEndDate: string;
  deliveryMode: FormatMode;
  venueCapacity?: number;
  totalBudget?: number;
}

export interface BudgetSettings {
  eventBriefId: string;
  currency: string;                    // snapshot of EventBrief.budget.currency at generation time
  defaultVarianceThresholdPct: number;  // default 10
  lastSeenBriefVersion: number;
  lastSeenScopeSnapshot: ScopeSnapshot;
  reforecastHistory: ReforecastEvent[];
  reconciledAt: string | null;
}
```

**Variance formula** (implement in `packages/budget-calc/src/variance.ts`):

```
actualVarianceAmount    = actualAmount − budgetedAmount
actualVariancePct       = budgetedAmount !== 0 ? (actualVarianceAmount / budgetedAmount) × 100 : null
committedVarianceAmount = committedAmount − budgetedAmount
committedVariancePct    = budgetedAmount !== 0 ? (committedVarianceAmount / budgetedAmount) × 100 : null

effectiveVariancePct = actualAmount > 0 ? actualVariancePct : (committedAmount > 0 ? committedVariancePct : null)
threshold = lineItem.varianceThresholdPct ?? budgetSettings.defaultVarianceThresholdPct

flag =
  budgetedAmount === 0 && (committedAmount > 0 || actualAmount > 0) ? "red"   // unbudgeted spend, always red
  : effectiveVariancePct === null ? "none"
  : abs(effectiveVariancePct) >= threshold * 2 ? "red"
  : abs(effectiveVariancePct) >= threshold ? "amber"
  : "none"
```

The default threshold is **10% (amber) / 20% (red)**, event-level, overridable per line item. This is a documented default, not a validated number — see §11.

**Reforecast trigger detection** (implement in `packages/budget-calc/src/reforecast.ts`): on each Budget Builder page load, compare `EventBrief.version` to `BudgetSettings.lastSeenBriefVersion`. If different, diff these six current brief field values against `lastSeenScopeSnapshot`:

| Field | Trigger condition |
|---|---|
| `audience.estimatedSize` | \|Δ\| ≥ 15% |
| `format.venueOrPlatform.capacity` | \|Δ\| ≥ 15% |
| `format.deliveryMode` | any change |
| `dates.eventStartDate` | any change |
| `dates.eventEndDate` | any change |
| `budget.totalBudget` | any change |

Any single trigger shows the reforecast banner. **Important:** this tool's own actuals-roll-up write-back (§5, "roll-up sync") also bumps `EventBrief.version` — that's expected and fine, because the trigger is based on the *field-value diff*, not the version number alone. Don't skip the diff step as an "optimization" or you'll miss real scope changes that happen to land on the same version as a sync.

## 5. P0 Feature Checklist

Derived directly from the PRD's functional requirements (FR-1 through FR-13). Check these off as you build.

- [ ] **FR-1** Auto-generate a standardized line-item template (8 categories: Venue, AV, F&B, Travel, Promo, Staffing, Swag, Contingency) on first opening the Budget Builder for a brief, seeded per-event-type per §6 below. Does not regenerate/duplicate on subsequent opens.
- [ ] **FR-2** Reconcile `EventBrief.budget.allocations[]` into the new taxonomy via a synonym map (e.g. "Catering"→`f_and_b`, "A/V"/"Production"→`av`, "Speaker fees"→`staffing`); unmatched categories become `other`-category line items retaining the original text as the name.
- [ ] **FR-3** Budgeted / Committed / Actual are three independently editable numeric fields per line item, all visible in the same table row.
- [ ] **FR-4** Live variance calculation and amber/red flagging per the §4 formula, including the always-red "unbudgeted spend" case (`budgetedAmount === 0` with nonzero committed/actual).
- [ ] **FR-5** Planners can add/edit/delete custom line items under any of the 9 categories, with identical variance/flag treatment to seeded items.
- [ ] **FR-6** CSV/XLSX import wizard: upload → column mapping (auto-suggested, editable) → preview → match against existing line items (by category+name) with planner confirmation → batch commit. Nothing writes before final confirmation. Every imported value tagged `source: "csv_import"` or `"xlsx_import"`.
- [ ] **FR-7** Reforecast banner appears when any watched field trigger fires (§4 table); dismissible.
- [ ] **FR-8** Reforecast flow highlights likely-affected categories, lets planner edit `budgetedAmount` inline, records a `ReforecastEvent` on save (action `"reforecasted"`) or on dismiss (action `"dismissed"`); either path updates the stored scope snapshot so the same change doesn't re-trigger.
- [ ] **FR-9** Actuals roll-up write-back: category-level actual totals sync into `EventBrief.budget.allocations[].actualAmount` (creating the allocation if missing) whenever line-item actuals change; bumps `EventBrief.version`/`updatedAt`; never overwrites `plannedAmount`.
- [ ] **FR-10** Finance export: XLSX (3 sheets — Line Items, Summary by Category, Budget vs. Brief) or flat CSV (Line Items only).
- [ ] **FR-11** Explicit "Mark budget reconciled" action stamps `BudgetSettings.reconciledAt`; reversible.
- [ ] **FR-12** Local usage-event log entries for: `budget_generated`, `import_performed`, `reforecast_triggered`, `reforecast_completed`, `reforecast_dismissed`, `export_triggered`, `budget_reconciled`, plus `variance_flag_first_triggered` (first time any line item crosses threshold, capturing whether it was via committed or actual) — same exportable CSV mechanism as PRD 1's usage log.
- [ ] **FR-13** `computeBudgetActualsSummary(lineItems, budgetSettings, brief)` exported from `packages/budget-calc/src/summary.ts` — see §7, this is the PRD 6 dependency, get its shape exactly right.

## 6. Standard Line-Item Templates by Event Type (for `packages/budget-calc/src/presets.ts`)

| Category | Conference | Webinar | Trade Show |
|---|---|---|---|
| Venue | Venue rental | *(none — $0 placeholder)* | Booth space rental |
| AV | General session AV package | Webinar platform & production | Booth AV / monitors |
| F&B | Breakfast/lunch/breaks; Reception catering | *(none)* | *(none)* |
| Travel | Staff travel; Speaker travel | *(none)* | Staff travel & booth shipping |
| Promo | Digital promotion; Print signage | Email / paid promotion | Pre-show promotion |
| Staffing | Temp/contract staff; Registration desk staff | Speaker honoraria | Booth staff |
| Swag | Attendee swag bags | Digital swag / incentive | Booth giveaways |
| Contingency | Contingency reserve | Contingency reserve | Contingency reserve |

Custom-type briefs: all 8 category headers, no seeded names. All seeded names are fully editable/removable (FR-5) — starting points, not requirements.

## 7. ROI Seam — Get This Shape Exactly Right

`packages/budget-calc/src/summary.ts` must export:

```typescript
export interface CategorySpend {
  category: BudgetLineItemCategory;
  budgeted: number;
  committed: number;
  actual: number;
  varianceAmount: number;
  variancePct: number | null;
}

export interface BudgetActualsSummary {
  eventBriefId: string;
  currency: string;
  generatedAt: string;
  totalBudgeted: number;
  totalCommitted: number;
  totalActual: number;
  varianceAmount: number;
  variancePct: number | null;
  spendByCategory: CategorySpend[];
  varianceAtClose: {
    isFinal: boolean;               // true once BudgetSettings.reconciledAt is set
    varianceAmount: number;
    variancePct: number | null;
    reconciledAt: string | null;
  };
  lineItemCount: number;
  reconciledLineItemPct: number;    // % of line items with actualAmount > 0
}

export function computeBudgetActualsSummary(
  lineItems: BudgetLineItem[],
  budgetSettings: BudgetSettings,
  brief: Pick<EventBrief, "id" | "budget">
): BudgetActualsSummary;
```

A later session (PRD 6, Post-Event ROI Report) will `import { computeBudgetActualsSummary } from "@event-toolkit/budget-calc"` and call it directly — no API, no serialization boundary, just a function call within the same monorepo. Keep it a **pure function** (no IndexedDB reads inside it — callers fetch `lineItems`/`budgetSettings` via `budgetRepository` first, then pass them in) so PRD 6 can call it against fixture data in tests without touching a browser database. Write at least one fixture (`fixtures/conference-budget-example.json`, containing line items + settings with one completed reforecast and a reconciled state) that exercises every field in this shape non-trivially — PRD 6's builder needs a realistic example to develop against.

## 8. Key UX Flows to Implement

1. **Entry** — from the brief view's "Launch Budget Builder" link (`?briefId=...`) or a standalone `/budget` list page (all local budgets: name, type, totals, worst flag, reconciled status).
2. **First open: auto-generated template** — no manual "generate" step; opening a brief with no existing `BudgetSettings` runs the template generation (FR-1/FR-2) immediately and lands on the main table with a one-time explanatory toast.
3. **Main table** — line items grouped by collapsible category sections; columns: name, vendor, budgeted, committed, actual, variance $/%, flag badge, status; sticky grand-total header row with overall worst-flag rollup; "+ Add line item" per category.
4. **Reforecast banner + flow** — conditional banner above the table; accepting opens a focused view of likely-affected categories with inline `budgetedAmount` edits and the trigger reason shown as context; saving logs a `ReforecastEvent`.
5. **Import wizard** — Upload → Column Mapping (auto-suggested + editable dropdowns) → Preview (5 rows, type/category validation warnings) → Matching (grouped Will Update / Will Create / Skipped, planner-reviewed) → Summary. Nothing writes until the final confirm.
6. **Export dialog** — format choice (XLSX/CSV) → download → logged.
7. **Mark reconciled** — top-bar action, confirms with a totals summary before stamping `reconciledAt`.

## 9. Acceptance Criteria / How to Verify Each P0 Item

Use these as your own manual QA pass before calling this session done:

- Open the Budget Builder for one fresh brief per preset (Conference/Webinar/Trade Show/Custom) — confirm all 8 categories appear, seeded per §6, with Custom having empty categories.
- On a brief that has `budget.allocations` entries (e.g. "Catering," "Speaker fees," "Photobooth"), confirm they map to `f_and_b`, `staffing`, and an `other` line item literally named "Photobooth."
- Edit budgeted/committed/actual on a line item to $1,000 budgeted / $1,150 actual — confirm it flags amber (15% ≥ 10% default threshold); edit actual to $1,300 — confirm it flags red (30% ≥ 20%).
- Set a line item's `budgetedAmount` to 0 and `committedAmount` to any positive number — confirm it flags red immediately.
- Add a custom line item, confirm it behaves identically to a seeded one for variance/flagging.
- Import a sample CSV (include one in your fixtures) with a differently-named "Actual Spend" column — confirm auto-mapping suggests `actualAmount`, and confirm a row matching an existing line item by name+category updates it while an unmatched row appears in "create new?" and is not written until confirmed.
- Change a test brief's `audience.estimatedSize` by +33% and reopen the Budget Builder — confirm the reforecast banner appears; change it by +7% instead — confirm it does not. Change `format.deliveryMode` by any amount — confirm the banner appears regardless of magnitude.
- Complete a reforecast (edit at least one `budgetedAmount`) — confirm a `ReforecastEvent` with `action: "reforecasted"` is recorded and the banner closes; on a separate trigger, dismiss instead — confirm the event is recorded as `"dismissed"` with no amount changes.
- Set several line items' actuals in the F&B category summing to $12,400 — confirm `EventBrief.budget.allocations` for F&B shows `actualAmount: 12400` and the brief's `version` incremented, with `plannedAmount` untouched.
- Export XLSX — confirm 3 sheets exist and the Summary-by-Category subtotals match the Line Items sheet; export CSV — confirm the flat table matches.
- Mark a budget reconciled — confirm `reconciledAt` is set and `computeBudgetActualsSummary(...).varianceAtClose.isFinal === true`.
- Call `computeBudgetActualsSummary` directly against the fixture budget (no UI) — confirm `totalActual` equals the sum of all line items' `actualAmount` and `spendByCategory` entries sum to the same total.
- Trigger each of the 8 loggable actions, download the usage-log CSV, confirm one row per action with correct type + timestamp.
- Full click-through (template generation → edit → import → reforecast → export → reconcile) with zero console errors in Chrome and Firefox.

## 10. Explicit Non-Goals (do not build these — prevent scope creep)

- No PO generation, invoice ingestion/OCR, or spend-approval routing.
- No accounting-system integration of any kind (QuickBooks, NetSuite, SAP, or otherwise) — not even a stubbed connector button.
- No multi-currency support — a budget is denominated in the single currency already set on its Event Brief; no FX conversion, no per-line-item currency field.
- No vendor master data / reusable vendor records — `vendor` is a free-text field on a line item, nothing more.
- No field-level edit history or full undo log — only reforecast events are tracked as discrete history entries; individual line-item edits are not versioned.
- No planner-customizable category taxonomy beyond the fixed 8 + `other` — this fixed set is a deliberate decision (see PRD §15 Q3), not a placeholder for a future settings screen.
- No multi-user approval workflow on budget changes — single planner, self-declared reconciled state, same pattern as PRD 1's draft/complete toggle.
- No cross-event budget benchmarking or analytics view.
- No automatic bank/card-feed reconciliation.
- Do not modify `packages/schema/src/event-brief.ts` or `schema/event-brief-schema.md` — those are frozen for v1; only add the new additive `budget-tracker.ts` module.

## 11. Documented Defaults (already decided — do not re-litigate, just implement)

These were open questions the stakeholder flagged as unresolvable without planner interviews we can't run right now. Each has a **decided default with rationale**, flagged as an assumption pending future validation — build to these, don't leave them as TODOs:

- **Variance thresholds:** fixed event-level default of **10% amber / 20% red** (2× the amber threshold), overridable per line item via `varianceThresholdPct`, and the event-level default itself is editable in Budget Settings.
- **Reforecast trigger sensitivity:** **15%** change threshold for `audience.estimatedSize` and `venueOrPlatform.capacity`; **any change** triggers for `deliveryMode`, both event dates, and `totalBudget`.
- **Category taxonomy:** fixed and identical across all event types (8 standard categories + `other`) — event-type differences live in which line items are *seeded*, not in different category sets.
- **"Reconciled at close":** explicit, self-declared planner action (not an automatic 100%-actuals rule) — mirrors PRD 1's draft/complete toggle pattern.

## 12. Suggested Build Order

1. **`packages/schema/src/budget-tracker.ts`** — write the types from §4, re-export from `packages/schema/src/index.ts`. Quick sanity check: does an existing PRD 1 fixture brief still type-check and load correctly with this addition present? (It should — this is purely additive.)
2. **`packages/budget-calc`** — pure domain logic first, no UI: `variance.ts` (formula + flag logic), `presets.ts` (§6 seed data), `reconcile.ts` (allocation→category synonym mapping), `reforecast.ts` (trigger detection), `summary.ts` (the ROI seam — get this right early since it's the most load-bearing export). Write these as pure functions and sanity-test them against hand-built fixture data before touching IndexedDB or React.
3. **`packages/local-store/src/budgetRepository.ts`** — add the two new IndexedDB object stores and CRUD functions. Test in isolation (small script or test page) before wiring to UI, same pattern PRD 1 used for `briefRepository`.
4. **Main table view** (`[briefId]/page.tsx` + `BudgetTable`/`CategorySection`/`LineItemRow`) — template auto-generation on first load, inline editing of budgeted/committed/actual, live variance/flag rendering. Get this solid before building the more complex flows on top of it.
5. **Reforecast banner + flow** — wire `detectReforecastTriggers` into the main page's load logic, build the banner and the focused reforecast editing view.
6. **Import wizard** — build the 5-step flow (`import-export.ts`'s CSV/XLSX parsing + column-mapping helpers first, then the UI steps on top). This is the most fiddly piece — budget extra time here.
7. **Export** — XLSX (3 sheets) and CSV, using the same `xlsx` library's write path.
8. **Reconciled toggle + usage log wiring** — straightforward once everything above works; wire logging calls into the actions you've already built.
9. **Fixtures + polish** — `fixtures/conference-budget-example.json` with a realistic, fully-worked example (multiple categories, at least one reforecast, reconciled state), empty states, loading states, cross-browser check, final pass against the PRD's Release Criteria checklist.

Build `packages/budget-calc` solidly and test it in isolation before touching UI — it's both this session's core logic and PRD 6's dependency, so getting its contract right (especially `computeBudgetActualsSummary`'s shape) matters more than any individual screen.
