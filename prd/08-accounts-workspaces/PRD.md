# PRD 8 — Accounts, Workspaces & Access Control

**Status:** Draft, ready for review
**Tier:** Platform (v2). Prerequisite for PRD 9 and PRD 10.
**Depends on:** PRDs 1–7 shipped and in use.
**Prepared:** 2026-08-11

---

## 0. Read this first: what changes, and what it costs

Every one of PRDs 1–7 carries the same binding constraint in its non-goals: *no backend, no
database, no authentication, no accounts, no cross-device sync*. That was not an oversight. It
bought the suite four real properties:

- **Zero onboarding.** Open a URL, start working. No signup, no admin, no procurement.
- **Zero data-protection surface.** Attendee names, emails and phone numbers never left the
  planner's machine, so the product was never a data processor for anyone.
- **Zero operational cost or downtime.** No server to run, breach, or bill for.
- **It works at a venue with no wifi**, which is precisely where the on-site issue log is used.

This PRD spends the first two of those deliberately, and PRD 9 is written specifically to
protect the fourth. What it buys in return:

- A planner's work survives a lost laptop, a wiped browser profile, or a cleared cache. Today
  it does not, and that is the single largest risk in the current product.
- More than one person can work an event. Today the suite assumes a single planner, stated as
  a documented default in PRD 1 and never revisited.
- A run of show can be handed to on-site staff without emailing a PDF.
- Lessons and ROI comparisons accumulate across a whole team, not one browser. PRD 6's
  year-over-year and PRD 7's carry-forward are both far more valuable with a shared history —
  today they only see what one person's browser happens to hold.

**The honest trade:** the third property is spent too. This becomes a service someone has to
run, secure and pay for. PRD 10 covers the obligations that follow.

---

## 1. Problem

Three failures, all caused by the same root:

1. **Work is one browser away from gone.** A planner who clears site data, changes laptop, or
   has IT reimage their machine loses every brief, budget, lead list and retro. There is no
   backup and no export-everything button. This has not bitten anyone yet only because the
   suite is new.
2. **Events are not run by one person.** A field marketer builds the brief, a coordinator runs
   logistics, a contractor staffs the booth, finance reconciles the budget. Today all of them
   would need to sit at one machine, or work from stale exported files.
3. **The suite's compounding value is trapped per-device.** PRD 7 writes lessons forward so the
   next event starts smarter, and PRD 6 compares year over year. Both only see one browser's
   history — so a team's institutional memory fragments across laptops, which is the exact
   problem the suite was built to solve.

## 2. Users

| Role | What they need |
|---|---|
| **Event planner / owner** | Their work saved and reachable from any device; the ability to bring colleagues in without handing over a laptop |
| **Coordinator** | Edit access to logistics and leads for events they're assigned, without being able to alter the budget |
| **On-site staff / contractor** | Read the run of show and contact sheet on their phone; log issues. Nothing else, and no access after the event |
| **Finance** | See and reconcile budgets; no need to touch leads or attendee data |
| **Workspace admin** | Add and remove people, see who has access to what, remove access when someone leaves |

## 3. User stories

- As a planner, I sign in and see every event my team has run, not just the ones in this browser.
- As a planner, I invite a coordinator to a workspace and they can immediately open the logistics pack for our next event.
- As a coordinator, I can edit the run of show but I cannot see the lead list, because attendee data is not my job.
- As on-site staff, I open a link on my phone, see today's run of show, and flag an issue — without an account being created for me by hand.
- As an admin, when a contractor's engagement ends I remove them and they immediately lose access to everything, including anything cached on their device.
- As a planner who has been using the local-only version, I sign up and my existing local data moves into my workspace without re-entering it.

## 4. Scope

### In scope
Identity, workspaces, membership, roles and the permission model the rest of the suite checks
against. Invitations. Session management. The one-time migration of existing local data into a
workspace. Read-only share links for on-site staff.

### Out of scope (explicit non-goals)
- **No SSO/SAML/SCIM in v1.** Email-based sign-in only. Enterprise identity is a follow-on;
  designing for it now would triple the scope before anyone has asked.
- **No per-field permissions.** Access is granted per tool per workspace, not per field on a
  brief. Finer grain is a support burden with no demonstrated demand.
- **No billing, plans, or seat limits.** Commercial packaging is a separate decision and
  hard-coding it now would constrain it.
