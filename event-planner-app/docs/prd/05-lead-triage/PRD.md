# PRD 5: Lead Triage & Follow-Up Engine

**Owner:** Product (Event Planner Productivity Suite)
**Status:** Approved for build
**Date:** 2026-08-09
**Version:** 1.0
**Suite position:** Fast-Follow Tier. Depends on PRD 1 (Event Brief Generator / `packages/schema`) for optional context; consumes `EventBrief` as a read-only input. Does not write back to the Event Brief in v1 (see §7 Data Model and §12 Open Questions Q3).
**Suite-numbering note:** `schema/event-brief-schema.md`'s "Assumed PRD numbering" table lists PRD 5 as "Day-Of / Run-of-Show Tool." This PRD supersedes that assumption for slot #5 per stakeholder direction — Lead Triage & Follow-Up Engine is PRD 5, Day-Of/Run-of-Show is renumbered elsewhere in the suite roadmap. This is a documentation-only discrepancy; nothing in the frozen v1 Event Brief schema is affected, since schema field ownership is assigned by capability, not by PRD number.

---

## 1. Problem Statement

The highest-value moment of an event — the 24-72 hours right after it ends, when attendee interest is at its peak — is routinely wasted. Badge scans and registration exports land in a planner's inbox as a messy CSV, often with duplicate rows per attendee (one per session scan, one per badge tap, one per demo sign-up sheet). A planner manually opens it in a spreadsheet, tries to dedupe by eye, guesses at who's a hot lead versus a tire-kicker, and eventually forwards *something* to sales — commonly a week or more after the event closes. By then sales has moved on to the next list, prospects have forgotten the conversation, and the event's actual pipeline contribution is undercut by nothing more than slow, manual list-wrangling. This is broadly regarded as the single largest destroyer of event ROI: the event did its job generating interest, and the follow-up process is where that value leaks out.

## 2. Goals & Non-Goals

### Goals
- Cut the time from "event closed" to "sales has a clean, prioritized, owner-assigned lead list" from a week-plus down to inside a 24-48 hour window.
- Replace manual, error-prone spreadsheet dedup with a repeatable import → dedupe → score → route workflow that a planner can run the same way after every event.
- Give sales owners a list they can act on immediately: pre-scored by engagement signal, pre-assigned to them, with a follow-up email draft already written so the first touch doesn't start from a blank page.
- Make the scoring logic and follow-up copy fully transparent and editable, not a black box — planners and sales leadership need to trust and tune it.
- Keep the tool useful and complete on its own (standalone-first, CSV-in/CSV-out) while structuring the data model so CRM write-back, automated sending, and enrichment can be added later without a rebuild.

### Non-Goals (v1)
- **CRM write-back.** No pushing leads, scores, or status into HubSpot/Salesforce/any CRM. Rationale: binding suite-wide standalone-first constraint; see §6 for the explicit v2 integration path this is deferred to.
- **Automated sending.** The tool drafts follow-up emails; it never sends them. Sales owners copy/paste or mail-merge from the export into their own email client. Rationale: sending on someone's behalf raises deliverability, compliance/consent, and "who's the sender of record" questions that need real product decisions, not a v1 shortcut; also keeps the tool honestly standalone (no email-provider integration required).
- **Enrichment from third-party data.** No Clearbit/ZoomInfo/LinkedIn append of firmographic or seniority data. Rationale: same standalone constraint — v1 only scores on signals present in the imported files themselves.
- **Live/real-time registration-platform sync.** Leads only enter via file import, never a live feed from Cvent/Splash/a badge-scanning app's API. Rationale: binding architecture constraint.
- **Cross-event / historical CRM dedupe.** v1 only dedupes *within* an imported batch for *one* event's triage session, not against a sales team's existing book of business in a CRM. Rationale: requires a CRM connection, which is out of scope (see §6).
- **Lead-status sync back to sales activity.** Once exported, this tool has no visibility into whether a sales owner actually contacted a lead unless the planner manually updates `status` in the app. Rationale: no CRM/email integration to observe real outreach in v1.

## 3. Target Users & Personas

**Primary persona: Corporate/Field Marketing Event Planner ("Dana," same persona as PRD 1).** Runs triage the day the event ends (or the next morning). Has 1-3 export files in hand: a badge-scan/session-attendance export, a registration list, sometimes a separate demo-request sign-up sheet. Is not a data analyst — needs the tool to guess correctly most of the time (column mapping, dedupe) and make it fast to fix the cases it gets wrong. Is measured, implicitly or explicitly, on how fast and how clean the list gets to sales. Wants to defend the scoring logic if a sales leader asks "why is this person marked hot?"

