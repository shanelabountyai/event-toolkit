// Who is signed in and what workspaces they hold.
//
// A small dynamic endpoint rather than reading the session in the root layout: doing it there
// would opt every static page in the suite out of prerendering. One fetch per page load buys back
// the whole of the tools tier staying static.

import { NextResponse } from "next/server";
import { isHostedConfigured } from "@/lib/auth";
import { getDb, getRetentionPolicy } from "@event-toolkit/server-db";
import { currentUser, myWorkspaces } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isHostedConfigured()) {
    return NextResponse.json({ signedIn: false, hosted: false, workspaces: [] });
  }

  const user = await currentUser();
  if (!user) return NextResponse.json({ signedIn: false, hosted: true, workspaces: [] });

  const workspaces = await myWorkspaces();
  // The retention period travels with the workspace because FR-13 requires the import notice to
  // name the period actually in force, not a number hard-coded into a sentence.
  const withPolicy = await Promise.all(
    workspaces.map(async (w) => ({
      id: w.workspaceId,
      name: w.name,
      role: w.role,
      retentionMonths: (await getRetentionPolicy(getDb(), w.workspaceId)).months,
    })),
  );

  return NextResponse.json({
    signedIn: true,
    hosted: true,
    userId: user.id,
    email: user.email,
    workspaces: withPolicy,
  });
}
