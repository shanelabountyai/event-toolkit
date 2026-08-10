# Roadmap

Full PRDs for every item below are in `docs/prd/`. Each PRD's `HANDOFF.md` is written to be pasted directly into a fresh Claude Code session.

## Launch tier

- [x] **PRD 1 — Event Brief Generator** — this repo's initial build. Guided intake, brief generation/edit, IndexedDB persistence, Markdown/HTML export, completeness indicator, carry-forward lessons, usage log.
- [x] **PRD 2 — Promo Campaign Kit** — built. Generates 18 assets (landing page, 5-email sequence with compressed send dates, 9 channel-aware social posts, 3 sales snippets) from the brief by template interpolation; edit tracking with live edit-distance; staleness detection and a regenerate flow that skips edited assets; registration pacing tracker with backloaded/linear target curves, CSV import with row-level errors, and rule-based interventions. Routes: `/promo`, `/promo/kit`, `/promo/pacing`. Logic covered by `pnpm promo-check`.
- [x] **PRD 3 — Run-of-Show / Logistics Pack** — built. One `LogisticsPack` per brief in the new `packages/logistics`, seeded from during-event milestones and stakeholders. Sessions hold time/label/location once; staffing, checklist, contacts and issues reference them and derive through `resolveSessionTime`, so one edit propagates everywhere. Room-clash and double-booking warnings, shipping CSV import, category checklist progress, issue log with a flag-from-anywhere affordance, browser-native print routes per artifact and for the full pack, and risk/milestone write-back into the brief. Logic covered by `pnpm logistics-check`.
- [ ] **PRD 4 — Budget Builder & Tracker** — line-item budget by event type, committed/actual tracking, variance flags, reforecast prompts, CSV/XLSX import.

PRDs 2–4 only depend on PRD 1 and can be built in parallel, each as a new route under `apps/web/app/(tools)/`. PRD 4 remains to be built.

## Fast-follow tier

(Depends on CSV import of registration/lead/survey data rather than a live integration — spec'd now, build after the launch tier is validated with real events.)

- [ ] **PRD 5 — Lead Triage & Follow-Up Engine** — CSV import of badge scans/registrants, dedupe, scoring, per-owner routing, follow-up drafts.
- [ ] **PRD 6 — Event ROI & Attribution Report** — depends on PRD 4 (budget actuals) + PRD 5 (lead outcomes). Repeat/kill/change scorecard.
- [ ] **PRD 7 — Post-Mortem Generator** — depends on PRD 3 (issue log) + PRD 4 (variance) + PRD 6 (ROI). Writes `carryForwardLessons`, closing the loop back into PRD 1's intake.

## Open questions to validate

Every PRD documents its assumptions (e.g. single-planner editing, variance thresholds, attribution windows, scoring rubric weights) as a decisive default flagged "Assumption — pending validation," since these weren't validated with real planner interviews yet. See each PRD's "Open Questions" section. Worth revisiting with real usage data once the launch tier ships.
