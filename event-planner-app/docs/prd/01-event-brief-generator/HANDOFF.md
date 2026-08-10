# HANDOFF: Event Brief Generator (PRD 1) — Claude Code Kickoff Brief

Paste this whole file into a fresh Claude Code session to start building immediately. You do not need to read the PRD first — everything required is inlined below. **This session also scaffolds the entire monorepo** that the other 6 tools in this suite (Timeline & Task Planner, Registration & Attendee Manager, Budget & Vendor Tracker, Day-Of/Run-of-Show, Post-Event Survey & Feedback, Post-Event ROI & Retro) will be added to later — build the shared foundation properly, not just this one feature bolted onto a throwaway app.

## 1. Project Summary

We're building the "Event Planner Productivity Suite," a standalone web app suite for corporate/field marketing event planners covering the full event lifecycle. It is **standalone-first**: no HubSpot/Marketo/Cvent/Splash integrations in v1; all data enters via user input or CSV/XLSX import. The suite is built as **one Next.js (App Router) + TypeScript + Tailwind monorepo**, with each of the 7 tools as a route/module inside the same app, sharing one canonical "Event Brief" data schema. This session builds **PRD 1: the Event Brief Generator** — a guided intake flow that turns a blank page into a structured, editable, exportable Event Brief (objectives, audience, budget shell, dates, format, stakeholder RACI, success metrics, risk register, timeline). The Event Brief is the data spine: every other tool in the suite reads and extends the same brief object rather than starting cold.

## 2. Monorepo Scaffold to Create

