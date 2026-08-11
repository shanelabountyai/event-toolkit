import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getDb, getWorkspace } from "@event-toolkit/server-db";
import { isHostedConfigured } from "@/lib/auth";
import { accessContextFor, currentUser } from "@/lib/session";
import { MigrateClient } from "./MigrateClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Move your data — Event Planner Suite" };

export default async function MigratePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isHostedConfigured()) redirect("/brief");

  const { workspaceId } = await params;
  if (!(await currentUser())) redirect("/sign-in");

  const ctx = await accessContextFor(workspaceId);
  if (!ctx?.role) notFound();

  const workspace = await getWorkspace(getDb(), ctx);
  if (!workspace) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="space-y-1">
        <Link href={`/workspace/${workspaceId}/members`} className="text-sm text-content-muted hover:text-content">
          ← {workspace.name}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-content">
          Move this browser&rsquo;s events into {workspace.name}
        </h1>
        <p className="text-sm text-content-muted">
          Everything you&rsquo;ve built here so far is stored in this browser. Moving it makes it
          available on your other devices and to the people you invite.
        </p>
      </div>

      <MigrateClient
        workspaceId={workspaceId}
        workspaceName={workspace.name}
        alreadyMigrated={workspace.migratedAt !== null}
      />
    </main>
  );
}
