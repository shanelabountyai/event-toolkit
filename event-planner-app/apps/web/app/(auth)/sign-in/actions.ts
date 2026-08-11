"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

export interface SignInState {
  error?: string;
}

/**
 * Send a sign-in link.
 *
 * On success this redirects rather than returning, so the outcome is identical whether or not the
 * address has an account. Saying "no account found" turns the form into an oracle for whether a
 * given person uses this product, and the addresses being probed would belong to event planners at
 * named companies. Auth.js creates the user on first link anyway, so there is no case to
 * distinguish.
 */
export async function requestSignInLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  // Deliberately shallow. Real validation is that the link only works if it arrives, and an
  // address that looks wrong to a regex is often a perfectly good one.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter an email address." };
  }

  try {
    await signIn("resend", { email, redirect: false, redirectTo: "/workspace" });
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    console.error("sign-in link failed", error);
    return { error: "Could not send the link just now. Try again in a moment." };
  }

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}
