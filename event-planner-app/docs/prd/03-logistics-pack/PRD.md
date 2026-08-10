# PRD 3: Run-of-Show / Logistics Pack

## Metadata

| Field | Value |
|---|---|
| **Status** | Draft — ready for build |
| **Owner** | Event Planner Productivity Suite — Product |
| **Depends on** | PRD 1 (Event Brief Generator) — reads `EventBrief`; PRD 1 must be built first |
| **Feeds** | PRD 7 (Post-Event ROI Report & Retro) — consumes this tool's issue log as raw input to the retro |
| **Suite position** | This document uses the assignment given for this build: **PRD 3, "Run-of-Show / Logistics Pack."** Note this differs from the *assumed* numbering table in `schema/event-brief-schema.md`, which labels the day-of/run-of-show tool "PRD 5" and reserves "PRD 3" for a Registration & Attendee Manager. That numbering table was a placeholder assumption made when the schema was written, not a locked decision. This PRD adopts the **functional read/write contract** the schema already assigned to "the day-of/run-of-show tool" (venue/format read access, live `riskRegister.status` and `timeline.milestones[].status` updates) regardless of which numeral it ends up carrying in the suite's final index. See **Risks & Assumptions** for the explicit callout and recommended reconciliation.
| **Target release** | v1 (standalone-first, no integrations) |

---

## 1. Problem Statement

Event planners currently rebuild four to five interlocking logistics documents — a minute-by-minute run-of-show, a staffing/shift plan, a shipping manifest, a booth or venue checklist, and an on-site contact sheet — from scratch for every event, almost always as separate, unversioned spreadsheets or documents. Because these documents describe the same underlying facts (who is where, doing what, at what time) but live in different files, they drift out of sync whenever a session time, venue detail, or staffing assignment changes — which happens constantly in the final week before an event. The result: planners either burn hours manually reconciling five files by hand, or worse, someone on-site is working from a stale version and shows up at the wrong time, in the wrong place, or unable to reach the right vendor contact. This is a well-known, high-frequency pain point for corporate/field marketing event planners and it gets worse, not better, the closer the event gets — exactly when planner attention is most stretched.

## 2. Goals & Non-Goals

### Goals

