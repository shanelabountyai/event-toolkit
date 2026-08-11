// packages/server-db/src/client.ts
//
// The one connection. Created lazily so that importing anything from this package — a type, the
// schema — does not require a database to exist. That matters: `pnpm verify` typechecks and builds
// with no Postgres anywhere, and it must stay that way.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (database) return database;

  const url = process.env.DATABASE_URL;
  if (!url) {
    // Loud and specific. A silent fallback to a local database is how staging quietly writes to
    // the wrong place for a week.
    throw new Error(
      "DATABASE_URL is not set. The hosted tier needs a Postgres connection string; " +
        "local-only mode does not use this package at all.",
    );
  }

  // One connection per serverless invocation: a pool that outlives the request is a pool that
  // exhausts the database's connection limit under any real traffic.
  client = postgres(url, { max: 1, prepare: false });
  database = drizzle(client, { schema });
  return database;
}

export type Database = ReturnType<typeof getDb>;
export { schema };
