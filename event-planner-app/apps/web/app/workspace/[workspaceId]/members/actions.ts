"use server";

import { revalidatePath } from "next/cache";
import {
  InvitationError,
  MembershipError,
  changeRole,
  getDb,
  inviteMember,
  removeMember,
  revokeInvitation,
} from "@event-toolkit/server-db";
import { PermissionError, ROLES, type Role } from "@event-toolkit/access";
import { accessContextFor } from "@/lib/session";

export interface ActionState {
  error?: string;
  ok?: string;
}

/**
 * Every action here resolves its own context rather than trusting one passed from the client.
 *
 * A workspace id posted in a form is a claim, not a fact. `accessContextFor` reads the caller's
 * actual role from the database for that workspace, so a forged id yields a null role and every
 * `assertCan` below refuses.
 */
async function contextFor(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  if (!workspaceId) throw new PermissionError("members:manage");
  const ctx = await accessContextFor(workspaceId);
  if (!ctx) throw new PermissionError("members:manage");
  return ctx;
}

/** Turns the domain's typed failures into something a person can read. */
function toMessage(error: unknown): string {
  if (error instanceof MembershipError || error instanceof InvitationError) return error.message;
  if (error instanceof PermissionError) return "You don't have permission to do that.";
  console.error("member action failed", error);
  return "Something went wrong. Try again.";
}

export async function inviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await contextFor(formData);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const role = String(formData.get("role") ?? "") as Role;

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter an email address." };
    // The role arrives from a <select>, which is to say it arrives from the network.
    if (!ROLES.includes(role)) return { error: "Pick a role." };

    await inviteMember(getDb(), ctx, email, role);
    revalidatePath(`/workspace/${ctx.workspaceId}/members`);
    return { ok: `Invitation sent to ${email}.` };
  } catch (error) {
    return { error: toMessage(error) };
  }
}

export async function changeRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await contextFor(formData);
    const userId = String(formData.get("userId") ?? "");
    const role = String(formData.get("role") ?? "") as Role;
    if (!ROLES.includes(role)) return { error: "Pick a role." };

    await changeRole(getDb(), ctx, userId, role);
    revalidatePath(`/workspace/${ctx.workspaceId}/members`);
    return { ok: "Role updated." };
  } catch (error) {
    return { error: toMessage(error) };
  }
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await contextFor(formData);
    await removeMember(getDb(), ctx, String(formData.get("userId") ?? ""));
    revalidatePath(`/workspace/${ctx.workspaceId}/members`);
    return { ok: "Removed. Their sessions have been ended." };
  } catch (error) {
    return { error: toMessage(error) };
  }
}

export async function revokeInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await contextFor(formData);
    await revokeInvitation(getDb(), ctx, String(formData.get("invitationId") ?? ""));
    revalidatePath(`/workspace/${ctx.workspaceId}/members`);
    return { ok: "Invitation revoked." };
  } catch (error) {
    return { error: toMessage(error) };
  }
}
