// packages/server-db/src/workspaces.ts
//
// PRD 8 FR-2, FR-6, FR-7, FR-10 — workspaces, membership and invitations, server side.
//
// Every function here that changes who can see what does three things in one place: it asks
// `can()`, it applies the rule, and it writes an access-log entry. Splitting those across a route
// handler and a repository is how an action ends up permitted but unlogged, and an audit trail
// with holes in it is worse than none because it is trusted.

import { assertCan, canRemoveMember, wouldLeaveNoOwner, type AccessContext, type Role } from "@event-toolkit/access";
import { and, eq, isNull, gt } from "drizzle-orm";
import { accessEvents, invitations, memberships, sessions, users, workspaces } from "./schema";

import type { Db } from "./db-type";

/** 14 days, per FR-6. */
const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function token(): string {
  // 32 bytes of CSPRNG output, URL-safe. An invitation token is a credential: a short or
  // predictable one is an unauthenticated route into somebody's attendee data.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

async function logEvent(
  db: Db,
  workspaceId: string,
  actorUserId: string | null,
  action: string,
  targetId?: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  await db.insert(accessEvents).values({ workspaceId, actorUserId, action, targetId, detail });
}

/* -------------------------------------------------------------------------- */
/* Workspaces                                                                  */
/* -------------------------------------------------------------------------- */

export async function createWorkspace(db: Db, name: string, ownerUserId: string) {
  const [workspace] = await db.insert(workspaces).values({ name, createdBy: ownerUserId }).returning();

  // The creator is the owner. A workspace that can exist without one is a workspace nobody can
  // administer, and `wouldLeaveNoOwner` exists to keep it that way.
  await db.insert(memberships).values({
    workspaceId: workspace.id,
    userId: ownerUserId,
    role: "owner",
  });

  await logEvent(db, workspace.id, ownerUserId, "workspace.created", workspace.id, { name });
  return workspace;
}

export async function listMemberships(db: Db, userId: string) {
  return db.select().from(memberships).where(eq(memberships.userId, userId));
}

/** Memberships with the workspace's name attached — what the switcher actually needs to render. */
export async function listWorkspacesFor(db: Db, userId: string) {
  return db
    .select({
      workspaceId: workspaces.id,
      name: workspaces.name,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
      migratedAt: workspaces.migratedAt,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(eq(memberships.userId, userId));
}

/** The role a user holds, for building an `AccessContext`. Null when they are not a member. */
export async function roleOf(db: Db, workspaceId: string, userId: string): Promise<Role | null> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  return (row?.role as Role | undefined) ?? null;
}

export async function listMembers(db: Db, ctx: AccessContext) {
  assertCan(ctx, "members:view");
  return db.select().from(memberships).where(eq(memberships.workspaceId, ctx.workspaceId));
}

/**
 * Members with the person attached — what a members screen actually renders.
 *
 * Gated on `members:view` like the raw list. A workspace's roster is not attendee data, but it is
 * still a list of named people at a named company, and the roles beside them say who can reach
 * the budget and who can reach the leads.
 */
export async function listMembersWithUsers(db: Db, ctx: AccessContext) {
  assertCan(ctx, "members:view");
  return db
    .select({
      userId: memberships.userId,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
      email: users.email,
      name: users.name,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.workspaceId, ctx.workspaceId));
}

/** One workspace, if this context may see it at all. */
export async function getWorkspace(db: Db, ctx: AccessContext) {
  if (!ctx.role) return null;
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
  return row ?? null;
}

export async function listAccessEvents(db: Db, ctx: AccessContext) {
  // FR-10: the audit view is for people who manage members, not everyone who can see the list.
  assertCan(ctx, "members:manage");
  return db.select().from(accessEvents).where(eq(accessEvents.workspaceId, ctx.workspaceId));
}

/* -------------------------------------------------------------------------- */
/* Membership changes                                                          */
/* -------------------------------------------------------------------------- */

export class MembershipError extends Error {
  readonly code: "last_owner" | "not_permitted" | "not_a_member";
  constructor(code: MembershipError["code"], message: string) {
    super(message);
    this.name = "MembershipError";
    this.code = code;
  }
}

async function currentRoles(db: Db, workspaceId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(eq(memberships.workspaceId, workspaceId));
  return rows.map((r) => r.role as Role);
}

export async function changeRole(db: Db, ctx: AccessContext, targetUserId: string, newRole: Role) {
  assertCan(ctx, "members:manage");

  const targetRole = await roleOf(db, ctx.workspaceId, targetUserId);
  if (!targetRole) throw new MembershipError("not_a_member", "That person is not in this workspace.");

  // Demoting an owner is a removal of ownership, so it needs the same authority as removing them.
  if (targetRole === "owner" && !canRemoveMember(ctx.role!, targetRole)) {
    throw new MembershipError("not_permitted", "Only an owner can change an owner's role.");
  }

  if (wouldLeaveNoOwner(await currentRoles(db, ctx.workspaceId), targetRole, { newRole })) {
    throw new MembershipError(
      "last_owner",
      "This workspace would be left with no owner. Make somebody else an owner first.",
    );
  }

  await db
    .update(memberships)
    .set({ role: newRole })
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.userId, targetUserId)));

  await logEvent(db, ctx.workspaceId, ctx.userId, "member.role_changed", targetUserId, {
    from: targetRole,
    to: newRole,
  });
}

/**
 * FR-7 — removal revokes access *now*.
 *
 * Deleting the membership row is what `can()` reads, and deleting the session rows is what stops
 * the request already in flight. Database sessions were chosen over JWTs for exactly this: a
 * stateless token cannot be revoked before it expires, so "removed" would have meant "removed in
 * up to thirty days".
 *
 * What this deliberately does *not* do is wipe the person's device. Their local copy is purged on
 * that device's next launch, and the admin UI has to say so plainly rather than implying a remote
 * wipe it cannot perform.
 */
