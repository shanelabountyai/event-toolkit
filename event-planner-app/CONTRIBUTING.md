# Contributing

## Setup

```bash
pnpm install
pnpm dev
```

Requires Node 22+ and pnpm 9+ (`corepack enable` will get you the right pnpm version).

## Before opening a PR

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm verify
```

All four must pass — this is exactly what CI runs on every push and PR (`.github/workflows/ci.yml`).

## Project rules (binding — see `docs/schema/event-brief-schema.md` and each tool's PRD for the full rationale)

1. **One app, one schema.** New tools are new routes under `apps/web/app/(tools)/`, not new Next.js apps. Every tool reads/writes the shared `EventBrief` object from `packages/schema` — do not invent a parallel data model for brief-level data.
2. **`packages/schema` has zero React/Next dependency.** Pure types, JSON Schema, presets, factory functions, migrations.
3. **`packages/local-store` is the only place IndexedDB is touched.** It's the seam a future backend sync layer replaces — keep its interface clean (`getBrief`, `listBriefs`, `saveBrief`, `deleteBrief`, `queryLessons`, ...).
4. **No backend, no database, no auth, no CRM/martech integration in v1.** This is a binding architecture constraint from the suite's PRDs, not a temporary shortcut — see each PRD's "Non-Goals" section before adding one.
5. **Schema changes are additive (MINOR) by default.** Adding a required field or changing a type is a MAJOR schema bump and requires a migration in `packages/schema/src/migrations/`. See the versioning policy in `docs/schema/event-brief-schema.md`.
6. **Read the tool's PRD and HANDOFF before building it.** `docs/prd/<tool>/PRD.md` is the full spec; `docs/prd/<tool>/HANDOFF.md` is written to be pasted into a fresh Claude Code session and is usually the fastest way to get full context on scope, data model, and acceptance criteria.

## Commit messages

Conventional commits are appreciated but not enforced: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
