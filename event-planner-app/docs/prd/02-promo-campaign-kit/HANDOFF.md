# HANDOFF: Promo Campaign Kit (PRD 2) — Claude Code Kickoff Brief

Paste this whole file into a fresh Claude Code session to start building immediately. You do not need to read a separate PRD first — everything required to build this is inlined below. This is **not a new app** — it's a new route/module added to the existing `event-toolkit` monorepo that PRD 1 (Event Brief Generator) already scaffolded. Assume the monorepo already exists and is buildable; if it doesn't, stop and scaffold PRD 1 first (its HANDOFF.md is at `event-toolkit/prd/01-event-brief-generator/HANDOFF.md`) — this tool has a hard dependency on `packages/schema` and `packages/local-store` already existing and working.

## 1. Project Summary

We're building the "Event Planner Productivity Suite," a standalone-first web app suite for corporate/field marketing event planners. It is **standalone-first**: no HubSpot/Marketo/Cvent/Splash integrations, no external LLM API, no backend server — all data enters via user input or CSV import, and everything persists locally in the browser via IndexedDB. The suite is one Next.js (App Router) + TypeScript + Tailwind monorepo; each tool is a route inside the same app, sharing one canonical `EventBrief` data schema (`packages/schema`) and one local-first persistence layer (`packages/local-store`).

This session builds **the Promo Campaign Kit**: given an existing Event Brief, generate a full set of promotional copy (landing page, 5-email sequence, per-channel social posts, sales outreach snippets) via template interpolation — no AI/LLM call — and track registration pacing against a target curve derived from the brief's registration goal, flagging when an event is falling behind and surfacing concrete next steps.

**Problem this solves:** planners currently hand-draft 15–30 separate promo assets per event, inconsistently, and check registration pacing ad hoc — catching underperforming events too late to meaningfully react.

## 2. Where This Slots Into the Existing Monorepo

```
event-toolkit/
├── apps/web/app/(tools)/
│   ├── brief/                          # already exists (PRD 1) — do not modify its internals
│   └── promo/                          # <-- THIS SESSION'S SCOPE, new folder
│       ├── page.tsx                    # redirects/prompts for ?briefId= if missing
│       ├── kit/
│       │   └── page.tsx                # Kit view (Landing/Email/Social/Sales sections) — reads ?briefId=
│       ├── pacing/
│       │   └── page.tsx                # Pacing Tracker view — reads ?briefId=
│       └── _components/
│           ├── PromoKitHome.tsx        # "Generate Promo Kit" entry screen
│           ├── AssetCard.tsx           # single editable asset card w/ edit-distance badge
│           ├── AssetSection.tsx        # collapsible section wrapper (Landing/Email/Social/Sales)
│           ├── RegenerateDialog.tsx    # per-section diff + confirm + "regenerate anyway" overrides
│           ├── StaleBriefBanner.tsx
│           ├── PacingEntryForm.tsx     # manual entry + CSV import
│           ├── PacingCurveChart.tsx    # hand-rolled inline SVG actual-vs-target line + table
│           ├── PacingStatusBadge.tsx
│           └── RecommendedInterventions.tsx
├── packages/
│   ├── schema/src/
│   │   ├── event-brief.ts              # already exists — DO NOT MODIFY (this tool only reads EventBrief)
│   │   ├── promo-kit.ts                # <-- NEW: types (PromoAsset, PromoAssetSet, PacingEntry, PacingConfig — see §4)
│   │   └── promo-kit-templates.ts      # <-- NEW: pure template functions, zero React/network deps
│   └── local-store/src/
│       ├── db.ts                       # already exists — add two new object stores here (see §4)
│       ├── promoKitRepository.ts       # <-- NEW: getAssetSet, saveAssetSet, regenerateAssetSet
│       └── pacingRepository.ts         # <-- NEW: listEntries, addEntry, importCsv, getConfig, saveConfig
```

