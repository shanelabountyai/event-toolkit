# HANDOFF: Hosted Sync & Offline-First Persistence (PRD 9) — Claude Code Kickoff Brief

Paste this whole file into a fresh Claude Code session to start building immediately. You do not
need to read the PRD first — everything required is inlined below.

**Prerequisite: PRD 8 must be built.** This session needs `packages/access`, `packages/server-db`,
authenticated sessions, and the `records` envelope table to exist.

---

## 1. The constraint this whole session is organised around

The Run-of-Show & Logistics Pack (PRD 3) puts a **"Flag an issue"** button in the header of every
artifact view. It is used on a convention centre floor, on the day, while something is going
wrong — a place with famously bad wifi.

Today it always works, because there is no network anywhere in the path.

So this is **not** "add a backend and call the API from the UI". That would trade a real, in-use
capability for an abstraction. The design is:

> **The local store remains the source of truth the UI talks to. Sync happens behind it.**

Every requirement below follows from that sentence. `packages/local-store` was documented from
the start as *"the deliberate seam a future backend/sync layer replaces without touching any
tool's UI code"* — this session is that layer, slotted behind the existing interface.

## 2. Read this before designing anything: the LogisticsPack problem

`LogisticsPack` is **one record containing six arrays**:

```typescript
export interface LogisticsPack {
  id: string; eventBriefId: string; version: number; /* ... */
  sessions: Session[];  staffAssignments: StaffAssignment[];  shippingItems: ShippingManifestItem[];
  venueChecklist: ChecklistItem[];  contacts: OnSiteContact[];  issueLog: IssueLogEntry[];
}
```

It is also **the only genuinely multi-user document in the suite**: on event day a planner edits
the run of show, a coordinator ticks the checklist, and on-site staff log issues — all at once,
all offline, all into the same record.

Naive record-level optimistic concurrency therefore makes the highest-value multi-user scenario
the most broken one: every one of those people conflicts with every other, constantly, over
disjoint parts of one document.

**Required solution: sync `LogisticsPack` at sub-document granularity.** At the sync boundary
only, explode its six arrays into per-item records keyed by item id, and reassemble the pack on
read. The document shape the UI sees never changes.

```
kind "logisticsPack"          → { id, eventBriefId, schemaVersion, createdAt, version }   (scalars only)
kind "logisticsPack.session"  → one record per Session, documentId = session.id
kind "logisticsPack.staff"    → one per StaffAssignment
kind "logisticsPack.shipping" → one per ShippingManifestItem
kind "logisticsPack.checklist"→ one per ChecklistItem
kind "logisticsPack.contact"  → one per OnSiteContact
kind "logisticsPack.issue"    → one per IssueLogEntry   (append-only, see §6)
```

Every other document stays whole: `EventBrief`, `RoiReport`, `RetroDocument`, `TriageSession`,
`ScoringRubric`, `BudgetSettings` are single-editor in practice. Leads, budget line items,
pipeline opportunities and survey responses are **already** one record per item, so they need
nothing special.

Getting this wrong produces a build that technically syncs and is unusable for the scenario the
entire platform tier exists to enable.

## 3. Where this slots into the monorepo

```
event-toolkit/
├── apps/web/
│   ├── app/api/sync/
│   │   ├── push/route.ts               # <-- NEW
│   │   └── pull/route.ts               # <-- NEW
│   └── app/_components/SyncIndicator.tsx  # <-- NEW: status in the layout header
├── packages/
│   ├── sync-engine/                    # <-- NEW PACKAGE
│   │   └── src/{index,outbox,push,pull,conflict,merge,kinds,cursor}.ts
│   └── local-store/                    # EXTEND: outbox writes + reassembly, see §5
└── scripts/
    └── sync-check.ts                   # <-- NEW, added to the `verify` chain
```

**The rule that keeps this buildable:** `packages/sync-engine` is called *by* `local-store` and
imported by nothing else. **No file under `apps/web/app/(tools)/` may import it.** Add a lint
rule enforcing that. If a tool needs to know about sync, the seam is in the wrong place.