- **No public/anonymous write access.** Share links are read-only plus issue logging, never
  general editing.
- **No org hierarchy beyond one level.** A workspace has members; it does not contain
  sub-workspaces. Multi-level orgs are a v3 problem if they ever appear.
- **No changes to the `EventBrief` schema.** Tenancy lives in a server-side envelope around the
  document, not inside it — see §6. The seven existing tools and the seven `.skill` packages
  must keep working against schema 1.1.0 unchanged.

## 5. Functional requirements

**FR-1 · Sign-up and sign-in.** Email + password, plus email magic-link as an alternative.
Email verification required before a workspace can be created. Password reset flow. Sessions
expire after 30 days of inactivity; a session can be revoked from the server.

**FR-2 · Workspace creation.** On first sign-in a user is prompted to create a workspace with a
name, or accept a pending invitation. Every event belongs to exactly one workspace. A user may
belong to several.

**FR-3 · Roles.** Four roles, fixed in v1:

| Role | Briefs | Promo | Logistics | Budget | Leads | ROI | Retro | Members |
|---|---|---|---|---|---|---|---|---|
| **Owner** | edit | edit | edit | edit | edit | edit | edit | manage |
| **Admin** | edit | edit | edit | edit | edit | edit | edit | manage |
| **Planner** | edit | edit | edit | edit | edit | edit | edit | view |
| **Coordinator** | view | edit | edit | — | — | — | view | view |
| **Finance** | view | — | — | edit | — | view | view | view |

Owner differs from Admin in exactly one way: an Owner cannot be removed by an Admin, and a
workspace must always have at least one.

**FR-4 · The permission check is one function.** Every tool calls a single
`can(user, workspace, capability)` helper. No tool implements its own rule. Capabilities are
named for what they do (`budget:edit`, `leads:view`), not for routes.

**FR-5 · Attendee data is gated separately.** `leads:view` is the only capability that exposes
attendee personal data (names, emails, phones). It is deliberately absent from Coordinator and
Finance. This is the one permission with a legal consequence, not just an organisational one —
see PRD 10.

**FR-6 · Invitations.** An Admin invites by email with a role. The invitee receives a link,
signs up or signs in, and joins. Pending invitations are listed and revocable. Invitations
expire after 14 days.

**FR-7 · Removing a member.** Removing revokes server access immediately and invalidates their
sessions. Any locally cached workspace data on their device is purged on next launch; if the
device never reconnects, the cache remains until it does — this limit must be stated plainly in
the admin UI rather than implied to be a remote wipe.

**FR-8 · Read-only share links (on-site staff).** A planner generates a link scoped to one
logistics pack, granting: view run of show, staffing, contacts and checklist; and log issues.
Nothing else, no other event, no attendee data. Links carry an expiry (default: event end + 2
days) and are revocable. Opening one does not create an account.

**FR-9 · Migration of existing local data.** A signed-in user with local-only data is offered a
one-time import: everything in their IndexedDB is uploaded into a chosen workspace, preserving
ids so cross-tool references survive. It is explicit, previewed, and non-destructive — the
local copy is left intact until the user confirms the upload succeeded.

**FR-10 · Audit of access changes.** Every membership change, role change, invitation and share
link creation/revocation is recorded with actor, target, and timestamp, visible to Admins. This
is what makes "who could see the attendee list" answerable, which PRD 10 requires.

**FR-11 · Account deletion.** A user can delete their account. If they are the sole Owner of a
workspace, they must first transfer ownership or delete the workspace. Deleting a workspace
deletes its events and all associated data — see PRD 10 for retention specifics.

**FR-12 · Every tool keeps working unchanged.** PRDs 1–7 gain a workspace context and a
permission check at the repository boundary. No tool's domain logic, schema, or check script
changes. This is the acceptance bar for the whole PRD: if a tool needed rewriting, the seam was
in the wrong place.

## 6. Data model

Tenancy lives in a **server-side envelope**, never inside the documents themselves:

```
Workspace   { id, name, createdAt, createdBy }
User        { id, email, emailVerifiedAt, name, createdAt }
Membership  { id, workspaceId, userId, role, invitedBy, joinedAt }
Invitation  { id, workspaceId, email, role, token, expiresAt, revokedAt }
ShareLink   { id, workspaceId, logisticsPackId, token, expiresAt, revokedAt, createdBy }
AccessEvent { id, workspaceId, actorUserId, action, targetId, at }

Record      { id, workspaceId, kind, documentId, document (JSON), version, updatedAt, deletedAt }
```