**Secondary persona: Sales Owner / SDR/AE receiving routed leads ("Marcus").** Never opens this tool directly in v1 — receives a CSV/XLSX export (email attachment, shared drive link, Slack file — outside this tool's scope) with his name on it, containing only the leads assigned to him. Needs, at a glance: who to call first (tier/score), why they're hot (which signals drove it — sessions attended, booth visit, demo request), and a follow-up email already drafted so he can send within minutes, not compose from scratch. Cares about not getting a list that's full of duplicate rows for the same person or leads that were actually assigned to a teammate. Does not use this tool's UI; his entire experience of this product is the quality of the file he receives.

## 4. User Stories

1. As a planner, I want to import one or more CSV/XLSX exports (badge scans, registrant list, demo requests) into a single triage session for an event so that I'm working from one consolidated lead pool instead of juggling files.
2. As a planner, I want the tool to map each file's columns to standard lead fields automatically, with the ability to correct any mapping, so that I don't have to manually rewrite headers every time a badge-scan vendor's export format is slightly different.
3. As a planner, I want duplicate records (the same person appearing in multiple files or multiple rows) merged automatically when there's a confident match, so that sales never receives the same person twice.
4. As a planner, I want to review and resolve cases where the tool isn't sure if two records are the same person, so that I stay in control of merge decisions the system can't make safely on its own.
5. As a planner, I want a scoring rubric with sensible starting weights for sessions attended, booth interactions, and demo requests, so that leads are prioritized without me having to invent a scoring model from scratch.
6. As a planner, I want to adjust the scoring rubric's weights and thresholds for this event, so that I can reflect what actually mattered for this specific event's goals.
7. As a planner, I want each lead assigned to a sales owner, either from a column already in my data or via an automatic round-robin, so that every lead has a clear next action-taker.
8. As a planner, I want to reassign individual leads or bulk-reassign a filtered set to a different owner, so that I can correct or override the automatic assignment.
9. As a planner, I want a follow-up email draft automatically generated for every lead based on its tier and engagement signals, so that sales owners aren't starting their first touch from a blank page.
10. As a planner, I want to edit the follow-up templates (and individual drafts), so that the tone and content match how our team actually writes.
11. As a planner, I want to export a separate file per sales owner containing only their assigned leads, sorted by priority, with drafts included, so that I can hand off a ready-to-work list to each person with no manual splitting.
12. As a planner, I want to see, at a glance, how many leads are deduped, scored, routed, and draft-ready, and how much time has elapsed since the event closed, so that I know whether I'm on pace to hit the 24-48 hour handoff window.
13. As a sales owner, I want the file I receive to contain only my assigned leads, clearly prioritized, with a follow-up draft for each, so that I can start calling/emailing my highest-value leads immediately without doing any triage myself.
14. As a sales owner, I want to understand *why* a lead is scored the way it is (which signals contributed), so that I can tailor my outreach instead of treating the score as an opaque number.
15. As a planner, I want to optionally link a triage session to an existing Event Brief, so that the event's name, close date, and target personas pre-fill instead of me re-entering them.

## 5. Functional Requirements (P0)

Numbered, testable requirements.

**FR-1 — Triage session creation, optionally linked to an Event Brief.** A planner creates a new triage session by either selecting an existing `EventBrief` (populating session `eventName`, `eventClosedAt` default, and read-only reference panels for `goals`, `audience.targetPersonas`, `format.deliveryMode`) or choosing "standalone" and entering the event name and close date/time manually.
*Acceptance:* Creating a session from a brief pre-fills event name and a close-date default of the brief's `dates.eventEndDate` at 11:59 PM in `dates.timezone`; creating a session standalone requires manual entry of both fields before proceeding.

**FR-2 — CSV/XLSX import with column mapping.** The planner uploads a CSV or XLSX file; the tool parses headers and rows, auto-suggests a mapping from source columns to standard lead fields (name, email, company, job title, sessions attended, booth interactions, demo requested, owner, etc.) using fuzzy header-name matching, and shows a preview of the first 5 mapped rows before the planner confirms import.
*Acceptance:* Uploading a file with at least one common-shape header (e.g. "Email," "Email Address," "E-mail") auto-maps it correctly; the planner can override any column's mapping via a dropdown before confirming; unmapped columns are clearly marked "Ignored" by default and can be mapped to a custom signal field instead.

**FR-3 — Multi-file import into one lead pool.** A planner can import multiple files into the same triage session (e.g. badge scans, then registrant list, then demo requests); each import runs its own column-mapping step and its resulting rows are merged into the session's shared lead pool, subject to FR-4 dedupe.
*Acceptance:* Importing 2 files with overlapping people (matched by email) into the same session results in one merged lead record per person, not two; each import is recorded with its filename, row count, and timestamp for audit purposes.

**FR-4 — Dedupe with automatic exact-match merge and manual conflict resolution.** On every import, new rows are matched against existing lead records using a normalized-email exact match first; where email matches, records auto-merge (later-imported non-empty field values fill gaps, conflicting non-empty values are queued for manual resolution). Where email is missing or doesn't resolve a match, a fuzzy match on normalized full name + company is attempted (see §7 for the algorithm); any fuzzy match is always queued for manual review rather than silently auto-merged.
*Acceptance:* Two rows with the identical normalized email merge into one lead record automatically with no manual step required, unless a mapped field differs between them (e.g. two different job titles), in which case that field is flagged for resolution. Two rows with similar-but-not-identical names and matching company appear in a "possible duplicate" review queue rather than merging silently. A planner can, from the review queue, choose "merge" (picking the winning value per conflicting field) or "not a duplicate" (keep as two separate lead records).

**FR-5 — Configurable scoring rubric with a pre-loaded starter default.** Every triage session starts with a default scoring rubric (see §7 for exact starter weights) covering sessions attended, booth interactions, and demo requests, plus an optional bonus rule for job-title match against the linked Event Brief's `audience.targetPersonas` titles (only available/active when the session is linked to a brief). The planner can edit rule weights, per-rule point caps, add/disable rules, and edit the Hot/Warm/Cold score thresholds; every lead's score recomputes live as the rubric changes.
*Acceptance:* Changing a rule's weight (e.g. demo-request points from 40 to 60) immediately changes affected leads' scores and tier counts without requiring re-import; disabling a rule removes its contribution from every lead's score; the rubric persists with the session and is reused if the planner returns later.

**FR-6 — Score-based tiering and a sortable/filterable lead table.** Every lead is assigned a tier (Hot/Warm/Cold) based on its score against the session's thresholds. The main triage workspace shows all leads in a table, sortable by score/tier/name/company/owner, filterable by tier/owner/status, with each lead's score breakdown (which rules contributed how many points) visible on demand.
*Acceptance:* Sorting by score descending places the highest-scored lead first; filtering to "Hot" shows only leads at or above the hot threshold; clicking a lead's score shows a breakdown listing each contributing rule and its point value.

**FR-7 — Owner assignment.** If an import's column mapping includes an "Owner" field, that value is used directly as the lead's assigned owner. For leads without a mapped owner value, the planner configures a list of sales owner names/emails and triggers either round-robin auto-assignment (evenly distributing unassigned leads) or manual assignment. Any lead's owner can be changed individually or via bulk reassignment on a filtered selection.
*Acceptance:* Leads with a mapped, non-empty owner column value retain that owner without further action. Triggering round-robin assignment on N unassigned leads across M configured owners distributes them within 1 lead of an even split. Reassigning a filtered selection (e.g. all "Hot" leads currently owned by Owner A) to Owner B updates only those leads.

**FR-8 — Per-lead follow-up email draft generation.** For every lead, the tool generates a follow-up email draft (subject + body) using a template selected by tier (and, when linked to a brief, by `format.deliveryMode` — in-person/virtual/hybrid variants), with merge tokens resolved from the lead's contact and signal data and (when linked) the Event Brief's name/objective. Drafts can be regenerated on demand (e.g. after a rubric or template edit) and manually edited per lead, with manual edits preserved and not overwritten by bulk regeneration.
*Acceptance:* Generating drafts for a session produces a non-empty subject and body for every lead with at least an email or name on file; a manually edited draft is marked "edited" and is skipped by a subsequent "regenerate all" bulk action unless the planner explicitly confirms overwriting it.

**FR-9 — Lead status tracking.** Each lead has a status: `new` → `routed` (owner assigned) → `draft_ready` (follow-up draft generated) → `contacted` / `closed` (planner-set manually, since there's no automated visibility into sales activity in v1). Status updates automatically for the `routed` and `draft_ready` transitions and is manually settable for `contacted`/`closed`.
*Acceptance:* A newly imported, unmerged lead starts at `new`; assigning an owner moves it to `routed`; generating its draft moves it to `draft_ready`; the planner can manually set a lead to `contacted` or `closed` from the lead table or detail view.

**FR-10 — Prioritized export per sales owner.** The planner can export the session's leads as CSV (P0) with an XLSX option (P0), either as one file per owner (containing only that owner's leads, sorted by tier then score descending, including contact info, signals summary, score, tier, status, and draft subject/body) or as one combined file grouped by owner. Triggering any export logs an export event (feeds FR-12/§10).
*Acceptance:* Exporting "per owner" for a session with 3 distinct owners produces 3 separate downloadable files, each containing only that owner's leads with no rows for other owners' leads; every exported row includes the generated draft subject and body text; exporting "combined" produces one file with an owner column, sorted by owner then tier then score.

**FR-11 — Live progress/completeness dashboard.** The session view shows a persistent header with: total lead count, % deduped (i.e., 1 - (merge-review-queue-remaining / total candidate rows)), % scored, % with an assigned owner (routed), % with a draft ready, and elapsed time since `eventClosedAt`.
*Acceptance:* All five figures update live as the planner works through import, dedupe, scoring, assignment, and drafting; elapsed time is visibly formatted (e.g. "14h 22m since event close") and continues to update while the session is open.

**FR-12 — Local event log for success-metric measurement.** The app locally logs key triage lifecycle events (session created, import completed, dedupe batch resolved, rubric edited, owner assignment run, draft(s) generated, export triggered, session marked routed) with timestamps, offering a "export usage log as CSV" action, mirroring PRD 1's FR-13 pattern.
*Acceptance:* Performing each logged action produces a corresponding row in the exportable CSV with an accurate timestamp, session id, and event type; the log is sufficient to compute both success metrics in §10 without additional instrumentation.

**FR-13 — Autosave / resumable session.** All triage session data (imports, mappings, lead records, merge decisions, rubric, templates, assignments, drafts) is autosaved to local browser storage (IndexedDB) as the planner works, with no explicit save button required. Closing the tab mid-session and reopening it restores exact state.
*Acceptance:* Entering partial progress (e.g. one file imported and mapped, dedupe review half-resolved), closing the tab without manual save, and reopening the app restores the session at the same point, with the same lead records and their states intact.

## 6. P1 / Later (out of scope for v1, including explicit v2 integration path)

### P1 — standalone enhancements, still no external integrations
- Saved/reusable column-mapping presets per badge-scan vendor shape (recognizing "this file looks like a Cvent badge-scan export" from its header set and pre-applying a known-good mapping) — purely a local pattern-matching convenience, not an integration with Cvent's API.
- Rubric templates library: save a tuned scoring rubric from one event and apply it as the starting point for the next, instead of always starting from the global default.
- Multiple follow-up template variants per tier (A/B options the planner can choose between at generation time).
- Duplicate-import detection (warn if a file with the same name/row-count as a prior import is uploaded again).
- Drag-and-drop / workload-aware bulk reassignment UI beyond simple round-robin.
- In-app reminder/nudge ("you're at 30 hours since event close and only 40% routed") using browser notifications — still fully local, no backend.

### P2 / Future — v2 Integration Path (explicitly NOT built now)
This is the tool in the suite most transformed by future integrations, precisely because its core inputs (badge scans, registrant lists) and its core output (a routed lead list) are exactly what martech/CRM/event-platform integrations exist to automate. None of the following is built in v1; it's documented here so the v1 data model (§7) doesn't have to be reworked to support it later.

- **CRM write-back.** Push routed leads (contact info, score, tier, status, assigned owner, draft content) directly into HubSpot/Salesforce as new or updated contact/lead records, eliminating the manual export/import step entirely. Requires: an OAuth-based CRM connector, a reverse of today's column-mapping UX (mapping *our* lead fields to the CRM's schema), a strategy for matching against existing CRM contacts (see cross-event dedupe below), and a decision on which system is the source of truth for `status` once a lead exists in both places.
- **Automated sending.** Instead of exporting drafts for a sales owner to send manually, integrate with an email API (Gmail/Outlook, or a transactional provider) to send — or queue for one-click approval and send — follow-ups directly, with open/click/reply data flowing back into `status`. Raises real product questions (sender-of-record identity, consent basis for emailing a badge-scan contact under CAN-SPAM/GDPR, rate limiting/deliverability) that need deliberate design, not a v1 shortcut.
- **Third-party enrichment.** Append firmographic/technographic/seniority data (Clearbit, ZoomInfo, LinkedIn Sales Navigator, etc.) to raw badge-scan records — e.g. company size, industry, buying-committee role — to materially improve scoring accuracy beyond what's captured on-site. Would extend the `ScoringRule` model (§7) with enrichment-sourced signal types.
- **Live registration-platform sync.** Replace manual CSV import of badge scans with a real-time feed from the event platform (Cvent, Splash, or the badge-scanning app itself), so lead data starts flowing into triage *during* the event rather than only after a planner exports and uploads a file — directly compressing the "time from event close to routed list" metric this PRD is trying to improve.
- **Cross-event / CRM-aware dedupe.** Dedupe not just within the current import batch but against a sales team's existing CRM contacts and accounts, so a lead who's already a known prospect is recognized and routed to their existing owner rather than treated as brand new. This is likely the single highest-value integration on this list, since it solves a problem v1 structurally cannot: it has no visibility outside the files it's given.

