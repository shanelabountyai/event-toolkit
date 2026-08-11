# CLAUDE.md

Instructions for Claude Code (or any agent) working in this repo. Read this before making changes.

## What this is

The **Event Planner Productivity Suite** — a standalone, local-first web app for corporate/field marketing event planners (conferences, webinars, trade shows). One Next.js monorepo, one shared `EventBrief` data schema, seven tools as routes in a single app. Full product context: `docs/SUITE-OVERVIEW.md`. Per-tool specs: `docs/prd/<tool>/PRD.md` + `HANDOFF.md`.

**Current state:** PRD 1 (Event Brief Generator) is built and working — guided intake, brief generation/edit, IndexedDB persistence, Markdown/HTML export, completeness indicator, carry-forward lessons, usage log. PRD 2 (Promo Campaign Kit) is built — 18-asset template generation, edit tracking, regenerate-with-skip, and the registration pacing tracker, at `/promo/kit` and `/promo/pacing`. PRD 3 (Logistics Pack) is built — run of show, staffing, shipping, checklist, contacts, issue log and print routes under `/logistics`, backed by the new `packages/logistics`. PRD 4 (Budget Builder) is built — line-item budgets with variance flagging, reforecast prompts, spreadsheet import/export and the actuals roll-up, under `/budget`, backed by `packages/budget-calc`. PRD 5 (Lead Triage) is built — import, dedupe, scoring, routing, follow-up drafts and per-owner export under `/leads`, backed by `packages/lead-triage-core`. PRD 6 (ROI Report) is built — attribution, cost per outcome, scorecard, YoY and report export under `/roi`, backed by `packages/roi-report-core`. PRD 7 (Post-Mortem) is built — candidate lessons from the issue log, budget and ROI scorecard, a repeat/fix/drop workspace, and the idempotent carry-forward write-back that closes the loop back into PRD 1's intake, under `/retro`, backed by `packages/postmortem-core`. **All seven PRDs are now built.**

## Non-negotiable architecture rules