## 4. Tech stack — decided

Everything from PRD 8 applies. No new runtime dependency is required: the outbox is an IndexedDB
object store, push/pull are `fetch` against Next route handlers, and scheduling is
`setInterval` plus `visibilitychange` and `online` events. **Do not** add a sync framework, a
CRDT library, or a websocket server — see the non-goals.

## 5. Architecture

```
  UI (7 tools, unchanged)
        │  identical function calls to today
        ▼
  packages/local-store
        ├─ IndexedDB  ← source of truth for every read
        ├─ outbox     ← every write also appends here
        └─ explode/reassemble for logisticsPack (§2)
                 │
                 ▼
  packages/sync-engine   push · pull · conflict classification
                 │
                 ▼
     /api/sync/*  →  Postgres `records` (PRD 8 §5)
```

```typescript
// packages/sync-engine/src/outbox.ts
export interface OutboxEntry {
  id: string;
  workspaceId: string;
  kind: string;
  documentId: string;
  /** null = delete (tombstone). */
  document: unknown | null;
  /** Version this edit was made against; the server rejects if stale. */
  baseVersion: number;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}
```

**Wire format:**

```
POST /api/sync/push   { workspaceId, mutations: OutboxEntry[] }
  → { applied: [{documentId, kind, version}], conflicts: [{kind, documentId, server: Record}] }

GET  /api/sync/pull?workspaceId=…&since=<cursor>&limit=500
  → { records: Record[], cursor: string, hasMore: boolean }
```

The cursor is a server-assigned monotonic sequence, **never a client timestamp** — clock skew
must not be able to reorder anything.

## 6. Conflict rules — implement exactly this table

```typescript
// packages/sync-engine/src/conflict.ts
export type Resolution = "fast_forward" | "conflict" | "union" | "server_wins";
export function classify(local: OutboxEntry, server: Record | null, currentUserId: string): Resolution;
```

| Situation | Resolution |
|---|---|
| No server record (first write) | apply |
| `server.version === local.baseVersion` | apply |
| Stale base, **same user**, server version is exactly `baseVersion + 1` | `fast_forward` — a planner's own sequential edits on two devices must never prompt |
| Stale base, different users, **append-only kind** | `union` |
| Stale base, different users, any other kind | `conflict` — surface it |
| Server record is a tombstone, local is an edit | `server_wins`, and tell the user the record was deleted |

**Append-only kinds** — `logisticsPack.issue`, `leadRecords`, `pipelineOpportunities`,
`surveyResponses`, `importBatches` — union by item id. Two coordinators logging different issues
offline must both keep theirs; losing one is unacceptable, and a duplicate is merely untidy.

**Conflicts are surfaced, never auto-resolved.** This mirrors a principle the product already
applies three times: PRD 5's dedupe never auto-merges an ambiguous match, PRD 2's regeneration
never overwrites an edited asset, PRD 6's write-back requires per-metric confirmation. Silently
resolving ambiguity is the one thing this product consistently refuses to do; sync must not be
the exception.

## 7. P0 checklist

