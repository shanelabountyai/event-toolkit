"use client";

import { useActionState } from "react";
import { Button, Field, Select, TextArea, TextInput } from "@event-toolkit/ui";
import { logIssueAction, type LogIssueState } from "./actions";

export function LogIssueForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<LogIssueState, FormData>(logIssueAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Field label="What's wrong?" htmlFor="description">
        <TextArea
          id="description"
          name="description"
          required
          rows={2}
          maxLength={500}
          placeholder="Projector in room B won't connect"
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="How urgent?" htmlFor="severity">
          <Select id="severity" name="severity" defaultValue="medium">
            <option value="low">Low — worth knowing</option>
            <option value="medium">Medium — needs sorting</option>
            <option value="high">High — blocking right now</option>
          </Select>
        </Field>
        <Field label="Your name" htmlFor="loggedBy" hint="Optional.">
          <TextInput id="loggedBy" name="loggedBy" maxLength={80} />
        </Field>
      </div>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Sending…" : "Report it"}
      </Button>
      {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-700">Reported. The organiser can see it.</p> : null}
    </form>
  );
}
