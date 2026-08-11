// packages/access/src/capabilities.ts
//
// Capabilities are named for what someone may *do*, never for a route or a screen. Routes move;
// "may this person read attendee data" does not.

import { TOOLS, grantFor, type Level, type Role, type Tool } from "./roles";

export type Capability =
  | `${Tool}:view`
  | `${Tool}:edit`
  /**
   * Deliberately separable from `logistics:edit`. A read-only share link handed to on-site staff
   * grants exactly this and nothing else — the whole point of the link is that someone standing
   * in a venue can report a problem without being given the run of the workspace.
   */
  | "logistics:log_issue"
  | "members:view"
  | "members:manage"
  | "workspace:delete";

export const ALL_CAPABILITIES: Capability[] = [
  ...TOOLS.flatMap((tool) => [`${tool}:view`, `${tool}:edit`] as Capability[]),
  "logistics:log_issue",
  "members:view",
  "members:manage",
  "workspace:delete",
];

/** Capabilities that expose third-party personal data. PRD 10 treats these specially. */
export const PII_CAPABILITIES: Capability[] = ["leads:view", "leads:edit"];

const LEVEL_CAPABILITIES: Record<Level, ("view" | "edit")[]> = {
  none: [],
  view: ["view"],
  // Edit implies view. Deriving it removes a whole class of mistake where a role can write
  // something it cannot read.
  edit: ["view", "edit"],
};

/** Every capability a role holds, derived from the matrix rather than hand-listed. */
export function capabilitiesFor(role: Role): Capability[] {
  const grant = grantFor(role);
  // Unknown role → no capabilities. Deny by default, and never throw out of a permission check.
  if (!grant) return [];
  const out: Capability[] = [];

  for (const tool of TOOLS) {
    for (const verb of LEVEL_CAPABILITIES[grant.tools[tool]]) {
      out.push(`${tool}:${verb}` as Capability);
    }
  }

  // Anyone who can edit logistics can obviously log an issue against it.
  if (grant.tools.logistics === "edit") out.push("logistics:log_issue");

  if (grant.members !== "none") out.push("members:view");
  if (grant.members === "manage") out.push("members:manage");
  if (grant.canDeleteWorkspace) out.push("workspace:delete");

  return out;
}

/** Human-readable, for the members screen and for permission-denied messages. */
export const CAPABILITY_LABELS: Partial<Record<Capability, string>> = {
  "leads:view": "See attendee data",
  "leads:edit": "Import and edit attendee data",
  "budget:edit": "Edit budgets",
  "members:manage": "Add and remove people",
  "workspace:delete": "Delete the workspace",
  "logistics:log_issue": "Log an on-site issue",
};
