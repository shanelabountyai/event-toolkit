# Event Planner Productivity Suite — PRD + Skills Package

Prepared by: Product Owner (Claude)
Date: 2026-08-09
Status: Ready for build — launch tier can start immediately; fast-follow tier is spec'd and ready but should be built after launch tier ships.

## What's in here

```
schema/
  event-brief-schema.md      ← canonical, human-readable Event Brief schema (the shared data spine — read this first)
  event-brief.schema.json    ← same schema as machine-readable JSON Schema

prd/
  01-event-brief-generator/  ← PRD.md + HANDOFF.md   (LAUNCH — build first, scaffolds the whole monorepo)
  02-promo-campaign-kit/     ← PRD.md + HANDOFF.md   (LAUNCH)
  03-logistics-pack/         ← PRD.md + HANDOFF.md   (LAUNCH)
  04-budget-builder/         ← PRD.md + HANDOFF.md   (LAUNCH)
  05-lead-triage/            ← PRD.md + HANDOFF.md   (FAST-FOLLOW — build after launch tier)
  06-roi-report/             ← PRD.md + HANDOFF.md   (FAST-FOLLOW — depends on 04 + 05)
  07-post-mortem/            ← PRD.md + HANDOFF.md   (FAST-FOLLOW — depends on 03 + 04 + 06; closes the loop back into 01)

skills/                      ← installable Claude Skills — a "usable today" implementation of each PRD, no coded app required
  01-event-brief-generator.skill
  02-promo-campaign-kit.skill
  03-logistics-pack.skill
  04-budget-builder.skill
  05-lead-triage.skill
  06-roi-report.skill
  07-post-mortem.skill
```

Every PRD.md is the full product spec for that tool: problem, users, user stories, numbered P0 requirements, data model, UX flow, success metrics, risks, and a Definition of Done. Every HANDOFF.md is a **standalone kickoff brief** — paste it into a brand-new Claude Code session and it has everything needed to start building that tool immediately, without needing you to also paste the PRD.

## The skills — share these with event planners directly

Each `.skill` file is a self-contained Claude Skill implementing that PRD's P0 scope *conversationally* — an event planner installs it (open the file, click "Save skill") and just talks to Claude to run it; no app, no login, no build step. This is the fastest way to get the suite's thesis ("one Event Brief feeds every downstream tool") into planners' hands today, while the coded web app in `prd/` gets built.

All 7 skills read and write a shared `event-brief-data.json` file in the planner's current project folder, using the exact same schema as the coded app (`schema/event-brief.schema.json`) — so a brief built with the skill will be importable by the eventual web app, and vice versa. Start with **Skill 1** for any new event; it creates that file. Skills 2–6 read it (and in a couple of cases write narrow fields back to it — see the schema doc's ownership table). **Skill 7** closes the full lifecycle loop: it writes lessons learned both into that event's own brief and into a shared cross-event library at `~/.event-toolkit/lessons-library.json`, which Skill 1 automatically checks and surfaces from during the next event's intake — so lessons genuinely carry forward from one event to the next, even in a different project folder.

Every skill was smoke-tested end-to-end against synthetic event data before packaging (not just written — actually run) and gracefully degrades to Markdown/CSV output if the standard `docx`/`xlsx`/`pdf` skills aren't installed in a recipient's account.

## How to use this to start building

1. **Build PRD 1 first, by itself.** Its HANDOFF.md scaffolds the entire monorepo (Next.js + TypeScript + Tailwind, the `packages/schema` package, local-first IndexedDB persistence) that every other tool builds into. Nothing else can start until this exists.
2. **Then build PRDs 2, 3, and 4 in any order** (they can even be built in parallel, in separate Claude Code sessions against the same repo) — each only depends on PRD 1's schema and scaffold.
3. **Ship and use the launch tier for real events before starting the fast-follow tier.** The source brief for this suite explicitly recommends validating the launch tier with real planner use before locking in PRD 5–7 assumptions — several open questions in those PRDs (scoring rubrics, attribution definitions, retro timing) are documented defaults flagged "Assumption — pending validation," not confirmed decisions.
4. **Build PRD 5, then PRD 6 (needs 4 + 5), then PRD 7 (needs 3 + 4 + 6)** — in that order, since each fast-follow PRD reads real output shapes from the ones before it.

## One shared contract, one architecture

Every tool is a route inside a single Next.js monorepo (`apps/web`), not a separate app — this is what makes "one link to share with event planners" possible. All 7 tools read and (where relevant) write a single versioned `EventBrief` object defined once in `packages/schema` and documented in `schema/event-brief-schema.md`. That file's "Confirmed PRD numbering" table is the source of truth for which tool owns which field — if any individual PRD.md ever seems to disagree with it, the schema doc wins.

## Assumptions you should know about before building

Every PRD documents its own open questions with a decisive default and a `Assumption — pending validation` flag, rather than leaving anything unresolved (per your instruction, since we couldn't run the 3–5 planner interviews the original brief called for). The notable ones, in one place:

- **PRD 1** — single-planner editing in v1 (no real-time collaboration); a documented default, worth revisiting once you see whether events are ever co-planned live.
- **PRD 2** — no brand-voice configuration in v1 (deferred to v1.1); a single neutral-professional tone with a `toneKey` hook already threaded through so v1.1 doesn't require a rewrite.
- **PRD 3** — build order for the 5 logistics artifacts (run-of-show → staffing → contact sheet → shipping manifest → venue checklist) is a reasoned default, not validated against which one planners actually find most painful.
- **PRD 4** — variance-flag thresholds default to 10% amber / 20% red, overridable per line item.
- **PRD 5** — a starter lead-scoring rubric and a name+email+company fuzzy dedupe strategy, both editable.
- **PRD 6** — "sourced" (30-day window) vs. "influenced" (90-day window) pipeline attribution definitions, both configurable per org.
- **PRD 7** — retro-prompt timing (3 days after event end, escalating at 14) and an auto-suggested repeat/fix/drop rule table.

None of these block building — they're real, documented decisions you can ship on. Treat them as the first things to validate once planners are using the launch tier.
