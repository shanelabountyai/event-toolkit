# HANDOFF: Accounts, Workspaces & Access Control (PRD 8) — Claude Code Kickoff Brief

Paste this whole file into a fresh Claude Code session to start building immediately. You do not
need to read the PRD first — everything required is inlined below.

This session adds the **first server-side component** to a suite that has never had one. It does
not create a new app: it adds an API and an auth layer to the existing Next.js monorepo, and a
permission check at one boundary. **No existing tool's UI or domain logic changes.**

---

## 1. Project summary

The "Event Planner Productivity Suite" is one Next.js (App Router) + TypeScript + Tailwind
monorepo containing seven built tools (PRDs 1–7), all sharing one canonical `EventBrief` schema
(`packages/schema`) and one local-first IndexedDB persistence layer (`packages/local-store`).

Every one of those seven PRDs carries the same non-goal: *no backend, no database, no
authentication, no accounts, no cross-device sync*. **This session lifts the first half of that
constraint.** PRD 9 lifts the rest by adding sync; PRD 10 adds the data-protection obligations
that follow. This session does identity and permissions only.

**What you are building:** email sign-in, team workspaces, five roles, invitations, read-only
share links for on-site staff, and a one-time migration of existing local data into a workspace.

**The bar this session is judged against, stated once here and repeated in §9:** all seven
existing `pnpm *-check` scripts must pass **unchanged**. `packages/local-store` was documented
from the start as *"the deliberate seam a future backend/sync layer replaces without touching
any tool's UI code."* If you find yourself editing a file under `apps/web/app/(tools)/`, stop —
the seam is in the wrong place.

## 2. Where this slots into the existing monorepo

```
event-toolkit/
├── apps/web/
│   ├── app/
│   │   ├── (tools)/                    # PRDs 1-7 — DO NOT MODIFY
│   │   ├── (auth)/                     # <-- NEW
│   │   │   ├── sign-in/page.tsx
│   │   │   ├── sign-up/page.tsx
│   │   │   ├── verify/page.tsx
│   │   │   └── invite/[token]/page.tsx
│   │   ├── workspace/                  # <-- NEW
│   │   │   ├── page.tsx                # switcher + create
│   │   │   ├── members/page.tsx        # invite, roles, remove, access log
│   │   │   └── migrate/page.tsx        # FR-9 local data import
│   │   ├── share/[token]/page.tsx      # <-- NEW: read-only on-site view
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── workspaces/route.ts
│   │       ├── workspaces/[id]/members/route.ts
│   │       ├── invitations/route.ts
│   │       ├── share-links/route.ts
│   │       └── migrate/route.ts
│   └── lib/
│       ├── auth.ts                     # <-- NEW: Auth.js config
│       └── session.ts                  # <-- NEW: server-side session helpers
├── packages/
│   ├── access/                         # <-- NEW PACKAGE: the permission model, pure
│   │   └── src/{index,capabilities,roles,can}.ts
│   ├── server-db/                      # <-- NEW PACKAGE: Drizzle schema + client
│   │   └── src/{index,schema,client}.ts
│   └── local-store/                    # EXTEND: workspace context only, see §7
└── scripts/
    └── access-check.ts                 # <-- NEW, added to the `verify` chain
```

**Do not** create a new app, a second database layer, or a parallel auth path. **Do not** modify
`packages/schema/src/event-brief.ts` — tenancy never enters the document (see §5).

## 3. Tech stack — decided, do not re-litigate

| Choice | Why |
|---|---|
| **Auth.js v5 (NextAuth)** | Works with App Router route handlers, supports both credentials and email magic-link, and has a first-class Drizzle adapter. |
| **Database sessions, not JWT-only** | FR-7 requires that removing a member kills their sessions *now*. A stateless JWT cannot be revoked before expiry. |
| **Drizzle ORM + Postgres (Vercel Postgres / Neon)** | SQL-first, tiny runtime, good in serverless. The data is document-shaped and low-volume; `jsonb` stores existing shapes without flattening them into tables that would then track schema 1.1.0 by hand. |
| **`@node-rs/argon2` for password hashing** | argon2id, fast in serverless. Do not hand-roll, and do not use plain bcrypt-js on the edge runtime. |
| **Resend for transactional email** | Verification, magic links, invitations. One provider, listed in PRD 10's sub-processor register. |
| **Node runtime for auth routes** | `export const runtime = "nodejs"` — argon2 and the Postgres driver do not run on edge. |

No new UI library — reuse `packages/ui`. No state management library.

## 4. The permission model — build this first, it is the load-bearing piece

Put it in `packages/access`, **pure TypeScript, zero imports from Next, React or the database.**
That is what makes it unit-testable, and it is the single place any tool's access question is
answered.

