// PRD 9 — apply a batch of queued mutations.
//
// Conflicts come back in the response rather than being resolved here. The server cannot know
// which of two edits a person meant to keep, and guessing is how somebody's work disappears
// without anyone noticing.

import { NextResponse } from "next/server";
import { getDb, pushMutations } from "@event-toolkit/server-db";
import type { OutboxEntry } from "@event-toolkit/sync-engine";
import { accessContextFor, currentUser } from "@/lib/session";
import { log } from "@/lib/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MUTATIONS = 500;

export async function POST(request: Request) {
  // Identity before body, so an unauthenticated caller cannot make the server parse a payload.
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { workspaceId, mutations } = (body ?? {}) as {
    workspaceId?: string;
    mutations?: OutboxEntry[];
  };

  if (typeof workspaceId !== "string" || !Array.isArray(mutations)) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  if (mutations.length > MAX_MUTATIONS) {
    return NextResponse.json({ error: `At most ${MAX_MUTATIONS} mutations per push.` }, { status: 413 });
  }

  const ctx = await accessContextFor(workspaceId);
  if (!ctx?.role) return NextResponse.json({ error: "Not a member of that workspace." }, { status: 403 });

  try {
    return NextResponse.json(await pushMutations(getDb(), ctx, mutations));
  } catch (error) {
    // A failing mutation can carry attendee data. This is exactly the path where it would
    // otherwise reach a log (PRD 10 FR-5).
    log.error("sync push failed", error, { workspaceId, count: mutations.length });
    return NextResponse.json({ error: "Could not apply those changes." }, { status: 500 });
  }
}
