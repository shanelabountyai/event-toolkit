"use client";

import { Button } from "@event-toolkit/ui";
import { signOutAction } from "./actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit">
        Sign out
      </Button>
    </form>
  );
}