```typescript
// packages/access/src/capabilities.ts

export type Capability =
  | "brief:view"    | "brief:edit"
  | "promo:view"    | "promo:edit"
  | "logistics:view" | "logistics:edit"
  | "budget:view"   | "budget:edit"
  | "leads:view"    | "leads:edit"      // leads:view is the PII gate — see §6
  | "roi:view"      | "roi:edit"
  | "retro:view"    | "retro:edit"
  | "members:view"  | "members:manage"
  | "workspace:delete";

export type Role = "owner" | "admin" | "planner" | "coordinator" | "finance";

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner:       [/* all of them, including workspace:delete */],
  admin:       [/* all except workspace:delete */],
  planner:     [/* every tool view+edit, members:view */],
  coordinator: ["brief:view", "promo:view", "promo:edit",
                "logistics:view", "logistics:edit", "retro:view", "members:view"],
  finance:     ["brief:view", "budget:view", "budget:edit",
                "roi:view", "retro:view", "members:view"],
};

export interface AccessContext {
  userId: string;
  workspaceId: string;
  role: Role | null;      // null = not a member
  viaShareLink?: ShareLinkGrant;
}

export interface ShareLinkGrant {
  logisticsPackId: string;
  expiresAt: string;
  revoked: boolean;
}

/** The ONE function. No tool implements its own rule. */
export function can(ctx: AccessContext, capability: Capability, resourceId?: string): boolean;
```

**Share-link grants are evaluated inside `can`**, not around it: a share link confers exactly
`logistics:view` for one `logisticsPackId`, plus the narrow right to append an issue-log entry,
and nothing else. Expiry and revocation are checked every call.

**Coordinator and Finance deliberately lack `leads:view`.** That is the one capability with a
legal consequence rather than an organisational one — see PRD 10.

## 5. Data model — tenancy lives in an envelope, never in the documents

```typescript
// packages/server-db/src/schema.ts  (Drizzle)

users        { id, email (unique), emailVerifiedAt, name, passwordHash, createdAt }
workspaces   { id, name, createdAt, createdBy }
memberships  { id, workspaceId, userId, role, invitedBy, joinedAt }   // unique(workspaceId,userId)
invitations  { id, workspaceId, email, role, token (unique), expiresAt, revokedAt, acceptedAt }
shareLinks   { id, workspaceId, logisticsPackId, token (unique), expiresAt, revokedAt, createdBy }
sessions     { id, userId, expiresAt, createdAt }                     // Auth.js adapter table
accessEvents { id, workspaceId, actorUserId, action, targetId, at }

records      { id, workspaceId, kind, documentId, document (jsonb),
               version, updatedAt, deletedAt }                        // unique(workspaceId,kind,documentId)
```

`records` is the envelope PRD 9 will sync. **This session creates the table and writes to it only
via the migration endpoint (FR-9); PRD 9 builds the live sync path.** `document` holds the
existing shape — an `EventBrief`, a `LogisticsPack` — completely unchanged, and `kind` names the
IndexedDB store it came from.

**Why an envelope and not a `workspaceId` field on `EventBrief`:** the canonical schema is shared
with seven installable `.skill` packages that write `event-brief-data.json` locally and have no
concept of a workspace. Adding tenancy to the schema forks the two implementations and breaks the
documented promise that a brief built conversationally imports into the app. Schema stays at
1.1.0, untouched.

## 6. P0 checklist

- [ ] **FR-1** Email+password and email magic-link sign-in. Verification required before creating a workspace. Password reset. Sessions expire after 30 days inactivity and are server-revocable.
- [ ] **FR-2** Workspace creation on first sign-in, or accept a pending invitation. A user may belong to several; every event belongs to exactly one.
- [ ] **FR-3** The five roles of §4, enforced everywhere through `can()`.
- [ ] **FR-4** Exactly one permission function. No route handler writes its own role check.
- [ ] **FR-5** `leads:view` gates all attendee personal data and is absent from Coordinator and Finance.
- [ ] **FR-6** Invitations by email + role; listed, revocable, expiring after 14 days.
- [ ] **FR-7** Removing a member revokes access immediately and deletes their session rows. Locally cached data is purged on that device's next launch — and the admin UI **says so plainly** rather than implying a remote wipe.
- [ ] **FR-8** Read-only share links scoped to one logistics pack: view run of show, staffing, contacts, checklist; log issues. Default expiry event end + 2 days. No account created.
- [ ] **FR-9** One-time migration of local IndexedDB data into a workspace: preview, upload preserving ids, non-destructive (local copy retained until the user dismisses it).
- [ ] **FR-10** Access log of every membership/role/invitation/share-link change, visible to admins.
- [ ] **FR-11** Account deletion; sole owners must transfer or delete the workspace first.
- [ ] **FR-12** All seven tools keep working, unmodified.

