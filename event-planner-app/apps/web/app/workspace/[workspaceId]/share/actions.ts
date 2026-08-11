"use server";

import { revalidatePath } from "next/cache";
import { createShareLink, getDb, revokeShareLink } from "@event-toolkit/server-db";
import { PermissionError } from "@event-toolkit/access";
import { accessContextFor } from "@/lib/session";

export interface ShareState {
  error?: string;
  ok?: string;
}

async function contextFor(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const ctx = workspaceId ? await accessContextFor(workspaceId) : null;
  if (!ctx?.role) throw new PermissionError("logistics:edit");
  return ctx;
}

export async function createShareLinkAction(_prev: ShareState, formData: FormData): Promise<ShareState> {
  try {
    const ctx = await contextFor(formData);
    const packId = String(formData.get("packId") ?? "");
    const days = Number(formData.get("days") ?? 0);

    if (!packId) return { error: "Pick an event." };
    // A link with no end date is a credential with no end date. The form offers a range; this is
    // the server refusing anything outside it, because the form is not where the rule lives.
    if (!Number.isFinite(days) || days < 1 || days > 30) {
      return { error: "Choose between 1 and 30 days." };
    }

    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await createShareLink(getDb(), ctx, packId, expiresAt);
    revalidatePath(`/workspace/${ctx.workspaceId}/share`);
    return { ok: "Link created." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: "You don't have permission to share this." };
    console.error("create share link failed", error);
    return { error: "Could not create the link." };
  }
}

export async function revokeShareLinkAction(_prev: ShareState, formData: FormData): Promise<ShareState> {
  try {
    const ctx = await contextFor(formData);
    await revokeShareLink(getDb(), ctx, String(formData.get("linkId") ?? ""));
    revalidatePath(`/workspace/${ctx.workspaceId}/share`);
    return { ok: "Link turned off." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: "You don't have permission to do that." };
    console.error("revoke share link failed", error);
    return { error: "Could not turn off the link." };
  }
}
