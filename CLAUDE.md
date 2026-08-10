# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

The **Event Planner Productivity Suite** — a 7-tool product for corporate/field marketing event
planners, delivered as **two parallel implementations of the same spec**:

| Layer | Location | What it is |
|---|---|---|
| Specs | `prd/`, `schema/` | 7 PRDs, each with a self-contained `HANDOFF.md`, plus the canonical Event Brief schema |
| Conversational | `skills/*.skill` | 7 installable Claude Skills — the suite usable today, no app required |
| Coded | `event-planner-app/` | Next.js monorepo implementing the same 7 tools as routes |

Both implementations deliberately share **one identical `EventBrief` schema**, so a brief built
conversationally with the skills imports into the web app and vice versa. Changing the shape of
the brief in one layer without the other silently breaks that promise.

**`event-planner-app/CLAUDE.md` is the authority for anything inside the app** — architecture
rules, per-tool build procedure, schema versioning policy. Read it before touching app code. This
file covers only what spans the whole repo.

## Working in the app

All app commands run from `event-planner-app/`:

```bash
pnpm install
pnpm dev            # localhost:3000, redirects to /brief
pnpm verify         # typecheck + lint + fixtures + sanity + store-check + promo-check + build
pnpm promo-check    # PRD 2 logic only — fastest loop when changing generation/pacing
pnpm store-check    # PRD 1 persistence only
```

There is no test framework. Each tool's logic is covered by one headless `scripts/*-check.ts`
script run through `tsx` against `fake-indexeddb`, using a hand-rolled `check(label, condition)`
helper that exits non-zero on failure. **A new tool adds its own `scripts/<tool>-check.ts` and
appends it to the `verify` chain in `package.json`** — that script, not the UI, is where the
tool's correctness is expected to live.

Browser-level coverage is `scripts/promo-e2e.py` (Playwright, Chromium + Firefox). It is
deliberately outside `pnpm verify` because CI installs neither Python nor browser binaries; run
it by hand when changing promo UI.

### pnpm is not installed globally on this machine

`corepack enable` fails with EACCES on `/usr/local/bin`. Two ways around it, no sudo needed:

```bash
corepack pnpm <cmd>                       # works directly, pins the version in packageManager
printf '#!/bin/sh\nexec corepack pnpm "$@"\n' > ~/.local/bin/pnpm && chmod +x ~/.local/bin/pnpm
```

The shim matters because `pnpm verify` chains nested `pnpm` calls that need it on `PATH`.

## The schema is duplicated in four places

`event-brief.schema.json` and `event-brief-schema.md` each exist as identical copies in:

- `schema/` — the delivered package copy
- `event-planner-app/docs/schema/` — the app's doc copy
- `event-planner-app/packages/schema/` (the `.md`) and `packages/schema/src/` (the `.json`)

**`packages/schema/src/event-brief.schema.json` is the one that actually executes** — it is what
`scripts/validate-fixtures.ts` loads via Ajv. Editing any single copy in isolation creates silent
drift. The whole `prd/` and `schema/` tree is likewise mirrored under `event-planner-app/docs/`.

When a PRD's text and the schema doc disagree about which tool owns which field, the schema doc's
"Confirmed PRD numbering" table wins.

## Build order (each tool reads real output shapes from the ones before it)

PRD 1 (done) → PRDs 2 (done), 3, 4 in parallel → PRD 5 → PRD 6 (needs 4+5) → PRD 7 (needs 3+4+6).
PRD 7 writes `carryForwardLessons`, which PRD 1 reads at intake — that is what closes the
lifecycle loop. Status lives in `event-planner-app/docs/ROADMAP.md`.

To build a tool, work from `prd/<NN-tool>/HANDOFF.md`: it is written to be self-contained, so it
does not require reading the PRD first, though the PRD carries the numbered FRs and acceptance
criteria worth checking against at the end.

## Standing product constraints

These come from the PRDs and are binding, not shortcuts to revisit:

- **Standalone-first.** No HubSpot/Marketo/Cvent/Splash integration, no backend, no auth, no
  database, no external LLM/AI API call anywhere. All data arrives via user input or CSV/XLSX
  import and persists locally (IndexedDB in the app, a JSON file for the skills).
- **Content generation is template interpolation, not AI.** If generated copy feels weak, the
  intended fix is better templates. Check the tool's "Non-Goals" before adding anything network-shaped.
- Every PRD resolves its own open questions as a decisive default flagged
  `Assumption — pending validation` (variance thresholds, attribution windows, scoring rubrics,
  retro timing, single-planner editing). They are meant to be revisited against real usage, not
  treated as settled research.

## The skills layer

Each `skills/*.skill` is a zip containing `SKILL.md` plus `references/`, `assets/`, `scripts/`.
They read and write `event-brief-data.json` in the planner's current folder, using the same schema
as the app. Skill 7 also writes `~/.event-toolkit/lessons-library.json`, a fixed cross-event path
that Skill 1 reads at intake — that is how lessons carry between events living in different
folders. Editing a skill means unzipping, changing, and rezipping with the same internal layout.

## Repo hygiene

`*.zip` and `*.tar.gz` are gitignored: they are the delivery archives, and their contents are
already extracted and tracked. Do not re-extract them over the working tree — the tarball is a
snapshot of PRD 1 only and will silently revert later work. `cowork-project-instructions.md`
records the project's cross-session context, including that repo creation must happen locally.