`Record` is the envelope. `document` holds the existing shape — an `EventBrief`, a
`LogisticsPack`, a `LeadRecord` — completely unchanged. `kind` names which store it came from.

**Why an envelope rather than adding `workspaceId` to each type:** the canonical `EventBrief`
is shared with the seven `.skill` packages, which have no concept of a workspace and write the
file locally. Putting tenancy inside the schema would fork the two implementations and break
the promise that a brief built conversationally imports into the app. The envelope keeps schema
1.1.0 untouched and the skills working.

## 7. UX flows

1. **First run, new user:** landing → sign up → verify email → create workspace → empty state offering "start a brief" or "import my local data".
2. **First run, invited user:** invitation link → sign up → lands directly in the workspace that invited them.
3. **Existing local-only user:** signs up, is shown a banner — *"You have 3 events saved in this browser. Move them into your workspace?"* → preview listing what will move → confirm → done, with the local copy retained until they dismiss it.
4. **Inviting someone:** Members → Invite → email + role → sent, listed as pending.
5. **On-site handoff:** logistics pack → Share → link generated with expiry shown → planner sends it however they like.
6. **Someone leaves:** Members → Remove → confirmation naming exactly what they lose access to → removed, sessions killed, entry written to the access log.

## 8. Success metrics

| Metric | Target |
|---|---|
| Existing local users who complete the migration when offered | ≥ 70% |
| Workspaces with more than one member after 30 days | ≥ 40% |
| Median time from invitation sent to invitee's first edit | < 24 hours |
| Support requests caused by permissions confusion | < 1 per 20 workspaces per month |
| Events accessed from more than one device | ≥ 50% — this is the core promise, and it is measurable |

## 9. Risks

| Risk | Mitigation |
|---|---|
| **Signup friction kills the thing that made it pleasant.** Zero-onboarding was a real feature. | Keep a local-only mode working for solo planners who never sign in. Signing up must be an upgrade, never a gate on first use. |
| **The role matrix is wrong.** It is a guess about how event teams divide work. | Roles are data, not code (FR-4). Getting the capability names right matters more than getting the matrix right — the matrix can change without touching any tool. |
| **Migration corrupts or duplicates data.** | Non-destructive by design (FR-9): upload, verify, then let the user dismiss the local copy. Ids are preserved so cross-tool references survive. |
| **Share links leak.** A URL is a credential. | Scoped to one pack, expiring by default, revocable, never exposing attendee data, and every issue logged through one is attributed to the link. |
| **Removed members keep cached data offline.** Unavoidable with offline-first. | State it plainly in the UI rather than implying a remote wipe. PRD 10 sets the retention expectation. |

## 10. Open questions — decided defaults, pending validation

Each is a decision you can build on, flagged for revisiting once real teams use it.

- **Local-only mode survives.** A planner can keep using the suite without an account,
  indefinitely. *Assumption — pending validation:* that the segment who want this is large
  enough to justify maintaining two paths. Revisit if migration uptake exceeds 90%.
- **Four roles, fixed.** Owner/Admin/Planner/Coordinator/Finance covers the division of labour
  we have observed in the PRDs themselves. *Assumption — pending validation:* no interviews
  were run. The capability layer is designed so this changes cheaply.
- **Coordinator cannot see leads.** Attendee PII is gated to the roles that need it.
  *Assumption — pending validation:* some teams may have coordinators doing lead follow-up.
- **Invitations expire at 14 days**, sessions at 30 days of inactivity. Both conventional, both
  unvalidated.
- **Share links default to event end + 2 days.** Long enough for teardown, short enough that a
  forwarded link goes stale. *Assumption — pending validation.*

## 11. Definition of done

- A new user can sign up, create a workspace, invite a colleague, and both can work the same event from different machines.
- Every capability in the FR-3 matrix is enforced at the repository boundary and covered by a check script — including the negative cases, which are the ones that matter.
- An existing local-only user can migrate their data and find every cross-tool reference intact: budget totals still match in the ROI report, retro lessons still appear in intake.
- All seven tools' existing check scripts pass **unchanged**. If any needed editing, FR-12 has been violated.
- Removing a member provably revokes access, and the access log shows who did it.
- A share link opens the run of show on a phone, allows logging an issue, and refuses everything else.
- Local-only mode still works with no account at all.
