/**
 * Headless exercise of the permission model (PRD 8).
 *
 * A wrong number in a budget is a bug. A wrong answer from `can()` is an attendee data leak, so
 * this script checks the full truth table — every role against every capability — rather than
 * spot-checking the happy path. **The negatives are the point**: proving a Coordinator cannot
 * read attendee data matters more than proving an Owner can.
 *
 * The expected matrix below is written out by hand from PRD 8 §FR-3, deliberately NOT derived
 * from `capabilitiesFor()`. Deriving it would make this file agree with the implementation by
 * construction and test nothing at all.
 *
 * Run with: pnpm access-check
 */

import {
  ALL_CAPABILITIES,
  PII_CAPABILITIES,
  ROLES,
  TOOLS,
  can,
  canRemoveMember,
  capabilitiesFor,
  capabilitiesOf,
  isShareLinkValid,
  wouldLeaveNoOwner,
  type AccessContext,
  type Capability,
  type Role,
  type Tool,
} from "../packages/access/src/index";

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/* -------------------------------------------------------------------------- */
/* The expected matrix — transcribed from the PRD, independent of the code     */
/* -------------------------------------------------------------------------- */

type Level = "none" | "view" | "edit";

const EXPECTED: Record<Role, { tools: Record<Tool, Level>; members: "none" | "view" | "manage"; deleteWorkspace: boolean }> = {
  owner: {
    tools: { brief: "edit", promo: "edit", logistics: "edit", budget: "edit", leads: "edit", roi: "edit", retro: "edit" },
    members: "manage", deleteWorkspace: true,
  },
  admin: {
    tools: { brief: "edit", promo: "edit", logistics: "edit", budget: "edit", leads: "edit", roi: "edit", retro: "edit" },
    members: "manage", deleteWorkspace: false,
  },
  planner: {
    tools: { brief: "edit", promo: "edit", logistics: "edit", budget: "edit", leads: "edit", roi: "edit", retro: "edit" },
    members: "view", deleteWorkspace: false,
  },
  coordinator: {
    tools: { brief: "view", promo: "edit", logistics: "edit", budget: "none", leads: "none", roi: "none", retro: "view" },
    members: "view", deleteWorkspace: false,
  },
  finance: {
    tools: { brief: "view", promo: "none", logistics: "none", budget: "edit", leads: "none", roi: "view", retro: "view" },
    members: "view", deleteWorkspace: false,
  },
};

function ctxFor(role: Role | null): AccessContext {
  return { userId: "u1", workspaceId: "w1", role };
}

function expectedHas(role: Role, capability: Capability): boolean {
  const spec = EXPECTED[role];
  if (capability === "workspace:delete") return spec.deleteWorkspace;
  if (capability === "members:manage") return spec.members === "manage";
  if (capability === "members:view") return spec.members !== "none";
  if (capability === "logistics:log_issue") return spec.tools.logistics === "edit";

  const [tool, verb] = capability.split(":") as [Tool, "view" | "edit"];
  const level = spec.tools[tool];
  if (verb === "edit") return level === "edit";
  return level === "view" || level === "edit"; // edit implies view
}

