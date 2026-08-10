# HANDOFF: Run-of-Show / Logistics Pack (PRD 3) — Claude Code Kickoff Brief

Paste this whole file into a fresh Claude Code session to start building immediately. You do not need to read the PRD first — everything required is inlined below. This session adds a **new tool/module to an existing monorepo** that has already been scaffolded by a prior session (Event Brief Generator). Do not create a new app, a new repo, or a new framework choice — this slots into what already exists.

## 1. Project Summary

We're building the "Event Planner Productivity Suite," a standalone web app suite for corporate/field marketing event planners covering the full event lifecycle. It is **standalone-first**: no HubSpot/Marketo/Cvent/Splash integrations, ever, in v1. All data enters via user input or CSV/XLSX import. The suite is one Next.js (App Router) + TypeScript + Tailwind monorepo, with each tool as a route/module inside the same app, all sharing one canonical "Event Brief" data schema (`packages/schema`) as the suite's data spine.

**This session builds the Run-of-Show / Logistics Pack tool**: given a completed Event Brief, generate and maintain a single logistics pack — minute-by-minute run-of-show, staffing assignments, shipping manifest, booth/venue checklist, and on-site contact sheet — where every artifact is a view over one shared set of underlying facts, so editing something once (like a session's time) updates every artifact that depends on it, with no manual reconciliation and no version-conflict spreadsheets. It also builds a lightweight, always-available issue log that a later tool (the post-event retro) will read from.

**The single most important thing to get right in this build:** the propagation model in §5 below. If a planner changes a session's start time once and has to also go update it somewhere else, the build has failed at its actual purpose, regardless of how polished anything else looks.

## 2. Where This Slots Into the Existing Monorepo

The monorepo already exists at the repo root, structured as:

```
event-toolkit/
├── apps/web/                     # the single Next.js app — all tools live here as routes
│   └── app/(tools)/
│       └── brief/                # PRD 1 — Event Brief Generator (already built)
│           └── [briefId]/page.tsx  # brief view has a "Logistics Pack" tool-launch link,
│                                    # currently stubbed as disabled/"coming soon" — you are
│                                    # wiring this up for real in this session
├── packages/
│   ├── schema/                   # canonical EventBrief types — READ-ONLY for this session
│   │                              # (you depend on it; you do not modify it)
│   ├── local-store/               # IndexedDB repository wrapper — you EXTEND this
│   └── ui/                        # shared UI primitives — reuse what's there, extend if needed
```

**You will add:**

```
apps/web/app/(tools)/logistics/
├── page.tsx                       # entry: reads ?briefId=..., finds-or-creates the pack,
│                                   # redirects to /logistics/[packId]
├── [packId]/
│   ├── page.tsx                   # Pack Overview / completeness dashboard
│   ├── run-of-show/page.tsx
│   ├── staffing/page.tsx
│   ├── shipping/page.tsx
│   ├── checklist/page.tsx
│   ├── contacts/page.tsx
│   ├── issues/page.tsx            # Issue Log view
│   └── print/
│       ├── page.tsx               # full-pack print view
│       └── [artifact]/page.tsx    # per-artifact print view
└── _components/
    ├── PackOverview.tsx
    ├── RunOfShowTable.tsx
    ├── StaffingByPerson.tsx
    ├── StaffingBySession.tsx
    ├── ShippingManifestTable.tsx
    ├── CsvImportDialog.tsx
    ├── ChecklistView.tsx
    ├── ContactSheetTable.tsx
    ├── IssueLogView.tsx
    ├── FlagIssueButton.tsx        # persistent affordance shown in every artifact's header
    ├── SessionOverlapWarning.tsx
    ├── DoubleBookingWarning.tsx
    ├── SessionDeleteConfirmDialog.tsx  # the reassign-or-snapshot prompt, see §5
    └── PrintLayout.tsx             # shared print-styled wrapper for all print/* routes

packages/logistics/                # NEW workspace package — zero React/Next dependency,
├── package.json                   # mirrors packages/schema's shape (pure TS types + pure fns)
├── tsconfig.json
└── src/
    ├── index.ts                   # public exports
    ├── logistics-pack.ts          # all TS types (inlined below in §4)
    ├── defaults.ts                # createLogisticsPackFromBrief(brief: EventBrief): LogisticsPack
    ├── selectors.ts                # resolveSessionTime(), findOverlaps(), findDoubleBookings(),
    │                                # completeness counts — the ONE place session-reference
    │                                # resolution happens; every view calls into this, never
    │                                # re-implements lookup logic inline
    └── migrations/
        └── index.ts                # CURRENT_LOGISTICS_SCHEMA_VERSION, migrateLogisticsPack()

packages/local-store/src/
└── logisticsRepository.ts          # NEW: getPack, getPackByBriefId, listPacks, savePack,
                                     # deletePack — mirrors briefRepository.ts's shape;
                                     # also extends db.ts with a new "logisticsPacks" object
                                     # store, indexed on eventBriefId
```

**Do not** create a new Next.js app, a new repo, or introduce a backend/database/auth. This is a new route tree plus two new/extended packages inside the existing structure — same pattern PRD 1's own handoff describes for every future tool in this suite.

## 3. Tech Stack (already decided — do not re-litigate)

| Choice | Note |
|---|---|
| Next.js (App Router), TypeScript, Tailwind CSS | Same app as everything else. Mark interactive components `"use client"`. |
| pnpm workspaces | `packages/logistics` joins `packages/schema`, `packages/local-store`, `packages/ui` as a workspace package, consumed via `workspace:*`. |
| `idb` | Same promise-based IndexedDB wrapper already used by `packages/local-store` — extend it, don't introduce a second persistence mechanism. |
| `zod` | Validate `LogisticsPack` objects the same way `EventBrief` objects are validated. |
| `crypto.randomUUID()` | Same ID-generation approach as PRD 1 — no new `uuid` dependency needed. |
| No CSS component library, no backend, no auth, no database | Same binding constraints as PRD 1. Local-first via IndexedDB only. |
| Browser-native print (`window.print()` + `@media print` / Tailwind `print:` variants) | The P0 print/PDF technique — see §7. Do not add a PDF-rendering library in this session; that's an explicit P1 (`html2pdf.js`, named in the PRD, deferred). |

## 4. Data Model — Key TypeScript Types (inline, authoritative for this build)

Put this in `packages/logistics/src/logistics-pack.ts` essentially verbatim.

```typescript
// packages/logistics/src/logistics-pack.ts

export const CURRENT_LOGISTICS_SCHEMA_VERSION = "1.0.0";

export type SessionType = "session" | "break" | "setup" | "teardown" | "other";
export type ShippingStatus = "not_shipped" | "shipped" | "delivered" | "confirmed_onsite";
export type ChecklistStatus = "todo" | "in_progress" | "done" | "blocked";
export type ContactOrgType = "internal" | "vendor" | "venue";
export type IssueSeverity = "low" | "medium" | "high";
export type IssueStatus = "open" | "resolved";
export type RelatedArtifact = "run_of_show" | "staffing" | "shipping" | "checklist" | "contacts" | "other";

export interface Session {
  id: string;
  label: string;
  startTime: string;   // ISO 8601 datetime, interpreted in the linked EventBrief's dates.timezone
  endTime: string;
  location?: string;
  owner?: string;
  type: SessionType;
  notes?: string;
}

export interface StaffAssignment {
  id: string;
  personName: string;
  sessionId?: string;          // FK into sessions[] — THE canonical time source when present
  customStartTime?: string;    // only used when sessionId is absent
  customEndTime?: string;      // only used when sessionId is absent
  assignmentRole: string;
  notes?: string;
}

export interface ShippingManifestItem {
  id: string;
  item: string;
  quantity: number;
  shipTo: string;
  carrier?: string;
  trackingNumber?: string;
  shipByDate?: string;   // ISO date
  status: ShippingStatus;
  owner?: string;
  notes?: string;
}

export interface ChecklistItem {
  id: string;
  category: string;      // free text; UI suggests defaults, does NOT lock an enum
  item: string;
  status: ChecklistStatus;
  owner?: string;
  dueSessionId?: string;   // FK into sessions[], optional
  dueNote?: string;        // freeform fallback
  notes?: string;
}

export interface OnSiteContact {
  id: string;
  name: string;
  role: string;
  orgType: ContactOrgType;
  phone?: string;
  email?: string;
  availabilitySessionId?: string;  // FK into sessions[], optional
  availabilityNote?: string;       // freeform fallback
  notes?: string;
}

export interface IssueLogEntry {
  id: string;
  timestamp: string;
  loggedBy?: string;
  description: string;     // required
  severity: IssueSeverity; // required
  status: IssueStatus;     // default "open"
  relatedArtifact?: RelatedArtifact;
  relatedSessionId?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
}

export interface LogisticsPack {
  schemaVersion: string;
  id: string;
  eventBriefId: string;   // FK into EventBrief.id — import the EventBrief type from packages/schema
  createdAt: string;
  updatedAt: string;
  version: number;
  sessions: Session[];
  staffAssignments: StaffAssignment[];
  shippingItems: ShippingManifestItem[];
  venueChecklist: ChecklistItem[];
  contacts: OnSiteContact[];
  issueLog: IssueLogEntry[];
}
```

**What this tool reads from `EventBrief`** (import types from `packages/schema`, do not redefine them):

| Field | Used for |
|---|---|
| `id` | Stored as `LogisticsPack.eventBriefId` |
| `name`, `type` | Header/context display |
| `dates.eventStartDate/eventEndDate/timezone` | Session time-picker bounds/default tz |
| `format.deliveryMode`, `format.venueOrPlatform` | Default location text seeded onto sessions/checklist |
| `stakeholders` | Seeds `OnSiteContact` rows and the staffing name-autocomplete list |
| `timeline.milestones` where `phase === "during_event"` | Seeds initial `Session` rows |
| `riskRegister` | Read-only display + live `status` write-back (see below) |
| `status` (brief's own draft/complete flag) | Read-only warning banner if the brief is still `"draft"` |

**What this tool writes back into the `EventBrief` document itself** (via the existing `briefRepository.saveBrief`, NOT a new write path): `riskRegister[].status` and `timeline.milestones[].status` only, when the planner uses the "Mark risk mitigated/occurred" or "Mark milestone done/at risk" actions on the Pack Overview. Every write bumps `EventBrief.version` and `updatedAt`, same as any other brief edit.

## 5. The Propagation Model — Read This Before Writing Any UI Code

This is the core mechanic. Get the data layer right and the UI is straightforward; get it wrong and you'll spend the rest of the build chasing sync bugs.

**Rule: a session's `startTime`, `endTime`, `label`, and `location` are stored in exactly one place — `sessions[]` — and nowhere else.** Every other record that needs "when is this" or "where is this" stores a **reference** (`sessionId`, `dueSessionId`, `availabilitySessionId`, `relatedSessionId`), never a copy of the time/label/location itself.

Implement one shared selector in `packages/logistics/src/selectors.ts`:

```typescript
export function resolveSessionTime(pack: LogisticsPack, sessionId: string | undefined): { startTime: string; endTime: string; label: string; location?: string } | null {
  if (!sessionId) return null;
  const session = pack.sessions.find(s => s.id === sessionId);
  return session ? { startTime: session.startTime, endTime: session.endTime, label: session.label, location: session.location } : null;
}
```

Every view (Staffing, Checklist, Contact Sheet, Issue Log) that displays a time tied to a session calls this selector at render time — it is a pure derivation from `pack.sessions`, computed fresh every render, never cached into the referencing record. This is what makes "edit once, everything updates" true by construction: there is no second copy anywhere to go stale.

**The one deliberate exception**: `StaffAssignment.customStartTime/customEndTime` (used only when there's no `sessionId`) and the `*Note` freeform fallbacks. These are independent facts by design — editing a session must NOT touch them, and that's correct behavior, not a bug.

**The one sharp edge to handle explicitly**: deleting a session that other records still reference. Do not allow silent orphaning. On delete, detect any `StaffAssignment`/`ChecklistItem`/`OnSiteContact` still pointing at that `sessionId`, and prompt the user to either (a) reassign the reference to a different session, or (b) convert it to a freeform note by copying the session's final time/label into the note field as an explicit, one-time, user-initiated snapshot (clearly labeled as no longer live). Build `SessionDeleteConfirmDialog.tsx` for this — it is a named component in §2's file list for a reason, don't skip it.

**Manual verification you must be able to demonstrate when this session is done:** change a session's start time once in the Run-of-Show view. Without touching anything else, navigate to Staffing, Checklist, and Contact Sheet — all three must show the new time for anything referencing that session. If they don't, the build isn't done, regardless of what else works.

## 6. P0 Feature Checklist

Derived from the PRD's FR-1 through FR-15. Check these off as you build.

- [ ] **FR-1** "Logistics Pack" link on the Event Brief view (currently a disabled stub from PRD 1) finds-or-creates a `LogisticsPack` for that `eventBriefId`; on create, seeds sessions from `during_event` milestones, seeds contacts from `stakeholders`, seeds venue/location default from `format.venueOrPlatform`.
- [ ] **FR-2** Run-of-show table: add/edit/delete sessions, sorted by `startTime`, with location/owner/type/notes.
- [ ] **FR-3** Overlap warning: same non-empty `location`, overlapping time ranges → visible flag on both rows.
- [ ] **FR-4** Staffing: assign person + role to a `sessionId` (or custom time block); "By Session" and "By Person" views computed from the same array, not stored twice.
- [ ] **FR-5** Double-booking warning: same `personName`, overlapping time ranges (via session or custom time) → flagged.
- [ ] **FR-6** Shipping manifest table with manual add/edit/delete plus CSV bulk-import (fixed column template + preview-before-import step).
- [ ] **FR-7** Venue checklist grouped by free-text category (suggest: Setup, AV/Tech, Signage, Catering, Teardown, Other), with status + per-category progress.
- [ ] **FR-8** On-site contact sheet, pre-seeded from stakeholders, editable, grouped by `orgType`.
- [ ] **FR-9** Single-edit propagation verified per §5's manual check.
- [ ] **FR-10** Issue log: "Flag an issue" affordance present on every artifact view's header; only `description` + `severity` required; dedicated filterable/sortable Issue Log view.
- [ ] **FR-11** Print views for all 5 artifacts + issue log + a concatenated full-pack view, chrome-free, paginated correctly, no split table rows.
- [ ] **FR-12** Autosave (debounced) to the new `logisticsPacks` IndexedDB store; reload restores exact state.
- [ ] **FR-13** Pack Overview dashboard: per-artifact completeness counts, open-issue count, links into each artifact.
- [ ] **FR-14** "Mark risk mitigated/occurred" and "Mark milestone done/at risk" actions write back to the linked `EventBrief` via the existing `briefRepository.saveBrief`, bumping `version`/`updatedAt`.
- [ ] **FR-15** `LogisticsPack.schemaVersion` + `migrateLogisticsPack()` (no-op passthrough acceptable for v1, but must exist and be called on every read in `logisticsRepository`).

## 7. Key UX Flows

1. **Entry**: Event Brief view → "Logistics Pack" link → `/logistics?briefId=X` → find-or-create → redirect to `/logistics/[packId]`.
2. **Pack Overview** (`/logistics/[packId]`): header (event name/dates/venue), 5 completeness tiles, "known risks" read-only panel with quick-status-update action, open-issue count, "Print Full Pack" button, nav into each artifact.
3. **Run-of-Show** (`/logistics/[packId]/run-of-show`): sortable table, inline add/edit, inline overlap warnings.
4. **Staffing** (`/logistics/[packId]/staffing`): "By Session" / "By Person" toggle, add-assignment modal (session dropdown or custom time), inline double-booking warnings.
5. **Shipping** (`/logistics/[packId]/shipping`): table + "Import CSV" action + inline status dropdown per row.
6. **Checklist** (`/logistics/[packId]/checklist`): grouped-by-category with progress bars, inline status toggle.
7. **Contacts** (`/logistics/[packId]/contacts`): table grouped by org type.
8. **Issue Log** (`/logistics/[packId]/issues`): flat filterable/sortable list; the "Flag an issue" button also appears in every OTHER artifact page's header, not just here.
9. **Print** (`/logistics/[packId]/print` and `/logistics/[packId]/print/[artifact]`): chrome-free, `@media print`-styled, triggered by `window.print()`.

## 8. Print/PDF Export Approach

**Build this in P0, browser-native, zero new dependencies:** dedicated print-only route(s) styled with Tailwind's `print:` utility classes / a `@media print` stylesheet in `PrintLayout.tsx`. A "Print" button calls `window.print()`. Requirements:
- Hide all app chrome (nav, edit buttons, form controls) in print mode.
- `page-break-inside: avoid` on every table row and checklist item — no row splits across a page.
- Body text ≥11pt for on-site paper legibility.
- Timezone abbreviation shown once in the document header, not repeated per row.
- Full-pack print concatenates sections in this fixed order: run-of-show → staffing → shipping → checklist → contacts → issue log, with a page break between each.

**Explicitly do NOT add a PDF-rendering library (e.g. `html2pdf.js`) in this session.** That's a named, deferred P1 in the PRD (for a "Download PDF without the OS print dialog" button), to be added only if post-launch feedback shows it's needed. Building it now would be speculative scope.

## 9. Acceptance Criteria — How to Verify Each P0 Item

- Create a brief with 2 `during_event` milestones and 3 stakeholders → launch the Logistics Pack → confirm 2 seeded sessions and 3 seeded contacts.
- Add two overlapping sessions at the same location → confirm the overlap warning shows on both; change one's location → warning clears.
- Assign 2 people to one session → confirm "By Session" shows both, "By Person" shows that session under each person.
- Assign the same person to two overlapping sessions → confirm double-booking warning on both.
- Import a 5-row shipping CSV → confirm 5 rows created correctly mapped; import a malformed CSV → confirm a clear error, not a crash.
- Mark 3 of 5 checklist items in one category done → confirm "3/5" progress shown.
- **Change a session's start time once. Without any other edit, check Staffing, Checklist, and Contact Sheet views. All three must reflect the new time.** This is the single most important check in this list.
- Delete a session referenced by a staffing assignment → confirm the reassign-or-snapshot prompt appears; confirm no silent data loss either way.
- Flag an issue from the Shipping view with only description + severity filled → confirm it appears in the Issue Log with `relatedArtifact: "shipping"` and a valid timestamp; mark it resolved → confirm status updates.
- Open the full-pack print view and use the browser's print/Save-as-PDF → confirm no UI chrome, no split table rows, correct multi-page pagination. Verify in both Chrome and Firefox.
- Edit a session time, close the tab without an explicit save action, reopen → confirm the edit persisted.
- From the Pack Overview, mark a risk `occurred` → reload the Event Brief view for that event → confirm the risk shows `occurred` and `EventBrief.version` incremented.
- Confirm a pack with 10 sessions and 6 staffed shows "6/10 sessions staffed" on the overview, and it updates immediately after staffing a 7th.
- Run through the whole flow once in Chrome and once in Firefox — zero console errors.

## 10. Explicit Non-Goals (do not build these — prevent scope creep)

- No real-time multi-user collaboration, presence indicators, or live conflict-resolution UI. Single planner owns a pack in v1.
- No vendor portals or any external-facing share mechanism beyond static print/PDF export.
- No floor-plan/booth-layout diagramming tool.
- No shipping-carrier API integrations (tracking number is a plain text field, nothing more).
- No push/SMS/email alerting.
- No multi-track/parallel-session swimlane UI — a flat, sortable list is P0 for all event sizes in scope.
- No PDF-rendering library (`html2pdf.js` or similar) — browser-native print only, per §8.
- No file/photo attachments on issue log entries.
- No CRM/martech/event-platform integration of any kind — standalone-first, same as the rest of the suite.
- No backend server, database, or authentication — IndexedDB only, same as the rest of the suite.
- Do not modify `packages/schema`'s `EventBrief` type definitions — you read them and, for exactly two fields (`riskRegister[].status`, `timeline.milestones[].status`), write back to an existing brief document through the existing `briefRepository.saveBrief` — you do not add new fields to `EventBrief` itself.

## 11. Suggested Build Order

1. **`packages/logistics`** first: types (§4), `defaults.ts` (`createLogisticsPackFromBrief`), `selectors.ts` (`resolveSessionTime`, `findOverlaps`, `findDoubleBookings`, completeness counters), `migrations/index.ts`. This package has zero UI dependency — write a quick sanity script validating `createLogisticsPackFromBrief` against one of the existing `fixtures/*.json` example briefs before touching any UI.
2. **`packages/local-store` extension**: add the `logisticsPacks` object store to `db.ts`, write `logisticsRepository.ts` (CRUD + `getPackByBriefId`). Test this in isolation before wiring to UI, same discipline as PRD 1's own build order.
3. **Run-of-Show view** (`/logistics/[packId]/run-of-show`) — build this before any other artifact, since everything else references `sessions[]`. Get overlap warnings (FR-3) working here too, since it's the same view.
4. **Staffing view** — build both "By Session" and "By Person" against `resolveSessionTime()` immediately, don't build a placeholder version that stores times directly and "refactor later." Do the double-booking warning (FR-5) here.
5. **Contact Sheet view** — simplest of the remaining three, and a second proof point for the FK-reference pattern.
6. **Shipping Manifest** — table + CSV import.
7. **Venue Checklist** — grouped-by-category view, benefits from patterns already established in steps 4–6.
8. **Pack Overview / dashboard** (FR-13) — build after the 5 artifacts exist, since it's a rollup of their counts. Add the risk/milestone write-back actions (FR-14) here.
9. **Issue Log view + the persistent "Flag an issue" affordance** — wire the affordance into every artifact page's header once the Issue Log data model and view both exist.
10. **Print views** (FR-11) — build `PrintLayout.tsx` once, reuse it across all 6 print routes; verify pagination in Chrome and Firefox as a dedicated QA pass before calling this session done.
11. **Manual verification pass** against §9's acceptance criteria, with special attention to the propagation check in §5 — this is the check that proves the product thesis, treat it as the actual definition of done, not a checkbox among many.

Build `packages/logistics` and the `local-store` extension solidly before touching any UI, exactly like PRD 1's own build order — the propagation model lives in the data layer, and if the FK-reference discipline slips in the UI layer (e.g., a component that copies a session's time into local state and forgets to re-derive it), the core promise of this tool breaks silently.
