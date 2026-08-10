This project ("event toolkit") is the Event Planner Productivity Suite — a standalone, local-first web app suite for corporate/field marketing event planners (conferences, webinars, trade shows), covering the full event lifecycle. It's a suite with one shared data model, not seven disconnected tools: everything hangs off a single "Event Brief" schema.

**What's already in this folder:**
- `event-toolkit-full-package.zip` — all 7 PRDs (full spec + a self-contained Claude Code HANDOFF.md per tool) and the canonical Event Brief schema (`schema/event-brief-schema.md` + `.json`).
- `skills/*.skill` — 7 installable Claude Skills, one per PRD, that run each tool's core workflow conversationally (no coded app needed). They share one data file, `event-brief-data.json`, using the exact same schema as the coded app. Skill 7 (Post-Mortem) writes lessons learned to `~/.event-toolkit/lessons-library.json`, which Skill 1 (Event Brief Generator) reads at intake — that's how the lifecycle loop closes across events.
- `event-planner-app-repo.tar.gz` — the actual coded web app (Next.js monorepo) implementing PRD 1 (Event Brief Generator). Built, tested, and committed to git locally. Has its own `CLAUDE.md` inside with full build rules — read that before touching the code.

**Suite build order:** PRD 1 (done) → PRDs 2–4 (Promo Kit, Logistics Pack, Budget Builder — parallel, launch tier) → PRD 5 (Lead Triage) → PRD 6 (ROI Report, needs 4+5) → PRD 7 (Post-Mortem, needs 3+4+6, closes the loop back into PRD 1).

**Standing decisions — don't re-litigate these without a good reason:**
- Standalone-first: no HubSpot/Marketo/Cvent/Splash integration in v1. All data via user input or CSV/XLSX import.
- One Next.js app, all 7 tools as routes, one shared `EventBrief` schema (`packages/schema`), local-first via IndexedDB, no backend/auth/database in v1.
- Every PRD's open questions (variance thresholds, attribution windows, scoring rubric, retro timing, single-planner editing) are resolved as decisive defaults flagged "Assumption — pending validation," not left blocking.

**A real constraint discovered the hard way:** this Cowork sandbox cannot create GitHub repos or push to new remotes — its network proxy only allows GitHub API calls scoped to already-configured repos, regardless of what credential is used (tested with both the platform token and a real user PAT). Any GitHub repo creation/push has to happen from Shane's own machine, not from inside a Cowork session. Package and deliver code as a tarball/zip instead, with exact `git remote add` / `push` commands for him to run locally.

**Next likely steps:** push `event-planner-app-repo.tar.gz`'s contents to GitHub (Shane does this locally), then build PRDs 2–4 the same way PRD 1 was built (spawn a coding agent per HANDOFF.md, verify with `pnpm verify`, commit).
