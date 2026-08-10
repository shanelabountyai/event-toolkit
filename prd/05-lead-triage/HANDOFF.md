# HANDOFF: Lead Triage & Follow-Up Engine (PRD 5) — Claude Code Kickoff Brief

Paste this whole file into a fresh Claude Code session to start building immediately. You do not need to read the PRD first — everything required is inlined below. This session adds a **new tool/route to the existing "Event Planner Productivity Suite" monorepo** — it does not create a new app.

## 1. Project Summary

We're building the "Event Planner Productivity Suite," a standalone-first web app suite for corporate/field marketing event planners, built as **one Next.js (App Router) + TypeScript + Tailwind monorepo**, with each tool as a route/module inside the same app, all sharing one canonical "Event Brief" data schema (`packages/schema`) and one local-first IndexedDB persistence layer (`packages/local-store`). PRD 1 (Event Brief Generator) already exists and scaffolded the monorepo — assume it's built and working.

**This session builds PRD 5: the Lead Triage & Follow-Up Engine.** Problem it solves: after an event ends, planners sit on messy, duplicate-riddled badge-scan/registration CSVs for a week or more before sales gets a usable list — the single biggest destroyer of event ROI. This tool takes one or more CSV/XLSX exports, dedupes them into a clean lead pool, scores each lead by engagement signals (sessions attended, booth interactions, demo requests) against a configurable rubric, assigns each lead to a sales owner, auto-generates a template-based follow-up email draft per lead, and exports a prioritized, ready-to-work file per sales owner. Target: routed list and follow-up drafts within 24-48 hours of event close, versus the current week-plus.

**Standalone-first constraint (binding, same as the rest of the suite):** no CRM/martech/event-platform integrations. All lead data enters via CSV/XLSX file import — never a live API feed. No automated email sending (drafts only, exported for the sales owner to send themselves). No third-party data enrichment. This is explicitly the tool in the suite most transformed by future integrations (CRM write-back, automated sending, enrichment, live sync) — the data model is designed so those can be added later without a rework, but **none of that is built in this session.**

## 2. Where This Slots Into the Existing Monorepo

Do **not** create a new Next.js app. Add to the existing structure:

```
event-toolkit/
├── apps/
│   └── web/
│       └── app/
│           └── (tools)/
│               ├── brief/                      # PRD 1 — already exists, don't touch
│               └── leads/                      # <-- THIS SESSION'S SCOPE
│                   ├── page.tsx                 # triage session list (home for this tool)
│                   ├── new/
│                   │   └── page.tsx             # new session: link-to-brief or standalone
│                   ├── [sessionId]/
│                   │   ├── page.tsx             # session overview/dashboard (default landing)
│                   │   ├── import/
│                   │   │   └── page.tsx         # upload + column mapping wizard (repeatable)
│                   │   ├── merge-review/
│                   │   │   └── page.tsx         # dedupe conflict resolution queue
│                   │   ├── rubric/
│                   │   │   └── page.tsx         # scoring rubric editor
│                   │   ├── triage/
│                   │   │   └── page.tsx         # main lead table workspace
│                   │   ├── templates/
│                   │   │   └── page.tsx         # follow-up template editor per tier
│                   │   └── export/
│                   │       └── page.tsx         # export dialog (per-owner / combined)
│                   └── _components/
│                       ├── SessionList.tsx
│                       ├── NewSessionForm.tsx
│                       ├── ImportUploader.tsx
│                       ├── ColumnMappingTable.tsx
│                       ├── MergeReviewQueue.tsx
│                       ├── RubricEditor.tsx
│                       ├── LeadTable.tsx
│                       ├── LeadDetailDrawer.tsx
│                       ├── OwnerAssignmentPanel.tsx
│                       ├── TemplateEditor.tsx
│                       ├── DraftPreview.tsx
│                       ├── ExportDialog.tsx
│                       └── ProgressDashboardBar.tsx
├── packages/
│   ├── schema/                    # PRD 1 — already exists, DEPENDENCY, do not modify
│   ├── local-store/                # PRD 1 — already exists, EXTEND (see §3)
│   ├── ui/                         # PRD 1 — already exists, reuse shared primitives
│   └── lead-triage-core/           # <-- NEW PACKAGE, build this session
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # public exports
│           ├── types.ts            # TriageSession, ImportBatch, ColumnMapping, LeadRecord, ScoringRubric, ScoringRule, FollowUpTemplate
│           ├── csvParser.ts        # parse CSV (papaparse) / XLSX (xlsx/SheetJS) -> raw headers + rows
│           ├── columnMapping.ts    # suggestColumnMapping(headers): best-guess target field per header
│           ├── dedupe.ts           # normalizeKey(), findPossibleDuplicates(), mergeLeadRecords()
│           ├── scoring.ts          # scoreLead(lead, rubric), defaultRubric(targetPersonas?)
│           ├── templates.ts        # renderTemplate(template, lead, session), defaultTemplates()
│           └── ownerAssignment.ts  # roundRobinAssign(), applyMappedOwner()
└── fixtures/
    ├── lead-triage-sample-badgescan.csv
    ├── lead-triage-sample-registrants.csv
    └── lead-triage-sample-demorequests.csv
```

