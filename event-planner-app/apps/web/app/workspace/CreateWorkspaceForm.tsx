"use client";

import { useActionState } from "react";
import { Button, Field, TextInput } from "@event-toolkit/ui";
import { createWorkspaceAction, type CreateWorkspaceState } from "./actions";

export function CreateWorkspaceForm() {
  const [state, formAction, pending] = useActionState<CreateWorkspaceState, FormData>(
    createWorkspaceAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Workspace name" htmlFor="name" hint="Usually your team or company.">
        <TextInput id="name" name="name" required autoFocus placeholder="Field Marketing" maxLength={80} />
      </Field>

      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
