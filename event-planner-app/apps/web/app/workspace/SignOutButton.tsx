"use client";

import { Button } from "@event-toolkit/ui";
import { signOutAction } from "./actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" size="sm">
        Sign out
      </Button>
    </form>
  );
}