**Design commitment for v1:** fields like `LeadRecord.ownerId` are stored as free-text strings, not foreign keys into a CRM user table, and `TriageSession.eventBriefId` is a soft reference (string id, not a hard relational constraint) — exactly so that a future CRM connector or live-sync source can be layered on by adding new fields/an alternate data source, not by changing the shape of what already exists. This mirrors the additive-only schema evolution discipline documented in `schema/event-brief-schema.md`.

## 7. Data Model

This tool defines its own local data model (it does not extend the canonical `EventBrief` schema — it *reads* from it optionally). New types live in a new package, `packages/lead-triage-core`, and are persisted via new repository methods added to the existing `packages/local-store`.

### Relationship to the Event Brief
- **Reads (optional, never required):** `EventBrief.id`, `.name`, `.dates.eventEndDate`, `.dates.timezone`, `.goals.primaryObjective`, `.audience.targetPersonas[].title`, `.format.deliveryMode`.
- **Uses of each:** `dates.eventEndDate`/`timezone` default the session's `eventClosedAt`; `name` pre-fills the session name and is available as a `{{eventName}}` merge token; `goals.primaryObjective` is shown as read-only context during rubric/template setup and available as an optional merge token; `audience.targetPersonas[].title` values seed keyword matching for the optional "persona title match" scoring bonus rule; `format.deliveryMode` selects which template variant (in-person/virtual/hybrid) is used by default.
- **Writes:** none in v1. The Event Brief schema is treated as frozen per PRD 1's release criteria, and Lead Triage has no assigned write ownership over any `EventBrief` field in `schema/event-brief-schema.md`. (See §12 Q3 for the documented default on why this tool doesn't write a "leads routed" figure back into `successMetrics` in v1.)
- **Standalone mode:** a triage session works fully without a linked brief — event name and close date are entered manually, the persona-match scoring rule is simply unavailable, and templates use a generic default variant.

