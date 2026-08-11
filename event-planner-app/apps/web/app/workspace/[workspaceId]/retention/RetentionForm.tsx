"use client";

import { useActionState } from "react";
import { Button, Field, Select } from "@event-toolkit/ui";
import { saveRetentionAction, type RetentionState } from "./actions";

export function RetentionForm({
  workspaceId,
  months,
  enabled,
}: {
  workspaceId: string;
  months: number;
  enabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<RetentionState, FormData>(saveRetentionAction, {});

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />

      <Field label="Delete attendee data after" htmlFor="months">
        <Select id="months" name="months" defaultValue={String(months)}>
          <option value="6">6 months</option>
          <option value="12">12 months</option>
          <option value="24">24 months</option>
          <option value="36">36 months</option>
        </Select>
      </Field>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-0.5" />
        <span>
          Delete automatically.
          {/* Turning it off is allowed and its consequence is stated, rather than the checkbox
              quietly meaning "keep third-party personal data indefinitely". */}
          <span className="block text-xs text-slate-500">
            Turn this off and attendee data is kept until somebody deletes it by hand. That is a
            decision worth making on purpose.
          </span>
        </span>
      </label>

      {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Save policy"}
      </Button>
    </form>
  );
}