export async function removeMember(db: Db, ctx: AccessContext, targetUserId: string) {
  assertCan(ctx, "members:manage");

  const targetRole = await roleOf(db, ctx.workspaceId, targetUserId);
  if (!targetRole) throw new MembershipError("not_a_member", "That person is not in this workspace.");

  if (!canRemoveMember(ctx.role!, targetRole)) {
    throw new MembershipError("not_permitted", "An admin cannot remove an owner.");
  }
  if (wouldLeaveNoOwner(await currentRoles(db, ctx.workspaceId), targetRole, "remove")) {
    throw new MembershipError(
      "last_owner",
      "This workspace would be left with no owner. Make somebody else an owner first.",
    );
  }

  await db
    .delete(memberships)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.userId, targetUserId)));

  // Kill every session that person holds. They may be signed in on several devices, and one
  // surviving session is the whole of the access they were just removed from.
  await db.delete(sessions).where(eq(sessions.userId, targetUserId));

  await logEvent(db, ctx.workspaceId, ctx.userId, "member.removed", targetUserId, { role: targetRole });
}

/* -------------------------------------------------------------------------- */
/* Invitations (FR-6)                                                          */
/* -------------------------------------------------------------------------- */

export async function inviteMember(db: Db, ctx: AccessContext, email: string, role: Role) {
  assertCan(ctx, "members:manage");

  const normalised = email.trim().toLowerCase();
  const [invitation] = await db
    .insert(invitations)
    .values({
      workspaceId: ctx.workspaceId,
      email: normalised,
      role,
      token: token(),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      invitedBy: ctx.userId,
    })
    .returning();

  // The email address is the point of the log entry here — an admin auditing who was invited
  // needs to know who, and an invited colleague is a business contact, not an attendee.
  await logEvent(db, ctx.workspaceId, ctx.userId, "invitation.sent", invitation.id, {
    email: normalised,
    role,
  });
  return invitation;
}

export async function listInvitations(db: Db, ctx: AccessContext) {
  assertCan(ctx, "members:manage");
  return db
    .select()
    .from(invitations)
    .where(and(eq(invitations.workspaceId, ctx.workspaceId), isNull(invitations.acceptedAt)));
}

export async function revokeInvitation(db: Db, ctx: AccessContext, invitationId: string) {
  assertCan(ctx, "members:manage");
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, invitationId), eq(invitations.workspaceId, ctx.workspaceId)));
  await logEvent(db, ctx.workspaceId, ctx.userId, "invitation.revoked", invitationId);
}

/**
 * Look up an invitation for display, without accepting it.
 *
 * Unauthenticated by necessity — the token *is* the authentication, which is why it is 32 bytes
 * of CSPRNG output. Returns only what the accept screen needs to show: the workspace name, the
 * role offered, and whether the link is still good. Never the invitee list or anything else about
 * the workspace, because whoever holds this URL is not yet a member of it.
 */
export async function getInvitationByToken(db: Db, tokenValue: string, now: Date = new Date()) {
  const [row] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      revokedAt: invitations.revokedAt,
      acceptedAt: invitations.acceptedAt,
      workspaceId: invitations.workspaceId,
      workspaceName: workspaces.name,
    })
    .from(invitations)
    .innerJoin(workspaces, eq(invitations.workspaceId, workspaces.id))
    .where(eq(invitations.token, tokenValue));

  if (!row) return null;
  return {
    ...row,
    status: row.acceptedAt
      ? ("accepted" as const)
      : row.revokedAt
        ? ("revoked" as const)
        : row.expiresAt <= now
          ? ("expired" as const)
          : ("pending" as const),
  };
}

export class InvitationError extends Error {
  readonly code: "invalid" | "expired" | "revoked" | "already_accepted" | "wrong_email";
  constructor(code: InvitationError["code"], message: string) {
    super(message);
    this.name = "InvitationError";
    this.code = code;
  }
}

/**
 * Accepting an invitation.
 *
 * The token is checked against the signed-in user's own email. Without that, a forwarded
 * invitation link is a way for anyone who receives it to join a workspace they were never invited
 * to — and the person who forwarded it usually had no idea the link was a credential.
 */
export async function acceptInvitation(
  db: Db,
  tokenValue: string,
  user: { id: string; email: string },
  now: Date = new Date(),
) {
  const [invitation] = await db.select().from(invitations).where(eq(invitations.token, tokenValue));

  if (!invitation) throw new InvitationError("invalid", "That invitation link is not valid.");
  if (invitation.acceptedAt) throw new InvitationError("already_accepted", "That invitation has already been used.");
  if (invitation.revokedAt) throw new InvitationError("revoked", "That invitation was revoked.");
  if (invitation.expiresAt <= now) throw new InvitationError("expired", "That invitation has expired.");
  if (invitation.email !== user.email.trim().toLowerCase()) {
    throw new InvitationError("wrong_email", "That invitation was sent to a different email address.");
  }

  await db
    .insert(memberships)
    .values({
      workspaceId: invitation.workspaceId,
      userId: user.id,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
    })
    // The unique index makes a double-clicked accept an update rather than a second membership
    // row with a second role.
    .onConflictDoNothing();

  await db.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invitation.id));
  await logEvent(db, invitation.workspaceId, user.id, "invitation.accepted", invitation.id, {
    role: invitation.role,
  });

  return invitation;
}

/** Pending invitations for an email, so sign-up can land somebody straight in the right workspace. */
export async function pendingInvitationsFor(db: Db, email: string, now: Date = new Date()) {
  return db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.email, email.trim().toLowerCase()),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, now),
      ),
    );
}
