# v2 platform tier — PRDs 8, 9 and 10

PRDs 1–7 are the product. These three are the platform it would need to stop being
single-device software.

They are written to be built **in order and together**. Each is useless or dangerous alone:

| | PRD | Without it |
|---|---|---|
| 8 | Accounts, Workspaces & Access Control | PRD 9 syncs data with no notion of who owns it |
| 9 | Hosted Sync & Offline-First Persistence | PRD 8 is a login screen in front of data that never leaves the browser |
| 10 | Data Protection & Tenant Operations | PRD 9 puts other people's personal data on a server with no way to delete it |

## The decision these encode

The constraint being lifted — *"no backend, no database, no authentication, no accounts,
no cross-device sync"* — appears in the non-goals of all seven original PRDs. It was
deliberate, and it bought four things: zero onboarding, zero data-protection surface, zero
operating cost, and **working with no wifi**.

Three of those are spent by this tier. The fourth is not, and PRD 9 exists mainly to protect
it: the on-site issue log has to keep working on a convention centre floor, so the local store
stays the source of truth and syncs in the background rather than being replaced by an API.

## Why it can be built without rewriting seven tools

`packages/local-store` was documented from the start as *"the deliberate seam a future
backend/sync layer replaces without touching any tool's UI code."* PRD 9 is that layer, sitting
behind the existing interface. The acceptance bar shared by PRDs 8 and 9 is the same:

> **All seven existing check scripts pass unchanged.** If any tool needed editing, the seam was
> in the wrong place.

Two design choices follow from the same instinct:

- **Tenancy lives in a server-side envelope**, not inside `EventBrief`. The canonical schema is
  shared with the seven `.skill` packages, which have no concept of a workspace. Putting
  `workspaceId` in the schema would fork the two implementations and break the promise that a
  brief built conversationally imports into the app.
- **Conflicts are surfaced, never auto-resolved** — consistent with how the product already
  treats ambiguity everywhere else: dedupe never auto-merges a fuzzy match, regeneration never
  overwrites an edited asset, write-back requires per-metric confirmation.

## Status

Each PRD now has a `HANDOFF.md` — a self-contained kickoff brief that can be pasted into a fresh
Claude Code session without reading the PRD first, exactly like the original seven.

Open questions in each PRD follow the house convention: a decided default you can build on,
flagged `Assumption — pending validation`.

## Two findings from writing the handoffs

**`LogisticsPack` breaks naive sync.** It is one record containing six arrays — sessions,
staffing, shipping, checklist, contacts, issue log — and it is also the only genuinely
multi-user document in the suite: on event day a planner edits the run of show, a coordinator
ticks the checklist, and on-site staff log issues, all at once, all into the same record.
Record-level concurrency would make the highest-value multi-user scenario the most broken one.
PRD 9's handoff requires sub-document sync for that kind specifically, exploding the arrays into
per-item records at the sync boundary and reassembling on read. Everything else stays whole.

**Privacy operations must be registry-driven, not per-tool.** PRD 10's handoff specifies a
`PII_REGISTRY` describing where personal data lives, with subject search, export and deletion
implemented once against it — plus a build check that fails when a new sync kind is added
without an entry. Hand-writing the traversal seven times guarantees one gets missed, and a
missed category is invisible to every privacy operation built on top.
