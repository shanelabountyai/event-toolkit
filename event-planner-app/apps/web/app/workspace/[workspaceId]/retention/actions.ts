"use server";

import { revalidatePath } from "next/cache";
import { getDb, setRetentionPolicy } from "@event-toolkit/server-db";
import { PermissionError } from "@event-toolkit/access";
import { accessContextFor } from "@/lib/session";

export interface RetentionState {
  error?: string;
  ok?: string;
}

export async function saveRetentionAction(
  _prev: RetentionState,
  formData: FormData,
): Promise<RetentionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const months = Number(formData.get("months") ?? 0);
  const enabled = formData.get("enabled") === "on";

  // Bounded on the server. A policy of 600 months is not a retention policy, and one of 0 would
  // delete data the moment it arrived.
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    return { error: "Choose between 1 and 120 months." };
  }

  try {
    const ctx = await accessContextFor(workspaceId);
    if (!ctx?.role) throw new PermissionError("members:manage");
    await setRetentionPolicy(getDb(), ctx, months, enabled);
    revalidatePath(`/workspace/${workspaceId}/retention`);
    return { ok: "Saved." };
  } catch (error) {
    if (error instanceof PermissionError) return { error: "Only owners and admins can change this." };
    console.error("retention update failed", error);
    return { error: "Could not save that." };
  }
}
