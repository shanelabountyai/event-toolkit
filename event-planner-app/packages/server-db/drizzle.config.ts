import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Only read when actually applying migrations. `drizzle-kit generate` works offline, which is
  // what lets the schema be reviewed and committed before any database is provisioned.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
