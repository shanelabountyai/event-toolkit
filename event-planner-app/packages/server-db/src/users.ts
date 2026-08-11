// packages/server-db/src/users.ts
//
// User-level queries. Kept here rather than in the web app so that `apps/web` never imports
// drizzle directly — the rule that `packages/server-db` is the only place SQL is written holds
// for the auth layer too.

import { eq, isNull, and } from "drizzle-orm";
import { users } from "./schema";
import type { Db } from "./db-type";

/**
 * Record that an address has been proven.
 *
 * Signing in through a magic link *is* the proof, so this runs on sign-in rather than as a
 * separate verification step. FR-1 requires verification before a workspace can be created, and
 * `emailVerified` is what that check reads.
 *
 * Idempotent: only writes when the column is still null, so a returning user does not have their
 * original verification date overwritten with today's on every sign-in.
 */
export async function markEmailVerified(db: Db, userId: string, now: Date = new Date()): Promise<void> {
  await db
    .update(users)
    .set({ emailVerified: now })
    .where(and(eq(users.id, userId), isNull(users.emailVerified)));
}

export async function findUserByEmail(db: Db, email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  return row ?? null;
}

export async function isEmailVerified(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ verified: users.emailVerified }).from(users).where(eq(users.id, userId));
  return Boolean(row?.verified);
}
