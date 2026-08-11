"use client";

import { useActionState } from "react";
import { Button } from "@event-toolkit/ui";
import { acceptInvitationAction, type AcceptState } from "./actions";

export function AcceptForm({ token, workspaceName }: { token: string; workspaceName: string }) {
  const [state, formAction, pending] = useActionState<AcceptState, FormData>(
    acceptInvitationAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Joining…" : `Join ${workspaceName}`}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
