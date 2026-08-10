# PRD 2: Promo Campaign Kit

## Metadata

| Field | Value |
|---|---|
| **Status** | Draft — ready for build kickoff |
| **Owner** | Event Planner Productivity Suite — Product |
| **Depends on** | PRD 1 — Event Brief Generator (`packages/schema`, `packages/local-store`, the `EventBrief` object) |
| **Consumed by** | None (leaf tool in the dependency graph); may itself be read by PRD 7 (Post-Event ROI Report & Retro) for "assets produced" retro context — not required for this PRD's P0 |
| **Target release** | v1 (same release train as the rest of the suite) |
| **Document version** | 1.0 |
| **Last updated** | 2026-08-09 |

> **Note on suite numbering:** `schema/event-brief-schema.md` documents an *assumed* PRD numbering where PRD 2 = Timeline & Task Planner and PRD 3 = Registration & Attendee Manager. This PRD deviates from that assumption — the stakeholder has designated **Promo Campaign Kit** as PRD 2. This is a naming/sequencing deviation only; it does not change the schema contract. Where this PRD's registration-pacing feature overlaps conceptually with the assumed future "Registration & Attendee Manager," see **Risks & Assumptions** for how the boundary is drawn (aggregate pacing counts here vs. individual registrant records there, later).

---

## 1. Problem Statement

Promoting a single event requires 15–30 discrete copy assets — landing page copy, a multi-touch email sequence, per-channel social posts, sales enablement snippets — each currently drafted by hand, one at a time, with no shared source of truth. This produces two costs: (1) planners spend hours re-typing the same event facts (name, dates, audience, goals) into a dozen different documents, and inconsistencies creep in when a date or headline changes and not every asset gets updated; (2) once assets are out the door, registration pacing is checked ad hoc (if at all), so events that are falling behind their registration goal are caught late — too late to meaningfully intervene — or not caught at all until the RSVP count is a post-event surprise.

Field/corporate marketing event planners running multiple events per quarter feel this most: they are their own copywriter, social manager, and analyst for every event, with no tooling that connects the brief they already wrote to the promotion work that brief should be driving.

## 2. Goals & Non-Goals

### Goals

1. **Reduce time to a usable promo asset set** from hours of manual drafting to minutes, by generating the full set directly from an existing Event Brief.
2. **Keep assets consistent with the brief** — a single edit to the brief (date change, audience change) should let a planner regenerate affected assets rather than hunt across a dozen documents.
3. **Make registration pacing visible and actionable early enough to matter** — replace "ad hoc, too late" checking with a standing tracker that flags a behind-pace event while there's still runway to react.
4. **Preserve planner control** — generated copy is a first draft, not a final deliverable; editing must be fast and must not be clobbered by later regeneration.
5. **Stay standalone-first** — no dependency on a martech/event-platform integration or an external LLM API to deliver core value (see §8, Content-Generation Approach).

### Non-Goals (v1)

