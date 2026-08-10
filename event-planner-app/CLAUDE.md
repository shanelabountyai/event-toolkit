# CLAUDE.md

Instructions for Claude Code (or any agent) working in this repo. Read this before making changes.

## What this is

The **Event Planner Productivity Suite** — a standalone, local-first web app for corporate/field marketing event planners (conferences, webinars, trade shows). One Next.js monorepo, one shared `EventBrief` data schema, seven tools as routes in a single app. Full product context: `docs/SUITE-OVERVIEW.md`. Per-tool specs: `docs/prd/<tool>/PRD.md` + `HANDOFF.md`.

**Current state:** PRD 1 (Event Brief Generator) is built and working — guided intake, brief generation/edit, IndexedDB persistence, Markdown/HTML export, completeness indicator, carry-forward lessons, usage log. PRD 2 (Promo Campaign Kit) is built — 18-asset template generation, edit tracking, regenerate-with-skip, and the registration pacing tracker, at `/promo/kit` and `/promo/pacing`. PRD 3 (Logistics Pack) is built — run of show, staffing, shipping, checklist, contacts, issue log and print routes under `/logistics`, backed by the new `packages/logistics`. PRDs 4–7 are fully spec'd in `docs/prd/` but not yet built.

## Non-negotiable architecture rules

1. **One app, one schema.** Every tool is a new route under `apps/web/app/(tools)/`, not a new Next.js app. Every tool reads/writes the shared `EventBrief` object from `packages/schema` — never invent a parallel brief-level data model. Tool-specific data (e.g. a budget's line items, a promo kit's generated assets) lives in its own sibling type/package, not crammed into `EventBrief`.
2. **`packages/schema` has zero React/Next dependency.** Pure TypeScript types, JSON Schema, presets, factory functions, migrations. Any future tool package can depend on it without pulling in UI framework code.
3. **`packages/local-store` is the only place IndexedDB is touched.** Keep its repository interface clean (`getBrief`, `listBriefs`, `saveBrief`, `deleteBrief`, `queryLessons`, ...) — it's the deliberate seam a future backend/sync layer replaces without touching any tool's UI code.
4. **No backend, no database, no auth, no CRM/martech integration in v1.** This is a binding constraint from the suite's PRDs (standalone-first), not a shortcut to fix later. Check a tool's PRD "Non-Goals" section before adding server code, an API route with persistence, or an OAuth button.
5. **Schema changes are additive by default.** Adding an optional field = MINOR version bump, update `docs/schema/event-brief-schema.md` + `packages/schema/src/event-brief.schema.json` + the TS types together, add a `CHANGELOG.md` entry. Renaming/removing a field, changing a type, or making an optional field required = MAJOR bump, requires a migration function in `packages/schema/src/migrations/`. Never break `migrateBrief()`'s ability to load an older brief.
6. **Read the tool's PRD + HANDOFF before building it.** `docs/prd/<tool>/PRD.md` is the full spec (problem, user stories, numbered FRs, data model, UX flow, acceptance criteria). `docs/prd/<tool>/HANDOFF.md` is written to be self-contained — paste it into a fresh session and it has everything needed to start building that tool without reading the PRD first.

## Commands

```bash
pnpm install
pnpm dev          # apps/web on http://localhost:3000, redirects to /brief
pnpm build        # production build, all packages
pnpm typecheck    # tsc --noEmit across the workspace
pnpm lint         # eslint
pnpm verify       # typecheck + lint + fixture validation + sanity + local-store + promo checks + build — run before every commit
pnpm store-check  # PRD 1 persistence behaviour, headless via fake-indexeddb
pnpm promo-check  # PRD 2 generation, edit-tracking, regenerate and pacing logic
pnpm logistics-check # PRD 3 seeding, propagation, conflicts, CSV and pack persistence
```

Browser-level end-to-end coverage lives in `scripts/promo-e2e.py` and `scripts/logistics-e2e.py`
(Playwright, Chromium and Firefox). It is not part of `pnpm verify` because it needs Python plus browser binaries — run
it manually against `pnpm dev` when changing the promo UI. See the header comment in that file.

`pnpm verify` is what CI (`.github/workflows/ci.yml`) runs on every push/PR — if it fails locally it will fail in CI.

## Repo map

```
apps/web/             the one deployable Next.js app; each tool = a route under app/(tools)/
packages/schema/       canonical EventBrief types + JSON Schema + presets + migrations (zero React)
packages/local-store/  IndexedDB repository — the only file(s) that import `idb`
packages/logistics/    PRD 3 domain types + selectors (zero React), the propagation model
packages/ui/           shared primitives (Button, Card, Table, Badge, Form, ProgressBar)
fixtures/              example EventBrief JSON docs, validated by `pnpm verify`
scripts/               make-fixtures, validate-fixtures, sanity-check, store-check
docs/prd/               PRD + HANDOFF per tool (source of truth for scope)
docs/schema/            canonical Event Brief schema reference (human-readable)
docs/ROADMAP.md         build order and status
```

## Build order for the remaining tools

PRD 1 (done) → PRD 2 (Promo Campaign Kit), PRD 3 (Logistics Pack), PRD 4 (Budget Builder) can be built in parallel, each only depending on PRD 1's schema → PRD 5 (Lead Triage) → PRD 6 (ROI Report, needs 4 + 5) → PRD 7 (Post-Mortem, needs 3 + 4 + 6, writes `carryForwardLessons` which PRD 1 reads at intake — this is what closes the lifecycle loop). Full rationale in `docs/ROADMAP.md`.

## When adding a new tool

1. Read that tool's `docs/prd/<NN-tool>/PRD.md` and `HANDOFF.md` in full.
2. Add a new route folder under `apps/web/app/(tools)/<tool>/`, following the pattern already established by `brief/` (list page, detail/edit page, `_components/`, `_hooks/`).
3. If the tool needs its own domain logic package (e.g. `packages/budget-calc`), create it following `packages/schema`'s shape: zero React dependency, its own `package.json`/`tsconfig.json`, exported via `workspace:*`.
4. Wire the "coming soon" link for that tool in `apps/web/lib/tools.ts` and `ToolLaunchLinks.tsx` to the new route.
5. Run `pnpm typecheck && pnpm lint && pnpm build && pnpm verify` before considering it done.
6. Update `docs/ROADMAP.md`'s checklist.

## Things every PRD's "Open Questions" section documents as an assumption, not a validated decision

Variance-flag thresholds, attribution windows, lead-scoring rubric weights, retro-trigger timing, single-planner (no real-time collaboration) editing, and a few others are all decisive defaults made without real planner interviews — see each PRD's "Open Questions" section, flagged `Assumption — pending validation`. Don't treat them as immovable; they're meant to be revisited once the launch tier has real usage.
