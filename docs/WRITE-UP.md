# Project Write-Up: Event Planner Productivity Suite

**Repo:** https://github.com/shanelabountyai/event-toolkit
**Live demo:** https://event-toolkit.vercel.app — click **"Load a demo event"**
**Built with:** Claude Code + Next.js 15 · TypeScript · Tailwind · IndexedDB · Postgres (Drizzle) · Auth.js · Vercel · Neon
**Status:** Shipped 14 Aug 2026 · Last synced: 14 Aug 2026

---

## The Business Problem

A corporate field-marketing team runs 20–40 events a year — conferences, webinars, trade-show
booths — and every one is planned across a pile of disconnected spreadsheets. The event brief lives
in a doc, the budget in Excel, the run of show in another sheet, the badge-scan export in a CSV
nobody dedupes, and the post-mortem in someone's notebook if it happens at all.

The cost is not the admin. It is that **nothing learned at one event reaches the next one**. The
same venue overcharges twice. The same AV failure happens three times. And when the CFO asks what
the $145,000 booth returned, the answer is assembled by hand, differently each time, by whoever is
free.

## What I Built

- Planners write one **event brief** and every other tool reads from it — no re-entering dates,
  venues, stakeholders or budgets
- **Promo campaign kit** generates 18 assets (emails, social, landing page, sales outreach) from
  the brief, and remembers which ones you edited so regenerating never destroys your work
- **Logistics pack** — run of show, staffing, shipping, checklist, contacts, issue log — printable
  for the venue floor, and a read-only link you can text to an AV tech without giving them an account
- **Budget tracker** flags variance as actuals arrive, and rolls up into the ROI report automatically
- **Lead triage** imports badge scans, finds duplicates without ever auto-merging an ambiguous
  pair, scores and routes them
- **ROI report** attributes pipeline, scores the event across five dimensions, and states plainly
  how much of the headline number is a choice about the attribution window
- **Post-mortem** turns the issue log, budget variances and ROI scorecard into candidate lessons —
  and writes the ones you keep into the *next* event's intake. That loop closing is the point of
  the whole product.

Everything works with **no account and no network**. Signing in adds a shared workspace, roles and
cross-device sync without changing how any tool behaves.

## How It's Built

A pnpm monorepo: one Next.js app where each tool is a route group, and twelve packages holding the
domain logic with zero React dependency. `packages/local-store` is the only file that touches
IndexedDB — written from the first commit as the seam a backend would later slot into, which is
exactly what happened: when the hosted tier arrived, **not one file under `app/(tools)/` changed.**

The same `EventBrief` document is also implemented as seven installable Claude Skills, so a brief
built by talking to Claude imports into the web app and back.

**Key design decisions**

| Decision | Alternative considered | Why I chose it |
|---|---|---|
| Ambiguity is always surfaced, never auto-resolved | Auto-merge duplicates, auto-pick sync winners | Auto-resolving is less code in all four places it appears. It is also how an afternoon's work disappears with nobody aware it happened |
| Tenancy in an envelope (`records` table), never in the document | Add `workspaceId` to `EventBrief` | The schema is shared with seven `.skill` packages that have no concept of a workspace. Tenancy in the document forks the two implementations |
| `LogisticsPack` syncs at sub-document granularity | Record-level optimistic concurrency | It is the only genuinely multi-user document — on event day three people edit it at once. Record-level locking makes the highest-value scenario the most broken one |
| Database sessions, not JWTs | Stateless tokens | Removing a member must revoke access *now*. A JWT cannot be revoked before it expires, so "removed" would have meant "removed within 30 days" |
| Personal data described once in a registry | Hand-written traversal per tool | Search, export, erasure and log redaction are four operations over the same description. Seven hand-written traversals means missing one, and the one missed survives every deletion request |
| Test against PGlite (Postgres in WASM) | Mock the database | A mock agrees with whatever the code does, which is the thing under test. PGlite runs the real migration in CI with nothing provisioned |
| Content generation is template interpolation | Call an LLM | Deliberate product constraint: no network calls to any model. If the copy is weak the fix is better templates — and that constraint is what made the failure below diagnosable |

## Skills Learned / Functions Unlocked

- **Offline-first sync with conflict classification** — an outbox in IndexedDB, optimistic
  concurrency on a server-assigned sequence, and a classifier that distinguishes a colleague's edit
  from your own second device. New to me end to end.
  [`packages/sync-engine/src/conflict.ts`](../event-planner-app/packages/sync-engine/src/conflict.ts)
- **Capability-based authorisation** — one `can()` function, five roles, and a truth table tested
  against a matrix transcribed by hand from the spec rather than derived from the implementation
  (deriving it would make the test agree by construction and prove nothing).
  [`packages/access/`](../event-planner-app/packages/access/src/can.ts) ·
  [`scripts/access-check.ts`](../event-planner-app/scripts/access-check.ts)
