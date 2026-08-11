"use server";

import { redirect } from "next/navigation";
import { InvitationError, acceptInvitation, getDb } from "@event-toolkit/server-db";
import { requireUser } from "@/lib/session";

export interface AcceptState {
  error?: string;
}

export async function acceptInvitationAction(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  let workspaceId: string;

  try {
    const user = await requireUser();
    // The address is checked inside acceptInvitation against the *signed-in* user, not against
    // anything posted here. A forwarded invitation must not work for whoever received it.
    const invitation = await acceptInvitation(getDb(), token, user);
    workspaceId = invitation.workspaceId;
  } catch (error) {
    if (error instanceof InvitationError) return { error: error.message };
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    console.error("accept invitation failed", error);
    return { error: "Could not accept that invitation. Try the link again." };
  }

  redirect(`/workspace/${workspaceId}/members`);
}
