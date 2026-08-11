// apps/web/lib/auth.ts
//
// PRD 8 FR-1 — sign-in.
//
// Two decisions shape this file, and the second one changed the spec.
//
// **Database sessions, not JWTs.** FR-7 requires that removing a member revokes their access
// *now*. A stateless token cannot be revoked before it expires, so "removed" would have meant
// "removed within thirty days". Deleting the session row is the mechanism, and `removeMember` in
// `packages/server-db` does exactly that.
//
// **Magic link rather than email + password**, which is a deviation from FR-1 worth stating
// plainly. Auth.js's Credentials provider cannot be used with database sessions — it requires the
// JWT strategy — so "password" and "revocable session" are mutually exclusive within this library.
// Given the choice, revocability wins: it is the one that protects attendee data. A magic link
// also *is* email verification, which FR-1 separately requires before a workspace can be created,
// so one mechanism satisfies both and there is no password to reset, breach, or store.
// See docs/V2-STATUS.md. If passwords are wanted later, they need a hand-rolled session write
// rather than the Credentials provider.

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import {
  accounts,
  getDb,
  markEmailVerified,
  sessions,
  users,
  verificationTokens,
} from "@event-toolkit/server-db";

/** 30 days, per FR-1. Rolling: the clock restarts on use, so this is inactivity rather than age. */
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * True when the hosted tier is actually configured.
 *
 * Local-only mode is a real product and must keep working with none of this set, so every entry
 * point checks rather than assuming. Without it, a planner who never signs in would meet a crash
 * on a page they had no reason to visit.
 */
export function isHostedConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET);
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM);
}

/**
 * The config is a function, so nothing here is evaluated at build time.
 *
 * That matters: `getDb()` throws when DATABASE_URL is absent, and evaluating the adapter eagerly
 * would make the whole application fail to build on a machine that only ever runs local-only mode.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const db = getDb();

  return {
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),

    session: {
      strategy: "database",
      maxAge: SESSION_MAX_AGE,
      // Refresh the row at most once a day. Every request writing to the session table would make
      // the database the bottleneck for reading a run of show on event morning.
      updateAge: 24 * 60 * 60,
    },

    providers: [
      Resend({
        from: process.env.EMAIL_FROM,
        // 15 minutes. A sign-in link is a bearer credential sitting in an inbox, and inboxes are
        // forwarded, synced and breached. Auth.js defaults to 24 hours, which is generous for
        // something that grants access to attendee data.
        maxAge: 15 * 60,
      }),
    ],

    pages: {
      signIn: "/sign-in",
      verifyRequest: "/verify",
      error: "/sign-in",
    },

    callbacks: {
      session({ session, user }) {
        // The user id is what every `AccessContext` is built from, so it has to survive onto the
        // session object rather than only existing in the database row.
        if (session.user) session.user.id = user.id;
        return session;
      },
    },

    // Signing in via a magic link proves the address. Recording that is what lets FR-1 require
    // verification before a workspace is created without a second round trip.
    events: {
      async signIn({ user }) {
        if (user.id) await markEmailVerified(getDb(), user.id);
      },
    },

    trustHost: true,
  };
});