1. **One app, one schema.** Every tool is a new route under `apps/web/app/(tools)/`, not a new Next.js app. Every tool reads/writes the shared `EventBrief` object from `packages/schema` — never invent a parallel brief-level data model. Tool-specific data (e.g. a budget's line items, a promo kit's generated assets) lives in its own sibling type/package, not crammed into `EventBrief`.
2. **`packages/schema` has zero React/Next dependency.** Pure TypeScript types, JSON Schema, presets, factory functions, migrations. Any future tool package can depend on it without pulling in UI framework code.
3. **`packages/local-store` is the only place IndexedDB is touched.** Keep its repository interface clean (`getBrief`, `listBriefs`, `saveBrief`, `deleteBrief`, `queryLessons`, ...) — it's the deliberate seam a future backend/sync layer replaces without touching any tool's UI code.
4. **v1 has no backend; v2 adds one beside it, never in place of it.** PRDs 1-7 are standalone-first and that is binding for them — check a tool's "Non-Goals" before adding server code to a v1 path. PRDs 8-10 (`prd/08-accounts-workspaces`, `09-hosted-sync`, `10-data-protection`) lift the constraint for the hosted tier only. **Local-only mode stays a real product**: no account, no network, no permission checks, and `workspace-store-check` proves the guard is inert there rather than merely permissive.
5. **One permission function.** `can()` in `packages/access` is the only place an access question is answered. No route handler, repository or component writes its own role check. A wrong number in a budget is a bug; a wrong answer from `can()` is an attendee data leak.
6. **Personal data is described in `PII_REGISTRY`, not traversed by hand.** Subject search, export, deletion and log redaction are all built on that one description. `pii-check` fails the build if a sync kind appears in neither the registry nor the explicit `NO_PII` allowlist — a new tool that forgets to register would otherwise ship a category of personal data invisible to every privacy operation.
7. **Schema changes are additive by default.** (Done once, at 1.1.0, for PRD 7's `LessonLearned.disposition`/`sourceType` — follow that commit as the worked example.) Adding an optional field = MINOR version bump, update `docs/schema/event-brief-schema.md` + `packages/schema/src/event-brief.schema.json` + the TS types together, add a `CHANGELOG.md` entry. Renaming/removing a field, changing a type, or making an optional field required = MAJOR bump, requires a migration function in `packages/schema/src/migrations/`. Never break `migrateBrief()`'s ability to load an older brief.
8. **Read the tool's PRD + HANDOFF before building it.** `docs/prd/<tool>/PRD.md` is the full spec (problem, user stories, numbered FRs, data model, UX flow, acceptance criteria). `docs/prd/<tool>/HANDOFF.md` is written to be self-contained — paste it into a fresh session and it has everything needed to start building that tool without reading the PRD first.

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
pnpm budget-check # PRD 4 variance formula, reconciliation, reforecast, import/export, roll-up
pnpm leads-check  # PRD 5 dedupe, scoring, templates, assignment, export, brief-read-only
pnpm roi-check    # PRD 6 attribution windows, NPS, cost math, scorecard bands, YoY, rendering
pnpm retro-check  # PRD 7 candidate rules, carry-forward idempotency, and PRD 1's read path
pnpm calibration-check # the calibration read-out: sample gating and no-overclaim rules
pnpm access-check      # v2: the full role x capability truth table, including the negatives
pnpm db-schema-check   # v2: the generated migration SQL says what PRD 8 requires
pnpm workspace-store-check # v2: workspace namespacing, the permission guard, outbox, migration preview
pnpm sync-check        # v2: the conflict table, LogisticsPack explode/reassemble, disjoint edits
pnpm pii-check         # v2: registry completeness, subject search/export/erase, log redaction
pnpm server-db-check   # v2: the hosted tier against a real Postgres (PGlite, nothing to provision)
```

**The hosted tier needs no database to develop against.** `packages/server-db` generates its
migration offline with `drizzle-kit generate`, and `server-db-check` applies that migration to
PGlite — Postgres compiled to WebAssembly — in process. So `pnpm verify` exercises the real
schema and the real queries on a laptop and in CI with nothing provisioned. Production uses
postgres.js against a real server; `packages/server-db/src/testing.ts` is imported only by check
scripts.

Browser-level coverage (Playwright, Chromium and Firefox), none of it part of `pnpm verify`
because CI installs neither Python nor browser binaries.

**One-time setup**, because the system Python has no Playwright and Homebrew's is
externally managed:

```bash
pnpm e2e:setup     # creates .venv (gitignored, ~150MB) and downloads chromium + firefox
```

Then, with `pnpm dev` running:

```bash
pnpm e2e             # all 7 tools: routes, empty states, console errors
pnpm e2e:promo       # PRD 2 in depth
pnpm e2e:logistics   # PRD 3 in depth, incl. the §5 propagation check
```

These scripts existed for a long time in a state where nobody could run them — the invocation in
this file was `python scripts/...`, which fails on a machine whose `python3` has no Playwright.
That is why they went unrun. Playwright 1.62 does have wheels for Python 3.14.

`suite-e2e.py` is the one to run after any cross-cutting change — it is breadth-first and
catches what the headless checks cannot: a route that throws on mount, a missing Suspense
boundary, a component that crashes on an empty state.

`pnpm verify` is what CI runs on every push/PR — if it fails locally it will fail in CI.

The workflow lives at the **repository root** (`../.github/workflows/ci.yml`), not in this
directory, and runs with `working-directory: event-planner-app`. GitHub only reads workflows
from the repo root; a copy inside `event-planner-app/.github/` is silently ignored, which is
how this repo went nine commits with CI that had never once executed.

## Repo map

```
apps/web/             the one deployable Next.js app; each tool = a route under app/(tools)/
packages/schema/       canonical EventBrief types + JSON Schema + presets + migrations (zero React)
packages/local-store/  IndexedDB repository — the only file(s) that import `idb`
packages/logistics/    PRD 3 domain types + selectors (zero React), the propagation model
packages/budget-calc/  PRD 4 variance, presets, reforecast + computeBudgetActualsSummary (PRD 6's seam)
packages/lead-triage-core/ PRD 5 CSV parse, dedupe, scoring, templates, assignment, export
packages/roi-report-core/  PRD 6 attribution, costs, NPS, scorecard, YoY, report rendering
packages/postmortem-core/  PRD 7 candidate lessons, retro prompt, carry-forward write-back
packages/ui/           shared primitives (Button, Card, Table, Badge, Form, ProgressBar)
packages/access/       v2 PRD 8: roles, capabilities, the single can(). Pure, no DB, no React
packages/server-db/    v2 PRD 8-10: Drizzle schema, workspaces, records, privacy. The only Postgres
packages/sync-engine/  v2 PRD 9: sync kinds, LogisticsPack explode/reassemble, conflict classifier
packages/pii-registry/ v2 PRD 10: where personal data lives, as data. Search, export, erase
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

## The spreadsheet dependency

`xlsx` is installed from SheetJS's own CDN tarball, **not** from npm — the npm-published
0.18.5 is abandoned and carries two unpatched high-severity advisories (prototype pollution,
ReDoS), and this code path parses files a planner was handed by a vendor. Keep the CDN pin
when upgrading. It is imported dynamically in `apps/web/lib/budget-file.ts` so its ~160kB
stays off the budget page's first load.

## Validating the documented assumptions

`/calibration` reads what the suite has actually recorded and reports what it says about each
default — dedupe threshold, lead tiers, variance bands, reforecast sensitivity, attribution
window, scorecard coverage, NPS sample rule, retro timing. Logic lives in
`apps/web/lib/calibration.ts` as pure functions, so `pnpm calibration-check` can test it; the
page must be in-app rather than a script because the real data is in the planner's browser
IndexedDB, which Node cannot reach.

Three rules that file follows, and any new finding must too:
1. Never conclude below a stated minimum sample — "not enough data yet" is the honest and most
   common answer.
2. Separate evidence (facts) from suggestion (a prompt to think, never an instruction).
3. Never claim to validate causality. The attribution window in particular can only be
   *characterised* — `attributionSensitivity` shows how far the headline number moves across
   plausible windows, and the finding never returns "supports".

## Things every PRD's "Open Questions" section documents as an assumption, not a validated decision

Variance-flag thresholds, attribution windows, lead-scoring rubric weights, retro-trigger timing, single-planner (no real-time collaboration) editing, and a few others are all decisive defaults made without real planner interviews — see each PRD's "Open Questions" section, flagged `Assumption — pending validation`. Don't treat them as immovable; they're meant to be revisited once the launch tier has real usage.
