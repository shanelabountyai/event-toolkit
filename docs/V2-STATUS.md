# v2 platform tier — where PRDs 8, 9 and 10 stand

Last updated: 11 August 2026. **All three v2 PRDs are built.**

The seven tools (PRDs 1–7) are built and unchanged. This document covers the hosted tier:
accounts and workspaces (PRD 8), offline-first sync (PRD 9), and data protection (PRD 10).

## The short version

**Every piece of logic that can be verified without hosting is built and verified.** That is more
than expected, because `packages/server-db` runs its real migration against PGlite — Postgres
compiled to WebAssembly — inside `pnpm verify`. The permission model, the schema, the sync
classifier, the conflict rules, workspaces, invitations, member removal, the migration upload, push
and pull, subject search, subject deletion and retention all run against an actual Postgres with
nothing provisioned.

**What is left is the parts that need your accounts**: hosting, a database, an email sender, and
the UI that sits on top of the verified logic.

## Built and verified

| Piece | Package | Proven by |
|---|---|---|
| Roles, capabilities, the single `can()` | `packages/access` | `pnpm access-check` — all 90 role × capability pairs against a matrix transcribed by hand from the PRD |
| Hosted schema + migration | `packages/server-db` | `pnpm db-schema-check` — asserts constraints against the generated SQL |
| Workspaces, memberships, invitations | `packages/server-db` | `pnpm server-db-check` — real Postgres |
| Migration upload (FR-9) | `packages/server-db` | idempotency proven by running it twice |
| Sync push / pull, optimistic concurrency | `packages/server-db` | real Postgres, including the version check inside the `UPDATE` |
| Conflict classification, `LogisticsPack` sub-document sync | `packages/sync-engine` | `pnpm sync-check` — every row of PRD 9 §6 plus the disjoint-edit case |
| Workspace namespacing + the permission guard on IndexedDB | `packages/local-store` | `pnpm workspace-store-check` |
| The durable outbox (FR-2) | `packages/local-store` | survives dropping the connection |
| Migration preview (FR-9) | `packages/local-store` | reads the pre-account database even while signed in |
| PII registry, subject search / export / erase | `packages/pii-registry` | `pnpm pii-check` — completeness fails the build |
| Log redaction (FR-5) | `apps/web/lib/redact.ts` | `pnpm pii-check` |
| Subject search / export / deletion, retention purge | `packages/server-db` | `pnpm server-db-check` — real Postgres |

All fifteen check scripts run inside `pnpm verify`, which is what CI runs on every push.

**The seven existing tools are untouched.** `git diff` across this entire tier touches no file
under `apps/web/app/(tools)/`, and all seven original check scripts pass unchanged. That was PRD
8's stated acceptance bar for the persistence seam, and it held.

## Deployed

**https://event-toolkit.vercel.app** — the seven tools, live.

The GitHub repo is connected, so every push to `main` deploys. Root Directory is
`event-planner-app/apps/web`; Vercel looks for `next` in the package.json there, and this repo
keeps its Next app two levels down with `pnpm-workspace.yaml` in between.

`AUTH_SECRET` and `CRON_SECRET` are set as sensitive production variables, generated separately
from the local development ones in `.env.local`.

**The deployment is publicly reachable and has no sign-in.** That is currently harmless rather
than sloppy: every tool is client-side, and a visitor's data lives in their own browser's
IndexedDB. There is no server-side data to expose because there is not yet a server holding any.
That stops being true the moment PRD 8's auth ships, which is what gates it. If you want it
private before then, turn on Vercel Authentication in Project Settings → Deployment Protection.

## Blocked on you

Two signups, roughly ten minutes. Neither blocks further building — see the note below.

1. **A Postgres database.** [neon.tech](https://neon.tech) → new project → copy the *pooled*
   connection string. Gives `DATABASE_URL`. Neon over Vercel Postgres for the more generous free
   tier; it is the same Postgres either way.
2. **A Resend account with a verified sending domain**, for verification emails, magic links and
   invitations. Gives `AUTH_RESEND_KEY` and `EMAIL_FROM`. DNS verification is the slow part, so
   start it first if you want it the same day.

`.env.example` lists every variable by name. Nothing real is committed.

**Neither is required to keep building.** PGlite persists to disk, so local development can run
the whole hosted tier against a real Postgres with no account, and Auth.js can print magic links
to the terminal instead of sending them. That wiring is not done yet — it is the fastest next
step if you want to carry on before the signups.

## What gets built once those exist

In order, and each is thin because the logic underneath is already verified:

1. **Auth.js wiring** (`lib/auth.ts`) — credentials + magic link, database sessions, verification,
   reset. Database sessions rather than JWTs, because FR-7 requires that removing a member kills
   their access immediately and a stateless token cannot be revoked before it expires.
2. **API route handlers** — thin wrappers over `packages/server-db`, which already enforces
   `can()` at the seam. No handler writes its own permission check.
3. **UI** — sign-in and sign-up, workspace switcher, members and invitations, the migration
   preview screen, the read-only share view, subject search, retention settings.
4. **The sync loop** — drain the outbox, apply pulls, show the indicator, surface conflicts.
5. **Operations** (PRD 10 FR-7 to FR-9) — backups, PITR, environment separation, and the first
   restore rehearsal. An untested backup is not a backup.
6. **Documentation** (PRD 10 FR-10 to FR-12) — breach process, sub-processor register, privacy
   page, DPA. These need facts only you have: who is the accountable person for a breach, which
   sub-processors you have actually signed with.

## Decisions made while building, worth your eye

**Survey responses and pipeline contacts are gated by `leads`, not `roi`.** They are displayed by
the ROI report, but survey free text can contain anything — including opinions about named staff —
and a pipeline row carries a contact's name and email. PRD 8 FR-5 says `leads:view` gates *all*
attendee personal data and PRD 10 classifies both as third-party personal, so the capability
follows the data rather than the screen. A Finance user sees the ROI scorecard and its aggregates
and not the rows behind them. If you want Finance to see raw survey text, that is a deliberate
change to make, not an oversight to fix.

**One IndexedDB database per workspace**, rather than namespaced keys. Namespacing would mean
rewriting every key and index across twenty-two stores, and one missed index scan leaks another
workspace's data. Separate databases cannot leak by construction.

**One permission guard, not sixty.** Every `idb` method takes the store name first, so a proxy over
the database handle checks every read and write in one place. An `assertCan` at the top of each
repository function would have been sixty chances to forget one.

**PGlite in the test path.** Postgres in WebAssembly, so `pnpm verify` exercises the real schema
with nothing to provision. Production still uses postgres.js against a real server. If you would
rather CI ran against a real Postgres service container, that is a straightforward swap.

**Aggregates are not recomputed after a deletion request.** Lead counts and cost-per-lead contain
no personal data, and rewriting last quarter's ROI report to pretend somebody was never there is
theatre that also destroys the report. The deletion result says so in words the UI can show.

## One environment problem

Something syncing `~/Documents` — most likely iCloud Drive — copies files as `name 2.ext`. The
duplicates inside `apps/web/.next` break `tsc` with duplicate-identifier errors, which looks like
a code failure and is not. `.gitignore` now excludes the pattern, and `rm -rf apps/web/.next`
clears it, but it will recur. Excluding this folder from cloud sync would end it.
