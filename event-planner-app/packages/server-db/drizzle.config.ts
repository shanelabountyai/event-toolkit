import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Only read when actually applying migrations. `drizzle-kit generate` works offline, which is
  // what lets the schema be reviewed and committed before any database is provisioned.
  // Migrations run on the direct endpoint. Neon's pooler is PgBouncer in transaction mode and
  // does not hold a session across statements, so DDL can fail or half-apply through it. Falls
  // back to DATABASE_URL so a plain setup still works.
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "" },
  strict: true,
});