- **Sending emails or publishing social posts.** This tool generates copy only. No SMTP/ESP integration, no social API posting. (Rationale: sending requires per-channel auth/integration that violates the standalone-first constraint and is a materially larger scope than copy generation.)
- **Paid-media planning** (ad copy, budget allocation across channels, bid strategy). (Rationale: distinct workflow and audience — paid media managers, not the event planner — and depends on ad-platform integrations out of scope for v1.)
- **A/B testing** of subject lines, copy variants, or send times. (Rationale: requires a send/measurement loop this tool doesn't own in v1; premature without real send data.)
- **Individual registrant/attendee record-keeping** (name-level registrant lists, dedupe, source attribution). Pacing tracking here is **aggregate counts only** (a number per date). Registrant-level data is out of scope for this PRD and reserved for a future Registration & Attendee Manager tool. (Rationale: keeps this tool's data model light and avoids duplicating what a dedicated registration tool will own.)
- **Brand-voice/tone configuration** in v1 (see Open Questions §12, Q1 — resolved as a documented default: deferred to v1.1).
- **Multi-language / localized copy generation.**

## 3. Target Users & Persona

**Primary persona: Maya, Field Marketing Manager.** Runs 6–10 regional and virtual events per year (webinars, regional roadshows, occasional trade show booths). Owns promotion for each event essentially solo — she writes the invite emails, social copy, and landing page brief herself, then hands sales a one-liner to reuse in outbound. She already used the Event Brief Generator to scope the event; she wants the next step — turning that brief into promotable copy — to take minutes, not a morning. She checks registration numbers manually in a spreadsheet every few days and has, more than once, realized an event was badly under-pacing with only a week left to fix it.

**Secondary persona: Sam, Sales Development Rep.** Doesn't use the tool directly but consumes its output — a short, on-brand snippet to paste into outbound emails or a LinkedIn message inviting a prospect to the event. Sam's needs are satisfied entirely by Maya copy-pasting from the Sales Outreach section; no separate UI for Sam in v1.

## 4. User Stories

1. As a field marketing manager, I want to generate a full set of promo copy directly from my Event Brief so that I don't have to retype the event name, dates, and audience into a dozen documents.
2. As a field marketing manager, I want each generated asset to be editable in place so that I can polish AI/template-generated wording without leaving the tool.
3. As a field marketing manager, when I change a fact in my brief (e.g., the event date), I want to regenerate only what changed without losing edits I've already made to other assets.
4. As a field marketing manager, I want to see per-channel social posts sized appropriately for each platform (LinkedIn vs. X) so that I'm not manually trimming a generic post to fit a character limit.
5. As a field marketing manager, I want a ready-made one-liner and short paragraph I can hand to sales so that reps have consistent, on-brief language without a separate brief-and-ask cycle.
6. As a field marketing manager, I want to enter or import registration counts over time and see whether I'm on pace against my registration goal so that I know early — not the week before — whether I need to intervene.
7. As a field marketing manager, when I'm behind pace, I want concrete, ready-to-use suggestions (not just a red flag) so that I can act immediately instead of guessing what to do.
8. As a field marketing manager, I want to bulk-export the whole promo kit (or copy individual assets) so that I can paste them into my ESP, social scheduler, or CRM myself.
9. As a field marketing manager opening this tool from a brief still in draft or missing a registration goal, I want a clear message telling me what's missing so that I'm not confused why generation or pacing is blocked/degraded.

## 5. Functional Requirements — P0

All FRs are scoped to a single Event Brief, addressed via `?briefId=` like every other tool in the suite. Numbered independently per PRD.

**Asset generation**

- **FR-1.** From an existing, loaded `EventBrief`, a "Generate Promo Kit" action produces a complete `PromoAssetSet` containing exactly: 1 landing page copy block, 5 sequenced emails, 9 social posts (3 per channel × 3 channels: LinkedIn, X, Facebook), and 3 sales outreach snippets (one-liner, short paragraph, LinkedIn DM script) — 18 assets total, within the 15–30 range cited in the problem statement.
- **FR-2.** Every generated asset's copy is produced by interpolating brief fields into asset-type-specific templates (see §8). No asset may contain an un-interpolated placeholder token (e.g., stray `{{eventName}}`) in the rendered output — fields with no value fall back to a documented default string (e.g., "[to be confirmed]"), never a raw token.
- **FR-3.** Generation requires, at minimum, the brief's required fields (per the Event Brief Generator's own required-field set: `name`, `type`, `goals.primaryObjective`, `audience.description`, `dates.timezone`, `dates.eventStartDate`, `dates.eventEndDate`, `format.deliveryMode`). If any are missing, "Generate Promo Kit" is disabled with a message identifying the missing field(s) and a link back to the brief.
- **FR-4.** Each `PromoAsset` is independently editable in place (plain-text/simple textarea editing — no rich text, consistent with the suite's plain-text convention). Edits autosave (debounced) to local storage.
- **FR-5.** Each `PromoAsset` tracks its originally generated body separately from its current (possibly edited) body, and computes a normalized edit-distance percentage between them, displayed per-asset (e.g., "12% edited") and aggregated for the whole set on the kit overview.
- **FR-6.** A brief that has been edited (its `version` counter incremented) since the current `PromoAssetSet` was generated shows a "Brief has changed since this kit was generated" banner with a **Regenerate** action.
- **FR-7.** Regeneration re-runs FR-1's templates against the current brief, but never silently overwrites an asset whose current body differs from its original generated body (i.e., an edited asset). Edited assets are skipped by default and flagged "Not regenerated — edited"; the planner can explicitly choose "Regenerate anyway (discard my edits)" per-asset or in bulk.
- **FR-8.** The kit view groups assets into four sections — Landing Page, Email Sequence, Social, Sales Outreach — each collapsible, each asset shown as a card with: label, body, edit-distance indicator, "Copy to clipboard" button.
- **FR-9.** A "Copy all" / bulk export action produces a single Markdown document containing every asset, grouped and labeled by section, downloadable as a `.md` file (mirrors the export pattern established by PRD 1).
- **FR-10.** Email sequence assets are labeled with a suggested send date, computed as offsets before `dates.eventStartDate`: Invite (T‑6 weeks), Reminder 1 (T‑3 weeks), Reminder 2 (T‑1 week), Last Chance (T‑2 days), Day-Of (morning of `dates.eventStartDate`, in `dates.timezone`). Any offset that would fall before today's date is compressed proportionally into the remaining window (documented default; see §12 Q4) rather than showing a past date.

**Registration pacing tracker**

- **FR-11.** The pacing tracker requires a `successMetrics` entry on the brief whose `metric` field matches "registration" (case-insensitive substring match) with a numeric `target` > 0. If none exists, the tracker shows a blocked state with a message and a link back to the brief's Success Metrics section to add one.
- **FR-12.** Planners can add pacing data points manually (date + cumulative registration count) via a simple form, or import a CSV with `date,count` columns (header required; dates ISO `YYYY-MM-DD`). Malformed rows are rejected individually with a row-level error list; valid rows in the same file are still imported.
- **FR-13.** The tool computes a target pacing curve between a campaign start date (see §12 Q4 for the default) and `dates.eventStartDate`, scaled to the registration `target`, using a selectable curve style: **Backloaded (standard)** [default] or **Linear**. The backloaded preset is a fixed set of cumulative-percent checkpoints (documented in §8).
- **FR-14.** Given the latest actual data point, the tool computes percent-behind-curve versus the target curve's expected value at that date, and shows a status badge: **On Pace** (within 10% of target), **Behind Pace** (10–25% behind), **Critical** (>25% behind). Thresholds are a documented default (see §12 Q5).
- **FR-15.** When status is Behind Pace or Critical, the tracker surfaces a **Recommended Interventions** panel: a fixed, rule-based list of tactics (e.g., "Send the next email in your sequence early," "Post an urgency-framed social update," "Share the sales outreach snippet with your AE/SDR team," "Consider a deadline extension or a co-marketing partner share") plus direct links into the still-unedited/relevant `PromoAsset`s from the same brief's kit (e.g., link straight to the "Last Chance" email if it hasn't been marked used).
- **FR-16.** The tracker view shows: current status badge, days remaining to `dates.eventStartDate`, latest actual count vs. target, and a simple actual-vs-target-curve visualization (table and/or lightweight inline chart — see §8 for the "no new charting dependency" default) plotted against the campaign window.
- **FR-17.** All pacing entries and the generated asset set persist to local storage (IndexedDB) keyed to the brief, survive reload, and are visible again on reopening the tool for that brief.

## 6. P1 / Later

- **Brand-voice / tone configuration** (multiple tone presets or a custom voice profile) — see §12 Q1.
- **Asset usage log** — a self-reported "mark as sent/used" checkbox per asset so Recommended Interventions (FR-15) can avoid repeatedly suggesting an asset already used, and so "time to complete" can be measured against real usage rather than just export.
- **Custom pacing curve editor** (planner defines their own checkpoint percentages rather than choosing Linear/Backloaded).
- **Additional social channels** (Instagram, TikTok) and additional asset types (press release blurb, partner co-marketing email, internal Slack/Teams announcement).
- **CSV export of the pacing entries** (currently import-only in P0).
- **Per-persona asset variants** — generate a distinct landing-page value proposition or email opener per `audience.targetPersonas` entry, rather than one generic version.
- **Optional LLM-assisted "enhance this asset" rewrite** — see §8 for why this is explicitly deferred, not silently assumed.

## 7. Data Model

### 7.1 Event Brief fields this tool reads (read-only; never writes back to `EventBrief` in v1)

| Field | Used for |
|---|---|
| `name`, `type` | Headlines, subject lines, template selection (conference/webinar/trade-show phrasing variants) |
| `goals.primaryObjective`, `goals.objectives` | Landing page body, email opening hook, sales snippet value proposition |
| `audience.description`, `audience.segments` | Audience framing across all copy; segment list surfaced as an optional targeting note on social posts |
| `audience.targetPersonas[].painPoints` | Optional pain-point line in landing copy body when present (falls back gracefully when empty) |
| `dates.eventStartDate`, `dates.eventEndDate`, `dates.timezone` | Email send-date offsets, landing page logistics line, social post dates, pacing curve window |
| `format.deliveryMode`, `format.venueOrPlatform` | Logistics/location line ("Join us in [city]" vs. "Join us online — link on registration") |
| `stakeholders` (filtered to `raci === "A"`, first match) | Optional "Questions? Contact [name]" line; omitted entirely if no Accountable stakeholder is set |
| `successMetrics` (entry matching "registration") | Pacing tracker target (FR-11, FR-13) |
| `timeline.milestones` | Optional campaign-start signal (see §12 Q4) |
| `constraints.items` | Surfaced as a read-only "Before you publish" checklist sidebar in the kit view — **not** auto-inserted into generated copy (a compliance constraint like "must comply with EU data residency" doesn't map cleanly to auto-generated prose; showing it as a checklist avoids inserting garbled or wrong text) |
| `version` | Staleness detection for the "brief changed" banner (FR-6) |
| `id` | Foreign key (`eventBriefId`) linking all new entities below back to the brief |

This tool **never writes to `EventBrief`** — it is a pure consumer. This keeps the spine object from growing 18+ generated-content records and pacing time-series rows, which are working data with their own edit/regeneration lifecycle, not brief facts.

### 7.2 New entities introduced by this PRD

Design decision: rather than extending the `EventBrief` object itself (the pattern PRD 1 reserved for PRD 4's budget actuals), this PRD's data is modeled as **new sibling types added to `packages/schema`** (a new file, not a change to `event-brief.ts`) and **new local-store object stores**, referencing the brief only by `eventBriefId`. Rationale: generated copy and daily pacing counts are high-volume, tool-owned working data (regenerated, edited, appended to over the campaign) — embedding them in the brief document would make every brief save/load carry that payload even for tools that never touch it, and would need a schema MAJOR/MINOR bump for what is really this tool's internal state. This mirrors how `packages/local-store`'s `usageLog` already lives outside the brief object. This is an architectural decision, not an open question — documented here for the builder, not deferred.

```typescript
// packages/schema/src/promo-kit.ts

export type PromoAssetType =
  | "landing_page"
  | "email"
  | "social"
  | "sales_outreach";

export type SocialChannel = "linkedin" | "x" | "facebook";

export type PacingCurveStyle = "backloaded_standard" | "linear";

export type PacingStatus = "on_pace" | "behind_pace" | "critical";

export interface PromoAsset {
  id: string;                    // UUID
  type: PromoAssetType;
  subtype?: string;               // e.g. "invite" | "reminder_1" | "reminder_2" | "last_chance" | "day_of" for email;
                                   // "announcement" | "mid_campaign" | "last_chance" for social
  channel?: SocialChannel;        // set only when type === "social"
  label: string;                  // display label, e.g. "Email 3 of 5 — Reminder (T-1 week)"
  suggestedSendDate?: string;     // ISO date, emails/social only
  generatedBody: string;          // immutable snapshot of the original template output
  currentBody: string;            // editable; equals generatedBody until first edit
  editDistancePct: number;        // 0-100, recomputed on every save of currentBody
  isEdited: boolean;               // currentBody !== generatedBody
  lastEditedAt?: string;           // ISO datetime
}

export interface PromoAssetSet {
  id: string;                     // UUID
  eventBriefId: string;           // FK -> EventBrief.id
  sourceBriefVersion: number;     // EventBrief.version this set was generated from (staleness check)
  generatedAt: string;            // ISO datetime, first generation
  regeneratedAt?: string;         // ISO datetime, last regeneration
  assets: PromoAsset[];
}

export interface PacingEntry {
  id: string;                     // UUID
  eventBriefId: string;           // FK -> EventBrief.id
  date: string;                   // ISO date
  cumulativeRegistrations: number;
  source: "manual" | "csv";
  enteredAt: string;               // ISO datetime
}

export interface PacingConfig {
  eventBriefId: string;           // FK -> EventBrief.id (one config per brief)
  curveStyle: PacingCurveStyle;   // default "backloaded_standard"
  campaignStartDateOverride?: string; // ISO date; overrides the computed default (§12 Q4)
}
```

`packages/local-store` gains two new object stores and a repository module:

```
packages/local-store/src/
  promoKitRepository.ts   // getAssetSet, saveAssetSet, regenerateAssetSet
  pacingRepository.ts     // listEntries, addEntry, importCsv, getConfig, saveConfig
```

Object stores: `promoAssetSets` (keyed by `eventBriefId`, one record per brief) and `pacingEntries` (keyed by auto-increment `id`, indexed by `eventBriefId`). No change to the existing `briefs` object store or to `EventBrief.schemaVersion`.

## 8. UX Flow

1. **Entry.** From the Brief View's "Launch a tool" links (stubbed by PRD 1), "Promo Campaign Kit" becomes a live link → `/promo?briefId=...`.
2. **Promo Kit home (no kit generated yet).** Shows the brief name/type/dates for confirmation, a preview list of what will be generated ("1 landing page, 5 emails, 9 social posts, 3 sales snippets"), and a **Generate Promo Kit** button — disabled with inline messaging if required brief fields are missing (FR-3).
3. **Generation.** Runs client-side, synchronously (template interpolation — no network round trip, effectively instant). Lands on the Kit view.
4. **Kit view.** Four collapsible sections (Landing Page, Email Sequence, Social, Sales Outreach). Each asset is a card: label (+ suggested send date where relevant), body in an editable textarea, edit-distance badge, Copy button. Top bar: kit-level "% edited" summary, "Copy all" bulk export, and (when stale) the "Brief changed — Regenerate" banner.
5. **Regenerate flow.** Clicking Regenerate shows a per-section diff summary ("Landing Page: will update. Email 2: edited, will be skipped. Email 4: will update.") with a confirm step; a "Regenerate anyway" override per skipped asset.
6. **Pacing Tracker tab** (same tool, second top-level tab alongside "Kit"). If no qualifying `successMetrics` entry exists, shows the blocked state (FR-11) with a link back to the brief. Otherwise shows: status badge, days remaining, entry form + "Import CSV" button, a table of entries, and the actual-vs-target visualization.
7. **Behind-pace state.** Status badge turns amber/red; Recommended Interventions panel appears above the chart, each recommendation either a static tactic or a direct link to a specific `PromoAsset` in the Kit view.
8. **Export.** "Copy all" produces one Markdown file with every asset labeled and grouped, mirroring the Brief Generator's export conventions; individual "Copy to clipboard" buttons on every asset card for fast one-off pasting into an ESP/social scheduler.

## 9. Content-Generation Approach

**Default approach: template-based generation with brief-field interpolation. No external LLM API in P0.** This is a deliberate architecture choice, not a placeholder for "add AI later without deciding":

- Every asset type has one or more hand-authored copy templates (plain strings/functions in `packages/schema/src/promo-kit-templates.ts` or a sibling file — a pure module with zero UI/network dependencies, consistent with `packages/schema`'s existing "pure TypeScript, no React" discipline).
- Templates use simple `{{fieldPath}}` interpolation resolved against the loaded `EventBrief` (e.g., `{{name}}`, `{{dates.eventStartDate}}` formatted per `dates.timezone`, `{{audience.description}}`), plus a small set of derived helper values computed before interpolation (e.g., a human-readable "in [city]" vs. "online" logistics phrase derived from `format.deliveryMode` + `format.venueOrPlatform`).
- Each asset type has **conditional branches**, not just interpolation — e.g., the landing page logistics block branches on `format.deliveryMode` (`in_person` / `virtual` / `hybrid`) to produce genuinely different sentences, not a single sentence with an awkward blank.
- Social templates are channel-aware: the same underlying message is rendered through three separate templates respecting each platform's practical character budget (X ≈ 280 chars, LinkedIn/Facebook longer-form), not one generic post truncated three ways.
- The backloaded pacing curve preset (FR-13) is a fixed constant, e.g. cumulative-percent-of-target checkpoints at campaign-window fractions `{0%: 5, 20%: 15, 40%: 30, 60%: 50, 80%: 75, 90%: 90, 100%: 100}`, linearly interpolated between checkpoints for any given date. This lives in `packages/schema/src/promo-kit.ts` alongside the types.
- Pacing visualization: **no new charting library dependency in P0.** Render a small hand-built inline SVG line (two polylines — actual vs. target — over the campaign window) plus a plain data table underneath for accessibility/precision. If the build session judges a lightweight chart library (e.g., Recharts, already common alongside shadcn/ui) meaningfully faster to implement correctly, that's an acceptable substitution — it does not violate the standalone-first/no-backend constraint since it's a client-side rendering library, not an integration.

**Why not an LLM API, stated plainly:** an LLM call would very likely produce higher-quality first-draft prose than fixed templates. It is explicitly not the P0 default because: (1) it introduces a new external network dependency and (likely) a paid API key the standalone-first architecture doesn't otherwise require anywhere else in the suite; (2) it introduces non-determinism that complicates the edit-distance success metric (a metric meant to measure "how much did the *template* need rewriting" gets noisier if the baseline itself varies run to run); (3) it raises a data-handling question (event/audience details leaving the device to a third-party API) that cuts against the local-first privacy posture the rest of the suite has maintained. **If a future revision wants this**, the clean seam is an optional, explicitly-opt-in "Enhance with AI" button per asset that calls an external LLM API and treats the template output as a fallback if the call fails or the user hasn't configured a key — never a P0 default path, and called out in that future PRD as a new external dependency requiring its own review (network egress, key storage, cost, data handling). Do not build this in P0.

## 10. Success Metrics & How Measured

**Important constraint on measurement:** this is a local-first, single-user, no-backend app (per the suite's binding architecture). There is no product analytics service in v1. All measurement below is derived from the same local, structured usage log pattern established in PRD 1 (FR-13) — this PRD adds its own event types to that log — and is only aggregable across planners if/when someone manually collects the exported CSVs. Treat all numeric targets below as **hypotheses to validate**, not committed benchmarks, until real usage data exists.

| Metric | Definition | How measured | Target (hypothesis) |
|---|---|---|---|
| Time to complete promo asset set | Elapsed time from `Generate Promo Kit` click to the first bulk export or last edit + 24h idle (whichever is sooner) for that `PromoAssetSet` | Usage-log timestamps: `promo_kit_generated`, `promo_asset_edited`, `promo_kit_exported` events, diffed locally | Median ≤ 30 minutes per event (vs. the multi-hour/multi-day manual baseline implied by the problem statement) |
| Asset edit distance | `editDistancePct` (FR-5), averaged across all 18 assets in a finalized set | Computed client-side (normalized Levenshtein or word-level diff ratio) on every `currentBody` save, aggregated at export time | Median aggregate edit distance in the 15–40% band — low enough that templates are read as genuinely useful drafts, high enough to confirm planners are actually personalizing rather than copy-pasting verbatim (a 0% median would indicate low relevance/generic output being used as-is, which is its own warning sign) |
| % of events hitting registration target | Of briefs with a "registration" `successMetrics` entry that also used the pacing tracker (≥1 `PacingEntry`), the share where the final `actual` ≥ `target` | Read directly from `EventBrief.successMetrics[].actual` vs. `.target` once PRD 3/6/7 (or manual entry) populates `actual`; requires the planner to keep that field updated post-event | Directional improvement over a pre-tool baseline the planner self-reports; no automated control-group comparison is possible in a local-first app — treat this as a metric to review qualitatively with early users, not a dashboard number |

## 11. Risks & Assumptions

| # | Risk / Assumption | Mitigation / Notes |
|---|---|---|
| 1 | Template output may read as generic; planners may bulk-ignore it and draft from scratch anyway, defeating the "time saved" goal. | Edit-distance metric (FR-5) is the early-warning signal for this; strong template craftsmanship in v1 build is the primary mitigation, not more scope. |
| 2 | Backloaded pacing curve preset is a single assumption about "typical" registration shape; webinar, conference, and trade-show pacing likely differ meaningfully. | Flagged explicitly in §12 Q3 as **Assumption — pending validation**. v1 offers a Linear alternative but not a fully custom curve (P1). |
| 3 | Behind-pace thresholds (10%/25%) are not derived from real data. | Flagged in §12 Q5 as **Assumption — pending validation**; thresholds are a single constant, trivial to tune once real usage exists. |
| 4 | CSV import for pacing data has no standard schema to match against (no CRM/ESP integration in v1 to source it from automatically). | FR-12's `date,count` format is intentionally minimal; row-level validation errors keep bad imports from silently corrupting the curve. |
| 5 | Regeneration logic (FR-7, skip-edited-assets) is more complex than a naive "overwrite everything" and is the part of this PRD most likely to have edge-case bugs (e.g., an asset edited back to exactly its original text). | Explicit acceptance criteria in §13 cover this case directly; treat `isEdited` as computed from a body-equality check recomputed on every save, not a one-way flag. |
| 6 | This PRD's registration pacing tracker deliberately does **not** track individual registrants, only aggregate counts — this is a narrower scope than a full "Registration & Attendee Manager" a later PRD may build. | Documented boundary: this tool owns aggregate pacing only; a future registrant-level tool is expected to supersede/feed this tracker's data, and the `PacingEntry` shape (date + count) is intentionally simple enough not to need migration when that happens — a future tool can compute the same aggregate curve from its richer registrant data instead. |
| 7 | Single-planner, no-auth, no-collaboration model (inherited from PRD 1) applies here too — no concept of "who edited this asset." | Consistent with the whole suite's v1 scope; not re-litigated here. |
| 8 | Social character-limit constants (X ≈280 chars, etc.) are hardcoded and will drift if platforms change limits. | Documented as a known low-severity maintenance item; not worth abstracting into a config system for three constants in v1. |

## 12. Open Questions — with Documented Defaults

**Q1. Should copy support brand-voice configuration in v1 or v1.1?**
**Default decision: v1.1 (deferred).** v1 ships a single, well-crafted "neutral professional B2B" tone across all templates. Rationale: brand-voice configuration multiplies template surface area (voice × asset type × channel) for a dimension we have no validated data on yet — we don't know if planners want "match our brand guide" (a big lift: needs a place to define/store a voice profile) or just "more casual vs. more formal" (a small lift: 2-3 tone presets). Shipping one strong default and watching the edit-distance metric (§10) tells us whether tone mismatch is actually the reason planners rewrite output, before we invest in configurability. **Architecture is prepared for this**: templates are parameterized internally by an (unused in v1) `toneKey` argument defaulting to `"neutral_professional"`, so v1.1 can add tone variants without restructuring the template system. **Assumption — pending validation** with real planner usage/feedback.

**Q2. Which social channels should v1 support?**
**Default decision: LinkedIn, X, and Facebook.** Instagram is excluded — it's a caption-plus-image-first platform and a text-only caption is a weak deliverable on its own without image generation (out of scope). **Assumption — pending validation**; easy to add as a fourth channel later since the template/channel structure (FR-1, `SocialChannel` type) already generalizes.

**Q3. What pacing curve shape should be the v1 default?**
**Default decision: "Backloaded (standard)" preset** (checkpoints in §9), with "Linear" offered as a manual alternative. Rationale: registration curves for B2B events are, anecdotally, back-loaded (a slow trickle early, a surge near the deadline); defaulting to Linear would systematically mis-flag early-campaign weeks as "behind pace" when that's normal, which would erode trust in the flag fast. **Assumption — pending validation** against real historical registration data from planner interviews; the single preset should be revisited once that data exists, and a custom-curve editor (P1) is the longer-term fix if one preset can't serve all event types well.

**Q4. What counts as "campaign start" for the pacing curve window and the email send-date offsets, when the brief has no explicit "promotion starts" date?**
**Default decision:** campaign start = the date the planner clicks **Generate Promo Kit** (i.e., "today," captured once and stored on the `PromoAssetSet`/`PacingConfig`), not the brief's `createdAt` (which may predate active promotion by weeks) and not a guess at a timeline milestone. If a `timeline.milestones` entry's `label` contains "invit" (case-insensitive), its `targetDate` is offered as a suggested override in the UI, but the default without any user action is "today." Planners can override via `PacingConfig.campaignStartDateOverride`. **Assumption — pending validation**; simplest deterministic default, no reliance on freeform label matching being correct.

**Q5. What percentages define "Behind Pace" vs. "Critical" (FR-14)?**
**Default decision:** On Pace = within 10% of the curve's expected value; Behind Pace = 10–25% below; Critical = more than 25% below. **Assumption — pending validation**; a single pair of constants, trivial to expose as a setting later if planners find them too sensitive or not sensitive enough.

## 13. Release Criteria (Definition of Done)

- [ ] Generating a kit from a fully-populated brief produces exactly 18 assets (1 landing page, 5 emails, 9 social, 3 sales outreach), none containing an un-interpolated template token.
- [ ] Generating a kit from a brief missing a required field is blocked with a clear, correct message; filling the field unblocks it.
- [ ] Editing an asset's body updates its edit-distance indicator in real time (or on save) and persists across reload.
- [ ] Incrementing the brief's `version` (any brief edit) surfaces the "Brief changed — Regenerate" banner on next visit to an already-generated kit.
- [ ] Regenerating: an untouched asset updates to reflect the new brief data; an edited asset is skipped and flagged, with a working "Regenerate anyway" override that discards the edit when used.
- [ ] "Copy to clipboard" works per asset; "Copy all" downloads a single Markdown file with all 18 assets correctly grouped and labeled.
- [ ] Email assets show correct suggested send dates computed from `dates.eventStartDate`, correctly compressed when the naive offset would land in the past.
- [ ] Opening the Pacing tab on a brief with no matching `successMetrics` registration entry shows the blocked state with a working link back to the brief.
- [ ] Adding a brief's registration success metric and returning unblocks the tracker.
- [ ] Manual pacing entry and CSV import (valid + intentionally malformed file) both work per FR-12, including row-level error reporting on the malformed file.
- [ ] Target curve renders correctly for both Backloaded and Linear styles and updates the status badge (On Pace / Behind Pace / Critical) correctly at representative test data points for all three states.
- [ ] Recommended Interventions panel appears only in Behind Pace/Critical states and links resolve to the correct assets in the Kit view.
- [ ] All promo-kit and pacing data persist in IndexedDB, survive reload, and are correctly scoped per `briefId` (verified with two different briefs open in sequence — no data bleed between them).
- [ ] No new required external network dependency introduced (verify: works fully offline after initial page load).
- [ ] Runs with zero console errors in Chrome and Firefox through the full flow: generate → edit → regenerate → export → add pacing data → view status → follow a recommended-intervention link.