### `TriageSession`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | Stable id. |
| `eventBriefId` | `string \| null` | No | Soft reference to `EventBrief.id`, if linked. |
| `eventName` | `string` | Yes | Copied from the brief at link time, or entered manually in standalone mode. |
| `eventClosedAt` | `string` (ISO datetime) | Yes | Anchor timestamp for the 24-48hr success-metric window. Defaults to `EventBrief.dates.eventEndDate` at 23:59 in `dates.timezone` when linked; editable always. |
| `status` | `"importing" \| "triaging" \| "routed" \| "archived"` | Yes | `"routed"` is set automatically the moment 100% of leads have a non-empty `ownerId` (also settable manually to close out a session with partial assignment). |
| `createdAt` / `updatedAt` | `string` (ISO datetime) | Yes | Standard timestamps. |

### `ImportBatch`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | |
| `triageSessionId` | `string` | Yes | |
| `filename` | `string` | Yes | Original uploaded filename, for audit reference. |
| `sourceType` | `"badge_scan" \| "registrant_list" \| "demo_requests" \| "other"` | No | Planner-labeled at import time; informational only, does not change parsing logic. |
| `columnMapping` | `ColumnMapping[]` | Yes | The confirmed mapping used for this import. |
| `rowCount` | `integer` | Yes | Rows successfully imported. |
| `importedAt` | `string` (ISO datetime) | Yes | |

`ColumnMapping`: `{ sourceColumn: string; targetField: LeadField | "customSignal" | "ignore"; customSignalKey?: string; confidence: "auto" | "manual" }`.

