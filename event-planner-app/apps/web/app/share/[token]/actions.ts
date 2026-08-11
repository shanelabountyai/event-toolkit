"use server";

import { revalidatePath } from "next/cache";
import { can } from "@event-toolkit/access";
import { appendIssueViaShareLink, getDb, resolveShareLink } from "@event-toolkit/server-db";

export interface LogIssueState {
  error?: string;
  ok?: boolean;
}

/**
 * The one write a share link permits.
 *
 * The token is re-resolved here rather than trusted from the form: a page rendered ten minutes ago
 * proves nothing about whether the link is still live, and revocation has to take effect on the
 * next action rather than the next page load.
 */
export async function logIssueAction(
  _prev: LogIssueState,
  formData: FormData,
): Promise<LogIssueState> {
  const token = String(formData.get("token") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const loggedBy = String(formData.get("loggedBy") ?? "").trim();
  const severity = String(formData.get("severity") ?? "medium");

  if (!description) return { error: "Say what's wrong." };
  if (description.length > 500) return { error: "Keep it under 500 characters." };
  if (!["low", "medium", "high"].includes(severity)) return { error: "Pick a severity." };

  const resolved = await resolveShareLink(getDb(), token);
  if (!resolved) return { error: "This link has expired or been turned off." };

  const ctx = {
    userId: "share-link",
    workspaceId: resolved.workspaceId,
    role: null,
    viaShareLink: resolved.grant,
  };

  // Asked rather than assumed. The capability is separable from logistics:edit precisely so that
  // this path can be granted on its own, and checking it here keeps the rule in one place.
  if (!can(ctx, "logistics:log_issue", resolved.grant.logisticsPackId)) {
    return { error: "This link can't log issues." };
  }

  // The exact IssueLogEntry shape packages/logistics defines, so the entry renders in the issue
  // log like any other and feeds PRD 7's candidate lessons. A near-miss shape here would store
  // fine and then be invisible in the tool that exists to read it.
  await appendIssueViaShareLink(getDb(), resolved.workspaceId, resolved.grant.logisticsPackId, {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    // Optional and free text. Requiring an account to report a broken projector is how the
    // projector stays broken.
    loggedBy: loggedBy || undefined,
    description,
    severity: severity as "low" | "medium" | "high",
    status: "open",
  });

  revalidatePath(`/share/${token}`);
  return { ok: true };
}
