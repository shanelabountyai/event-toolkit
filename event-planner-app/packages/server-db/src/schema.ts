// packages/server-db/src/schema.ts
//
// PRD 8 §5 — the hosted tier's tables.
//
// Two rules govern everything here:
//
//   1. **Tenancy lives in an envelope, never in the documents.** `records.document` holds an
//      EventBrief or a LogisticsPack byte-for-byte unchanged, and `workspaceId` sits beside it in
//      the row. `packages/schema` stays at 1.1.0 and never learns what a workspace is — which is
//      what keeps the seven installable `.skill` packages, which write plain local JSON and have
//      no concept of tenancy, importable into the app.
//
//   2. **Constraints belong in the database.** A unique index is enforced under concurrency; an
//      application-level check is enforced only when the code that remembers to run it does.
//      Every uniqueness rule that matters to correctness is declared here, not in a route handler.

import { ROLES } from "@event-toolkit/access";
import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Every timestamp is stored with a timezone. A naive timestamp is a bug waiting for a region change. */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * Derived from `packages/access` rather than re-typed, so the database and the permission model
 * cannot disagree about what a role is. Adding a role there and forgetting here would otherwise
 * produce an insert that fails only in production.
 */
export const roleEnum = pgEnum("role", ROLES as [string, ...string[]]);

/* -------------------------------------------------------------------------- */
/* Auth.js adapter tables                                                      */
/*                                                                             */
/* Column names follow the @auth/drizzle-adapter contract exactly. They are    */
/* not ours to rename: the adapter queries these names directly, so a tidier   */
/* `emailVerifiedAt` would typecheck and then fail at runtime on first login.  */
/* -------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: id(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: ts("emailVerified"),
  image: text("image"),
  /** Null for magic-link-only users, who never set one. */
  passwordHash: text("password_hash"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

/**
 * Database sessions, not JWTs. FR-7 requires that removing a member kills their access *now*,
 * and a stateless token cannot be revoked before it expires — deleting the row is the mechanism.
 */
export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: ts("expires").notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: ts("expires").notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* -------------------------------------------------------------------------- */
/* Workspaces and membership                                                   */
/* -------------------------------------------------------------------------- */

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  /** Retained if the creator's account is deleted — FR-11 requires transfer, not orphaning. */
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  /** FR-9: set once the local-data migration has run, so it is offered once and not on every visit. */
  migratedAt: ts("migrated_at"),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [
    // One membership per person per workspace. Without this, a double-clicked "accept invitation"
    // gives someone two rows and two roles, and which one `can()` sees is a race.
    uniqueIndex("memberships_workspace_user_uq").on(t.workspaceId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    acceptedAt: ts("accepted_at"),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    // At most one *live* invitation per email per workspace. Partial, because a revoked or
    // accepted invitation must not block re-inviting someone later — which is exactly what a
    // plain unique(workspaceId, email) would do the first time somebody leaves and comes back.
    uniqueIndex("invitations_pending_uq")
      .on(t.workspaceId, t.email)
      .where(sql`${t.revokedAt} is null and ${t.acceptedAt} is null`),
    index("invitations_email_idx").on(t.email),
  ],
);

/**
 * FR-8. A credential in a URL, so it is scoped as narrowly as the product can manage: one
 * logistics pack, expiring, revocable. `packages/access` decides what it confers; this table only
 * records it.
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    logisticsPackId: text("logistics_pack_id").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("share_links_workspace_idx").on(t.workspaceId)],
);

/**
 * FR-10, and PRD 10 FR-6's access log for attendee data.
 *
 * `actorUserId` deliberately does NOT cascade on user deletion: an audit trail that disappears
 * when the person being audited deletes their account is not an audit trail.
 */
export const accessEvents = pgTable(
  "access_events",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Kept as free text: the vocabulary grows every PRD, and an enum migration per verb is friction for no gain. */
    action: text("action").notNull(),
    targetId: text("target_id"),
    detail: jsonb("detail"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("access_events_workspace_at_idx").on(t.workspaceId, t.at)],
);

/* -------------------------------------------------------------------------- */
/* The document envelope                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every tool's documents, stored whole.
 *
 * `kind` names the IndexedDB store the document came from, so the local and hosted tiers describe
 * the same thing the same way. `document` is the existing shape, untouched — no flattening into
 * columns that would then have to track schema 1.1.0 by hand.
 *
 * PRD 8 writes here only through the migration endpoint (FR-9). PRD 9 builds the live sync path
 * on top of `version` and `deletedAt`.
 */
export const records = pgTable(
  "records",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** The document's own id, preserved from local storage so cross-tool references survive migration. */
    documentId: text("document_id").notNull(),
    document: jsonb("document").notNull(),
    /** Bumped on every write. PRD 9's optimistic concurrency check compares against it. */
    version: integer("version").notNull().default(1),
    /**
     * The sync cursor (PRD 9 §5), assigned by the database and bumped on every write.
     *
     * Never a timestamp. Two servers with a few milliseconds of clock skew would reorder records
     * between them, and a client that pulled "everything since 10:04:02" would silently skip a
     * record written at 10:04:01 by the machine whose clock ran fast. A sequence cannot skew.
     */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    /** Tombstone. A deletion has to be a row PRD 9 can propagate, not an absence it cannot see. */
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    // The constraint that makes FR-9's migration idempotent: re-running it upserts onto the same
    // row rather than producing a second copy of every event.
    uniqueIndex("records_workspace_kind_document_uq").on(t.workspaceId, t.kind, t.documentId),
    // PRD 9 pulls "everything in this workspace changed since X".
    index("records_workspace_updated_idx").on(t.workspaceId, t.updatedAt),
    // PRD 9 pulls "everything in this workspace after cursor N", in sequence order.
    index("records_workspace_seq_idx").on(t.workspaceId, t.seq),
  ],
);

/* -------------------------------------------------------------------------- */
/* Retention policy (PRD 10 FR-4) — one row per workspace                      */
/* -------------------------------------------------------------------------- */

export const retentionPolicies = pgTable("retention_policies", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  /** Months after event end before attendee data is purged. PRD 10's default is 12. */
  months: integer("months").notNull().default(12),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: ts("last_run_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  memberships: many(memberships),
  records: many(records),
  invitations: many(invitations),
  shareLinks: many(shareLinks),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  workspace: one(workspaces, { fields: [memberships.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const recordsRelations = relations(records, ({ one }) => ({
  workspace: one(workspaces, { fields: [records.workspaceId], references: [workspaces.id] }),
}));
