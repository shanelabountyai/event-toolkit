// apps/web/lib/session.ts
//
// The bridge from "who is signed in" to "what may they do".
//
// Every server route builds its `AccessContext` here and nowhere else. That is the whole point of
// there being one `can()`: if a handler can assemble a context by hand, it can assemble a wrong
// one, and a wrong context is an attendee data leak rather than a bug.

import { cache } from "react";
import { getDb, listWorkspacesFor, roleOf } from "@event-toolkit/server-db";
import type { AccessContext, Role } from "@event-toolkit/access";
import { auth, isHostedConfigured } from "./auth";

export interface SignedInUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * The signed-in user, or null.
 *
 * `cache` deduplicates within a single request: a page, its layout and three server components all
 * asking who is signed in should be one session lookup, not four.
 */
export const currentUser = cache(async (): Promise<SignedInUser | null> => {
  if (!isHostedConfigured()) return null;

  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;

  return { id: user.id, email: user.email, name: user.name ?? null };
});

export async function requireUser(): Promise<SignedInUser> {
  const user = await currentUser();
  if (!user) throw new NotSignedInError();
  return user;
}

export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "NotSignedInError";
  }
}

/**
 * The access context for one workspace.
 *
 * **The role is read from the database on every call, never from the session.** A session is
 * issued once and lives for thirty days; a role can be changed or revoked in between. Caching the
 * role onto the session would mean a demoted admin keeps admin rights until they next sign in,
 * which is precisely the failure FR-7 exists to prevent — and the reason this product pays for
 * database sessions in the first place.
 *
 * Deduplicated per request, so the extra query is one query rather than one per component.
 */
export const accessContextFor = cache(async (workspaceId: string): Promise<AccessContext | null> => {
  const user = await currentUser();
  if (!user) return null;

  const role: Role | null = await roleOf(getDb(), workspaceId, user.id);
  return { userId: user.id, workspaceId, role };
});

/** Every workspace this user belongs to, for the switcher and for choosing a default. */
export const myWorkspaces = cache(async () => {
  const user = await currentUser();
  if (!user) return [];
  return listWorkspacesFor(getDb(), user.id);
});
