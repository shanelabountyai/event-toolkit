// packages/access/src/can.ts
//
// The one function. No route handler, repository or component implements its own rule.
//
// Two properties matter more than anything else here:
//   1. It denies by default. Every path that is not an explicit grant returns false, including
//      unknown roles and malformed contexts.
//   2. Share links are evaluated *inside* it, not around it. A grant that lives outside the
//      permission check is a grant nobody audits.

import { capabilitiesFor } from "./capabilities";
import type { Capability } from "./capabilities";
import type { Role } from "./roles";

/**
 * A link handed to on-site staff. It is a credential in a URL, so it is scoped as narrowly as
 * the product can manage: one logistics pack, expiring, revocable, and no attendee data ever.
 */
export interface ShareLinkGrant {
  logisticsPackId: string;
  /** ISO datetime. */
  expiresAt: string;
  revoked: boolean;
}

export interface AccessContext {
  userId: string;
  workspaceId: string;
  /** null when the user is not a member of this workspace. */
  role: Role | null;
  /** Present when the request arrived via a share link rather than a session. */
  viaShareLink?: ShareLinkGrant;
}

/** Exactly what a share link confers. Nothing is added to this list without a PRD change. */
const SHARE_LINK_CAPABILITIES: Capability[] = ["logistics:view", "logistics:log_issue"];

export function isShareLinkValid(grant: ShareLinkGrant, now: Date = new Date()): boolean {
  if (grant.revoked) return false;
  const expires = Date.parse(grant.expiresAt);
  if (Number.isNaN(expires)) return false;
  return expires > now.getTime();
}

/**
 * May this actor do this thing?
 *
 * @param resourceId For capabilities scoped to one object — currently the logistics pack a share
 *   link is bound to. Omitting it when a share link is in play denies, rather than granting
 *   across every pack in the workspace.
 */
export function can(
  ctx: AccessContext,
  capability: Capability,
  resourceId?: string,
  now: Date = new Date(),
): boolean {
  if (!ctx || !ctx.workspaceId) return false;

  // Share-link access is a complete substitute for membership, never an addition to it: a link
  // grants its two capabilities and nothing else, even if the holder also happens to be a member
  // with a role. Whoever opened the link is acting as the link.
  if (ctx.viaShareLink) {
    if (!isShareLinkValid(ctx.viaShareLink, now)) return false;
    if (!SHARE_LINK_CAPABILITIES.includes(capability)) return false;
    // Scoped to one pack. No resourceId means "which pack?" is unanswerable, so: no.
    return resourceId !== undefined && resourceId === ctx.viaShareLink.logisticsPackId;
  }

  if (!ctx.role) return false;
  return capabilitiesFor(ctx.role).includes(capability);
}

/** Throwing form, for repository and route-handler boundaries. */
export class PermissionError extends Error {
  readonly capability: Capability;
  constructor(capability: Capability) {
    super(`Not permitted: ${capability}`);
    this.name = "PermissionError";
    this.capability = capability;
  }
}

export function assertCan(
  ctx: AccessContext,
  capability: Capability,
  resourceId?: string,
): void {
  if (!can(ctx, capability, resourceId)) throw new PermissionError(capability);
}

/** Every capability this context currently holds — for rendering nav and empty states. */
export function capabilitiesOf(ctx: AccessContext, now: Date = new Date()): Capability[] {
  if (ctx.viaShareLink) {
    return isShareLinkValid(ctx.viaShareLink, now) ? [...SHARE_LINK_CAPABILITIES] : [];
  }
  return ctx.role ? capabilitiesFor(ctx.role) : [];
}
