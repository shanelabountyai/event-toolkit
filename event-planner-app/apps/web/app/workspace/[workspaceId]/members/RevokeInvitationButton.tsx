"use client";

import { useActionState } from "react";
import { Button } from "@event-toolkit/ui";
import { revokeInvitationAction, type ActionState } from "./actions";

export function RevokeInvitationButton({
  workspaceId,
  invitationId,
}: {
  workspaceId: string;
  invitationId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(revokeInvitationAction, {});

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {state.error ? <span className="text-xs text-danger-text">{state.error}</span> : null}
    </form>
  );
}
