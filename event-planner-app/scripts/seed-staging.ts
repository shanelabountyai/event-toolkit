/**
 * Seed a staging database from the repository's fixtures.
 *
 * PRD 10 FR-8 is "no production data ever copied to staging", and the suite ships fixtures
 * precisely so that rule costs nothing: staging gets realistic events that are not anybody's.
 *
 * **This script refuses to run against a database holding real people.** The guard is not a naming
 * convention or an environment variable someone can set by mistake — it inspects the target and
 * stops if it finds an account that is not a seed account. A seed script that can be pointed at
 * production is a seed script that eventually is.
 *
 * The demo credentials below are known values, published in this file, and that is fine precisely
 * because of the guard above: they can only ever exist in a database that contains nothing else.
 *
 * Run with: DATABASE_URL=<staging> pnpm seed-staging
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../packages/server-db/src/schema";
import { createWorkspace, migrateRecords, users } from "../packages/server-db/src/index";
import type { AccessContext } from "../packages/access/src/index";

/** Everything the seed creates uses this domain, which is reserved and can never receive mail. */
const SEED_DOMAIN = "@staging.invalid";
const SEED_OWNER = `owner${SEED_DOMAIN}`;
const SEED_PLANNER = `planner${SEED_DOMAIN}`;

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("\nDATABASE_URL is not set.\n");
    process.exit(1);
  }

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  const host = url.split("@")[1]?.split("/")[0] ?? "unknown";
  console.log(`\nSeeding ${host}\n`);

  // ---- The guard -----------------------------------------------------------
  const existing = await db.select({ email: users.email }).from(users);
  const real = existing.filter((u) => !u.email.endsWith(SEED_DOMAIN));
  if (real.length > 0) {
    console.error("REFUSING TO SEED.\n");
    console.error(
      `This database holds ${real.length} account(s) that the seed did not create — so it is not\n` +
        "a staging database. Seeding it would put fixture events beside real ones, and this script\n" +
        "is the wrong tool for that in every case.\n",
    );
    await client.end();
    process.exit(1);
  }

  // ---- Accounts ------------------------------------------------------------
  const [owner] = await db
    .insert(users)
    .values({ email: SEED_OWNER, name: "Staging Owner", emailVerified: new Date() })
    .onConflictDoNothing()
    .returning();
  const [planner] = await db
    .insert(users)
    .values({ email: SEED_PLANNER, name: "Staging Planner", emailVerified: new Date() })
    .onConflictDoNothing()
    .returning();

  const ownerRow = owner ?? (await db.select().from(users).where(eq(users.email, SEED_OWNER)))[0];
  const plannerRow = planner ?? (await db.select().from(users).where(eq(users.email, SEED_PLANNER)))[0];

  const workspace = await createWorkspace(db as never, "Staging workspace", ownerRow.id);
  await db.insert(schema.memberships).values({
    workspaceId: workspace.id,
    userId: plannerRow.id,
    role: "planner",
  });
  console.log(`  workspace: ${workspace.name} (${workspace.id})`);
  console.log(`  accounts:  ${SEED_OWNER} (owner), ${SEED_PLANNER} (planner)`);

  // ---- Events --------------------------------------------------------------
  const conference = fixture("conference-brief-example.json");
  const webinar = fixture("webinar-brief-example.json");
  const budget = fixture("conference-budget-example.json");

  const ctx: AccessContext = { workspaceId: workspace.id, userId: ownerRow.id, role: "owner" };

  const records = [
    { kind: "briefs", documentId: conference.id as string, document: conference },
    { kind: "briefs", documentId: webinar.id as string, document: webinar },
    ...((budget.lineItems as Record<string, unknown>[]) ?? []).map((item) => ({
      kind: "budgetLineItems",
      documentId: item.id as string,
      document: item,
    })),
  ];
  if (budget.settings) {
    const settings = budget.settings as Record<string, unknown>;
    records.push({
      kind: "budgetSettings",
      documentId: (settings.eventBriefId ?? budget.eventBriefId) as string,
      document: settings,
    });
  }

  const result = await migrateRecords(db as never, ctx, records);
  console.log(`  records:   ${result.inserted} inserted, ${result.updated} updated`);

  // Deliberately no attendee data. Staging exercises the permission model and the sync path; it
  // does not need third-party personal data, and inventing plausible attendees is how a test
  // fixture ends up being mistaken for a real export.
  console.log("\n  No attendee records seeded — staging does not need third-party personal data.\n");

  await client.end();
  console.log("Done.\n");
}

void main();