### `LeadRecord`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | |
| `triageSessionId` | `string` | Yes | |
| `dedupeKey` | `string` | Yes | Normalized email if present; otherwise a normalized `name+company` composite key. See dedupe algorithm below. |
| `contact.firstName` / `.lastName` / `.fullName` / `.email` / `.company` / `.jobTitle` / `.phone` | `string` (each optional except at least one of email/fullName) | — | Standard contact fields. |
| `signals.sessionsAttended` | `string[]` | No (default `[]`) | Session names/ids if the source data provides them. |
| `signals.sessionsAttendedCount` | `integer` | Yes (default `0`) | Used by scoring even if names aren't available. |
| `signals.boothInteractions` | `integer` | Yes (default `0`) | |
| `signals.demoRequested` | `boolean` | Yes (default `false`) | |
| `signals.registrationStatus` | `"registered" \| "attended" \| "no_show"` | No | |
| `signals.customSignals` | `Record<string, string \| number \| boolean>` | No | Catch-all for mapped columns that don't fit a standard field, usable in custom scoring rules. |
| `score` | `number` | Yes | Computed by `scoring.ts`; recomputed on any rubric or signal change. |
| `scoreBreakdown` | `{ ruleId: string; label: string; points: number }[]` | Yes | |
| `tier` | `"hot" \| "warm" \| "cold"` | Yes | Derived from `score` vs. session rubric thresholds. |
| `ownerId` | `string \| null` | No | Free-text identifier (name or email) — intentionally not a foreign key (see §6 design commitment). |
| `ownerName` | `string \| null` | No | Display name, may equal `ownerId`. |
| `assignmentMethod` | `"column_mapped" \| "round_robin" \| "manual"` | No | |
| `status` | `"new" \| "routed" \| "draft_ready" \| "contacted" \| "closed"` | Yes (default `"new"`) | |
| `followUpDraft` | `{ templateId: string; subject: string; body: string; generatedAt: string; editedAt?: string; edited: boolean } \| null` | No | |
| `sourceRows` | `{ importBatchId: string; rowIndex: number }[]` | Yes | Audit trail back to originating import row(s); grows on merge. |
| `mergedFrom` | `string[]` | No | Ids of `LeadRecord`s merged into this one, for audit/undo reference. |
| `createdAt` / `updatedAt` | `string` (ISO datetime) | Yes | |

### `ScoringRubric` / `ScoringRule`

| Field | Type | Description |
|---|---|---|
| `id`, `triageSessionId` | `string` | |
| `rules` | `ScoringRule[]` | See below. |
| `tierThresholds` | `{ hot: number; warm: number }` | Score ≥ `hot` → Hot; ≥ `warm` and < `hot` → Warm; else Cold. |
| `updatedAt` | `string` | |

`ScoringRule`: `{ id: string; signal: "sessionsAttended" | "boothInteractions" | "demoRequested" | "personaTitleMatch" | "customSignal"; label: string; pointsPerUnit?: number; cap?: number; flatPoints?: number; customSignalKey?: string; enabled: boolean }`.

**Default starter rubric (documented assumption — see §12 Q2):**

| Rule | Signal | Weight | Cap |
|---|---|---|---|
| Demo requested | `demoRequested` | flat +40 pts | n/a |
| Booth interactions | `boothInteractions` | +10 pts each | cap 30 (3 interactions) |
| Sessions attended | `sessionsAttended` | +5 pts each | cap 25 (5 sessions) |
| Persona title match *(only when linked to a brief with `targetPersonas`)* | `personaTitleMatch` | flat +15 pts if job title contains a keyword from any target persona's `title` | n/a |

Tier thresholds default: **Hot ≥ 70, Warm 40-69, Cold < 40** (max realistic score ~110 with all rules firing).

### `FollowUpTemplate`

| Field | Type | Description |
|---|---|---|
| `id`, `triageSessionId` | `string` | |
| `tier` | `"hot" \| "warm" \| "cold" \| "all"` | Which tier this template applies to. |
| `deliveryModeVariant` | `"in_person" \| "virtual" \| "hybrid" \| "generic"` | Selects among variants when linked to a brief; `"generic"` is used in standalone mode. |
| `subjectTemplate` / `bodyTemplate` | `string` | Plain text with `{{mergeToken}}` placeholders (see §9). |
| `updatedAt` | `string` | |

### Dedupe key strategy (documented default — see §12 Q1)

1. **Primary key:** normalize email — lowercase, trim whitespace, strip surrounding quotes. Two rows with an identical normalized email are the same person.
2. **Fallback key (when email is missing on one or both sides):** normalize full name (lowercase, trim, collapse whitespace, strip punctuation) and normalized company name the same way. Compute a similarity score combining name-string similarity (Levenshtein-ratio based) and company-string similarity; a combined score ≥ 0.85 is treated as a **possible** match.
3. **Merge behavior:** exact email matches **auto-merge** (later-imported non-empty values fill gaps in earlier ones; a field with conflicting non-empty values on both sides is flagged for manual resolution rather than silently overwritten). Fallback fuzzy matches **never auto-merge** — they always go to the manual "possible duplicate" review queue, where the planner chooses "merge" (and picks the winning value per conflicting field) or "not a duplicate."
4. This is intentionally conservative on the fuzzy side: a false-negative (two records for the same person left unmerged) just means a sales owner might see a duplicate row, which is a minor annoyance; a false-positive (two different people silently merged into one) could suppress real outreach to one of them, which is worse. The exact/fuzzy split reflects that asymmetry.

