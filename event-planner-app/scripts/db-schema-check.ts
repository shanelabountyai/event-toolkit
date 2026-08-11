/**
 * Asserts the hosted tier's schema says what PRD 8 §5 requires — against the *generated SQL*,
 * not just the TypeScript.
 *
 * Drizzle's table objects are easy to read and easy to be wrong about: a `uniqueIndex` that never
 * made it into a migration is invisible in the source and absent in the database. So this reads
 * the emitted migration and checks the constraints that carry a consequence:
 *
 *   - the uniqueness that makes FR-9's migration idempotent rather than duplicating every event
 *   - the uniqueness that stops one person holding two roles in one workspace
 *   - cascade on workspace deletion, so deleting a workspace does not strand attendee data
 *   - NO cascade on the audit log's actor, so an audit trail survives the account it audits
 *
 * Runs with no database. That is the point: `pnpm verify` must stay runnable on a laptop and in
 * CI with nothing provisioned.
 *
 * Run with: pnpm db-schema-check
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROLES } from "../packages/access/src/index";
import { accessEvents, memberships, records, roleEnum } from "../packages/server-db/src/schema";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "packages", "server-db", "drizzle");

function generatedSql(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) {
    console.error(
      "\nNo generated migration found. Run `pnpm --filter @event-toolkit/server-db generate`.\n",
    );
    process.exit(1);
  }
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8")).join("\n");
}

/** Collapses whitespace so assertions do not depend on how drizzle-kit happens to wrap a line. */
function normalise(sql: string): string {
  return sql.replace(/\s+/g, " ").toLowerCase();
}

function main(): void {
  const sql = normalise(generatedSql());

  console.log("\nThe database enforces what the permission model believes");
  check(
    `the role enum is exactly the ${ROLES.length} roles in packages/access`,
    roleEnum.enumValues.length === ROLES.length && ROLES.every((r) => roleEnum.enumValues.includes(r)),
    `db has [${roleEnum.enumValues.join(", ")}], access has [${ROLES.join(", ")}]`,
  );
  check(
    "…and that enum reaches the database",
    ROLES.every((r) => sql.includes(`'${r}'`)),
  );

  console.log("\nUniqueness that correctness depends on");
  check(
    "one row per (workspace, kind, document) — this is what makes migration idempotent",
    sql.includes("records_workspace_kind_document_uq") &&
      /unique index "records_workspace_kind_document_uq"[^;]*"workspace_id"[^;]*"kind"[^;]*"document_id"/.test(sql),
  );
  check(
    "one membership per person per workspace",
    /unique index "memberships_workspace_user_uq"[^;]*"workspace_id"[^;]*"user_id"/.test(sql),
  );
  check(
    "at most one live invitation per email per workspace",
    sql.includes("invitations_pending_uq"),
  );
  check(
    "…and that uniqueness is partial, so a revoked invitation does not block re-inviting someone",
    /invitations_pending_uq[^;]*where[^;]*revoked_at" is null[^;]*accepted_at" is null/.test(sql),
    "a plain unique index here would permanently bar anyone who ever left",
  );
  check(
    "share link tokens are unique",
    /"share_links"[^;]*"token" text not null[^;]*unique/.test(sql) || sql.includes("share_links_token_unique"),
  );
  check("invitation tokens are unique", sql.includes("invitations_token_unique"));
  check("one account per email address", sql.includes("users_email_unique"));

  console.log("\nDeletion behaviour");
  check(
    "deleting a workspace takes its records with it",
    /"records"[\s\S]*?references "public"."workspaces"\("id"\) on delete cascade/.test(sql) ||
      /records_workspace_id_workspaces_id_fk[^;]*on delete cascade/.test(sql),
  );
  check(
    "deleting a workspace takes its memberships with it",
    /memberships_workspace_id_workspaces_id_fk[^;]*on delete cascade/.test(sql),
  );
  check(
    "deleting a user takes their sessions with it — FR-7 revokes access by deleting rows",
    /sessions_userid_users_id_fk[^;]*on delete cascade/.test(sql),
  );
  check(
    "⭐ the audit log's actor does NOT cascade — an audit trail must outlive the account it audits",
    /access_events_actor_user_id_users_id_fk[^;]*on delete set null/.test(sql),
    "if this became a cascade, deleting an account would erase the record of what it did",
  );

  console.log("\nThe envelope keeps tenancy out of the documents");
  check("records carry a workspace id", "workspaceId" in records);
  check("records store the document whole, as jsonb", records.document.getSQLType() === "jsonb");
  check("records keep the document's own id, so cross-tool references survive", "documentId" in records);
  check("records have a version for PRD 9's concurrency check", "version" in records);
  check("records can be tombstoned rather than only removed", "deletedAt" in records);
  check(
    "every workspace-scoped table names its tenant the same way",
    [memberships, records, accessEvents].every((t) => "workspaceId" in t),
  );

  console.log("\nTimestamps");
  check(
    "every timestamp carries a timezone",
    (sql.match(/timestamp/g) ?? []).length > 0 &&
      (sql.match(/timestamp(?! with time zone)/g) ?? []).length === 0,
    "a naive timestamp is a bug waiting for a region change",
  );

  if (failures > 0) {
    console.error(`\n${failures} schema check(s) failed.\n`);
    console.error("If the schema changed deliberately, regenerate the migration:");
    console.error("  pnpm --filter @event-toolkit/server-db generate\n");
    process.exit(1);
  }
  console.log("\nAll database schema checks passed.\n");
}

main();