**Why a new package instead of putting logic in `apps/web`:** CSV parsing, dedupe matching, scoring, and template rendering are pure-TypeScript, framework-independent logic that should be unit-testable without React/Next and reusable if a future tool needs it — same rationale PRD 1 used for `packages/schema`. `packages/lead-triage-core` has **zero** dependency on `EventBrief`'s internal write logic — it only imports `EventBrief`'s *types* from `packages/schema` (read-only usage) for the optional brief-linking features.

**Import rule:** `apps/web`'s `leads/` route imports from `packages/lead-triage-core` (business logic) and `packages/local-store` (persistence) and `packages/schema` (types, for `EventBrief` read access) and `packages/ui` (shared components). Never duplicate types that already exist in `packages/schema`.

## 3. Extending `packages/local-store`

Add a new repository file, following the exact pattern of the existing `briefRepository.ts` — do not touch how `packages/schema`/`EventBrief` are stored.

**New IndexedDB object stores** (add to `db.ts`'s schema/upgrade logic):
- `triageSessions` (keyed by `id`, indexed by `eventBriefId`)
- `importBatches` (keyed by `id`, indexed by `triageSessionId`)
- `leadRecords` (keyed by `id`, indexed by `triageSessionId`, `dedupeKey`, `ownerId`)
- `scoringRubrics` (keyed by `id`, indexed by `triageSessionId`)
- `followUpTemplates` (keyed by `id`, indexed by `triageSessionId`)

**New file `packages/local-store/src/leadRepository.ts`** exporting: `getSession`, `listSessions`, `saveSession`, `deleteSession`, `listImportBatches(sessionId)`, `saveImportBatch`, `listLeads(sessionId)`, `getLead`, `saveLead`, `saveLeadsBulk(leads[])`, `deleteLead`, `getRubric(sessionId)`, `saveRubric`, `listTemplates(sessionId)`, `saveTemplate`. Same promise-based `idb`-wrapped style as `briefRepository.ts`.

**Reading `EventBrief` data:** call the *existing* `getBrief(id)` from `briefRepository.ts` when a session is linked — do not write a second brief-reading path. Never call any brief *write* method from this tool's code.

## 4. Tech Stack Additions

Everything from PRD 1's stack applies unchanged (Next.js App Router, TypeScript, Tailwind, pnpm workspaces, `idb`, `zod`, `crypto.randomUUID()`, no backend/auth/database). Two new runtime dependencies needed for this session, added to `apps/web`'s (or `packages/lead-triage-core`'s) `package.json`:

| New dependency | Why |
|---|---|
| **`papaparse`** | Robust, battle-tested CSV parsing (handles quoting, delimiters, encoding edge cases) — far more reliable than hand-rolled CSV splitting for real-world badge-scan exports. |
| **`xlsx`** (SheetJS) | XLSX parsing and generation, browser-compatible, no backend required — needed for both import (planners sometimes have Excel exports) and export (XLSX is a P0 export format per FR-10). |

No new dependency needed for fuzzy-match dedupe — implement a small Levenshtein-ratio + normalized string-similarity function directly in `dedupe.ts` (a handful of lines; avoid pulling in a fuzzy-matching library for something this scoped).

## 5. Key Types (inline, canonical — put in `packages/lead-triage-core/src/types.ts`)

```typescript
// packages/lead-triage-core/src/types.ts

export type TriageSessionStatus = "importing" | "triaging" | "routed" | "archived";
export type LeadStatus = "new" | "routed" | "draft_ready" | "contacted" | "closed";
export type LeadTier = "hot" | "warm" | "cold";
export type ScoringSignal = "sessionsAttended" | "boothInteractions" | "demoRequested" | "personaTitleMatch" | "customSignal";
export type AssignmentMethod = "column_mapped" | "round_robin" | "manual";
export type TemplateVariant = "in_person" | "virtual" | "hybrid" | "generic";

export interface TriageSession {
  id: string;
  eventBriefId: string | null; // soft reference to EventBrief.id — never a hard FK
  eventName: string;
  eventClosedAt: string; // ISO datetime — anchors the 24-48hr success metric
  status: TriageSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: LeadField | "customSignal" | "ignore";
  customSignalKey?: string;
  confidence: "auto" | "manual";
}

export type LeadField =
  | "firstName" | "lastName" | "fullName" | "email" | "company" | "jobTitle" | "phone"
  | "sessionsAttended" | "sessionsAttendedCount" | "boothInteractions" | "demoRequested"
  | "registrationStatus" | "owner";

export interface ImportBatch {
  id: string;
  triageSessionId: string;
  filename: string;
  sourceType?: "badge_scan" | "registrant_list" | "demo_requests" | "other";
  columnMapping: ColumnMapping[];
  rowCount: number;
  importedAt: string;
}

export interface LeadContact {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
}

export interface LeadSignals {
  sessionsAttended: string[];
  sessionsAttendedCount: number;
  boothInteractions: number;
  demoRequested: boolean;
  registrationStatus?: "registered" | "attended" | "no_show";
  customSignals?: Record<string, string | number | boolean>;
}

export interface ScoreBreakdownEntry {
  ruleId: string;
  label: string;
  points: number;
}

export interface FollowUpDraft {
  templateId: string;
  subject: string;
  body: string;
  generatedAt: string;
  editedAt?: string;
  edited: boolean;
}

export interface LeadRecord {
  id: string;
  triageSessionId: string;
  dedupeKey: string;
  contact: LeadContact;
  signals: LeadSignals;
  score: number;
  scoreBreakdown: ScoreBreakdownEntry[];
  tier: LeadTier;
  ownerId: string | null;
  ownerName: string | null;
  assignmentMethod: AssignmentMethod | null;
  status: LeadStatus;
  followUpDraft: FollowUpDraft | null;
  sourceRows: { importBatchId: string; rowIndex: number }[];
  mergedFrom?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ScoringRule {
  id: string;
  signal: ScoringSignal;
  label: string;
  pointsPerUnit?: number;
  cap?: number;
  flatPoints?: number;
  customSignalKey?: string;
  enabled: boolean;
}

export interface ScoringRubric {
  id: string;
  triageSessionId: string;
  rules: ScoringRule[];
  tierThresholds: { hot: number; warm: number };
  updatedAt: string;
}

export interface FollowUpTemplate {
  id: string;
  triageSessionId: string;
  tier: LeadTier | "all";
  deliveryModeVariant: TemplateVariant;
  subjectTemplate: string;
  bodyTemplate: string;
  updatedAt: string;
}
```

**Default starter rubric** (implement as `defaultRubric()` in `scoring.ts`):

| Rule | Signal | Weight | Cap |
|---|---|---|---|
| Demo requested | `demoRequested` | flat +40 | n/a |
| Booth interactions | `boothInteractions` | +10/each | cap 30 |
| Sessions attended | `sessionsAttended` | +5/each | cap 25 |
| Persona title match (brief-linked only) | `personaTitleMatch` | flat +15 | n/a |

Tier thresholds: **Hot ≥ 70, Warm 40-69, Cold < 40**.

**Dedupe key strategy** (implement in `dedupe.ts`): normalized email (lowercase, trim, strip quotes) is the primary match key and auto-merges on exact match (conflicting non-empty field values go to a manual-resolution flag, never silently overwritten). When email is missing/non-matching, fall back to normalized-name + normalized-company similarity ≥ 0.85 combined score — this path **never auto-merges**, it always queues for manual review in the merge-review UI.

## 6. P0 Feature Checklist

Derived directly from the PRD's functional requirements (FR-1 through FR-13). Check these off as you build.

- [ ] **FR-1** Triage session creation, either linked to an existing `EventBrief` (pre-fills `eventName`, `eventClosedAt` from `dates.eventEndDate`/`timezone`, shows read-only `goals`/`audience.targetPersonas` panel) or standalone (manual entry of both fields).
- [ ] **FR-2** CSV/XLSX import with auto-suggested, manually-overridable column mapping and a row preview before confirming.
- [ ] **FR-3** Multiple files importable into one session's shared lead pool, each recorded as an `ImportBatch` with filename/row-count/timestamp.
- [ ] **FR-4** Dedupe: exact-email auto-merge (conflicts flagged), fuzzy name+company match routed to manual merge-review queue (never silently auto-merged).
- [ ] **FR-5** Configurable scoring rubric, pre-loaded with the default above, live score recompute on any rubric edit, persisted per session.
- [ ] **FR-6** Tier-based (Hot/Warm/Cold), sortable/filterable lead table with a visible per-lead score breakdown.
- [ ] **FR-7** Owner assignment: mapped-column value takes precedence; else configurable round-robin auto-assign; individual and bulk manual reassignment always available.
- [ ] **FR-8** Per-lead follow-up draft generation via template + merge tokens (tier-based, delivery-mode-variant-aware when brief-linked); regenerate-safe (never silently overwrites a manually edited draft).
- [ ] **FR-9** Lead status lifecycle: `new` → `routed` (auto, on owner assignment) → `draft_ready` (auto, on draft generation) → `contacted`/`closed` (manual only).
- [ ] **FR-10** Prioritized export per sales owner: CSV + XLSX, "per owner" (separate files) or "combined" (one file, grouped/sorted), tier-then-score sort order, includes draft subject/body.
- [ ] **FR-11** Persistent progress dashboard: lead count, %deduped, %scored, %routed, %draft-ready, elapsed time since `eventClosedAt` — all live-updating.
- [ ] **FR-12** Local usage-event log (session created, import completed, dedupe resolved, rubric edited, assignment run, drafts generated, export triggered, session routed) with CSV export, mirroring PRD 1's FR-13 pattern.
- [ ] **FR-13** Autosave to IndexedDB throughout; closing and reopening the tab mid-session restores exact state.

## 7. Key UX Flows to Implement

1. **Triage sessions home** → list of sessions with key stats, or empty state + "New Triage Session" CTA.
2. **New session** → link-to-brief (dropdown of existing briefs) or standalone (manual event name + close date/time) → lands on session import step.
3. **Import wizard** (repeatable) → upload → column mapping table (auto-suggested, editable, with row preview) → confirm → merged into session lead pool → dedupe runs automatically.
4. **Merge review queue** (only shown if fuzzy possible-duplicates exist) → side-by-side comparison, planner picks "merge" (choose winning value per conflicting field) or "not a duplicate."
5. **Rubric editor** → starter rubric pre-loaded, editable weights/caps/enabled-toggles/thresholds, live "N hot / N warm / N cold" preview.
6. **Triage workspace** (main lead table) → sortable/filterable, persistent progress bar at top, row click opens detail drawer (full contact, signals, score breakdown, owner, status, draft preview/edit).
7. **Owner assignment panel** → configured owner list, distribution view, "auto-assign unassigned (round robin)" action, bulk reassignment on filtered selections.
8. **Template editor** → per-tier (× per-delivery-mode-variant when brief-linked) templates with default starter copy, live merge-token preview on a sample lead, "generate all drafts" bulk action.
9. **Export dialog** → format (CSV/XLSX) × scope (per-owner / combined) → triggers download(s), logs export event.

## 8. Acceptance Criteria / How to Verify Each P0 Item

Use these as your own manual QA pass before calling this session done:

- Create one session linked to an existing brief fixture and confirm `eventName`/`eventClosedAt` pre-fill correctly from that brief's `dates`.
- Create one standalone session and confirm it requires manual event name + close date entry.
- Import a CSV with a header like "Email Address" and confirm it auto-maps to `email`; deliberately mis-map a column and confirm the override sticks through to the imported records.
- Import a second file containing at least one row with the exact same (normalized) email as a row in the first file — confirm they merge into one `LeadRecord`, not two.
- Import a file with a name+company pair that closely (but not exactly) matches an existing record with no email — confirm it lands in the merge-review queue, not auto-merged; resolve it both ways ("merge" and "not a duplicate") and confirm each produces the expected record count.
- Edit a rubric weight (e.g. demo-request points) and confirm affected leads' scores and tier counts update immediately without re-importing.
- Assign owners via a mapped "Owner" column on one import and via round-robin on unassigned leads from another — confirm both paths produce correct `assignmentMethod` values; bulk-reassign a filtered selection and confirm only those leads change.
- Generate drafts for all leads, manually edit one, then run "generate all" again — confirm the edited draft is preserved (not silently overwritten) while un-edited drafts still regenerate.
- Export "per owner" for a session with 3+ distinct owners — confirm 3+ separate files, each containing only that owner's leads, sorted tier-then-score, with draft subject/body included as columns.
- Export "combined" — confirm one file, grouped/sorted by owner then tier then score.
- Confirm `TriageSession.status` flips to `"routed"` automatically the moment every lead has a non-null `ownerId`.
- Watch the FR-11 progress dashboard update live through import → dedupe → rubric edit → assignment → draft generation.
- Trigger every FR-12-listed action, then download the usage-log CSV, and confirm rows with correct type/timestamp for each — and confirm the two §11-PRD success metrics (time-to-routed, %-drafted-within-48h) are computable from that CSV.
- Close the tab mid-session (e.g. after import but before dedupe review is resolved), reopen, confirm the session resumes at the same point with the same data.
- **Inspect IndexedDB before and after a full run against a linked brief and confirm the `EventBrief` object itself was never modified** — this tool must be strictly read-only against the Event Brief in v1.
- Run through the whole flow once in Chrome and once in Firefox — zero console errors.

## 9. Explicit Non-Goals (do not build these — prevent scope creep)

- **No CRM write-back** — no pushing leads/status/scores into HubSpot, Salesforce, or any CRM, not even a stubbed OAuth button.
- **No automated sending** — the tool only drafts follow-up emails; it never sends them via any email API. Export is the entire "handoff" mechanism.
- **No third-party enrichment** — no Clearbit/ZoomInfo/LinkedIn append of firmographic/seniority data. Scoring only uses signals present in the imported files.
- **No live/real-time registration-platform sync** — leads only enter via file import (CSV/XLSX), never a live API feed from Cvent/Splash/a badge-scanning app.
- **No cross-event or CRM-aware dedupe** — dedupe only operates within one session's imported batch, never against a sales team's existing CRM contacts.
- **No write-back to the `EventBrief` object at all** — this tool is strictly read-only against briefs in v1, even for something that might feel harmless like a lead count.
- **No lead-status auto-sync from real outreach** — `contacted`/`closed` statuses are manually planner-set only; there's no way for the tool to know a sales owner actually acted on a lead.
- **No AI/LLM-generated draft copy** — follow-up drafts are deterministic template + merge-token rendering only, same convention PRD 1 established for brief generation.
- **No backend server, no database, no authentication/accounts, no cross-device sync** — IndexedDB + CSV/XLSX export/import is the entire v1 persistence and handoff story, same as the rest of the suite.

These four (CRM write-back, automated sending, enrichment, live sync) are explicitly named in the PRD's §6 "v2 Integration Path" as the natural next step once this tool proves itself standalone — do not attempt any of them, not even a stub, in this session.

## 10. Suggested Build Order

1. **`packages/lead-triage-core`** first, with zero UI dependency: `types.ts`, then `csvParser.ts` (wrap `papaparse`/`xlsx`), `columnMapping.ts` (header fuzzy-matching against `LeadField` names), `dedupe.ts` (normalize + exact/fuzzy match + merge), `scoring.ts` (`defaultRubric()` + `scoreLead()`), `templates.ts` (`defaultTemplates()` + `renderTemplate()`), `ownerAssignment.ts` (round robin + mapped-owner application). Write quick unit tests/sanity scripts against the three sample CSV fixtures before touching UI — this package is the load-bearing logic of the whole tool and is much easier to get right in isolation.
2. **Extend `packages/local-store`**: add the 5 new object stores to `db.ts`, then `leadRepository.ts` with full CRUD. Test in isolation (a small script or test page) before wiring to UI, same discipline PRD 1 used.
3. **Session creation + import flow**: new session page (brief-link or standalone) → import wizard (upload, column mapping, preview, confirm) → wire to `local-store`, confirm data round-trips through IndexedDB correctly for a single file first, then a second overlapping file to prove dedupe works end to end.
4. **Merge review queue**: build once dedupe is producing real "possible duplicate" pairs from step 3 to test against.
5. **Rubric editor + live scoring**: wire `scoreLead()` to recompute on every rubric change; build the lead table (`LeadTable.tsx`) at the same time since you'll need somewhere to see the scores/tiers land.
6. **Owner assignment**: mapped-column path first (simpler, just reads an already-imported field), then round-robin + manual/bulk reassignment UI.
7. **Templates + draft generation**: default templates first (`defaultTemplates()` in `lead-triage-core`), then the template editor UI, then "generate all drafts" wired to the lead table, then per-lead manual edit + the edited-draft-preservation logic in FR-8.
8. **Progress dashboard bar** (FR-11): straightforward once steps 3-7 exist, since it's just aggregating state that's already there — but wire it early enough in your own dev loop that you can visually confirm each preceding step's effect on it.
9. **Export** (FR-10): pure functions in `lead-triage-core` (or a new `export.ts` there) that take the session's leads and produce CSV/XLSX per the "per owner"/"combined" rules, then the export dialog UI.
10. **Usage log** (FR-12): wire logging calls into every action built in steps 3-9, then the CSV export action, then do the QA cross-check against the FR-11 dashboard numbers.
11. **Polish**: empty states, loading states, the sessions list home page, cross-browser check, the three CSV fixtures + one fully-worked fixture session for `fixtures/`, final pass against the PRD's Release Criteria checklist — including the explicit "confirm zero writes to `EventBrief`" check.

Build `lead-triage-core` and the `local-store` extension solidly before touching UI, same reasoning PRD 1 used for its own schema/local-store-first approach — dedupe and scoring correctness are the whole value proposition of this tool, and they're far easier to get right (and to unit test) as pure functions before they're wired into forms and tables.