## 8. UX Flow

**Step 0 — Triage sessions home.** List of existing sessions (event name, lead count, %routed, %draft-ready, elapsed time since close) with a "New Triage Session" CTA. Empty state explains the workflow in one line and offers the same CTA.

**Step 1 — New session.** Choose "Link to an Event Brief" (dropdown of existing briefs, showing name/type/dates) or "Standalone" (manual event name + close date/time entry). Linking pre-fills `eventName`, `eventClosedAt`, and shows a read-only side panel summarizing `goals.primaryObjective` and `audience.targetPersonas` for reference during later steps.

**Step 2 — Import.** Drag-and-drop or file-picker upload of a CSV/XLSX. On upload, the tool parses headers and shows a **column mapping table**: source column | sample values from the first few rows | mapped target field (dropdown, pre-selected via fuzzy header-name matching) | confidence indicator (auto vs. needs review). Planner adjusts any mapping, then confirms to import. A "source type" label (badge scan / registrant list / demo requests / other) is optionally set for the planner's own reference.

**Step 3 — Repeat import (optional).** Planner can add more files to the same session; each runs its own Step 2 mapping and is merged into the shared pool per the dedupe rules in §7.

**Step 4 — Merge review (dedupe).** If any fuzzy/possible-duplicate pairs were found, a review queue shows them side by side with differing fields highlighted; planner resolves each as "merge" (choosing the winning value per conflicting field) or "not a duplicate." Sessions with zero possible duplicates skip this step automatically.

**Step 5 — Scoring rubric.** The starter rubric (§7 defaults) is pre-loaded and shown as an editable table: rule, weight, cap, enabled toggle, plus the Hot/Warm/Cold threshold sliders. Editing any value live-updates a small "N hot / N warm / N cold" preview so the planner can feel the effect of a change before moving on.

**Step 6 — Triage workspace (main lead table).** Sortable/filterable table (tier, score, name, company, title, owner, status, draft status) with a persistent progress header (FR-11). Clicking a row opens a detail drawer showing full contact info, signal detail, score breakdown, owner, status, and draft preview/edit.

**Step 7 — Owner assignment.** A dedicated panel (or accessible from the workspace) lists configured owners (from a mapped column and/or manually entered names), shows current distribution, and offers "auto-assign unassigned via round robin" plus bulk reassignment on any filtered selection.

**Step 8 — Follow-up templates & draft generation.** A template editor per tier (and per delivery-mode variant when linked to a brief) with default starter copy pre-filled and a live merge-token preview using a sample lead. "Generate all drafts" bulk-runs generation for every lead without a draft (or without a manually-edited one); any lead can be regenerated or hand-edited individually from the workspace detail drawer.

**Step 9 — Export.** Export dialog: format (CSV / XLSX) and scope ("Per owner — one file each" or "Combined — one file, grouped by owner"). Triggers download(s) and logs the export event. The session's status flips to `"routed"` automatically once every lead has an owner (independent of whether export has been triggered — export can happen multiple times as work continues).

**Step 10 — Progress dashboard (persistent throughout Steps 2-9).** A top bar always visible while a session is open: lead count, %deduped, %scored, %routed, %draft-ready, and "Xh Ym since event close," directly surfacing the two §10 success metrics live, in-app, without needing to export the usage log.

## 9. Follow-Up Draft Generation Approach

Draft generation is **deterministic, template-based mail-merge — no AI/LLM text generation** in v1. This is a direct continuation of the precedent PRD 1 set (its guided-intake brief generation is explicitly "deterministic forms + preset defaults only," with AI-assisted drafting called out as a deliberately deferred idea "so v1 ships a deterministic, testable... flow rather than a harder-to-test generative one"). No PRD 2 exists yet in this suite to reference directly, but this PRD follows the same reasoning PRD 1 already established as the suite's working convention: predictable, inspectable, zero-dependency output that a planner can trust and a QA pass can actually test.