- [ ] **FR-1** Every read and write still goes through `local-store` against IndexedDB, fast, online or off. No tool gains a spinner it did not have.
- [ ] **FR-2** Every mutation applies locally *and* appends a durable outbox entry that survives reload and crash.
- [ ] **FR-3** Background push drains oldest-first with exponential backoff. A permanently rejected mutation is surfaced, never silently dropped.
- [ ] **FR-4** Background pull since the last cursor: every 30s while foregrounded, on reconnect, and on tab focus.
- [ ] **FR-5** Optimistic concurrency on `version`. `EventBrief`, `LogisticsPack` and `RetroDocument` already carry a monotonic counter — use it rather than inventing one.
- [ ] **FR-6** Conflicts shown as mine / theirs / both, with concrete values, never a JSON diff.
- [ ] **FR-7** Same-user sequential edits never prompt (pull-before-push on focus, plus the fast-forward rule).
- [ ] **FR-8** Deletes are tombstones so they propagate; purged server-side after 90 days.
- [ ] **FR-9** Persistent sync indicator: synced / syncing / offline with N pending / error. Clicking shows what is pending.
- [ ] **FR-10** When offline, the UI states what is available locally. **It must never render an unsynced list as an empty one** — that looks exactly like data loss and is the most damaging possible failure.
- [ ] **FR-11** First sync on a new device pages with visible progress.
- [ ] **FR-12** A user without `leads:view` never receives lead records — filtered server-side on pull, so the data is absent from the device rather than hidden in the UI.
- [ ] **FR-13** Local-only mode unchanged: no outbox, no polling, zero network calls.
- [ ] **FR-14** Bounded local storage: cache the active workspace, evict archived events, refetch on demand. **Never evict a record with a pending outbox entry.** Request persistent storage.

## 8. Acceptance criteria

- **The airplane-mode test.** Put a phone in airplane mode, log six issues across four hours, reconnect: all six appear for the team, none lost, no prompt.
- **The two-coordinator test.** Two devices offline, each logs three different issues into the same pack. On reconnect the pack holds all six.
- **The disjoint-edit test.** One person edits the run of show while another ticks a checklist item, both offline. Both land. **No conflict** — this is what §2 exists to guarantee.
- **The same-user test.** Edit a brief on a laptop, open it on a phone: the edit is there, no prompt, ever.
- **The genuine-conflict test.** Two users edit the same budget line item's amount. A conflict UI shows both values; whichever is chosen is what both devices converge on.
- Killing the tab mid-write loses nothing — the outbox drains on next launch.
- Signing out and back in on a fresh browser restores the workspace completely.
- A Finance user's device never receives a single lead record (inspect IndexedDB directly).
- Local-only mode issues zero network requests.
- **All seven existing check scripts pass unchanged**, and no file under `apps/web/app/(tools)/` imports `sync-engine`.

## 9. Explicit non-goals

- **No real-time collaboration.** No live cursors, no OT, no CRDT. Sync is eventual, on the order of seconds. Two people typing in the same field simultaneously is not supported.
- **No field-level merge.** Record-level, user chooses. Do not attempt three-way merge of a brief.
- **No sync of derived data.** Scorecards, cost summaries, executive summaries and generated promo copy are recomputed per client — they already are, and syncing them would bloat the payload for no gain.
- **No offline sign-up or workspace join.** Only working with data you already have is offline.
- **No websockets.** Polling, per the PRD's documented default.
- **No changes to any tool's domain logic or to `packages/schema`.**

## 10. Suggested build order

1. **`packages/sync-engine/src/conflict.ts` + `kinds.ts`** — the classification table from §6 and the append-only registry, as pure functions. Write `scripts/sync-check.ts` against them *first*, covering every row of that table plus the explode/reassemble round-trip for `LogisticsPack`. This is the piece where a mistake silently loses someone's work.
2. **Explode / reassemble for `LogisticsPack`** (§2). Prove a pack survives a round-trip byte-identical before anything touches the network.
3. **Outbox** — IndexedDB store, append on every write, durable across reload.
4. **`/api/sync/push`** with `can()` enforcement and version checking; return conflicts rather than applying them.
5. **`/api/sync/pull`** with cursor paging and the `leads:view` filter (FR-12).
6. **Scheduler** — interval, focus, reconnect; backoff.
7. **Sync indicator + conflict UI** (FR-6, FR-9, FR-10).
8. **First-sync paging** (FR-11) and **eviction** (FR-14).
9. **Verification pass** against §8, with the airplane-mode and two-coordinator tests done on a real phone, not simulated.

Build the conflict classifier and the LogisticsPack explode/reassemble in isolation, with tests,
before any network code exists. Every other bug in this session is recoverable; a sync bug that
drops a mutation destroys trust in the product permanently, and by the time anyone notices, the
evidence is gone.
