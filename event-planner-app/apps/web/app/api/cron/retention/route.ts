// PRD 10 FR-4 — the daily retention purge.
//
// Runs as a Vercel Cron job. Authenticated by a shared secret rather than a session, because there
// is no user. An unauthenticated deletion endpoint is the worst thing to leave open, so the check
// is first, absolute, and fails closed when the secret is not configured at all.

import { NextResponse } from "next/server";
import { getDb, listAllWorkspaceIds, purgeExpiredRecords } from "@event-toolkit/server-db";
import { log } from "@/lib/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Purging every workspace can outlast the default 10 seconds, and a truncated purge is one that
// silently skips whichever workspaces sorted last.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const db = getDb();
  const workspaceIds = await listAllWorkspaceIds(db);

  let purged = 0;
  let failed = 0;

  for (const workspaceId of workspaceIds) {
    try {
      const result = await purgeExpiredRecords(db, workspaceId);
      purged += result.purged;
    } catch (error) {
      // One workspace failing must not stop the rest. A purge that aborts on the first error
      // leaves every later workspace holding data past its own policy.
      failed += 1;
      log.error("retention purge failed for workspace", error, { workspaceId });
    }
  }

  log.info("retention purge complete", { workspaces: workspaceIds.length, purged, failed });
  return NextResponse.json({ workspaces: workspaceIds.length, purged, failed });
}
