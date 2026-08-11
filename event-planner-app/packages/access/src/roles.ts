// packages/access/src/roles.ts
//
// PRD 8 — the role matrix, expressed as data.
//
// The PRD states permissions as a table of roles × tools. This file *is* that table, and every
// capability is derived from it rather than written out by hand. Hand-listing capabilities per
// role is how a role silently gains one nobody intended, and in this product that mistake is an
// attendee data leak rather than a cosmetic bug.
//
// Pure TypeScript: no React, no Next, no database. That is what lets `access-check` exercise
// every role against every capability, including the negatives, which are the cases that matter.

/** The seven built tools, as permission subjects. */
export type Tool = "brief" | "promo" | "logistics" | "budget" | "leads" | "roi" | "retro";

export const TOOLS: Tool[] = ["brief", "promo", "logistics", "budget", "leads", "roi", "retro"];

/** Access level for one tool. `edit` always implies `view` — see `capabilitiesFor`. */
export type Level = "none" | "view" | "edit";

export type Role = "owner" | "admin" | "planner" | "coordinator" | "finance";

export const ROLES: Role[] = ["owner", "admin", "planner", "coordinator", "finance"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  planner: "Planner",
  coordinator: "Coordinator",
  finance: "Finance",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full access, manages people, and is the only role that can delete the workspace.",
  admin: "Full access to every tool and manages people. Cannot delete the workspace or remove an owner.",
  planner: "Full access to every tool. Can see who is in the workspace but not change it.",
  coordinator:
    "Runs promo and logistics for events they're on. Deliberately cannot see attendee data or budgets.",
  finance: "Owns budgets and reads the ROI report. No access to attendee data.",
};

interface RoleGrant {
  tools: Record<Tool, Level>;
  members: "none" | "view" | "manage";
  canDeleteWorkspace: boolean;
}

/**
 * The normative table from PRD 8 §FR-3.
 *
 * Owner and Admin differ in exactly two ways, both encoded here and in `canRemoveMember`:
 * an Owner can delete the workspace, and an Owner cannot be removed by an Admin.
 *
 * Coordinator and Finance are the two roles with `leads: "none"`. That is not an oversight or a
 * convenience — `leads` is the only tool holding third-party personal data, so it is the one
 * permission with a legal consequence attached (PRD 10). Widening it is a decision with an
 * external cost, not an internal one.
 */
const ROLE_MATRIX: Record<Role, RoleGrant> = {
  owner: {
    tools: { brief: "edit", promo: "edit", logistics: "edit", budget: "edit", leads: "edit", roi: "edit", retro: "edit" },
    members: "manage",
    canDeleteWorkspace: true,
  },
  admin: {
    tools: { brief: "edit", promo: "edit", logistics: "edit", budget: "edit", leads: "edit", roi: "edit", retro: "edit" },
    members: "manage",
    canDeleteWorkspace: false,
  },
  planner: {
    tools: { brief: "edit", promo: "edit", logistics: "edit", budget: "edit", leads: "edit", roi: "edit", retro: "edit" },
    members: "view",
    canDeleteWorkspace: false,
  },
  coordinator: {
    tools: { brief: "view", promo: "edit", logistics: "edit", budget: "none", leads: "none", roi: "none", retro: "view" },
    members: "view",
    canDeleteWorkspace: false,
  },
  finance: {
    tools: { brief: "view", promo: "none", logistics: "none", budget: "edit", leads: "none", roi: "view", retro: "view" },
    members: "view",
    canDeleteWorkspace: false,
  },
};

/**
 * True only for a role this build actually knows.
 *
 * Roles arrive from the database and, in principle, from a tampered session. An unrecognised
 * value must deny, never throw: a permission check that crashes is one a caller might wrap in
 * a try/catch that fails open, and it is a 500 in the best case.
 */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

/** Undefined for any role this build does not recognise. Callers must treat that as "no access". */
export function grantFor(role: Role): RoleGrant | undefined {
  return isRole(role) ? ROLE_MATRIX[role] : undefined;
}

export function levelFor(role: Role, tool: Tool): Level {
  return grantFor(role)?.tools[tool] ?? "none";
}

/**
 * Who may remove whom.
 *
 * An Admin manages members but cannot remove an Owner — otherwise "Owner" would be a label
 * rather than a protection. Only an Owner can remove an Owner, and `wouldLeaveNoOwner` guards
 * the case where that is the last one.
 */
export function canRemoveMember(actorRole: Role, targetRole: Role): boolean {
  if (!isRole(actorRole) || !isRole(targetRole)) return false;
  if (ROLE_MATRIX[actorRole].members !== "manage") return false;
  if (targetRole === "owner") return actorRole === "owner";
  return true;
}

/** A workspace must always retain at least one owner. */
export function wouldLeaveNoOwner(
  currentRoles: Role[],
  targetRole: Role,
  change: "remove" | { newRole: Role },
): boolean {
  const owners = currentRoles.filter((r) => r === "owner").length;
  if (targetRole !== "owner") return false;
  if (change === "remove") return owners <= 1;
  return change.newRole !== "owner" && owners <= 1;
}
