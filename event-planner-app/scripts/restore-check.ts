/**
 * PRD 10 FR-7 — verify a restored database.
 *
 * "An untested backup is not a backup" is easy to write and easy to leave as a sentence. This is
 * the sentence made runnable: point it at a database restored from a backup or a point-in-time
 * branch, and it says whether the restore is actually usable.
 *
 * It is **read-only**. A restore rehearsal that mutates the thing it is checking cannot be run
 * against a branch of production, which is exactly what you want to rehearse against.
 *
 * Run with: RESTORED_DATABASE_URL=<restored> pnpm restore-check
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../packages/server-db/src/schema";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const EXPECTED_TABLES = [
  "users",
  "accounts",
  "sessions",
  "verificationToken",
  "workspaces",
  "memberships",
  "invitations",
  "share_links",
  "access_events",
  "records",
  "retention_policies",
];

async function main(): Promise<void> {
  const url = process.env.RESTORED_DATABASE_URL;
  if (!url) {
    console.error(
      "\nRESTORED_DATABASE_URL is not set.\n\n" +
        "Restore a backup (or create a Neon point-in-time branch), then point this at it.\n" +
        "Deliberately a different variable from DATABASE_URL, so a rehearsal cannot be run\n" +
        "against the live database by forgetting to change one word.\n",
    );
    process.exit(1);
  }

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  console.log(`\nVerifying restore: ${url.split("@")[1]?.split("/")[0] ?? "unknown"}\n`);

  try {
    console.log("Structure");
    const tables = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    );
    const names = new Set(tables.map((t) => t.tablename));
    const missing = EXPECTED_TABLES.filter((t) => !names.has(t));
    check(`all ${EXPECTED_TABLES.length} tables are present`, missing.length === 0, missing.join(", "));

    const indexes = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_indexes where schemaname = 'public'`,
    );
    check("indexes were restored, not just tables", Number(indexes[0]?.n ?? 0) >= 20, `${indexes[0]?.n} indexes`);

    const partial = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_indexes
          where indexname = 'invitations_pending_uq' and indexdef ilike '%where%'`,
    );
    check("…including the partial unique index", Number(partial[0]?.n ?? 0) === 1);

    console.log("\nContent");
    const counts = await db.execute<{ users: number; workspaces: number; records: number; live: number }>(
      sql`select
            (select count(*)::int from users) as users,
            (select count(*)::int from workspaces) as workspaces,
            (select count(*)::int from records) as records,
            (select count(*)::int from records where deleted_at is null) as live`,
    );
    const c = counts[0];
    console.log(`  ${c.users} users · ${c.workspaces} workspaces · ${c.records} records (${c.live} live)`);
    check("the restore contains data", (c.users ?? 0) > 0 && (c.workspaces ?? 0) > 0);
    check("…and documents, not just accounts", (c.records ?? 0) > 0);

    console.log("\nIntegrity — the parts a partial restore breaks first");
    const orphanMembers = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from memberships m
          left join workspaces w on w.id = m.workspace_id where w.id is null`,
    );
    check("no membership points at a missing workspace", Number(orphanMembers[0]?.n ?? 0) === 0);

    const orphanRecords = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from records r
          left join workspaces w on w.id = r.workspace_id where w.id is null`,
    );
    check("no record points at a missing workspace", Number(orphanRecords[0]?.n ?? 0) === 0);

    const ownerless = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from workspaces w
          where not exists (select 1 from memberships m where m.workspace_id = w.id and m.role = 'owner')`,
    );
    check(
      "every workspace still has an owner",
      Number(ownerless[0]?.n ?? 0) === 0,
      "an ownerless workspace is one nobody can administer",
    );

    const seq = await db.execute<{ maxseq: number; nextval: number }>(
      sql`select coalesce(max(seq), 0)::int as maxseq,
                 (select last_value::int from records_seq_seq) as nextval from records`,
    );
    check(
      "⭐ the sync sequence is ahead of the data",
      Number(seq[0]?.nextval ?? 0) >= Number(seq[0]?.maxseq ?? 0),
      "a sequence restored behind its table hands out cursors that clients have already seen, " +
        "so every device silently stops receiving updates",
    );

    console.log("\nPrivacy obligations survive the restore");
    const policies = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from retention_policies`,
    );
    console.log(`  ${policies[0]?.n ?? 0} explicit retention policies (workspaces without one use the 12-month default)`);
    const audit = await db.execute<{ n: number }>(sql`select count(*)::int as n from access_events`);
    check(
      "the access log came back",
      Number(audit[0]?.n ?? 0) > 0,
      "an audit trail that does not survive a restore is not an audit trail",
    );
  } finally {
    await client.end();
  }

  if (failures > 0) {
    console.error(`\n${failures} restore check(s) failed. This restore is NOT usable.\n`);
    process.exit(1);
  }
  console.log(
    "\nThis restore is usable.\n\n" +
      "Record the date in docs/V2-STATUS.md — an unrecorded rehearsal is one nobody can point to.\n",
  );
}

void main();
