// packages/sync-engine/src/conflict.ts
//
// PRD 9 §6 — the classification table, and nothing else.
//
// This is the piece where a mistake silently loses someone's work, so it is pure, it is a single
// function, and every row of the table has a named test in `scripts/sync-check.ts`.
//
// The governing principle, which this product has now applied four times: **conflicts are
// surfaced, never auto-resolved.** PRD 5's dedupe never auto-merges an ambiguous match, PRD 2's
// regeneration never overwrites an edited asset, PRD 7's write-back requires per-metric
// confirmation. Silently resolving ambiguity is the one thing this product consistently refuses
// to do, and sync does not get to be the exception.

import { isAppendOnly } from "./kinds";

export interface OutboxEntry {
  id: string;
  workspaceId: string;
  kind: string;
  documentId: string;
  /** null = delete (tombstone). */
  document: unknown | null;
  /** The version this edit was made against. The server rejects it if stale. */
  baseVersion: number;
  /** Who made the edit. Distinguishes "my own second device" from "a colleague". */
  userId: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface ServerRecord {
  kind: string;
  documentId: string;
  document: unknown;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

export type Resolution =
  /** No contest — write it. */
  | "apply"
  /** The user's own sequential edit from another device. Apply without ever prompting. */
  | "fast_forward"
  /** Both edits are kept, merged by item id. Append-only kinds only. */
  | "union"
  /** Genuine disagreement between two people. Surface it; do not choose. */
  | "conflict"
  /** The record was deleted on the server. The local edit does not resurrect it. */
  | "server_wins";

/**
 * Which way does this mutation go?
 *
 * @param server The server's current record, or null when this is the first write of it.
 */
export function classify(
  local: OutboxEntry,
  server: ServerRecord | null,
  currentUserId: string,
): Resolution {
  // First write of this document. Nothing to contest.
  if (!server) return "apply";

  // A deletion beats a concurrent edit. Applying the edit would resurrect a record someone
  // deliberately removed — and under PRD 10 that record may have been deleted because an
  // attendee asked for it to be, which makes silent resurrection a compliance failure rather
  // than a merge inconvenience. The caller must tell the user.
  if (server.deletedAt !== null) return "server_wins";

  // The common case: nobody moved underneath this edit.
  if (server.version === local.baseVersion) return "apply";

  // Server is *behind* the base we edited against. That should be impossible — a version only
  // ever rises — so it means the client is carrying state from a database that no longer
  // exists (a restore, a workspace re-migration). Surface it rather than guess.
  if (server.version < local.baseVersion) return "conflict";

  // Stale base from here down: somebody else's write landed first.

  // A planner editing on their laptop and then their phone is one person having one thought.
  // Exactly one version ahead and the same author means their own previous edit, so prompting
  // them to resolve a conflict with themselves would be noise — and noise here trains people to
  // dismiss the prompts that matter.
  if (
    server.updatedBy !== null &&
    server.updatedBy === currentUserId &&
    local.userId === currentUserId &&
    server.version === local.baseVersion + 1
  ) {
    return "fast_forward";
  }

  // Different people, and the kind is one where both contributions must survive.
  if (isAppendOnly(local.kind)) return "union";

  return "conflict";
}

/** True when the caller must show the user something rather than proceeding silently. */
export function needsUserAttention(resolution: Resolution): boolean {
  return resolution === "conflict" || resolution === "server_wins";
}
