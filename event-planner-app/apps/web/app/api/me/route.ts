// Who is signed in and what workspaces they hold.
//
// A small dynamic endpoint rather than reading the session in the root layout: doing it there
// would opt every static page in the suite out of prerendering. One fetch per page load buys back
// the whole of the tools tier staying static.

import { NextResponse } from "next/server";
import { isHostedConfigured } from "@/lib/auth";
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
  return NextResponse.json({
    signedIn: true,
    hosted: true,
    userId: user.id,
    email: user.email,
    workspaces: workspaces.map((w) => ({ id: w.workspaceId, name: w.name, role: w.role })),
  });
}
