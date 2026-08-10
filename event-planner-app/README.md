# Event Planner Productivity Suite

A standalone, local-first web app suite for corporate/field marketing event planners — conferences, webinars, trade shows — covering the full event lifecycle. Built as a single Next.js monorepo where every tool shares one canonical **Event Brief** data model.

This repo currently implements **PRD 1: Event Brief Generator** — a guided intake flow that turns a blank page into a structured, editable, exportable Event Brief (objectives, audience, budget shell, dates, format, stakeholder RACI, success metrics, risk register, timeline). Six more tools (Promo Campaign Kit, Logistics Pack, Budget Builder, Lead Triage, ROI Report, Post-Mortem) are fully spec'd — see `docs/prd/` — and get added as new routes in `apps/web` without touching this foundation.

## Why this architecture

- **Standalone-first, v1.** No CRM/martech/event-platform integrations (HubSpot, Marketo, Cvent, Splash). All data enters via user input or CSV/XLSX import. The data model is designed so integrations can be added later without a rework.
- **One app, one schema.** All 7 tools live as routes inside a single Next.js app (`apps/web`) and read/write one versioned `EventBrief` object (`packages/schema`) — not seven disconnected utilities.
- **Local-first persistence.** IndexedDB via `packages/local-store`, no backend/auth/database in v1. `packages/local-store` is the one seam a future sync backend would slot into.

## Getting started

```bash
pnpm install
pnpm dev        # starts apps/web on http://localhost:3000
```

```bash
pnpm build      # production build, all packages
pnpm typecheck  # tsc --noEmit across the workspace
pnpm lint       # eslint
pnpm verify     # fixture validation + sanity script + local-store repository check
```

Open `http://localhost:3000` — it redirects to `/brief`, the Event Brief Generator.

## Repo layout

```
apps/web/            the single deployable Next.js app — every tool is a route under app/(tools)/
packages/schema/      canonical EventBrief TypeScript types, JSON Schema, presets, migrations — zero React dependency
packages/local-store/ IndexedDB repository (briefs, intake progress, usage log) — the only place IndexedDB is touched
packages/ui/          shared UI primitives (Button, Card, Table, Badge, Form, ProgressBar)
fixtures/             example EventBrief JSON documents used by the verification scripts
docs/prd/             the full PRD + Claude Code handoff brief for every tool in the suite (1 built, 6 upcoming)
docs/schema/          the canonical Event Brief schema reference (source of truth for packages/schema)
```

## Roadmap

See `docs/ROADMAP.md` and the individual PRDs in `docs/prd/`. Build order: PRD 1 (this repo, done) → PRDs 2–4 (Promo Kit, Logistics Pack, Budget Builder — can build in parallel) → PRD 5 (Lead Triage) → PRD 6 (ROI Report, needs 4+5) → PRD 7 (Post-Mortem, needs 3+4+6, closes the lifecycle loop back into PRD 1's intake).

## Contributing

See `CONTRIBUTING.md`.
