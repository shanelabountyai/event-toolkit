// PRD 8 FR-9 — receive a planner's local dataset and write it into their workspace.
//
// The upload half. The reading and preview half runs in the browser, because the data is in the
// browser's IndexedDB and no server can reach it.

import { NextResponse } from "next/server";
import { SYNC_KINDS } from "@event-toolkit/sync-engine";
import { getDb, migrateRecords, type IncomingRecord } from "@event-toolkit/server-db";
import { accessContextFor, currentUser } from "@/lib/session";
import { log } from "@/lib/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Uploads arrive in batches. A planner with two years of events can have thousands of records,
 * and one request carrying all of them is a request that times out halfway and leaves somebody
 * guessing which half arrived.
 */
const MAX_RECORDS_PER_BATCH = 500;

const KNOWN_KINDS = new Set(SYNC_KINDS.map((k) => k.kind));

export async function POST(request: Request) {
  // Identity first, before the body is read. Validating a payload before authenticating means an
  // unauthenticated caller can make the server parse megabytes of JSON on demand, which is work
  // handed out for free at an endpoint whose whole job is accepting bulk uploads.
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { workspaceId, records } = (body ?? {}) as {
    workspaceId?: string;
    records?: IncomingRecord[];
  };

  if (typeof workspaceId !== "string" || !Array.isArray(records)) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  if (records.length > MAX_RECORDS_PER_BATCH) {
    return NextResponse.json(
      { error: `Send at most ${MAX_RECORDS_PER_BATCH} records per request.` },
      { status: 413 },
    );
  }

  // The context is resolved from the session, never from the body. `migrateRecords` then checks
  // each record's capability against it and reports what it skipped.
  const ctx = await accessContextFor(workspaceId);
  if (!ctx?.role) {
    return NextResponse.json({ error: "Not a member of that workspace." }, { status: 403 });
  }

  // A kind the server does not recognise would be written under a name that the PII registry, the
  // conflict classifier and the privacy operations all know nothing about — which is how a
  // category of data becomes invisible to every deletion request. Refuse rather than store it.
  const unknown = [...new Set(records.map((r) => r?.kind))].filter((k) => !KNOWN_KINDS.has(k));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unrecognised record types: ${unknown.join(", ")}` },
      { status: 400 },
    );
  }

  const malformed = records.some(
    (r) => typeof r?.documentId !== "string" || !r.documentId || r.document === undefined,
  );
  if (malformed) {
    return NextResponse.json({ error: "Some records are missing an id." }, { status: 400 });
  }

  try {
    const result = await migrateRecords(getDb(), ctx, records);
    return NextResponse.json(result);
  } catch (error) {
    // Redacted: a failing record can carry attendee data, and this is the exact path where it
    // would otherwise reach a log (PRD 10 FR-5).
    log.error("migration batch failed", error, { workspaceId, count: records.length });
    return NextResponse.json({ error: "Could not save that batch." }, { status: 500 });
  }
}
