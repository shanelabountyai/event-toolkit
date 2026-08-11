# PRD 9 — Hosted Sync & Offline-First Persistence

**Status:** Draft, ready for review
**Tier:** Platform (v2). Depends on PRD 8 (workspaces and permissions).
**Prepared:** 2026-08-11

---

## 0. The one thing this PRD must not break

The Run-of-Show & Logistics Pack (PRD 3) has a feature called "Flag an issue", deliberately
placed in the header of every artifact view. It exists to be used **on a convention centre
floor, on the day, while something is going wrong**. That is a place with famously bad wifi.

Today it always works, because there is no network in the path at all.

An architecture that puts a server between the planner and their own run of show trades a real,
in-use capability for an abstraction. So this is not "add a backend". It is: **keep the local
store as the thing the UI talks to, and sync it.** Every requirement below follows from that.

The good news is that the existing architecture was built for this. `packages/local-store` is
documented as *"the deliberate seam a future backend/sync layer replaces without touching any
tool's UI code."* This PRD is that layer, and the seam is the reason it can be built without
rewriting seven tools.

---

## 1. Problem

PRD 8 gives users accounts and workspaces. On its own that is a login screen in front of data
that still only exists in one browser. This PRD is what actually makes the data leave the
device — and come back to any other one — without giving up offline operation.

Three specific problems:

1. **No durability.** A cleared cache loses everything. There is no backup.
2. **No portability.** The same planner on a laptop and a phone has two disconnected datasets.
3. **No concurrency.** Two people editing the same event today would silently overwrite each
   other, if they could even see each other's data.

## 2. Users

Everyone in PRD 8's table, but the requirements are driven by two in particular:

| Role | The demand they place on this design |
|---|---|
| **On-site coordinator** | Must be able to read the run of show and log issues with no connectivity, for hours, and have it all arrive later |
| **Planner on two devices** | Must never be asked "which version do you want?" for changes they made themselves, sequentially |

## 3. User stories

- As a coordinator in a basement exhibition hall with no signal, I log six issues over four hours and they all appear for the team once I'm back on wifi.
- As a planner, I edit a brief on my laptop, close it, and open the same brief on my phone with the edit already there.
- As a planner, I never see a sync conflict caused by my own sequential edits on two devices.
- As two planners editing the same budget at once, we are told about the collision and shown both values, rather than one of us silently losing work.
- As a user of the local-only version, nothing about my experience changes until I choose to sign in.
- As an admin, I can see when a workspace last synced and whether anything is stuck.

## 4. Scope

### In scope
The sync engine: local-first reads and writes, an outbox of pending mutations, background push
and pull, conflict detection and resolution, and the server-side record store PRD 8's envelope
defines. Sync status surfaced in the UI. Backfill and migration paths.

### Out of scope (explicit non-goals)
- **No real-time collaborative editing.** No live cursors, no operational transform, no CRDT
  merge of concurrent keystrokes. Sync is eventual, on the order of seconds. Two people typing
  in the same text field at the same instant is not a supported workflow, and pretending
  otherwise would multiply the cost of this PRD several times over.
- **No field-level merge.** Conflicts resolve at the record level with the user choosing, per
  §7. Automatic three-way merge of a brief is not attempted.
- **No sync of derived data.** Anything computable from source records — scorecards, cost
  summaries, executive summary text, promo asset generation — is recomputed on each client, not
  synced. This is already how the code is structured and it materially shrinks the payload.
- **No offline account creation.** Signing up and joining a workspace require connectivity.
  Only working with data you already have is offline.
- **No cross-workspace sync.** A device syncs the workspaces its user belongs to, nothing else.
- **No changes to any tool's domain logic.** Same bar as PRD 8's FR-12.

## 5. Functional requirements

**FR-1 · The local store stays the source of truth for the UI.** Every read and write in every
tool continues to go through `packages/local-store` against IndexedDB, synchronously fast,
online or off. No tool gains a loading spinner it did not have.

