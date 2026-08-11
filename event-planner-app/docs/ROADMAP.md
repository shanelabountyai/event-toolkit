# Roadmap

Full PRDs for every item below are in `docs/prd/`. Each PRD's `HANDOFF.md` is written to be pasted directly into a fresh Claude Code session.

## Launch tier

- [x] **PRD 1 — Event Brief Generator** — this repo's initial build. Guided intake, brief generation/edit, IndexedDB persistence, Markdown/HTML export, completeness indicator, carry-forward lessons, usage log.
- [x] **PRD 2 — Promo Campaign Kit** — built. Generates 18 assets (landing page, 5-email sequence with compressed send dates, 9 channel-aware social posts, 3 sales snippets) from the brief by template interpolation; edit tracking with live edit-distance; staleness detection and a regenerate flow that skips edited assets; registration pacing tracker with backloaded/linear target curves, CSV import with row-level errors, and rule-based interventions. Routes: `/promo`, `/promo/kit`, `/promo/pacing`. Logic covered by `pnpm promo-check`.
- [x] **PRD 3 — Run-of-Show / Logistics Pack** — built. One `LogisticsPack` per brief in the new `packages/logistics`, seeded from during-event milestones and stakeholders. Sessions hold time/label/location once; staffing, checklist, contacts and issues reference them and derive through `resolveSessionTime`, so one edit propagates everywhere. Room-clash and double-booking warnings, shipping CSV import, category checklist progress, issue log with a flag-from-anywhere affordance, browser-native print routes per artifact and for the full pack, and risk/milestone write-back into the brief. Logic covered by `pnpm logistics-check`.
- [x] **PRD 4 — Budget Builder & Tracker** — built. Auto-generated line-item template per event type in the new `packages/budget-calc`, with the brief's own `budget.allocations` reconciled into the fixed 9-category taxonomy. Budgeted/committed/actual per row with live variance flagging (10% amber / 20% red, per-line overridable, unbudgeted spend always red, commitments as the early-warning signal). Reforecast banner driven by a scope field-value diff, CSV/XLSX import wizard with column mapping and a review step, three-sheet finance export, actuals roll-up back onto the brief, and `computeBudgetActualsSummary` — the seam PRD 6 will import. Routes: `/budget`, `/budget/[briefId]`. Logic covered by `pnpm budget-check`.

PRDs 2–4 only depend on PRD 1 and were built as separate routes under `apps/web/app/(tools)/`. The launch tier is complete.

## Fast-follow tier

(PRD 6 imports `computeBudgetActualsSummary` from `packages/budget-calc` directly — see `fixtures/conference-budget-example.json` for a worked example to develop against.)

(Depends on CSV import of registration/lead/survey data rather than a live integration — spec'd now, build after the launch tier is validated with real events.)

- [x] **PRD 5 — Lead Triage & Follow-Up Engine** — built. New `packages/lead-triage-core`: CSV parsing (papaparse), column-mapping suggestions, dedupe (exact-email auto-merge with conflicts recorded; fuzzy name+company queued for a human, never auto-merged), a configurable scoring rubric with live re-scoring, deterministic follow-up templates that never clobber an edited draft, owner assignment (mapped column → round robin → manual), and tier-then-score export per owner or combined. Strictly read-only against EventBrief. Routes under `/leads`. Logic covered by `pnpm leads-check`.
- [x] **PRD 6 — Event ROI & Attribution Report** — built. New `packages/roi-report-core`: timing-based sourced/influenced attribution (a CRM column can override it but never resurrect an outside-window row), pipeline and survey CSV/XLSX import, NPS, cost per lead/meeting/opportunity, a five-dimension transparent scorecard with generated rationale, year-over-year deltas against finalised reports only, and deterministic full-report and executive-summary rendering. Calls PRD 4's `computeBudgetActualsSummary` directly and reads PRD 5's leads; writes to neither. Routes under `/roi`. Logic covered by `pnpm roi-check`.
- [ ] **PRD 7 — Post-Mortem Generator** — depends on PRD 3 (issue log) + PRD 4 (variance) + PRD 6 (ROI). Writes `carryForwardLessons`, closing the loop back into PRD 1's intake.

## Open questions to validate

Every PRD documents its assumptions (e.g. single-planner editing, variance thresholds, attribution windows, scoring rubric weights) as a decisive default flagged "Assumption — pending validation," since these weren't validated with real planner interviews yet. See each PRD's "Open Questions" section. Worth revisiting with real usage data once the launch tier ships.