1. **Single source of truth for event-day logistics.** A planner edits one fact (e.g., a session's start time) once, and every artifact that depends on it (run-of-show, staffing, contact sheet) reflects the change immediately, with zero manual reconciliation.
2. **Faster pack production.** Reduce the time to produce a first complete logistics pack for an event, measured from "Event Brief marked complete" to "all 5 artifacts have at least minimum viable content," relative to the planner's current spreadsheet-based process (self-reported baseline captured in onboarding/survey, since we have no pre-launch telemetry).
3. **Eliminate version-conflict incidents.** Because there is exactly one underlying data store per event (no exported/emailed spreadsheet copies to fall out of sync), the "I was working from the old version" failure mode should not be structurally possible within the tool itself.
4. **Print-ready output for offline, on-site use.** Every artifact must be usable on paper or as a static PDF, because venue Wi-Fi and cell service are unreliable — this is explicitly a v1 requirement, not a P1.
5. **Lay the groundwork for the retro.** Capture day-of issues as they happen, in a lightweight, low-friction way, so PRD 7's post-mortem has real, timestamped input instead of planners trying to remember what went wrong three weeks later.

### Non-Goals (v1)

| Non-goal | Rationale |
|---|---|
| Real-time day-of collaboration (live multi-user presence, concurrent editing, conflict resolution UI) | High engineering cost (requires a sync backend, which violates the standalone/local-first constraint) for a capability most solo/small planning teams can approximate today by having one person own the pack and others view a printed/exported copy. Revisit only if usage data shows single-owner editing is a real bottleneck. |
| Vendor portals (external sharing links, vendor self-service updates) | Requires auth, external accounts, and a backend — directly conflicts with the standalone-first, no-backend architecture constraint. |
| Floor-plan / booth-layout visual tooling | A distinct, visually-heavy product (drag-and-drop diagramming) with little data overlap with the Event Brief spine; scoping it in would roughly double this PRD's build size for a capability that's substitutable today with a PDF/image attachment workaround (out of scope, see Open Questions). |
| Shipping-carrier tracking integration (UPS/FedEx API lookups) | Standalone-first constraint forbids external integrations in v1; tracking numbers are stored as text fields planners can look up manually. |
| Push/SMS/email day-of alerting | Requires a notification backend; out of scope for a local-first, no-server app. |
| Multi-track / parallel-session swimlane views | Real need for large conferences, but adds significant UI complexity; v1 ships a flat, sortable/filterable list which covers single-track and small multi-track events adequately (see Open Questions for the P1 trigger condition). |

## 3. Target Users & Persona

**Primary persona: Jamie, Field Marketing Event Planner.** Owns 6–15 events per year (mix of webinars, regional trade show booths, and 1–2 flagship conferences). Works solo or with one coordinator. Currently keeps a "Run of Show" Google Sheet, a separate staffing tab or doc, an email thread with the shipping tracking numbers, and a printed contact list assembled the night before travel. Is not a full-time ops/logistics specialist — wants structure without a learning curve, and needs something that works when the venue's Wi-Fi is bad.

**Secondary persona: Priya, on-site support staff / booth staffer.** Doesn't build the pack — consumes a printed or exported copy of it on-site. Never logs into the tool. Represented in this PRD only as a constraint on the print/export experience (must be readable, self-contained, no login required, no dependency on a live connection).

**Secondary persona: Sam, Field Marketing Manager (stakeholder/approver).** May be listed in the Event Brief's `stakeholders` RACI as Accountable or Consulted. Wants a fast way to sanity-check the pack is complete before the event, not to build it themselves.

## 4. User Stories

1. As Jamie, I want to generate a starter logistics pack directly from my completed Event Brief so that I don't start from a blank page every event.
2. As Jamie, I want to build a minute-by-minute run-of-show with sessions, times, and locations so that I have one authoritative schedule instead of a spreadsheet I keep re-copying.
3. As Jamie, when I move a session's start time, I want every other artifact that references that session (staffing, contact sheet availability) to update automatically so that I never have to remember to also fix the staffing tab.
4. As Jamie, I want to assign staff to shifts/sessions and see both "who's covering what" and "what is this person doing all day" views so that I can spot gaps or double-bookings before the event.
5. As Jamie, I want to track what's being shipped to the venue, by whom, and its status, so that I'm not digging through email the week of the event to confirm the banner stand shipped.
6. As Jamie, I want a booth/venue checklist grouped by category (setup, AV, signage, catering, teardown) so that I have a clear, checkable list for on-site setup and breakdown.
7. As Jamie, I want a single on-site contact sheet (internal team, vendors, venue contacts) pre-populated from my Event Brief's stakeholder list so that I don't retype names, roles, and emails I already entered once.
8. As Jamie, I want to print or export each artifact — and the whole pack — as a clean, paper-friendly document so that my on-site team has something usable even with no Wi-Fi.
9. As Jamie, when something goes wrong on-site (a session runs long, a shipment is missing, AV fails), I want to log it in seconds from wherever I am in the tool so that I have a real record for the post-event retro instead of relying on memory.
10. As Priya (on-site staffer), I want a printed contact sheet and run-of-show that are self-contained and readable without any device or login so that I can do my job with just paper in hand.
11. As Sam (stakeholder), I want to see at a glance how complete the logistics pack is (sessions defined, staff assigned, shipments tracked, checklist progress) so that I can flag gaps before the event without reading every row.

## 5. Functional Requirements — P0 (numbered, testable)

**FR-1. Create pack from Event Brief.** From the Event Brief view, a "Logistics Pack" launch link creates (if none exists) or opens (if one exists) exactly one `LogisticsPack` document linked to that brief via `eventBriefId`. On creation, the pack is seeded with: (a) one `Session` per `EventBrief.timeline.milestones` entry where `phase === "during_event"`, using the milestone's `label` and `targetDate` as a starting point; (b) `venueChecklist`/run-of-show default location pre-filled from `EventBrief.format.venueOrPlatform.name`; (c) one `OnSiteContact` per `EventBrief.stakeholders` entry, mapping `name`/`role`/`email`. *Test:* create a brief with 2 during-event milestones and 3 stakeholders → new pack has 2 seeded sessions and 3 seeded contacts.

**FR-2. Run-of-show editor.** A table/timeline view of `sessions` sorted by `startTime`, showing start time, end time, label, location, owner, type (`session | break | setup | teardown | other`), and notes. Supports add, edit, delete, and reorder (reorder is derived from time, not a manual drag order). *Test:* add a session at 9:00–9:30 and one at 9:15–9:45 in the same location → both appear, sorted by start time, with an overlap warning shown on both rows.

**FR-3. Overlap/conflict warning.** Any two sessions sharing the same non-empty `location` with overlapping `[startTime, endTime]` ranges are flagged with a visible warning indicator on the run-of-show view. *Test:* as above — warning appears; changing one session's location removes the warning.

**FR-4. Staffing assignments.** A `StaffAssignment` links a `personName` (free text, autocompleted from `EventBrief.stakeholders` and any previously-entered names) to a `sessionId` (dropdown of existing sessions) and an `assignmentRole` (free text, e.g. "Registration desk lead"). Assignments not tied to a specific session support an explicit `customStartTime`/`customEndTime` instead of a `sessionId`. Two views are provided over the same underlying data: **By Session** (who's covering each session) and **By Person** (each person's full shift list across the day), both computed from the same `staffAssignments` array — no separate storage per view. *Test:* assign 2 people to one session → "By Session" shows both under that session; "By Person" shows that session under each person's row.

**FR-5. Staffing double-booking warning.** If the same `personName` has two assignments (via `sessionId` or custom times) with overlapping time ranges, both are flagged. *Test:* assign the same person to two overlapping sessions → warning shown on both in the "By Person" view.

**FR-6. Shipping manifest.** A table of `ShippingManifestItem` rows: item description, quantity, ship-to (defaults from venue name/location, editable), carrier, tracking number, ship-by date, status (`not_shipped | shipped | delivered | confirmed_onsite`), owner, notes. Supports manual add/edit/delete and bulk-add via CSV import (columns mapped to the fields above; consistent with the suite's file-import architecture constraint). *Test:* import a 5-row CSV → 5 manifest rows created with correct field mapping; manually edit one row's status → persists on reload.

**FR-7. Booth/venue checklist.** A checklist of `ChecklistItem` rows grouped by category (default categories: Setup, AV/Tech, Signage, Catering, Teardown, Other — categories are editable text, not a locked enum, so planners aren't blocked by a fixed taxonomy). Each item has status (`todo | in_progress | done | blocked`), owner, optional due time (either a freeform note or a reference to an existing `sessionId`, e.g. "before Session: Doors Open"), and notes. *Test:* mark 3 of 5 items in "Setup" done → category shows "3/5" progress.

**FR-8. On-site contact sheet.** A table of `OnSiteContact` rows: name, role, org type (`internal | vendor | venue`), phone, email, availability (optional reference to a `sessionId`, meaning "reachable during this session's time window," or freeform text), notes. Pre-seeded per FR-1; fully add/edit/delete-able afterward. *Test:* add a vendor contact with no session reference → appears with freeform availability text, not blocked by the optional field being empty.

**FR-9. Single-edit propagation (core requirement).** Editing a `Session`'s `startTime`, `endTime`, `label`, or `location` in the run-of-show is a write to exactly one record. Every other artifact view that references that session by `sessionId` (staffing "By Session"/"By Person," checklist due-time references, contact availability references) re-renders the updated time/label/location on next view without any additional edit and without a separate stored copy of that time existing anywhere else in the pack. *Test:* change a session's start time from 9:00 to 9:30 → immediately reload the Staffing, Checklist, and Contact Sheet views (no additional edits made) → all three display 9:30 for anything referencing that session.

**FR-10. Issue log (PRD 7 seam).** A lightweight, always-available "Flag an issue" action is present on every artifact view (run-of-show, staffing, shipping, checklist, contacts) and on the pack overview. Logging an issue takes ≤2 required fields (description + severity) and captures: `id`, `timestamp` (auto, editable), `loggedBy` (free text), `description`, `severity` (`low | medium | high`), `status` (`open | resolved`), optional `relatedArtifact` (`run_of_show | staffing | shipping | checklist | contacts | other`), optional `relatedSessionId`, optional `resolutionNotes`/`resolvedAt`. A dedicated Issue Log view lists all entries for the pack, filterable by status and severity, sortable by timestamp. *Test:* flag an issue from the Shipping view with only description + severity filled → entry appears in the Issue Log with correct `relatedArtifact: "shipping"` and a valid auto-timestamp; mark it resolved → status updates and appears in a "resolved" filter.

**FR-11. Print/PDF export per artifact and full pack.** Each of the 5 artifacts plus the issue log has a dedicated print-optimized view, and a "Print Full Pack" view concatenates all of them in a fixed order (run-of-show → staffing → shipping → checklist → contacts → issue log) with page breaks between sections. *Test:* open the full-pack print view, use the browser's print/Save-as-PDF — output is a multi-page, readable, correctly-paginated document with no UI chrome (nav bars, buttons) present, and no table row is split across a page break.

**FR-12. Autosave to IndexedDB.** All edits across all 6 sub-views (5 artifacts + issue log) autosave (debounced) to a `logisticsPacks` IndexedDB object store, keyed by `LogisticsPack.id`, indexed by `eventBriefId`. Closing and reopening the tab restores exact state. *Test:* edit a session time, close the tab without an explicit save action, reopen → the edited time is present.

**FR-13. Pack overview / completeness dashboard.** A pack landing page shows, per artifact: session count, staffed-session count vs. total, shipment status breakdown, checklist completion (`done`/total per category and overall), contact count, and open-issue count — each linking into the relevant artifact view. *Test:* a pack with 10 sessions, 6 staffed, shows "6/10 sessions staffed" on the overview, and the number updates immediately after staffing a 7th.

**FR-14. Live write-back to the Event Brief.** Per the Event Brief schema's existing contract for this tool's functional role, this tool is a writer of two `EventBrief` fields during the live event: `riskRegister[].status` and `timeline.milestones[].status`. A "Mark risk mitigated/occurred" action and a "Mark milestone done/at risk" action are available (surfaced from the pack overview, referencing the brief's existing risk/milestone lists — not duplicated into the pack's own storage) and, when used, save back to the same `EventBrief` document via the existing `local-store` `saveBrief` path, incrementing `EventBrief.version` and `updatedAt`. *Test:* from the pack overview, mark a risk `occurred` → reload the Event Brief view for that event → the risk's status shows `occurred`.

**FR-15. Schema versioning for the pack document.** Every `LogisticsPack` document carries `schemaVersion`; a `migrateLogisticsPack()` function (no-op passthrough acceptable for v1, but must exist and be called on every read) runs before use, mirroring the Event Brief's migration discipline.

## 6. P1 / Later

- **Real-time collaboration** (multi-user live editing/presence) — requires backend infrastructure; revisit if usage data shows single-owner editing blocks larger event teams.
- **One-click "Download PDF" button** using a client-side rendering library (e.g. `html2pdf.js`) instead of relying on the browser's native print dialog — see Print/PDF Export section for why this is deferred, not because it's undesirable.
- **Calendar/ICS export** of a staff member's personal shift schedule.
- **Multi-track/parallel-session swimlane view** for large conferences with concurrent tracks (trigger: ≥3 events report the flat list is unusable for multi-track scheduling).
- **Auto-suggested checklist templates** per event type/format (e.g., a trade-show-booth-specific checklist preset), extending the existing preset pattern from PRD 1.
- **Shipping carrier tracking lookups** (manual paste-in of a tracking URL that opens the carrier's site — still no API integration, just a convenience link).
- **Floor-plan/booth-layout attachment** (upload a static image/PDF floor plan and pin checklist items to zones) as a lightweight bridge toward floor-plan tooling without building a full diagramming tool.
- **Vendor-facing read-only share link** (still local-first: an exported static HTML/PDF a planner emails, not a live portal).
- **Bulk "duplicate this pack" for recurring event series** (e.g., a monthly webinar) to reduce rebuild time further.

## 7. Data Model

### 7.1 What this tool reads from the Event Brief

| `EventBrief` field | Used for |
|---|---|
| `id` | Foreign key stored as `LogisticsPack.eventBriefId` |
| `name`, `type` | Header/context display across the pack |
| `dates.eventStartDate`, `dates.eventEndDate`, `dates.timezone` | Bounds and default timezone for session time pickers |
| `format.deliveryMode`, `format.venueOrPlatform` | Seeds default location/venue text on sessions and the checklist |
| `stakeholders` | Seeds `OnSiteContact` rows (FR-1) and the autocomplete list for staffing `personName` |
| `timeline.milestones` (where `phase === "during_event"`) | Seeds initial `Session` rows (FR-1) |
| `riskRegister` | Read for display (e.g., "known risks" panel on the pack overview) and written back for `status` only (FR-14) |
| `status` (of the brief itself) | Read-only warning banner if launched from a `"draft"` (not `"complete"`) brief, consistent with PRD 1's guidance to downstream tools |

This tool does **not** write to `goals`, `audience`, `budget`, `successMetrics`, or `constraints` — those remain owned by other PRDs.

### 7.2 New document: `LogisticsPack`

Stored in a new `packages/logistics` workspace package (domain types + pure functions, zero React dependency — mirrors `packages/schema`'s shape) and persisted via a new `logisticsRepository.ts` in `packages/local-store`, in a new `logisticsPacks` IndexedDB object store keyed by `id`, indexed by `eventBriefId` (one pack per brief in v1 — see Open Questions).

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
  startTime: string;   // ISO 8601 datetime, in the brief's dates.timezone
  endTime: string;
  location?: string;
  owner?: string;       // free text; MAY match a stakeholder name
  type: SessionType;
  notes?: string;
}

export interface StaffAssignment {
  id: string;
  personName: string;
  sessionId?: string;          // FK into sessions[] — canonical time source
  customStartTime?: string;    // ONLY used when sessionId is absent
  customEndTime?: string;      // ONLY used when sessionId is absent
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
  category: string;      // free text, default set suggested in UI
  item: string;
  status: ChecklistStatus;
  owner?: string;
  dueSessionId?: string;   // FK into sessions[], OPTIONAL
  dueNote?: string;        // freeform fallback if no session reference applies
  notes?: string;
}

export interface OnSiteContact {
  id: string;
  name: string;
  role: string;
  orgType: ContactOrgType;
  phone?: string;
  email?: string;
  availabilitySessionId?: string;  // FK into sessions[], OPTIONAL
  availabilityNote?: string;       // freeform fallback
  notes?: string;
}

export interface IssueLogEntry {
  id: string;
  timestamp: string;       // ISO 8601 datetime
  loggedBy?: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;       // default "open"
  relatedArtifact?: RelatedArtifact;
  relatedSessionId?: string; // FK into sessions[], OPTIONAL
  resolutionNotes?: string;
  resolvedAt?: string;
}

export interface LogisticsPack {
  schemaVersion: string;
  id: string;                // UUID
  eventBriefId: string;      // FK into EventBrief.id
  createdAt: string;
  updatedAt: string;
  version: number;           // revision counter, same discipline as EventBrief.version
  sessions: Session[];
  staffAssignments: StaffAssignment[];
  shippingItems: ShippingManifestItem[];
  venueChecklist: ChecklistItem[];
  contacts: OnSiteContact[];
  issueLog: IssueLogEntry[];
}
```

### 7.3 The single-source-of-truth propagation model, concretely

The mechanism is **normalization by foreign key reference, not duplication, with rendering computed at read time**:

- `sessions[]` is the **only** place a session's `startTime`, `endTime`, `label`, or `location` is stored anywhere in the pack.
- `StaffAssignment.sessionId`, `ChecklistItem.dueSessionId`, `OnSiteContact.availabilitySessionId`, and `IssueLogEntry.relatedSessionId` are all **references** (string IDs), never copies of the time/label/location itself.
- Every view that needs to display "when" for one of these referencing records does so by looking up `sessions.find(s => s.id === record.sessionId)` at render time — a pure derivation, not a stored field. In the actual UI code this is a small shared selector, e.g. `resolveSessionTime(pack, sessionId)`, used by every artifact view, so there is exactly one place in the codebase that resolves a session reference to a displayable time.
- **Consequence:** editing `sessions[i].startTime` is a single write to a single array element. Nothing else in the `LogisticsPack` object needs to change, because nothing else stored the time — they stored a pointer to where the time lives. The next render of any dependent view picks up the new value automatically. This is what makes "change it once, everything updates" true by construction rather than something the app has to remember to keep in sync (there is no sync step at all — there's nothing to reconcile).
- The **only** legitimate exception is `customStartTime`/`customEndTime` on a `StaffAssignment` with no `sessionId` (e.g., "on-site all day, not tied to a specific session") and `dueNote`/`availabilityNote` freeform fallbacks — these are deliberately independent facts, not copies of a session's time, so it is correct (not a bug) that editing a session does not touch them.
- Deleting a session that other records reference: the UI must not silently orphan references. On session delete, any `StaffAssignment`, `ChecklistItem`, or `OnSiteContact` still pointing at that `sessionId` is detected and the user is prompted to either reassign the reference or convert it to a freeform note (copying the now-final time/label into the freeform field as a one-time snapshot, clearly not a live link). This is the one place a "copy" is intentionally created, and it is explicit and user-initiated, not silent.

## 8. UX Flow

1. **Entry from Event Brief.** Brief view → "Logistics Pack" tool link (previously a stubbed "coming soon" link from PRD 1) → finds-or-creates the pack for this `eventBriefId` → lands on the **Pack Overview**.
2. **Pack Overview** (`/logistics/[packId]`): header with event name/dates/venue; completeness tiles for each of the 5 artifacts (FR-13); "known risks" panel (read-only view of `EventBrief.riskRegister`, with quick status-update action per FR-14); open-issue count with link to Issue Log; "Print Full Pack" button; nav into each artifact.
3. **Run-of-Show** (`/logistics/[packId]/run-of-show`): sortable table/timeline, inline add/edit row, overlap warnings inline (FR-2, FR-3).
4. **Staffing** (`/logistics/[packId]/staffing`): toggle between "By Session" and "By Person" views (FR-4); add assignment modal/inline row with session-or-custom-time choice; double-booking warnings inline (FR-5).
5. **Shipping Manifest** (`/logistics/[packId]/shipping`): table view; "Import CSV" action; inline status updates (FR-6).
6. **Venue Checklist** (`/logistics/[packId]/checklist`): grouped-by-category view with per-category progress bar; inline status toggle (FR-7).
7. **Contact Sheet** (`/logistics/[packId]/contacts`): table view, grouped by org type (FR-8).
8. **Issue Log** (`/logistics/[packId]/issues`): flat, filterable/sortable list (FR-10); a persistent "Flag an issue" affordance (small button/icon) is present in the header chrome of every artifact page, not just this view, so a planner never has to navigate away from what they're doing to log a problem.
9. **Print views** (`/logistics/[packId]/print` for full pack, `/logistics/[packId]/print/[artifact]` per artifact): chrome-free, print-styled renders (FR-11).

## 9. Print/PDF Export Approach

**Technique (P0):** Browser-native print, via dedicated print-only routes styled with a `@media print` CSS stylesheet (Tailwind's `print:` variants), triggered by a "Print" button that calls `window.print()`. This is a deliberate continuation of the precedent already set in PRD 1 (its HTML export is explicitly designed to "look reasonable printed/PDF'd"), requires zero new runtime dependencies, and lets the planner either print physical paper or use their OS/browser's native "Save as PDF" — which on every modern OS/browser (Chrome, Edge, Safari, Firefox print dialogs all include a PDF destination) produces a real PDF file with no extra library. Print stylesheet requirements: hide all app chrome (nav, buttons, edit affordances); force `page-break-inside: avoid` on table rows and checklist items so no row splits across a page; use a serif or high-contrast sans font sized for on-site paper legibility (≥11pt body); print in the brief's stated timezone with the timezone abbreviation shown once in the header, not per-row.

**Named library for the P1 upgrade:** if user feedback after launch shows planners want a one-click "Download PDF" without going through the OS print dialog (e.g., because they're on a locked-down corporate machine where "print to PDF" is disabled by IT policy — a real, reported failure mode for spreadsheet tools in corporate environments), add **`html2pdf.js`** (a thin client-side wrapper combining `html2canvas` + `jsPDF`) as a P1 dependency, reusing the exact same print-styled routes as the rendering source so there's no duplicate template to maintain. This is explicitly deferred to P1 rather than built in P0 because the native-print technique covers the "usable on-site, offline-safe, paper or PDF" requirement at zero dependency cost, and adding a rendering library before knowing whether planners hit the locked-down-machine failure mode would be speculative scope.

## 10. Issue-Log Seam for PRD 7

This is the explicit hand-off point PRD 7 (Post-Event ROI Report & Retro) depends on, and it is being called out deliberately because PRD 7 has not been scoped yet and needs a stable contract to build against:

- **What PRD 7 reads:** `LogisticsPack.issueLog` (the full `IssueLogEntry[]` array) for a given `eventBriefId`, via the same `logisticsRepository` used by this tool (`packages/local-store`) — PRD 7 does not need a new data path, just read access to an existing, already-persisted array.
- **Why it's designed as "v0.5/informal" on purpose:** the point of this log is to capture *something* in the moment, under time pressure, on-site — not to be a rigorous incident-tracking system. Only `description` and `severity` are required (FR-10); everything else (who logged it, what it relates to, resolution) is optional and can be filled in later or never. A planner who logs "AV guy 20 min late, opening delayed" with nothing else filled in has still given PRD 7 usable raw material.
- **Contract PRD 7 can rely on:** every `IssueLogEntry` has a `timestamp` and a `description`; `severity` is always one of the 3 defined values; `status` is always `open` or `resolved`. PRD 7 should treat `relatedArtifact`/`relatedSessionId`/`resolutionNotes` as optional enrichment, not guaranteed fields.
- **What this PRD does *not* build for PRD 7:** no auto-summarization, no auto-categorization/tagging beyond the single `relatedArtifact` enum, no severity-weighted scoring, no auto-generated retro doc. That synthesis work belongs entirely to PRD 7's own scope.
- **Schema evolution note:** if PRD 7's build reveals the issue log needs additional fields (e.g., a cost-impact estimate, a root-cause tag), those should be added as new **optional** fields to `IssueLogEntry` under the same additive-only versioning discipline used for the Event Brief schema (see `schema/event-brief-schema.md` §Versioning policy) — bump `LogisticsPack`'s own schema version, do not restructure existing fields.

## 11. Success Metrics & How Measured

| Metric | Type | Target | Measurement method |
|---|---|---|---|
| Time to produce a complete logistics pack | Leading | Reduce planner-reported time-to-complete by ≥50% vs. their prior spreadsheet process, within 30 days of a planner's first use | Self-reported baseline captured via a short in-app prompt the first time a planner opens the tool ("roughly how long does this usually take you today?"), compared against the local usage log's timestamp delta between pack creation (FR-1) and the pack overview showing ≥1 item in each of the 5 artifacts (a proxy for "complete enough to use"). Logged via the same local usage-event log pattern established in PRD 1 (FR-13 there), extended with pack-specific event types (`pack_created`, `pack_minimally_complete`). |
| Version-conflict incidents reported | Leading/diagnostic | Zero *structural* incidents (the propagation model in §7.3 makes them architecturally impossible within the tool); track qualitative reports of planners falling back to exported/emailed copies going stale | No telemetry (standalone, local-first, no backend to phone home to) — measured via direct planner interviews/feedback surveys post-launch, specifically asking whether they exported a copy and someone worked from a stale one. This is a proxy signal, not a hard number, and is flagged as a measurement limitation, not a gap in the metric's importance. |
| Reuse rate across events | Lagging | ≥60% of planners who complete one pack create a second pack for a different event within 90 days | Local usage log: count distinct `eventBriefId` values with an associated `LogisticsPack` per `createdBy` (from the linked `EventBrief.createdBy`), computed from the same local IndexedDB usage log PRD 1 established — since there's no backend, this requires either a manual "export usage log as CSV" upload from planners for aggregate analysis, or is scoped as a per-planner, self-visible stat only (e.g., shown on the brief list: "You've used the Logistics Pack for 3 of your last 5 events"). **This is the honest data-collection limitation of a local-first, no-telemetry v1 — see Risks & Assumptions.** |
| Print/export success | Leading | ≥95% of "Print Full Pack" actions complete without a rendering error (e.g., broken page breaks reported) | Usage log event on print-view load; qualitative bug/feedback reports for pagination issues, since there is no way to detect "did the printed page look right" from client-side code alone. |

## 12. Risks & Assumptions

| # | Risk / Assumption | Mitigation / Note |
|---|---|---|
| R1 | **No backend means no cross-planner analytics.** Several success metrics above (reuse rate especially) cannot be measured with real aggregate precision in a local-first, no-telemetry v1 — they rely on self-report, CSV export, or per-user local stats. | Documented explicitly in §11 rather than hidden behind an optimistic metric. If aggregate product analytics become a priority, that's a deliberate, separate architecture decision (adding *opt-in* telemetry), not something to bolt on silently. |
| R2 | **Suite numbering mismatch.** `schema/event-brief-schema.md`'s assumed PRD table calls the day-of/run-of-show tool "PRD 5" and reserves "PRD 3" for Registration & Attendee Manager; this build was assigned as "PRD 3." | This PRD explicitly adopts the *functional* contract the schema already wrote for the day-of/run-of-show role (live `riskRegister.status` and `timeline.milestones[].status` writes, `format`/venue reads) regardless of numeral. **Action item:** whoever owns the schema doc should reconcile the numbering table in a follow-up pass so future PRDs (4, 6, 7) aren't confused about which number maps to which tool. This PRD does not change the schema file itself, to avoid an out-of-scope edit to a document owned by PRD 1/the platform track. |
| R3 | **One pack per brief assumption.** V1 assumes a 1:1 relationship between `EventBrief` and `LogisticsPack` (an event has exactly one logistics pack). | Documented default — see Open Questions Q1. If a planner needs to model a multi-venue or multi-day event with genuinely separate packs, this would need revisiting; not expected to be common in P0's target persona (single-venue conferences, webinars, trade show booths). |
| R4 | **Session-reference deletion UX is a sharp edge.** Because the propagation model depends on FK references rather than copies, deleting a session that other artifacts point to is the one place data could be silently lost (a staffing assignment pointing at a deleted session with no time left to show). | FR/design explicitly requires a delete-time prompt (§7.3) rather than allowing silent orphaning — this is called out as a specific implementation requirement, not left to incidental discovery during build. |
| R5 | **CSV import mapping (FR-6) is a lightweight v1, not a robust ETL tool.** Malformed CSVs, mismatched columns, or unusual date formats could produce bad manifest rows. | v1 scope is a simple fixed-column-order template (documented in-app) with a preview-before-import step; no fuzzy column matching. If this proves too rigid, revisit in P1. |
| R6 | **Print pagination is inherently browser-dependent.** `@media print` rendering can vary slightly across Chrome/Firefox/Safari print engines. | Acceptance criteria (§13) require verification in at least Chrome and Firefox, matching PRD 1's existing cross-browser QA precedent; Safari is a stretch check, not a blocking one, for v1. |

## 13. Open Questions (with documented defaults)

**Q1 — Which artifact do planners find most painful? (the question the source brief explicitly flagged as needing 3–5 planner interviews we cannot run right now.)**

> **Default decision (Assumption — pending validation): build P0 in this order — (1) Run-of-Show, (2) Staffing Assignments, (3) On-Site Contact Sheet, (4) Shipping Manifest, (5) Booth/Venue Checklist.**
>
> **Rationale:**
> - *Run-of-show first* is not really a "which is most painful" bet — it's a structural necessity. Per the data model in §7, staffing, checklist due-times, and contact availability all reference `sessions[]` by FK. There is no way to build a working propagation demo (the core differentiator of this whole PRD, per the product thesis) without `sessions[]` existing first. This ordering is dependency-driven, not just pain-driven.
    - *Staffing second*: of the remaining four, staffing/shift confusion ("who's covering the booth at 8am") is the most commonly cited day-of fire-drill in informal planner conversations and industry write-ups about event-day chaos — and it has the highest data-model leverage once sessions exist (it's the first real consumer of the FK-reference pattern, so building it second de-risks the propagation mechanism early while it's still cheap to fix).
    - *Contact sheet third*: comparatively low build complexity (a table, largely pre-seeded from `stakeholders` per FR-1), high perceived planner value ("I can't reach the AV vendor" is a classic on-site failure), and it's a second, simpler consumer of the same FK pattern — good for confirming the pattern generalizes before tackling more complex artifacts.
    - *Shipping manifest fourth*: valuable but functionally more independent of session timing (it's fundamentally a pre-event, not real-time, artifact) and introduces a new mechanic (CSV import) that's worth building once the core session/reference pattern is proven, not in parallel with it.
    - *Venue checklist fifth*: the most bespoke/variable artifact across event types (a trade-show-booth checklist and a 500-person-conference-venue checklist look quite different), so it carries the highest risk of over-templating incorrectly on the first attempt — building it last means it benefits from whatever category/status UI patterns were already validated in the checklist-shaped parts of shipping and staffing.
    >
    > **How to validate:** the first 3–5 real planner interviews (or even lightweight usability sessions with 3–5 target users using a build-in-progress) should directly ask "which of these five would you build first if you could only have one at launch?" and "which one causes you the most pain today?" — if the answer clusters differently than this ordering, re-sequence P0 before general release, not after. This is flagged as **pending validation**, not settled fact.

**Q2 — Is the 1:1 EventBrief:LogisticsPack relationship correct?**

> **Default decision (Assumption — pending validation): one `LogisticsPack` per `EventBrief`, enforced by the "find or create" behavior in FR-1.**
> Rationale: matches the target persona's typical event shape (single venue, single date range) and keeps the data model simple. Revisit if user research surfaces a real multi-venue/multi-leg event pattern in this planner segment.

**Q3 — Should the venue checklist categories be a fixed enum or free text?**

> **Default decision: free text with suggested defaults (Setup, AV/Tech, Signage, Catering, Teardown, Other), not a locked enum.**
> Rationale: consistent with the Event Brief schema's own precedent (`BudgetAllocation.category` is free text, not an enum, specifically so planners aren't blocked by a fixed taxonomy) — same reasoning applies here, since booth checklists vary widely by event type.

**Q4 — Does a "Mark risk mitigated/occurred" action belong in this tool, or should it stay purely inside the Event Brief editor from PRD 1?**

> **Default decision: it belongs here too, as a live, in-the-moment convenience, per the schema's already-declared contract that this tool is a day-of writer of `riskRegister.status`.**
> Rationale: the whole point of this tool is being usable *during* the event; making a planner switch to the Event Brief editor mid-event to update a risk status defeats that purpose. Confirmed non-controversial given the schema doc already assigned this write path to "the day-of/run-of-show tool" before this PRD was written (see schema table row for `riskRegister`).

**Q5 — Should the issue log support attachments (e.g., a photo of a shipping-damage claim)?**

> **Default decision: no, not in P0.** Text-only entries (FR-10). Rationale: file/blob storage in IndexedDB is technically feasible but adds real complexity (storage quota management, export/print handling for binary attachments) for a v0.5-intentionally-lightweight feature; flagged as a clean P1 candidate if PRD 7 or planner feedback shows photo evidence is commonly wanted for the retro.

## 14. Release Criteria (Definition of Done)

- [ ] All 15 P0 functional requirements (FR-1 through FR-15) implemented and pass their stated test in this document.
- [ ] `packages/logistics` exists, has zero React/Next dependency, exports `LogisticsPack` and all sub-types, `CURRENT_LOGISTICS_SCHEMA_VERSION`, and a `migrateLogisticsPack()` function called on every read.
- [ ] `packages/local-store` has a `logisticsRepository.ts` with CRUD for `LogisticsPack`, keyed by `id`, queryable by `eventBriefId`.
- [ ] The single-edit propagation model is manually verified end-to-end: edit one session's time once, confirm the Staffing, Checklist, and Contact Sheet views all reflect the new time with zero additional edits (this is the single most important acceptance check in this PRD — it is the product thesis made concrete for this tool).
- [ ] Session-delete-with-references prompt (§7.3) is implemented and tested (delete a referenced session → confirm the reassign-or-snapshot prompt appears; confirm no silent data loss).
- [ ] Overlap warnings (FR-3) and double-booking warnings (FR-5) verified with at least one true-positive and one true-negative case each.
- [ ] CSV import for the shipping manifest (FR-6) tested with a valid file and a malformed file (confirm a clear error, not a crash or silent partial import).
- [ ] Print views for all 5 artifacts + issue log + full pack verified in Chrome and Firefox: no UI chrome visible, no table row split across a page break, correct pagination, timezone shown once in the header.
- [ ] Issue log (FR-10) verified as the PRD 7 seam: confirm `LogisticsPack.issueLog` is readable via `logisticsRepository` independent of any UI state, with the minimum-required-fields contract (`timestamp`, `description`, `severity`, `status` always present) holding for an entry created with only the 2 required fields filled in.
- [ ] Live write-back to `EventBrief.riskRegister[].status` and `EventBrief.timeline.milestones[].status` (FR-14) verified: action taken in the logistics pack is visible on reload of the Event Brief view, with `EventBrief.version` incremented.
- [ ] Autosave/reload verified for every one of the 6 sub-stores (5 artifacts + issue log).
- [ ] Zero console errors in a full click-through of every view in both Chrome and Firefox.
- [ ] The "Logistics Pack" launch link on the Event Brief view (previously a disabled "coming soon" stub from PRD 1) is wired to real find-or-create behavior (FR-1) and no longer disabled.
- [ ] This PRD's Open Questions (§13) are visibly flagged as "Assumption — pending validation" in-repo (this document) so a future planner-research pass has a clear, specific list of defaults to confirm or overturn, rather than needing to rediscover them.