**FR-2 · Every mutation is enqueued.** A write does two things: applies locally, and appends to
a durable local outbox. The outbox survives a reload and a crash.

**FR-3 · Background push.** When online and authenticated, the outbox drains oldest-first to
the server. Failures retry with exponential backoff. A permanently rejected mutation (for
example, permission denied because the user's role changed) is surfaced to the user, never
silently dropped.

**FR-4 · Background pull.** The client polls for records in its workspaces changed since its
last sync cursor, and applies them locally. Poll interval: 30 seconds while the tab is
foregrounded, on reconnect, and on tab focus.

**FR-5 · Optimistic concurrency, detected not guessed.** Every record carries a `version`. A
push sends the base version it was edited from. The server rejects a write whose base version is
stale, returning the current record. Three of the suite's core documents — `EventBrief`,
`LogisticsPack`, `RetroDocument` — **already carry a monotonically increasing `version`
counter**, so this is a use of existing structure rather than a new concept.

**FR-6 · Conflicts are surfaced, never auto-resolved.** On a rejected push the user is shown
both versions and chooses: keep mine, take theirs, or open both side by side. Nothing is
overwritten without a decision.

> This mirrors a principle already established three times in the suite: PRD 5's dedupe never
> auto-merges an ambiguous match, PRD 2's regeneration never overwrites an edited asset, and
> PRD 6's write-back requires per-metric confirmation. Silently resolving ambiguity is the one
> thing this product consistently refuses to do, and sync must not be the exception.

**FR-7 · Same-user sequential edits never conflict.** A planner editing on a laptop then a
phone must not be prompted. Achieved by pulling before push on focus, and by treating a push
from the same user whose base version is the immediately prior version as a fast-forward.

**FR-8 · Deletes are tombstones.** Deleting sets `deletedAt` rather than removing the row, so
the delete propagates to other devices. Tombstones are purged server-side after 90 days.

**FR-9 · Sync status is visible.** A persistent, unobtrusive indicator: synced, syncing, offline
with N pending, or error. Clicking it shows what is pending and any failures. A planner walking
into a venue should be able to confirm at a glance that their pack is on the device.

**FR-10 · Offline capability is honest.** When offline, the UI states which data is available
locally. It never shows an empty list that is actually an unsynced list — the single most
damaging possible failure, because it looks like data loss.

**FR-11 · First sync on a new device.** Signing in on a new device pulls the workspace's
records with visible progress. Large workspaces page rather than blocking.

**FR-12 · Attendee data respects permission on pull.** A user without `leads:view` never
receives lead records, so they are not merely hidden in the UI but absent from the device. This
is a PRD 10 requirement enforced here.

**FR-13 · Local-only mode is untouched.** A user who never signs in gets exactly today's
behaviour, with no outbox, no polling, and no network calls.

**FR-14 · Bounded local storage.** IndexedDB is not unlimited. The client caches the full
current workspace and evicts records for archived events, refetching on demand. Eviction never
touches records with pending outbox entries.

## 6. Architecture

```
  UI (7 tools, unchanged)
        │  same function calls as today
        ▼
  packages/local-store        ← the existing seam
        │
        ├─ IndexedDB (source of truth for reads)
        └─ outbox (pending mutations)
                 │
                 ▼
       packages/sync-engine   ← NEW
                 │  push / pull / conflict detection
                 ▼
           API  →  Postgres (Record envelope from PRD 8 §6)
```

**Stack.** Next.js route handlers on Vercel for the API, Postgres for storage, and an
`Authorization`-header session from PRD 8. Chosen because the app already deploys to Vercel, the
data is document-shaped and low-volume (thousands of records per workspace, not millions), and
Postgres `jsonb` stores the existing document shapes without flattening them into tables that
would then have to track schema 1.1.0 by hand.

**The one rule that keeps this buildable:** `packages/sync-engine` is a new package that
`local-store` calls. No tool imports it, no tool knows it exists. If a tool needs to know about
sync, the seam is in the wrong place.

## 7. Conflict resolution

Conflicts are rare by construction — two people editing *the same record* within a sync
interval — but they must be handled explicitly when they happen.

| Situation | Behaviour |
|---|---|
| Same user, sequential devices | Fast-forward, no prompt (FR-7) |
| Different users, different records | No conflict; both merge |
| Different users, same record, disjoint fields | Still a conflict. v1 does not attempt field-level merge, and says so rather than guessing |
| Different users, same record | Conflict UI: mine / theirs / show both |
| Append-only collections (issue log, lead pool, pipeline rows) | **Union, not conflict.** Two coordinators logging different issues both keep theirs — the collection is a log, and losing an entry is unacceptable |

The append-only exception matters more than it looks: it covers the on-site issue log, which is
the highest-value offline case in the product.

## 8. Success metrics

| Metric | Target |
|---|---|
| Mutations that reach the server without user intervention | ≥ 99.9% |
| Median sync latency, foregrounded and online | < 10 seconds |
| Conflicts requiring a user decision | < 1 per 100 events |
| Offline sessions that fully reconcile on reconnect | 100% — anything less is data loss |
| Reported incidents of "my data disappeared" | 0 |

## 9. Risks

| Risk | Mitigation |
|---|---|
| **Silent data loss.** The failure that ends trust in the product permanently. | Outbox is durable and drains oldest-first; nothing is removed locally until acknowledged; a rejected mutation is always surfaced (FR-3); FR-10 forbids showing unsynced-as-empty. |
| **The sync engine leaks into the tools.** Seven tools growing loading states and error handling would negate the architecture. | One hard rule: no tool imports the sync engine. Enforceable with a lint rule and provable by the existing check scripts continuing to pass unchanged. |
| **Conflict UI is confusing, so people click through it.** | Conflicts are rare by design; the UI shows concrete values, not diffs of JSON; append-only collections never produce one. |
| **Clock skew corrupts ordering.** | Ordering uses server-assigned versions, never client timestamps. `updatedAt` is display only. |
| **IndexedDB eviction by the browser** under storage pressure, wiping pending writes. | Request persistent storage; never evict records with pending outbox entries (FR-14); surface pending count prominently (FR-9). |
| **Large workspaces make first sync slow.** | Paged pull with progress (FR-11); archived events excluded until opened. |

## 10. Open questions — decided defaults, pending validation

- **Polling, not websockets.** 30-second poll while foregrounded. Simpler, survives flaky
  networks, and adequate for eventual sync measured in seconds. *Assumption — pending
  validation:* that nobody perceives it as slow. Revisit if users expect near-real-time.
- **Record-level conflicts, no field merge.** *Assumption — pending validation:* that conflicts
  are rare enough that a chooser is acceptable. If they turn out common, field-level merge for
  briefs specifically is the first upgrade.
- **90-day tombstone retention.** Long enough for a device that has been offline for a season.
  Unvalidated.
- **Full-workspace cache with archived-event eviction.** *Assumption — pending validation:*
  that a workspace's active data fits comfortably in IndexedDB. Needs measuring against a real
  team's volume.
- **Append-only collections union rather than conflict.** A deliberate asymmetry, chosen
  because losing an issue-log entry is worse than showing a duplicate.

## 11. Definition of done

- A coordinator can put a phone in airplane mode, log six issues over hours, reconnect, and have all six appear for the team — with nothing lost and no prompt.
- A planner edits a brief on one device and sees it on another within a poll interval, never prompted about their own sequential edits.
- Two users editing the same budget line produce a conflict UI showing both values, and whichever is chosen is what both devices converge on.
- Two coordinators logging different issues offline both keep theirs.
- The seven existing check scripts pass **unchanged**, and no file under `apps/web/app/(tools)/` imports the sync engine.
- Signing out and back in on a fresh browser restores the workspace completely.
- Local-only mode makes zero network requests.
- Killing the tab mid-write loses nothing: the outbox survives and drains on next launch.