- **Data-protection engineering** — subject search, export, hard deletion with per-record erase
  strategies, retention purge, and log redaction, all driven from one registry, with a build check
  that fails if a new data kind is added without being described.
  [`packages/pii-registry/`](../event-planner-app/packages/pii-registry/src/registry.ts)
- **Design tokens and a real dark mode** — a palette layer and a semantic layer, so the dark theme
  is ten redefined values rather than a second copy of every component; plus contrast measured by
  script in both themes rather than eyeballed.
  [`apps/web/app/tokens.css`](../event-planner-app/apps/web/app/tokens.css) ·
  [`scripts/a11y-e2e.py`](../event-planner-app/scripts/a11y-e2e.py)
- **Agent-driven product validation** — using an agent as a *practitioner* rather than a test
  script, which found a class of defect no assertion I had written could catch. See below.

## The Hardest Bug

**I shipped a dark mode that was invisible, then wrote a test that told me it was fine.**

I added design tokens with a full dark theme, wired up a theme toggle defaulting to "follow your
OS", verified the build passed, and shipped it to a branch. What I had missed is that the token
system was being bypassed 174:1 — 1216 raw `slate-*` classes against 7 semantic ones — and the
shared primitives contained no token at all. So the *canvas* flipped to near-black and the *text*
stayed near-black with it. Page headings measured **1.05:1**. On a Mac with system dark mode you
got white cards floating on black with invisible headings, having chosen nothing.

A design audit caught it. Fine — I migrated all six primitives and swept 1215 classes. Then I wrote
a Playwright script to measure every text node in both themes so it could never regress.

**The script said light mode had 201 failures and dark mode was perfect.**

That is not a plausible shape for a bug. A theme is not uniformly broken in one mode and flawless
in the other, and 201 failures all reporting *exactly* 1.23:1 is a constant, not a measurement.
Constants mean the input is constant — so the thing varying (the background) was not varying.

It wasn't. My code walked up the DOM looking for the first non-transparent background:

```js
let bg = 'rgba(0,0,0,0)';
while (node && bg === 'rgba(0, 0, 0, 0)') { ... }   // note the spaces
```

The initial literal has no spaces; `getComputedStyle` returns them. The strings never matched, the
loop never ran, and every element was compared against black. Dark text on assumed-black failed
everything; light text on assumed-black passed everything. **My verification tool reported dark mode
as passing while it was broken** — the exact failure I had written it to prevent.

Fixed, it found two real problems I would never have caught by eye: `--color-text-subtle` failing
at 4.31:1 in light *and* 3.73:1 in dark (near-misses that still fail), and primary buttons at
4.47:1 — short by 0.03 — because I had treated the accent *fill* and accent *text* as one value
when they have opposite contrast requirements.

**What I'd instrument next time:** assert the shape of the result, not just the threshold. A check
that every measured value is identical, or that one whole mode passes while another wholly fails,
should fail loudly as implausible. A green check from a broken checker is worse than no check,
because it stops you looking.

## What I'd Do Differently

- **Validate the output, not just the behaviour, from day one.** Sixteen check scripts and a full
  browser suite all passed while the promo generator produced 18 unsendable assets — it was
  rendering internal revenue targets as customer-facing copy ("I thought of you because *capture 60
  qualified leads and influence $900K of pipeline*"). Every individual piece was correct; the whole
  was wrong. An agent running the product as a planner found it in one pass. I would run that on
  day one now, not after building the platform tier on top.
- **Build the intake field before the thing that consumes it.** I added the schema and templates for
  attendee-facing copy and shipped without the UI to collect it, so the generator emitted
  placeholders and nobody could fix it. Half-finished was worse than not started.
- **Don't build a platform tier on unvalidated defaults.** Auth, sync and data protection are solid
  work, but they sit on top of variance thresholds, lead-scoring weights and attribution windows
  that are still guesses. More machinery on guesses compounds risk rather than reducing it.

## By the Numbers

| | |
|---|---|
| Application + package code | **42,897** lines TS/TSX |
| Test code | 5,841 lines (16 headless check scripts, **1,079 assertions**) + 958 lines of Playwright |
| Specification written before code | 6,022 lines across 10 PRDs |
| Packages | 12, each with zero React dependency except `ui` |
| Routes / API endpoints | 51 pages · 6 API routes |
| Data stores | 25 IndexedDB object stores · 11 Postgres tables |
| Delivery formats | 1 web app + 7 installable Claude Skills, one shared schema |
| Calendar time | 5 days (10–14 Aug 2026), 41 commits |
| Contrast compliance | WCAG AA in both themes, measured across 238 text nodes |
| Events actually run through it | **2** — which is why every default still says *"Assumption — pending validation"* |

---

*Part of my Claude Code build log.*
