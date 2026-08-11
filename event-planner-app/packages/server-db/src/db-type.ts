// The shared supertype of the production (postgres.js) and test (PGlite) drivers. A union of the
// two collapses drizzle's method overloads and makes `.returning()` unresolvable, which is a
// typing artefact rather than a real difference — both are a Postgres.
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schemaTypes from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schemaTypes>;