function main(): void {
  console.log("\nThe full truth table — every role against every capability");
  let mismatches = 0;
  for (const role of ROLES) {
    for (const capability of ALL_CAPABILITIES) {
      const actual = can(ctxFor(role), capability, "pack-1");
      const expected = expectedHas(role, capability);
      if (actual !== expected) {
        mismatches += 1;
        console.error(`      ${role} × ${capability}: expected ${expected}, got ${actual}`);
      }
    }
  }
  check(
    `all ${ROLES.length * ALL_CAPABILITIES.length} role/capability pairs match the PRD`,
    mismatches === 0,
    `${mismatches} mismatch(es)`,
  );

  console.log("\nThe negatives that carry a legal consequence");
  check("a coordinator cannot see attendee data", !can(ctxFor("coordinator"), "leads:view"));
  check("a coordinator cannot edit attendee data", !can(ctxFor("coordinator"), "leads:edit"));
  check("finance cannot see attendee data", !can(ctxFor("finance"), "leads:view"));
  check("finance cannot edit attendee data", !can(ctxFor("finance"), "leads:edit"));
  check(
    "only owner, admin and planner hold any PII capability",
    ROLES.filter((r) => PII_CAPABILITIES.some((c) => can(ctxFor(r), c))).join(",") === "owner,admin,planner",
  );

  console.log("\nOther structural guarantees");
  check("only an owner can delete the workspace",
    ROLES.filter((r) => can(ctxFor(r), "workspace:delete")).join(",") === "owner");
  check("a coordinator cannot touch budgets", !can(ctxFor("coordinator"), "budget:view") && !can(ctxFor("coordinator"), "budget:edit"));
  check("finance cannot touch logistics", !can(ctxFor("finance"), "logistics:view") && !can(ctxFor("finance"), "logistics:edit"));
  check("edit implies view for every role and tool", ROLES.every((role) =>
    TOOLS.every((tool) => !can(ctxFor(role), `${tool}:edit` as Capability) || can(ctxFor(role), `${tool}:view` as Capability))));
  check("nobody can edit something they cannot read", ROLES.every((role) => {
    const caps = capabilitiesFor(role);
    return caps.filter((c) => c.endsWith(":edit")).every((c) => caps.includes(c.replace(":edit", ":view") as Capability));
  }));

  console.log("\nDeny by default");
  check("a non-member gets nothing", ALL_CAPABILITIES.every((c) => !can(ctxFor(null), c, "pack-1")));
  check("…and holds no capabilities at all", capabilitiesOf(ctxFor(null)).length === 0);
  check("an empty context is denied",
    !can({ userId: "", workspaceId: "", role: "owner" }, "brief:view"));
  check("an unknown capability is denied",
    !can(ctxFor("owner"), "nonsense:invent" as Capability));
  check("an unknown role is denied",
    !can({ userId: "u", workspaceId: "w", role: "superuser" as Role }, "brief:view"));

  /* ---------------------------------------------------------------- */
  console.log("\nShare links — a credential in a URL, scoped as narrowly as possible");
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const linkCtx = (over: Partial<AccessContext["viaShareLink"]> = {}, role: Role | null = null): AccessContext => ({
    userId: "anon", workspaceId: "w1", role,
    viaShareLink: { logisticsPackId: "pack-1", expiresAt: future, revoked: false, ...over },
  });

  check("grants viewing the pack it names", can(linkCtx(), "logistics:view", "pack-1"));
  check("grants logging an issue against it", can(linkCtx(), "logistics:log_issue", "pack-1"));
  check("does NOT grant editing the pack", !can(linkCtx(), "logistics:edit", "pack-1"));
  check("does NOT grant attendee data", !can(linkCtx(), "leads:view", "pack-1"));
  check("does NOT grant budgets", !can(linkCtx(), "budget:view", "pack-1"));
  check("does NOT grant the members list", !can(linkCtx(), "members:view", "pack-1"));
  check("grants nothing for a different pack", !can(linkCtx(), "logistics:view", "pack-2"));
  check("grants nothing when no pack is named", !can(linkCtx(), "logistics:view"));
  check("an expired link grants nothing", !can(linkCtx({ expiresAt: past }), "logistics:view", "pack-1"));
  check("a revoked link grants nothing", !can(linkCtx({ revoked: true }), "logistics:view", "pack-1"));
  check("a malformed expiry grants nothing", !can(linkCtx({ expiresAt: "not a date" }), "logistics:view", "pack-1"));
  check("expiry is evaluated, not assumed", isShareLinkValid({ logisticsPackId: "p", expiresAt: future, revoked: false }));

  check("⭐ a link substitutes for membership rather than adding to it", (() => {
    // An owner who opens a share link is acting as the link, not as an owner. Otherwise a
    // forwarded URL would silently escalate for anyone who happens to have an account.
    const ownerViaLink = linkCtx({}, "owner");
    return !can(ownerViaLink, "leads:view", "pack-1") && !can(ownerViaLink, "members:manage", "pack-1");
  })());
  check("…and an expired link leaves an owner with nothing",
    capabilitiesOf(linkCtx({ expiresAt: past }, "owner")).length === 0);

  /* ---------------------------------------------------------------- */
  console.log("\nMember management");
  check("an admin can remove a planner", canRemoveMember("admin", "planner"));
  check("⭐ an admin cannot remove an owner", !canRemoveMember("admin", "owner"));
  check("an owner can remove an owner", canRemoveMember("owner", "owner"));
  check("a planner cannot remove anyone", !canRemoveMember("planner", "coordinator"));
  check("a coordinator cannot remove anyone", !canRemoveMember("coordinator", "finance"));
  check("finance cannot remove anyone", !canRemoveMember("finance", "planner"));

  console.log("\nA workspace always keeps an owner");
  check("removing the last owner is blocked", wouldLeaveNoOwner(["owner", "planner"], "owner", "remove"));
  check("removing one of two owners is fine", !wouldLeaveNoOwner(["owner", "owner"], "owner", "remove"));
  check("demoting the last owner is blocked",
    wouldLeaveNoOwner(["owner", "planner"], "owner", { newRole: "admin" }));
  check("demoting one of two owners is fine",
    !wouldLeaveNoOwner(["owner", "owner"], "owner", { newRole: "admin" }));
  check("removing a non-owner is never blocked by this rule",
    !wouldLeaveNoOwner(["owner"], "planner", "remove"));

  /* ---------------------------------------------------------------- */
  console.log("\nThe capability set itself");
  check(`every tool has view and edit (${ALL_CAPABILITIES.length} capabilities)`,
    TOOLS.every((t) => ALL_CAPABILITIES.includes(`${t}:view` as Capability) && ALL_CAPABILITIES.includes(`${t}:edit` as Capability)));
  check("no duplicates", new Set(ALL_CAPABILITIES).size === ALL_CAPABILITIES.length);
  check("every capability is reachable by at least one role",
    ALL_CAPABILITIES.every((c) => ROLES.some((r) => can(ctxFor(r), c, "pack-1"))));
  check("capabilitiesOf agrees with can() for every role", ROLES.every((role) => {
    const held = capabilitiesOf(ctxFor(role));
    return ALL_CAPABILITIES.every((c) => held.includes(c) === can(ctxFor(role), c, "pack-1"));
  }));

  if (failures > 0) {
    console.error(`\n${failures} access check(s) failed.\n`);
    process.exit(1);
  }
  console.log("\nAll access checks passed.\n");
}

main();
