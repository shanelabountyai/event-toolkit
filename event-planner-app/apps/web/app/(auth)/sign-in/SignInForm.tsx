"use client";

import { useActionState } from "react";
import { Button, Field, TextInput } from "@event-toolkit/ui";
import { requestSignInLink, type SignInState } from "./actions";

export function SignInForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(requestSignInLink, {});

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Work email" htmlFor="email">
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          defaultValue={defaultEmail}
          placeholder="you@company.com"
        />
      </Field>

      {state.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={pending} className="w-full justify-center">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
