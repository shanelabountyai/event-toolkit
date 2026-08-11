// PRD 9 — everything in this workspace after a cursor.
//
// Records the caller may not read are filtered server-side, so a Finance user's device never
// receives an attendee record at all. Filtering in the UI would mean the data reached the
// browser, sat in IndexedDB, and appeared in any backup of it.

import { NextResponse } from "next/server";
import { getDb, pullRecords } from "@event-toolkit/server-db";
import { PermissionError } from "@event-toolkit/access";
import { accessContextFor, currentUser } from "@/lib/session";
import { log } from "@/lib/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const since = url.searchParams.get("since") ?? "0";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_LIMIT) || MAX_LIMIT, MAX_LIMIT);

  if (!workspaceId) return NextResponse.json({ error: "Malformed request." }, { status: 400 });

  const ctx = await accessContextFor(workspaceId);
  if (!ctx?.role) return NextResponse.json({ error: "Not a member of that workspace." }, { status: 403 });

  try {
    return NextResponse.json(await pullRecords(getDb(), ctx, since, limit));
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: "Not permitted." }, { status: 403 });
    }
    log.error("sync pull failed", error, { workspaceId, since });
    return NextResponse.json({ error: "Could not fetch changes." }, { status: 500 });
  }
}
