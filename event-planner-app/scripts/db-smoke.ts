/**
 * Smoke-test a real, provisioned database.
 *
 * `server-db-check` proves the logic against PGlite, which is Postgres but not *this* Postgres.
 * This script runs the same flows against whatever `DATABASE_URL` points at, so a newly
 * provisioned environment is verified rather than assumed. The things that could plausibly differ
 * between an embedded build and a hosted one are exactly what it exercises: the sequence behind
 * the sync cursor, the partial unique index on invitations, and cascade deletes.
 *
 * **It cleans up after itself** — everything it creates hangs off one workspace, which it deletes
 * on the way out, and the cascade takes the rest. It is safe to run against production, which is
 * the point: an environment nobody dares smoke-test is an environment nobody has verified.
 *
 * Deliberately NOT part of `pnpm verify`: CI has no database, and `verify` must keep running on a
 * laptop with nothing provisioned.
 *
 * Run with: DATABASE_URL=... pnpm db-smoke
 */

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  acceptInvitation,
  createWorkspace,
  deleteSubject,
  inviteMember,
  migrateRecords,
  pullRecords,
  pushMutations,
  revokeInvitation,
  roleOf,
  searchSubject,
  users,
  workspaces,
} from "../packages/server-db/src/index";
import * as schema from "../packages/server-db/src/schema";
import type { AccessContext } from "../packages/access/src/index";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("\nDATABASE_URL is not set. Nothing to smoke-test.\n");
    process.exit(1);
  }

  const host = url.split("@")[1]?.split("/")[0] ?? "unknown";
  console.log(`\nSmoke-testing ${host}\n`);

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  // A run-scoped marker, so a failed run leaves rows that are obviously test data and trivially
  // identifiable rather than anonymous debris in somebody's workspace list.
  const stamp = `smoke-${Date.now()}`;
  let workspaceId: string | undefined;

  try {
    console.log("Schema");
    const tables = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from pg_tables where schemaname = 'public'`,
    );
    check("the migration has been applied", Number(tables[0]?.count ?? 0) >= 11, `${tables[0]?.count} tables`);

    const seq = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_class where relkind = 'S' and relname like 'records_seq%'`,
    );
    check("the sync cursor's sequence exists", Number(seq[0]?.n ?? 0) === 1);

    const partial = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_indexes
          where indexname = 'invitations_pending_uq' and indexdef ilike '%where%'`,
    );
    check("the invitation index is partial, not plain", Number(partial[0]?.n ?? 0) === 1);

    console.log("\nEnd-to-end flow");
    const [ownerUser] = await db
      .insert(users)
      .values({ email: `${stamp}-owner@example.invalid`, name: "Smoke Owner" })
      .returning();
    const [inviteeUser] = await db
      .insert(users)
      .values({ email: `${stamp}-invitee@example.invalid`, name: "Smoke Invitee" })
      .returning();

    const ws = await createWorkspace(db, `${stamp} workspace`, ownerUser.id);
    workspaceId = ws.id;
    const owner: AccessContext = { workspaceId: ws.id, userId: ownerUser.id, role: "owner" };
    check("a workspace can be created", (await roleOf(db, ws.id, ownerUser.id)) === "owner");

    const invite = await inviteMember(db, owner, inviteeUser.email, "planner");
    await acceptInvitation(db, invite.token, { id: inviteeUser.id, email: inviteeUser.email });
    check("an invitation can be issued and accepted", (await roleOf(db, ws.id, inviteeUser.id)) === "planner");

    const revoked = await inviteMember(db, owner, `${stamp}-third@example.invalid`, "finance");
    await revokeInvitation(db, owner, revoked.id);
    let reinvited = true;
    try {
      await inviteMember(db, owner, `${stamp}-third@example.invalid`, "coordinator");
    } catch {
      reinvited = false;
    }
    check("⭐ the partial index allows re-inviting after a revoke", reinvited);

    await migrateRecords(db, owner, [
      { kind: "briefs", documentId: `${stamp}-b1`, document: { id: `${stamp}-b1`, name: "Smoke summit" } },
      {
        kind: "leadRecords",
        documentId: `${stamp}-l1`,
        document: { id: `${stamp}-l1`, contact: { email: `${stamp}-attendee@example.invalid`, firstName: "Smoke" } },
      },
    ]);
    const repeated = await migrateRecords(db, owner, [
      { kind: "briefs", documentId: `${stamp}-b1`, document: { id: `${stamp}-b1`, name: "Smoke summit" } },
    ]);
    check("migration is idempotent here too", repeated.inserted === 0 && repeated.updated === 1);

    const before = await pullRecords(db, owner);
    check("pull returns the migrated records", before.records.length === 2);

    await pushMutations(db, owner, [
      {
        id: crypto.randomUUID(),
        workspaceId: ws.id,
        userId: ownerUser.id,
        kind: "briefs",
        documentId: `${stamp}-b1`,
        document: { id: `${stamp}-b1`, name: "Smoke summit, edited" },
        baseVersion: 1,
        queuedAt: new Date().toISOString(),
        attempts: 0,
      },
    ]);
    const after = await pullRecords(db, owner, before.cursor);
    check(
      "⭐ an update advances the real sequence, not just an insert",
      after.records.length === 1 && after.records[0].documentId === `${stamp}-b1`,
      "this is the behaviour most likely to differ between embedded and hosted Postgres",
    );

    const hits = await searchSubject(db, owner, `${stamp}-attendee@example.invalid`);
    check("subject search finds the attendee", hits.length === 1);
    const deletion = await deleteSubject(db, owner, `${stamp}-attendee@example.invalid`);
    check("subject deletion removes them", deletion.deletedRecords === 1);
    check("…and a second search finds nothing", (await searchSubject(db, owner, `${stamp}-attendee@example.invalid`)).length === 0);
  } finally {
    if (workspaceId) {
      // Cascades take memberships, invitations, records and access events with it.
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    }
    await db.delete(users).where(sql`${users.email} like ${`${stamp}%`}`);

    const leftover = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from workspaces where name like ${`${stamp}%`}`,
    );
    check("\nCleanup: nothing left behind", Number(leftover[0]?.n ?? 0) === 0);
    await client.end();
  }

  if (failures > 0) {
    console.error(`\n${failures} smoke check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nThis database is working.\n");
}

void main();
