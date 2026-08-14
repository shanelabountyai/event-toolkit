# Event Planner Productivity Suite

A seven-tool suite for corporate and field marketing event planners — event brief, promo campaign
kit, logistics pack, budget tracker, lead triage, ROI report, post-mortem — built twice from one
specification, sharing one data schema.

**Live:** https://event-toolkit.vercel.app · no account needed, everything stays in your browser.

---

## What makes it interesting

Most of what is worth looking at here is not the feature count.

### It refuses to guess on your behalf

The same decision recurs in four unrelated places, and it is the product's spine:

| Where | What it refuses to do |
|---|---|
| Lead dedupe | Auto-merge an ambiguous match — it shows both records and asks |
| Promo regeneration | Overwrite copy you edited — edits survive, with a revert |
| ROI write-back | Push metrics to the brief without per-metric confirmation |
| Sync conflicts | Pick a winner when two people edit the same thing |

Silently resolving ambiguity is how an afternoon's work disappears with nobody aware. Every one of
those is a place where auto-resolving would have been less code.

### It is honest about not knowing

Every default in the suite — variance thresholds, lead-scoring weights, attribution windows,
dedupe sensitivity, retro timing — shipped flagged `Assumption — pending validation`. Not as a
disclaimer, but as a mechanism: [`/calibration`](https://event-toolkit.vercel.app/calibration)
reads whatever real data exists and reports what it says about each one.

Today it says **"0 holding up · 0 worth revisiting · 9 waiting on data"**, because the honest
answer to "is this threshold right?" after two events is *we don't know yet*. It refuses to
conclude below a stated minimum sample, separates evidence from suggestion, and states its own
blind spots:

> **Duplicates you never caught.** Rejected pairs are visible; missed ones leave no trace. This
> page can tell you the threshold is too loose, never that it is too tight.

> This is not validation, and it cannot become validation. Which opportunities the event actually
> caused is not knowable from a spreadsheet of created dates.

### An agent found what the test suite could not

15 headless check scripts and a full browser suite all passed. Then an agent ran a complete event
through the product **as a practitioner rather than a tester** — inventing a real conference,
importing real CSVs, working the dedupe queue, reading the output as a planner would.

It found a category error nothing else could have: the promo generator was rendering *internal
objectives* as *customer-facing copy*. The generated sales email opened:

> "I thought of you because **capture 60 qualified leads and influence $900K of pipeline**…"

All 18 assets were unsendable. The tests verified the app *worked*; nothing verified its output was
*sane*. The root cause turned out to be a schema gap — the brief had no attendee-facing field at
all — which is why it survived review: every individual piece was correct.

That run also found the lead scorer ranking a hospitality events manager above the literal ICP at a
manufacturing conference, and a pacing view whose campaign window collapsed to zero days. Write-up
of the fixes is in the commit history.

### Two implementations, one schema

The suite exists as **seven installable Claude Skills** (conversational, no app) *and* as a
**Next.js app** — both reading and writing the identical `EventBrief` document. A brief built by
talking to Claude imports into the web app and back. The schema is duplicated in four places on
purpose, and `pnpm verify` fails if they drift.

### Testing without a database, then with one

There is no test framework — each tool's logic is covered by a headless script using a hand-rolled
`check(label, condition)`. The hosted tier tests against **PGlite**, Postgres compiled to
WebAssembly, so the real migration and real queries run in CI with nothing provisioned. Production
uses postgres.js against a real server.

The browser suites measure rather than assert: `pnpm a11y` checks every text node in both themes
against WCAG AA; `pnpm responsive` checks page overflow and nested scrollers at 375px and 1440px.
The first version of the contrast checker was itself wrong — it compared everything against black —
and reported dark mode as passing while it was broken. That is recorded in the commit that fixed it.

---

## Architecture

```
prd/                      10 PRDs, each with a standalone HANDOFF.md
schema/                   the canonical EventBrief schema (JSON Schema + prose)
skills/                   7 installable Claude Skills — the suite, conversationally
event-planner-app/        the Next.js monorepo
  apps/web/               one app; each tool is a route group
  packages/schema/        EventBrief types, JSON Schema, presets, migrations — zero React
  packages/local-store/   the only file that touches IndexedDB
  packages/access/        roles, capabilities, one can() — pure, no DB, no React
  packages/server-db/     Drizzle schema + the only place SQL is written
  packages/sync-engine/   conflict classification, sub-document sync
  packages/pii-registry/  where personal data lives, described as data
```

**Local-first by default.** Without an account nothing leaves the browser — IndexedDB, no server,
no sync. That is a supported way to work, not a trial. Signing in adds a workspace, roles and
cross-device sync without any tool changing: `packages/local-store` was written from the first
commit as the seam a backend would slot into, and when the hosted tier arrived it did, with no file
under `app/(tools)/` modified.

**Privacy is driven by one registry.** Subject search, export, erasure and log redaction are all
implemented once against `PII_REGISTRY`, and the build fails if a new data kind is added without
being described there — so a new tool cannot ship a category of personal data that is invisible to
every deletion request.

---

## Running it

```bash
cd event-planner-app
pnpm install
pnpm dev            # localhost:3000
pnpm verify         # typecheck, lint, fixtures, 15 check scripts, build
```

Browser suites need a one-time setup, because they are deliberately outside `verify` (CI has no
browsers):

```bash
pnpm e2e:setup      # venv + chromium/firefox
pnpm e2e            # all 7 tools: routes, empty states, console errors
pnpm a11y           # contrast, both themes, WCAG AA
pnpm responsive     # overflow at 375 and 1440
```

The hosted tier needs no database to develop against — `pnpm server-db-check` applies the real
migration to PGlite in process.

---

## Honest limitations

- **Nothing is validated.** Two events have been through it. `/calibration` needs n=3 to n=25
  depending on the finding. Every threshold is still a considered guess.
- **Content generation is template interpolation, not AI.** Deliberate — the product makes no
  network calls to any model. If generated copy is weak, the fix is better templates.
- **Known gaps from the event runs**, unfixed: budget import cannot map to existing line items,
  the run-of-show table re-sorts while you type, lead scoring has no negative signals or ICP
  weighting.
- **The hosted tier is built but young.** Auth, workspaces, roles, invitations, share links,
  offline-first sync and the data-subject tooling all work and are tested; none has carried a real
  team's event yet.
- The policy documents in `docs/policies/` are drafts with `[[MARKER]]`s where facts belong. They
  describe what the system actually does, which is the part an engineer can write honestly.

## Where to look first

- [`docs/FOR-PLANNERS.md`](docs/FOR-PLANNERS.md) — what this does and why a planner might use it,
  written for them rather than for engineers

- [`docs/V2-STATUS.md`](docs/V2-STATUS.md) — what is built, what is deployed, what is left
- [`prd/`](prd/) — the specifications, including the three that added the hosted tier
- `git log` — the reasoning, including the mistakes