Set this up as a pnpm workspace (or npm workspaces if pnpm isn't available — prefer pnpm). Exact structure:

```
event-toolkit/
├── package.json                  # workspace root, private, no deps of its own
├── pnpm-workspace.yaml           # packages: ["apps/*", "packages/*"]
├── tsconfig.base.json            # shared TS compiler options, extended by each package
├── .gitignore
├── apps/
│   └── web/                      # the single Next.js app — all 7 tools live here as routes
│       ├── package.json
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── tsconfig.json         # extends ../../tsconfig.base.json
│       └── app/
│           ├── layout.tsx        # root layout: global nav shell for the whole suite
│           ├── page.tsx          # suite home — for now, redirects to /brief
│           ├── globals.css
│           └── (tools)/
│               └── brief/                     # <-- THIS SESSION'S SCOPE
│                   ├── page.tsx                # brief list (home for this tool)
│                   ├── new/
│                   │   └── page.tsx            # preset chooser (Step 1)
│                   ├── [briefId]/
│                   │   ├── intake/
│                   │   │   └── page.tsx        # guided intake wizard (Steps 2-8)
│                   │   └── page.tsx            # brief view/edit (Step 9)
│                   └── _components/            # intake steps, brief sections, tables
│                       ├── PresetPicker.tsx
│                       ├── IntakeWizard.tsx
│                       ├── steps/
│                       │   ├── EventBasicsStep.tsx
│                       │   ├── GoalsStep.tsx
│                       │   ├── AudienceStep.tsx
│                       │   ├── BudgetStep.tsx
│                       │   ├── StakeholdersStep.tsx
│                       │   └── ConstraintsStep.tsx
│                       ├── BriefView.tsx
│                       ├── BriefSection*.tsx    # one per section, read + inline-edit modes
│                       ├── CompletenessBadge.tsx
│                       └── ExportDialog.tsx
├── packages/
│   ├── schema/                   # canonical Event Brief types + JSON Schema — build this FIRST
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── CHANGELOG.md
│   │   └── src/
│   │       ├── index.ts          # public exports
│   │       ├── event-brief.ts    # all TS types (inlined below in §4)
│   │       ├── event-brief.schema.json   # copy of the JSON Schema (kept in sync manually or via a build script)
│   │       ├── presets.ts        # per-event-type default metrics/risks/milestones/personas
│   │       ├── defaults.ts       # createEmptyBrief(), factory helpers, uuid generation
│   │       └── migrations/
│   │           └── index.ts      # migrateBrief(brief: unknown): EventBrief ; CURRENT_SCHEMA_VERSION
│   ├── local-store/               # IndexedDB repository wrapper — build SECOND
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # public exports
│   │       ├── db.ts             # idb wrapper, object store setup
│   │       ├── briefRepository.ts# getBrief, listBriefs, saveBrief, deleteBrief, queryLessons
│   │       └── usageLog.ts       # FR-13 local event log + CSV export
│   └── ui/                        # optional shared UI primitives (buttons, tables, form fields)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts
└── fixtures/
    ├── conference-brief-example.json
    └── webinar-brief-example.json
```

**Why this shape:** `packages/schema` has zero dependency on React/Next — it's pure TypeScript types + a JSON Schema + pure functions, so every future tool package can depend on it without pulling in UI framework code. `packages/local-store` depends only on `packages/schema` (for types) and the `idb` library — it's the one place IndexedDB is touched, and it's the seam where a future backend sync layer gets swapped in later without touching any tool's UI code. `apps/web` is the only deployable artifact; PRDs 2–7 each add a new folder under `app/(tools)/` plus new `_components/` folders, and add domain logic in new `packages/*` if it's substantial enough to be reusable (e.g. a future `packages/budget-calc`), but do NOT create new Next.js apps.

## 3. Tech Stack & Key Libraries

| Choice | Why |
|---|---|
| **Next.js (App Router), TypeScript, Tailwind CSS** | Given by the architecture decision — one deployable app, file-system routing gives each of the 7 tools a clean URL namespace, App Router's server/client component split works fine for a mostly-client-state local-first app (mark interactive components `"use client"`). |
| **pnpm workspaces** | Standard, fast, disk-efficient monorepo tooling; works cleanly with Next.js + shared internal packages via `workspace:*` protocol. |
| **`idb`** (npm package, tiny wrapper by Jake Archibald) | Turns the callback-based raw IndexedDB API into promises. This is the only new runtime dependency needed for persistence — no ORM, no backend. |
| **`zod`** | Runtime validation of `EventBrief` objects against the schema (useful both for form validation in the intake wizard and for validating fixture/import JSON) — derive it from or keep it hand-in-hand with `event-brief.schema.json`. |
| **`uuid`** (or `crypto.randomUUID()`, available in all modern browsers — prefer this, avoids the extra dependency) | Generating `id` fields for briefs, stakeholders, metrics, risks, milestones. |
| **React Hook Form (optional but recommended)** | The intake wizard has 6 multi-field steps with validation; RHF keeps this manageable versus hand-rolled state. Not required if you prefer plain controlled state — use judgment, don't over-engineer. |
| **No CSS component library** (e.g. no MUI/Chakra) | Tailwind + a small `packages/ui` of hand-built primitives keeps the suite visually consistent without a heavy dependency; this is a judgment call, not a hard requirement — swap in shadcn/ui if you want a faster start, it's Tailwind-based and won't conflict with this architecture. |
| **No backend/server, no auth library, no database** | Binding v1 constraint — local-first via IndexedDB only. Do not add Prisma, Postgres, NextAuth, etc. in this session. |

## 4. Event Brief Schema — Key TypeScript Types (inline, canonical)

This is the authoritative shape. Put this in `packages/schema/src/event-brief.ts` essentially verbatim (add JSDoc comments per the field descriptions in the full schema doc if you have it available; if not, this file is sufficient to build against).

```typescript
// packages/schema/src/event-brief.ts

export const CURRENT_SCHEMA_VERSION = "1.0.0";

export type EventType = "conference" | "webinar" | "trade_show" | "custom";
export type BriefStatus = "draft" | "complete";
export type FormatMode = "in_person" | "virtual" | "hybrid";
export type RaciRole = "R" | "A" | "C" | "I";
export type LikertLevel = "low" | "medium" | "high";
export type RiskStatus = "open" | "mitigated" | "occurred" | "closed";
export type EventPhase = "pre_event" | "during_event" | "post_event";
export type MilestoneStatus = "not_started" | "in_progress" | "done" | "at_risk";
export type ExportFormat = "markdown" | "pdf" | "docx" | "html";

export interface Persona {
  name: string;
  title?: string;
  description?: string;
  painPoints?: string[];
}

export interface Goals {
  primaryObjective: string;
  objectives?: string[];
  businessJustification?: string;
}

export interface Audience {
  description: string;
  targetPersonas?: Persona[];
  estimatedSize?: number;
  segments?: string[];
}

export interface BudgetAllocation {
  id: string;
  category: string;
  plannedAmount: number;
  actualAmount?: number | null; // written by PRD 4 (Budget & Vendor Tracker), never by PRD 1
  notes?: string;
}

export interface Budget {
  totalBudget?: number;
  currency: string; // ISO 4217, default "USD"
  allocations?: BudgetAllocation[];
  notes?: string;
}

export interface Dates {
  timezone: string; // IANA tz name
  eventStartDate: string; // ISO date YYYY-MM-DD
  eventEndDate: string;
}

export interface VenueOrPlatform {
  name?: string;
  locationOrUrl?: string;
  capacity?: number;
  notes?: string;
}

export interface Format {
  deliveryMode: FormatMode;
  venueOrPlatform?: VenueOrPlatform;
}

export interface Stakeholder {
  id: string;
  name: string;
  role: string;
  raci: RaciRole;
  email?: string;
  department?: string;
}

export interface SuccessMetric {
  id: string;
  metric: string;
  target: number;
  unit?: string;
  actual?: number | null; // written by PRD 3 / PRD 6 / PRD 7, never by PRD 1
  notes?: string;
}

export interface RiskItem {
  id: string;
  risk: string;
  likelihood: LikertLevel;
  impact: LikertLevel;
  mitigation?: string;
  owner?: string;
  status: RiskStatus; // default "open"
}

export interface Milestone {
  id: string;
  label: string;
  phase: EventPhase;
  targetDate: string; // ISO date
  owner?: string;
  status: MilestoneStatus; // default "not_started"
  notes?: string;
}

export interface Timeline {
  milestones: Milestone[];
}

export interface Constraints {
  items?: string[];
  notes?: string;
}

export interface LessonLearned {
  id: string;
  sourceEventId?: string;
  category?: string;
  lesson: string;
  addedAt: string; // ISO datetime
}

export interface ExportRecord {
  id: string;
  format: ExportFormat;
  generatedAt: string; // ISO datetime
  filename?: string;
}

export interface EventBrief {
  schemaVersion: string; // semver, e.g. "1.0.0"
  id: string; // UUID
  name: string;
  type: EventType;
  status: BriefStatus;
  version: number; // brief revision counter, increments on save
  createdAt: string; // ISO datetime
  updatedAt: string;
  createdBy?: string;
  goals: Goals;
  audience: Audience;
  budget: Budget;
  dates: Dates;
  format: Format;
  stakeholders: Stakeholder[];
  successMetrics: SuccessMetric[];
  riskRegister: RiskItem[];
  timeline: Timeline;
  constraints: Constraints;
  carryForwardLessons: LessonLearned[]; // written by PRD 7, read here at intake (FR-11)
  exportHistory?: ExportRecord[];
}
```

The full field-by-field reference (descriptions, required/optional, PRD read/write ownership, versioning policy) is at `schema/event-brief-schema.md` and the matching JSON Schema at `schema/event-brief.schema.json` in the repo root one level up from `event-toolkit/` — copy both into `packages/schema/` (the JSON Schema as `packages/schema/src/event-brief.schema.json`) as part of this session's setup.

**Versioning rule to implement now:** `packages/schema` exports `CURRENT_SCHEMA_VERSION` and a `migrateBrief(brief: unknown): EventBrief` function. For v1 this can be a no-op passthrough (stamp `schemaVersion` if missing, otherwise return as-is) — but the function must exist and be called by `local-store`'s `getBrief`/`listBriefs` on every read, so later PRDs that bump the schema to `1.1.0`+ have a real hook to add migration logic into without changing call sites in `apps/web`.

## 5. P0 Feature Checklist

Derived directly from the PRD's functional requirements (FR-1 through FR-13). Check these off as you build.

- [ ] **FR-1** Event-type preset selection (Conference / Webinar / Trade Show Booth / Custom) sets `type` and pre-populates ≥3 default `successMetrics` and ≥3 default `riskRegister` entries per type, defined in `packages/schema/src/presets.ts`.
- [ ] **FR-2** Guided 6-step intake flow (Event basics → Goals → Audience → Budget → Stakeholders/RACI → Constraints) with working forward/back navigation that preserves entered data.
- [ ] **FR-3** Required-field validation blocks brief generation until `name`, `type`, `goals.primaryObjective`, `audience.description`, `dates.timezone`, `dates.eventStartDate`, `dates.eventEndDate`, `format.deliveryMode`, `budget.currency` are all filled; missing fields are highlighted with a way to jump back to them.
- [ ] **FR-4** Brief generation assembles a full `EventBrief` object, merging preset defaults with intake answers, validating against the schema (zod or equivalent) before saving.
- [ ] **FR-5** Every brief field is editable post-generation on the brief view page (inline edit per section), including add/remove rows for stakeholders, metrics, risks, milestones.
- [ ] **FR-6** Autosave to IndexedDB (debounced), both during intake and post-generation editing; closing and reopening the tab restores exact state.
- [ ] **FR-7** Brief list page shows all locally stored briefs (name, type, status, completeness, last updated) and opens any one for continued editing.
- [ ] **FR-8** Export to Markdown (.md download) and printable HTML, covering every populated section in readable prose/table form.
- [ ] **FR-9** Every stored brief carries `schemaVersion`; `local-store` runs `migrateBrief()` on every read.
- [ ] **FR-10** Completeness indicator (see PRD §12 Q2 default: required fields + ≥1 entry each in stakeholders/successMetrics/riskRegister/timeline.milestones/audience.targetPersonas), shown on both list and brief view.
- [ ] **FR-11** Carry-forward lessons: during Goals/Constraints intake steps, query all `carryForwardLessons` across all local briefs, filter to exact `type` match (fallback: most recent 3 regardless of type if fewer than 3 matches), show as dismissible suggestions that can be accepted into `constraints.items`.
- [ ] **FR-12** Manual draft/complete status toggle on the brief view, reflected in the brief list.
- [ ] **FR-13** Local usage-event log (brief created, brief marked complete, export triggered, tool-launch-link clicked) with a "download usage log as CSV" action.

## 6. Key UX Flows to Implement

1. **Brief list (home)** → empty state with "New Brief" CTA, or a list of existing briefs with status/completeness badges.
2. **New brief → preset picker** → 4 cards (Conference/Webinar/Trade Show/Custom), each with a 1-line description of what it pre-fills.
3. **Guided intake wizard**, one topic per screen, in this order: Event basics (name, type, dates, timezone, delivery mode, venue/platform) → Goals (primary objective, secondary objectives, business justification, + carry-forward-lesson suggestions sidebar) → Audience (description, size, segments, personas) → Budget (total, currency, category table with preset defaults) → Stakeholders & RACI (table, preset-suggested starter rows) → Constraints (free list + notes, pre-filled with accepted lessons).
4. **Review & generate** screen: per-section completeness check, jump-back links for gaps, disabled "Generate Brief" button until required fields pass.
5. **Brief view/edit**: full structured document render (header, Objectives, Audience & Personas, Budget summary, RACI table, Success Metrics table, Risk Register table, Timeline grouped by phase, Constraints), inline edit affordance per section, top bar with completeness %, status toggle, Export button, and stubbed "Launch a tool" links for the other 6 tools (route to `/[tool]?briefId=...`, even though those routes don't exist yet — build them as disabled/"coming soon" links this session, since PRDs 2-7 will implement the destinations).
6. **Export dialog**: format choice (Markdown/HTML) → triggers download; log the export event (FR-13).

## 7. Acceptance Criteria / How to Verify Each P0 Item

Use these as your own manual QA pass before calling this session done — they mirror the PRD's acceptance criteria exactly:

- Create one brief per preset (4 total) and confirm each has the right `type` and ≥3 default metrics + ≥3 default risks.
- Walk all 6 intake steps forward, go back to step 1, confirm data entered in later steps is still there when you go forward again.
- Try to generate a brief with `audience.description` empty — confirm it's blocked and the field is flagged; fill it in, confirm generation now succeeds.
- Open browser devtools → Application → IndexedDB, confirm the generated brief is present with `schemaVersion: "1.0.0"`.
- Edit a field on the brief view (e.g. add a stakeholder), reload the page, confirm the edit persisted.
- Close the tab mid-intake (e.g. after step 3), reopen the app, confirm the brief list shows the in-progress brief and resuming it restores step 3's data.
- Export a fully-populated brief as Markdown — open the file, confirm all sections are present and tables render as Markdown tables.
- Export the same brief as HTML — open in a browser, confirm it looks reasonable printed/PDF'd.
- Add a `carryForwardLessons` entry to one brief's JSON directly (or via a quick test path) matching a `type`, then start a new brief of that same type — confirm the suggestion appears in the Goals step and accepting it adds to `constraints.items`.
- Toggle a brief's status between draft/complete, confirm the brief list badge updates.
- Trigger several loggable actions (create, complete, export, click a tool-launch link), then use the "download usage log as CSV" action, open the CSV, confirm one row per action with correct type + timestamp.
- Run through the whole flow once in Chrome and once in Firefox — zero console errors.

## 8. Explicit Non-Goals (do not build these — prevent scope creep)

- No approval workflow / approver role / gated status beyond the simple draft↔complete toggle.
- No multi-event portfolio dashboard/analytics view.
- No CRM/martech/event-platform integration of any kind (no HubSpot, Marketo, Cvent, Splash — not even a stubbed OAuth button).
- No real-time multi-user collaborative editing, no presence indicators, no comments/annotations. Single planner owns a brief in v1 (documented default, see PRD §12 Q1).
- No custom planner-saved presets beyond the 3 built-in ones + Custom.
- No AI/LLM-assisted drafting of objectives/personas/risk text from a free-text prompt — the guided flow is deterministic forms + preset defaults only.
- No rich-text editing in free-text fields — plain text only.
- No backend server, no database, no authentication/accounts, no cross-device sync. IndexedDB + JSON export/import is the entire v1 persistence story.
- Do not build out the other 6 tools' actual functionality — only stub their route entry points as disabled/"coming soon" links from the brief view.

## 9. Suggested Build Order

1. **Scaffold the monorepo** exactly per §2 — root config, `apps/web` Next.js app boots with a placeholder home page, empty `packages/schema` and `packages/local-store` packages wired into the workspace and importable from `apps/web`.
2. **`packages/schema`**: write `event-brief.ts` (types above), `event-brief.schema.json`, `presets.ts` (default metrics/risks/milestones/personas for Conference, Webinar, Trade Show — see PRD §9 for example content per preset), `defaults.ts` (`createEmptyBrief(type)` factory), `migrations/index.ts` (`CURRENT_SCHEMA_VERSION`, `migrateBrief`). Write a couple of quick unit tests / sanity script validating the two example fixtures in `fixtures/` against the JSON Schema.
3. **`packages/local-store`**: IndexedDB setup via `idb`, `briefRepository.ts` (CRUD + `queryLessons(type)`), `usageLog.ts` (append-only log + CSV export). Test this in isolation (e.g. a small script or test page) before wiring to UI.
4. **Intake flow**: preset picker → 6-step wizard → review/generate. Build one step at a time, wiring each to local component state first, then to autosave against `local-store` once the shape feels right.
5. **Brief generation + brief view/render**: assemble-and-validate on generate, then build the read view for all sections, then layer in inline edit per section.
6. **Completeness indicator + status toggle + carry-forward-lessons UI** (FR-10, FR-11, FR-12) — these depend on the brief view/edit already working.
7. **Export** (Markdown + HTML, FR-8) — build a pure function that takes an `EventBrief` and returns Markdown, then a second that renders/prints HTML from the same data (share formatting logic where reasonable).
8. **Usage log CSV export** (FR-13) — wire logging calls into the actions you already built (create, complete, export, tool-launch-link clicks), then build the CSV export action.
9. **Polish**: empty states, loading states, the brief list page, cross-browser check, fixture data for `fixtures/`, final pass against the Release Criteria checklist in the PRD.

Build the schema and local-store packages solidly before touching UI — every other PRD in this suite depends on them being right, and getting the contract stable early is the whole point of doing PRD 1 first.
