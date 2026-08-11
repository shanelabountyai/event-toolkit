"use client";

import { useActionState } from "react";
import { Button, Field, Select, TextInput } from "@event-toolkit/ui";
import { ROLES, ROLE_LABELS } from "@event-toolkit/access";
import { inviteAction, type ActionState } from "./actions";

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(inviteAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Email" htmlFor="invite-email" className="min-w-56 flex-1">
          <TextInput id="invite-email" name="email" type="email" required placeholder="colleague@company.com" />
        </Field>
        <Field label="Role" htmlFor="invite-role">
          {/* Planner is the default: full access to the tools, no power over people. Defaulting to
              admin would hand out member management to whoever clicked fastest. */}
          <Select id="invite-role" name="role" defaultValue="planner">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-sm text-success-text">{state.ok}</p> : null}
      <p className="text-xs text-content-muted">The invitation expires in 14 days and can be revoked.</p>
    </form>
  );
}