**Do not** create a new Next.js app, a new package for "just this tool," or a new persistence mechanism. `packages/schema` stays framework-free (pure TS types + pure functions); `packages/local-store` stays the only place IndexedDB is touched; `apps/web` is the only deployable artifact. Add a "Launch Promo Campaign Kit" real link from the Brief View (`apps/web/app/(tools)/brief/[briefId]/page.tsx`'s "Launch a tool" stub list) pointing at `/promo/kit?briefId=...` — PRD 1 built this as a disabled/"coming soon" stub; wire it live as part of this session.

## 3. Tech Stack (inherited — do not change)

Next.js App Router, TypeScript, Tailwind CSS, pnpm workspaces, `idb` for IndexedDB, `zod` for runtime validation, `crypto.randomUUID()` for IDs. No new runtime dependency is required for the core feature. If you want a chart library for the pacing curve visualization, a small one (e.g., Recharts) is an acceptable judgment call — the required default is a hand-rolled inline SVG (two polylines: actual vs. target) plus a plain data table, since it's simple enough not to need a dependency and keeps the "no heavy dependency" ethos PRD 1 established. **No LLM/AI API call anywhere in this build** — see §7.

## 4. Data Model — New Types & Storage (build this first, same discipline as PRD 1)

This tool **reads** `EventBrief` (never writes to it) and introduces its own sibling types/storage, referencing the brief only by id. Do not add fields to `EventBrief` or bump its `schemaVersion`.

```typescript
// packages/schema/src/promo-kit.ts

export type PromoAssetType = "landing_page" | "email" | "social" | "sales_outreach";
export type SocialChannel = "linkedin" | "x" | "facebook";
export type PacingCurveStyle = "backloaded_standard" | "linear";
export type PacingStatus = "on_pace" | "behind_pace" | "critical";

export interface PromoAsset {
  id: string;
  type: PromoAssetType;
  subtype?: string; // email: "invite" | "reminder_1" | "reminder_2" | "last_chance" | "day_of"
                     // social: "announcement" | "mid_campaign" | "last_chance"
  channel?: SocialChannel; // set only when type === "social"
  label: string;
  suggestedSendDate?: string; // ISO date
  generatedBody: string; // immutable snapshot of original template output
  currentBody: string;   // editable; starts equal to generatedBody
  editDistancePct: number; // 0-100, recomputed on every save
  isEdited: boolean;        // currentBody !== generatedBody
  lastEditedAt?: string;
}

export interface PromoAssetSet {
  id: string;
  eventBriefId: string; // FK -> EventBrief.id
  sourceBriefVersion: number; // EventBrief.version at generation time — staleness check
  generatedAt: string;
  regeneratedAt?: string;
  assets: PromoAsset[]; // exactly 18 on first generation: 1 landing + 5 email + 9 social + 3 sales
}

export interface PacingEntry {
  id: string;
  eventBriefId: string;
  date: string; // ISO date
  cumulativeRegistrations: number;
  source: "manual" | "csv";
  enteredAt: string;
}

export interface PacingConfig {
  eventBriefId: string; // one per brief
  curveStyle: PacingCurveStyle; // default "backloaded_standard"
  campaignStartDateOverride?: string; // ISO date
}

// Fixed backloaded preset: cumulative % of target at each fraction of the campaign window
export const BACKLOADED_CURVE_CHECKPOINTS: Array<[fraction: number, cumulativePct: number]> = [
  [0.0, 5], [0.2, 15], [0.4, 30], [0.6, 50], [0.8, 75], [0.9, 90], [1.0, 100],
];

export const PACING_STATUS_THRESHOLDS = { onPaceWithinPct: 10, behindPaceWithinPct: 25 };
```

Add two IndexedDB object stores in `packages/local-store/src/db.ts`:
- `promoAssetSets` — keyed by `eventBriefId` (one record per brief; overwritten on regenerate).
- `pacingEntries` — keyed by auto-increment `id`, indexed by `eventBriefId`.

Repository functions needed (`promoKitRepository.ts`, `pacingRepository.ts`): `getAssetSet(briefId)`, `saveAssetSet(set)`, `generateAssetSet(brief)` (pure function — brief in, `PromoAssetSet` out, calls the templates module), `regenerateAssetSet(brief, existingSet, overrides)`; `listEntries(briefId)`, `addEntry(entry)`, `importCsv(briefId, csvText)` (returns `{imported: PacingEntry[], errors: {row: number, reason: string}[]}`), `getConfig(briefId)`, `saveConfig(config)`.

## 5. Content Generation — How It Actually Works (read this before writing templates)

**Template-based interpolation. No LLM call, no network request.** `packages/schema/src/promo-kit-templates.ts` exports pure functions that take an `EventBrief` and return `PromoAsset[]`. For each asset type:

- Use `{{fieldPath}}`-style interpolation against brief fields (or just plain template literal functions in TS — no need for an actual templating engine/library, this is simple enough for string interpolation functions).
- **Branch on conditions, don't just interpolate.** At minimum: branch the logistics/location line on `format.deliveryMode` (`in_person` → venue name/city from `format.venueOrPlatform`; `virtual` → "online — link included in your confirmation"; `hybrid` → both). Branch subject-line/headline phrasing lightly by `type` (conference/webinar/trade_show wording differs).
- **Social posts are channel-aware**, not one post truncated three ways: write a separate template per `SocialChannel` respecting a practical length target (X ≈ 280 chars, LinkedIn/Facebook longer-form, more room for context).
- **Missing optional fields degrade gracefully** — never emit a raw `{{token}}`; fall back to a documented placeholder string (e.g., "[to be confirmed]") when a field is empty.
- Every template function is parameterized by an unused-in-v1 `toneKey: string = "neutral_professional"` argument — wire the parameter through even though only one tone ships, so a future session can add tone variants without restructuring (documented default, see §8 Open Questions below).
- Email send dates: compute from `dates.eventStartDate` at fixed offsets — Invite T‑6wk, Reminder 1 T‑3wk, Reminder 2 T‑1wk, Last Chance T‑2d, Day‑Of same day. If an offset lands before today, compress the remaining offsets proportionally into the time actually left rather than showing a past date.
- Pacing target curve: interpolate linearly between `BACKLOADED_CURVE_CHECKPOINTS` (or a straight 0→100% line for `"linear"`) across the window from campaign-start (default = the date the planner clicks "Generate Promo Kit," stored once on `PacingConfig`/`PromoAssetSet`; NOT the brief's `createdAt`) to `dates.eventStartDate`, scaled by the registration `successMetrics[].target`.

**Do not build an "AI enhance" button, an API key input, or any external HTTP call in this session.** If you're tempted because template output feels weak, put more effort into the templates themselves — that's the intended P0 answer to quality concerns (see the parent PRD's §9 for the explicit rationale on why LLM generation is deferred, not just forgotten).

## 6. P0 Checklist

- [ ] `packages/schema/src/promo-kit.ts` — types + constants above, exported from `packages/schema/src/index.ts`.
- [ ] `packages/schema/src/promo-kit-templates.ts` — pure `generateAssetSet(brief: EventBrief): PromoAsset[]` producing exactly 18 assets (1 landing page, 5 email, 9 social [3 channels × 3 subtypes], 3 sales outreach), no un-interpolated tokens ever in output.
- [ ] `packages/local-store` — new object stores + `promoKitRepository.ts` + `pacingRepository.ts`, including `importCsv` with row-level error reporting.
- [ ] `/promo` route family in `apps/web/app/(tools)/promo/` per the tree in §2, wired to `?briefId=`.
- [ ] "Generate Promo Kit" entry screen: preview of what will generate, disabled + explanatory message if required brief fields are missing.
- [ ] Kit view: 4 sections, editable asset cards, per-asset + aggregate edit-distance indicator, per-asset "Copy to clipboard," "Copy all" bulk Markdown export.
- [ ] Staleness banner when `EventBrief.version` has advanced past `PromoAssetSet.sourceBriefVersion`.
- [ ] Regenerate flow: unedited assets update, edited assets (`isEdited === true`, recomputed by body comparison, not a one-way flag) are skipped and flagged with a working "regenerate anyway" per-asset override.
- [ ] Pacing tab: blocked state when brief has no `successMetrics` entry matching "registration" (case-insensitive) with `target > 0`; manual entry form; CSV import (`date,count`, header row, ISO dates) with per-row validation errors; curve-style toggle (Backloaded default / Linear); status badge (On Pace / Behind Pace / Critical, thresholds 10%/25%); Recommended Interventions panel (rule-based tactic list + links to relevant kit assets) shown only when Behind Pace/Critical.
- [ ] Everything persists in IndexedDB per-brief, survives reload, no cross-brief data bleed.
- [ ] Live "Launch Promo Campaign Kit" link wired from the Brief View (replacing PRD 1's disabled stub).

## 7. Key UX Flows

1. Brief View → "Promo Campaign Kit" link → `/promo/kit?briefId=...`.
2. No kit yet → home screen previews the 18-asset breakdown → "Generate Promo Kit" (disabled + reason if required brief fields missing) → instant client-side generation → lands on Kit view.
3. Kit view: 4 collapsible sections, each asset a card (label + optional send date, editable body, edit-distance %, Copy button); top bar shows aggregate edit % and bulk "Copy all"; stale banner + Regenerate when the brief has changed.
4. Regenerate: diff summary per asset ("will update" / "edited — will be skipped") → confirm → optional per-asset "regenerate anyway (discard edits)."
5. Second tab, same tool: `/promo/pacing?briefId=...`. Blocked state with link back to brief if no registration metric exists yet. Otherwise: status badge, days remaining, entry form + CSV import, actual-vs-target chart/table, Recommended Interventions panel when behind.
6. Recommended Interventions link directly into specific `PromoAsset`s in the Kit view (e.g., jump straight to the "Last Chance" email).

## 8. Acceptance Criteria

- Generating from a fully-populated brief yields exactly 18 assets, zero un-interpolated tokens.
- Generating from a brief missing a required field (e.g. `dates.eventStartDate`) is blocked with a correct, specific message; fixing it in the brief and returning unblocks generation.
- Editing an asset updates its edit-distance indicator and persists across reload.
- Bumping the brief's `version` (any brief edit via the Brief View) shows the stale banner next time the kit is opened.
- Regenerate: an untouched asset's copy updates to the new brief data; an asset edited then edited *back* to its exact original text is correctly treated as not-edited (`isEdited` is a live comparison, not a sticky flag) and is safely regenerated/left as-is either way.
- "Copy to clipboard" works per card; "Copy all" downloads one correctly-grouped, correctly-labeled Markdown file.
- Email send dates compute correctly from `dates.eventStartDate`, with correct compression when offsets would land in the past relative to today.
- Pacing tab is blocked with a working link-back when no qualifying `successMetrics` entry exists; adding one and returning unblocks it.
- CSV import: a valid file imports all rows; a file with some malformed rows imports the valid ones and reports row-level errors for the rest.
- Status badge is correct at representative data points for all three states (On Pace / Behind Pace / Critical) under both curve styles.
- Recommended Interventions only appears in Behind Pace/Critical, and its asset links resolve to the correct card in the Kit view.
- Two different briefs open in sequence show correctly isolated kit/pacing data (no bleed).
- Fully functional offline after initial load — no network call anywhere in this feature.
- Zero console errors through the full flow (generate → edit → regenerate → export → add pacing data → view status → follow an intervention link) in Chrome and Firefox.

## 9. Explicit Non-Goals (do not build these)

- No sending emails, no posting to social platforms, no ESP/social-API integration of any kind — copy generation only.
- No paid-media planning (ad copy, spend allocation, bidding).
- No A/B testing of any asset.
- No individual registrant/attendee records — pacing data is aggregate counts only (`date` + `cumulativeRegistrations`), never a per-person list. That's reserved for a future, separate tool.
- No brand-voice/tone configuration UI in this session (the `toneKey` parameter exists in the template functions for future use, but only one tone ships — no settings screen for it).
- No LLM/AI API call, no API key input/storage, anywhere in this session.
- No new charting library dependency unless you judge it clearly faster/safer than a hand-rolled SVG — the required baseline is the simple inline SVG + table.
- No changes to `EventBrief`'s type, `packages/schema/src/event-brief.ts`, or `CURRENT_SCHEMA_VERSION`. This tool is a pure reader of the brief.
- No multi-language/localized copy.
- No custom pacing-curve editor (only the Backloaded/Linear toggle) — a full custom-checkpoint editor is future scope.

## 10. Suggested Build Order

1. **`packages/schema/src/promo-kit.ts`** — types + constants (§4). Export from `packages/schema/src/index.ts`.
2. **`packages/schema/src/promo-kit-templates.ts`** — the pure `generateAssetSet(brief)` function. Write this against a couple of the existing PRD 1 fixture briefs (`event-toolkit/fixtures/*.json`) as manual test input before touching any UI — confirm output for an in-person conference brief and a virtual webinar brief both look right and branch correctly on `format.deliveryMode`.
3. **`packages/local-store`** — object stores + `promoKitRepository.ts` + `pacingRepository.ts`, including the pacing-curve math (checkpoint interpolation) and CSV parsing/validation. Test in isolation before wiring to UI, same discipline as PRD 1.
4. **Promo Kit home + generation flow** (`/promo/kit`, generate action, required-field guard).
5. **Kit view**: sections, asset cards, inline edit + edit-distance computation + autosave.
6. **Staleness detection + Regenerate flow**, including the per-asset skip/override logic — this is the trickiest correctness area, budget real test time here.
7. **Export**: "Copy to clipboard" per asset, "Copy all" Markdown bulk export.
8. **Pacing tracker**: entry form, CSV import + validation, curve computation + style toggle, status badge, chart/table visualization.
9. **Recommended Interventions panel**, linked back into Kit view assets.
10. **Wire the live "Launch Promo Campaign Kit" link** from the Brief View, replacing PRD 1's disabled stub.
11. **Polish & QA pass** against the Acceptance Criteria in §8 — two-brief isolation check, offline check, cross-browser console-error check.

Build the schema/template layer and local-store layer solidly before touching UI, same discipline PRD 1 used — the generation and pacing-math logic is the part of this tool that actually needs to be correct; the UI is comparatively straightforward CRUD-over-local-storage that the suite already has a working pattern for.
