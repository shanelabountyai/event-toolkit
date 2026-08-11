"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createWorkspace, getDb, isEmailVerified } from "@event-toolkit/server-db";
import { requireUser } from "@/lib/session";
import { signOut } from "@/lib/auth";

export interface CreateWorkspaceState {
  error?: string;
}

export async function createWorkspaceAction(
  _prev: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { error: "Give the workspace a name." };
  if (name.length > 80) return { error: "That name is too long — 80 characters at most." };

  // FR-1: verification before a workspace can be created. Signing in by magic link proves the
  // address, so in practice this only fails for an account created some other way — but the check
  // belongs on the server, where it cannot be skipped by anyone posting the form directly.
  if (!(await isEmailVerified(getDb(), user.id))) {
    return { error: "Confirm your email address before creating a workspace." };
  }

  const workspace = await createWorkspace(getDb(), name, user.id);
  revalidatePath("/workspace");
  redirect(`/workspace?w=${workspace.id}`);
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/sign-in" });
}