## 7. How the tools become workspace-aware without changing

`packages/local-store` gains a module-level context and nothing else:

```typescript
// packages/local-store/src/context.ts  — NEW
export interface StoreContext { mode: "local" | "workspace"; workspaceId?: string; userId?: string; }
export function setStoreContext(ctx: StoreContext): void;
export function getStoreContext(): StoreContext;
```

- **`mode: "local"`** is exactly today's behaviour: IndexedDB only, no network, no auth. This is the default and must keep working for a user who never signs in (PRD 8 FR-13 in the PRD, and a real product decision — zero-onboarding was a genuine feature).
- **`mode: "workspace"`** namespaces IndexedDB keys by `workspaceId` so two workspaces on one device do not collide, and lets PRD 9 attach sync later.

Repository functions gain a permission assertion at their top — `assertCan("budget:edit")` —
which is a no-op in local mode. **That is the entire change to existing code.** Every tool keeps
calling `getBrief`, `saveLineItems`, `listLeads` exactly as it does now.

## 8. Key UX flows

1. **New user:** landing → sign up → verify email → create workspace → empty state offering "start a brief" or "import my local data".
2. **Invited user:** invitation link → sign up → lands directly in the inviting workspace.
3. **Existing local-only user:** signs in, banner reads *"You have 3 events saved in this browser. Move them into your workspace?"* → preview listing exactly what moves → confirm → local copy retained until dismissed.
4. **Inviting:** Members → Invite → email + role → pending, revocable.
5. **On-site handoff:** logistics pack → Share → link with visible expiry.
6. **Removal:** Members → Remove → confirmation naming exactly what they lose → sessions killed → access log entry.

## 9. Acceptance criteria

- Sign up, verify, create a workspace, invite a colleague; both work the same event from different machines.
- **Every capability in §4 is covered by `scripts/access-check.ts`, including the negative cases** — a Coordinator must be *proven* unable to read leads, not merely lacking a link to them.
- A Finance member opening `/leads` directly by URL gets a permission error, not data.
- A share link opens the run of show on a phone, allows logging one issue, and refuses every other route and every other pack.
- An expired or revoked share link refuses everything.
- Migration moves a full local dataset and every cross-tool reference survives: budget totals still match in the ROI report, retro lessons still appear in intake.
- Migration is idempotent — running it twice does not duplicate.
- Removing a member invalidates their session on the next request.
- **All seven existing check scripts pass unchanged**, and `git diff` touches no file under `apps/web/app/(tools)/`.
- Local-only mode makes zero network requests and needs no account.

## 10. Explicit non-goals

- No SSO/SAML/SCIM. No per-field permissions. No billing, plans or seat limits.
- No public write access — share links are read-only plus issue logging.
- No org hierarchy beyond one level.
- No changes to `EventBrief`, `packages/schema`, or any tool's domain package.
- **No sync.** This session persists to Postgres only through the migration endpoint. Live
  read/write sync is PRD 9 and building it here will produce a half-version that PRD 9 has to
  unpick.
- No real-time presence or collaborative editing.

## 11. Suggested build order

1. **`packages/access`** — capabilities, roles, `can()`, share-link evaluation. Pure. Write `scripts/access-check.ts` against it *before any UI exists*, covering every role × capability including negatives. This is the piece where a mistake is a security bug rather than a bug.
2. **`packages/server-db`** — Drizzle schema and client, migrations, local Postgres for development.
3. **Auth.js wiring** — credentials + magic link, database sessions, verification, reset. Get sign-up → verify → sign-in working end to end before anything else.
4. **Workspaces and memberships** — create, switch, list; the API routes with `can()` enforced.
5. **Invitations** — send, accept, revoke, expire.
6. **`local-store` context** — `setStoreContext`, key namespacing, `assertCan` no-op in local mode. Confirm the seven check scripts still pass at this point; if not, stop and fix the seam.
7. **Migration (FR-9)** — read every IndexedDB store, preview, upload preserving ids, verify, offer dismissal.
8. **Share links** — token, scoped read-only route, issue logging, expiry, revocation.
9. **Access log and admin UI** — members list, roles, removal, audit view.
10. **Polish** — local-only mode untouched, empty states, the plain-English caveat on FR-7.

Build `packages/access` solidly and test it in isolation before touching UI, the same discipline
every prior PRD in this suite used. A wrong number in a budget is a bug; a wrong answer from
`can()` is an attendee data leak.
