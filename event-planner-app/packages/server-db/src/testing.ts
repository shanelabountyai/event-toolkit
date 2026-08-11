// packages/server-db/src/testing.ts
//
// A real Postgres, in process, with the real migration applied.
//
// PGlite is Postgres compiled to WebAssembly, so `pnpm verify` exercises the actual schema —
// the partial unique index, the enum, the foreign keys, the sequence — with nothing to
// provision, on a laptop or in CI. The alternative was mocking the database, and a mocked
// database agrees with whatever the code does, which is precisely the thing under test.
//
// Production uses postgres.js against a real server (see `client.ts`). This file is imported only
// by check scripts and never by application code.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

/** A fresh, empty, fully migrated database. Each caller gets its own. */
export async function createTestDb(): Promise<TestDatabase> {
  const client = new PGlite();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    throw new Error(
      "No migration found. Run `pnpm --filter @event-toolkit/server-db generate` first.",
    );
  }

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    // drizzle-kit separates statements with its own marker rather than plain semicolons, which
    // matters because the schema contains function bodies and quoted strings holding both.
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await client.exec(trimmed);
    }
  }

  return drizzle(client, { schema });
}