**Mechanics:**
- Each `FollowUpTemplate` is plain text with `{{mergeToken}}` placeholders in both subject and body.
- Supported merge tokens (v1): `{{firstName}}`, `{{lastName}}`, `{{company}}`, `{{jobTitle}}`, `{{eventName}}`, `{{sessionsAttendedList}}` (comma-joined, or omitted gracefully if empty), `{{sessionsAttendedCount}}`, `{{boothInteractionsCount}}`, `{{demoRequestedYesNo}}`, `{{ownerName}}`, `{{eventPrimaryObjective}}` (only resolves when linked to a brief; renders as empty string otherwise, template authors are advised not to rely on it in standalone-friendly templates).
- A token with no available value renders as an empty string (not left as literal `{{token}}` text) — templates should be written so a missing optional token (e.g. no sessions attended) still reads naturally; the default starter templates are written this way.
- Template selection at generation time: `tier` match required; `deliveryModeVariant` match preferred (falls back to `"generic"` if the specific variant doesn't exist for that tier).
- Generation is idempotent and safe to re-run: re-generating a lead's draft that hasn't been manually edited simply re-renders from the current template/data; a manually edited draft (`edited: true`) is never silently overwritten by a bulk "generate all" — the planner must explicitly confirm per-lead or in bulk to overwrite.
- **Default starter templates** (one per tier, generic variant, editable) are shipped so a planner never sees a blank template on session creation — e.g. the Hot-tier default opens by referencing the demo request or booth visit directly, the Cold-tier default is lighter-touch and content-offer-oriented. Exact copy is a UX-writing task at build time, not specified field-by-field here, but must exist as real, sendable-quality copy, not lorem-ipsum placeholders.

## 10. Export Approach Per Sales Owner

- **Format:** CSV is the P0 baseline (universally opens in any spreadsheet tool or CRM import path a sales owner already has); XLSX is also P0 (many sales teams prefer it, and it's a low-additional-cost format to also generate from the same in-memory lead data).
- **Scope options:** (a) **Per owner** — one file per distinct assigned owner, containing only that owner's leads, or (b) **Combined** — one file with all leads and an `Owner` column, for planners who prefer to hand-distribute themselves or who use a shared drive folder structure.
- **Sort order:** tier (Hot → Warm → Cold) then score descending, within each owner's file — this *is* the prioritization the sales owner needs; no manual re-sorting should be required on their end.
- **Included columns:** full name, email, company, job title, phone (if available), score, tier, key signals summary (sessions attended count, booth interactions, demo requested Y/N), status, draft subject, draft body, event name.
- **File naming:** `leads_{eventName-slug}_{ownerName-slug}_{exportDate}.csv` (or `.xlsx`) for per-owner files; `leads_{eventName-slug}_combined_{exportDate}.csv` for the combined option — predictable enough that a planner attaching multiple files to separate emails to different owners doesn't have to open each one to check whose it is.
- **Repeatable, not transactional:** exporting does not lock or "consume" leads — a planner can export again after more triage work (e.g. more drafts generated, a few reassignments) and the new export simply reflects current state. There is no dedup-across-exports tracking in v1 (i.e., the tool doesn't know if a sales owner already received a given file) — that's a natural consequence of the no-automated-sending non-goal and is explicitly out of scope.
- **Not included in v1:** no direct emailing of the export to the owner (that's the automated-sending non-goal), no per-owner shareable link (no backend to host one).

## 11. Success Metrics

Both metrics are the exact two named in the source stakeholder brief. Per the no-backend, standalone architecture, both are measured from data already stored locally (the lead records themselves and the FR-12 usage log), exportable as CSV, and also surfaced live in-app via the FR-11 progress dashboard.

1. **Time from event close to routed list.**
   - *Definition:* elapsed time between `TriageSession.eventClosedAt` and the timestamp the session's `status` first becomes `"routed"` (i.e., the moment 100% of leads in the session have a non-null `ownerId`).
   - *Measurement:* computed directly from stored session data (`eventClosedAt` vs. the `session_routed` entry in the FR-12 usage log); exportable as a CSV column when exporting the usage log. Report as median and 90th percentile across all local sessions.
   - *Target:* median ≤ 24 hours, 90th percentile ≤ 48 hours (assumption — pending validation; this directly encodes the stakeholder's "24-48 hrs of event close" framing as the explicit target rather than leaving it implicit).

2. **% of leads with a follow-up draft within 48 hours of event close.**
   - *Definition:* of all leads in a session, the percentage whose `followUpDraft.generatedAt` is within 48 hours of that session's `eventClosedAt`.
   - *Measurement:* computed directly from lead records (no additional logging required beyond the `generatedAt` timestamp already stored on every draft); shown live on the FR-11 dashboard and captured as a snapshot in the usage log at each export event, so the figure at time-of-handoff is preserved even if drafts are later added/edited.
   - *Target:* ≥ 90% of leads have a draft within 48 hours (assumption — pending validation).

## 12. Risks & Assumptions

- **Risk:** CSV/XLSX export formats vary meaningfully across badge-scan vendors, registration platforms, and manual spreadsheets — a mapping that works well for one event's files might need real adjustment for the next. *Mitigation:* column mapping is always editable per import (FR-2); saved mapping presets are an explicit P1, not P0, because we don't yet know how much format variance is real versus assumed.
- **Risk:** The default scoring rubric (§7) is a reasonable-sounding but unvalidated guess — real conversion data from actual events could show a different signal (e.g. booth interactions) predicts pipeline better than demo requests. *Mitigation:* every weight, cap, and threshold is planner-editable per session (FR-5), and the rubric is transparent (FR-6 score breakdown) specifically so it can be second-guessed and corrected, not trusted blindly.
- **Risk:** Conservative fuzzy-dedupe (§7) intentionally under-merges rather than over-merges, meaning some real duplicates will surface in the manual review queue or, if a planner skips that step, end up as duplicate rows in a sales owner's export. *Mitigation:* documented tradeoff (false-negative safer than false-positive); the merge review queue is a required step whenever possible duplicates exist, not skippable, and FR-11's progress dashboard doesn't report "deduped: 100%" until the queue is cleared.
- **Risk:** Without CRM write-back or sync, this tool has zero visibility into whether an exported lead was actually contacted; a planner's `contacted`/`closed` status is only as accurate as their manual updates. *Mitigation:* explicitly documented as a v1 limitation; the §6 v2 integration path names CRM write-back as the direct fix.
- **Risk:** Round-robin owner assignment with no workload or territory awareness could route a lead to an owner who isn't actually the right fit (wrong territory, wrong segment). *Mitigation:* mapped "owner" columns (when the planner's source data already has assignment logic, e.g. from a CRM export) always take precedence over round robin; manual reassignment is always one click away (FR-7).
- **Assumption — pending validation:** the default scoring rubric's exact weights/caps/thresholds (§7, §12 Q2).
- **Assumption — pending validation:** the dedupe matching strategy and 0.85 fuzzy-similarity threshold (§7, §12 Q1).
- **Assumption — pending validation:** the two numeric success-metric targets in §11 (24h median / 48h p90 for routing; 90% draft coverage within 48h) are directive defaults, not research-backed numbers.
- **Assumption:** round-robin is a reasonable default owner-assignment method absent a mapped owner column or a validated alternative (e.g. territory rules); this is a simplification chosen for v1 predictability, not a claim it's optimal — see §12 Q4.

## 13. Open Questions and Documented Default Decisions

No explicit stakeholder open question was provided for this PRD, but several judgment calls have no validated user input yet. Each is given a decisive default so this PRD is fully buildable, flagged as an assumption pending validation with real planner/sales usage.

**Q1: What dedupe matching strategy and threshold should be used, absent validated data on how badge/registration exports vary across venues and vendors?**
**Default decision:** normalized-email exact match as the primary key, auto-merging on match (with conflicting non-empty field values queued for manual resolution rather than silently overwritten). When email is missing or doesn't resolve a match, fall back to a fuzzy match on normalized full name + company, treating a combined similarity ≥ 0.85 as a *possible* match — but never auto-merging on the fuzzy path; it always routes to a manual review queue. Rationale: email is the one field reliably unique-per-person and consistently present across badge-scan and registration exports; a conservative fuzzy fallback avoids the worse failure mode (silently merging two different people, which can suppress real outreach) at the cost of the milder one (an occasional duplicate row a planner has to manually resolve or a sales owner sees twice).
**Flagged as:** Assumption — pending validation.

**Q2: What should the starter/default scoring rubric weights and tier thresholds be?**
**Default decision:** Demo requested = flat +40 pts; Booth interactions = +10 pts each, capped at 30; Sessions attended = +5 pts each, capped at 25; optional Persona title match (brief-linked only) = flat +15 pts. Tier thresholds: Hot ≥ 70, Warm 40-69, Cold < 40. Rationale: demo request is the strongest unambiguous buying-intent signal a badge scan can capture, so it gets the largest single weight; booth interaction is next as an active, effortful signal of interest; session attendance is capped so a passive "attended everything" lead can't outrank someone who took a concrete buying action. Every value is planner-editable (FR-5) specifically because this default is expected to need replacing with something evidence-based after a few real triage sessions generate outcome data.
**Flagged as:** Assumption — pending validation.

**Q3: Should Lead Triage write anything back into the linked Event Brief (e.g. a `successMetrics` entry for "Leads Routed")?**
**Default decision:** No write-back in v1. This tool reads the Event Brief but never mutates it. Rationale: `schema/event-brief-schema.md` doesn't assign this tool write ownership over any field, and PRD 1's release criteria treat the schema as frozen for v1 — introducing a write path here would be scope creep against that boundary. A future, explicitly-scoped enhancement could add an opt-in "record leads-routed count against a matching `successMetric`" feature via a proper MINOR schema version bump (adding an optional field or a documented convention for which `SuccessMetric.metric` name to match against), following the existing versioning policy rather than improvising one here.
**Flagged as:** Assumption — pending validation.

**Q4: Absent a mapped "owner" column, what should the default auto-assignment method be?**
**Default decision:** simple round-robin across a planner-configured list of owner names/emails, evenly distributing currently-unassigned leads. Rationale: it's predictable, requires no additional configuration burden (no territory rules, no capacity data — none of which is available from imported files anyway), and is trivially overridden via manual/bulk reassignment (FR-7) when it gets something wrong. Territory- or segment-aware assignment is a reasonable P1 once there's evidence round-robin's misses are common enough to matter.
**Flagged as:** Assumption — pending validation.

## 14. Release Criteria (Definition of Done for P0)

Lead Triage & Follow-Up Engine P0 is done when all of the following are true:

- [ ] All 13 functional requirements (FR-1 through FR-13) pass their stated acceptance criteria.
- [ ] `packages/lead-triage-core` exports the `TriageSession`, `ImportBatch`, `ColumnMapping`, `LeadRecord`, `ScoringRubric`, `ScoringRule`, `FollowUpTemplate` types plus pure functions for CSV/XLSX parsing, column-mapping suggestion, dedupe matching, scoring, and template rendering — all independently unit-testable without React/Next.
- [ ] `packages/local-store` is extended with a lead-triage repository (session/import/lead/rubric/template CRUD) following the same repository-wrapper pattern as `briefRepository.ts`, with no direct IndexedDB access from `apps/web` UI code.
- [ ] A planner can go end-to-end — new session (both linked-to-brief and standalone paths) → import ≥2 files with at least one deliberate duplicate across them → resolve any merge-review queue → adjust the scoring rubric and see tier counts update → assign owners (both column-mapped and round-robin paths) → generate and hand-edit at least one draft → export both "per owner" and "combined" — without errors.
- [ ] Data persists across a page reload at every stage of that flow.
- [ ] At least one fixture triage session (sample CSV inputs + expected merged/scored/routed output) exists in the repo for manual QA and for future PRD builders to develop against.
- [ ] Exported CSV and XLSX files open correctly in a spreadsheet application and contain every column specified in §10, correctly sorted.
- [ ] The FR-11 progress dashboard and the FR-12 usage-log CSV independently agree on %routed and %draft-ready for a given session (cross-check as part of QA).
- [ ] The usage-log CSV contains accurate rows for every FR-12-listed lifecycle event with correct timestamps, sufficient to compute both §11 success metrics without additional instrumentation.
- [ ] No console errors in a full click-through of the flow in Chrome and Firefox latest.
- [ ] This tool makes zero writes to any `EventBrief` object at any point (verified by inspecting IndexedDB before/after a full triage session run against a linked brief) — enforcing the §7/§12-Q3 read-only boundary.
