import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { can } from "@event-toolkit/access";
import { getDb, getRetentionPolicy, getWorkspace } from "@event-toolkit/server-db";
import { isHostedConfigured } from "@/lib/auth";
import { accessContextFor, currentUser } from "@/lib/session";
import { RetentionForm } from "./RetentionForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Data retention — Event Planner Suite" };

export default async function RetentionPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  if (!isHostedConfigured()) redirect("/brief");

  const { workspaceId } = await params;
  if (!(await currentUser())) redirect("/sign-in");

  const ctx = await accessContextFor(workspaceId);
  if (!ctx?.role) notFound();
  const workspace = await getWorkspace(getDb(), ctx);
  if (!workspace) notFound();

  const policy = await getRetentionPolicy(getDb(), workspaceId);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="space-y-1">
        <Link href={`/workspace/${workspaceId}/members`} className="text-sm text-slate-600 hover:text-slate-900">
          ← {workspace.name}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Data retention</h1>
        <p className="text-sm text-slate-600">
          How long this workspace keeps attendee data before deleting it automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Policy</h2>
          {policy.lastRunAt ? (
            <span className="text-xs text-slate-500">
              Last run {new Date(policy.lastRunAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
          ) : (
            <span className="text-xs text-slate-500">Hasn&rsquo;t run yet</span>
          )}
        </CardHeader>
        <CardBody className="space-y-4">
          {can(ctx, "members:manage") ? (
            <RetentionForm workspaceId={workspaceId} months={policy.months} enabled={policy.enabled} />
          ) : (
            <p className="text-sm text-slate-700">
              Attendee data is deleted {policy.months} months after an event&rsquo;s last activity.
              Only owners and admins can change this.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">What gets deleted</h2>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-slate-600">
          {/*
            Named explicitly. "Old data is deleted" is the kind of sentence that makes a planner
            afraid to trust the product with the record of their own events.
          */}
          <p>
            <span className="font-medium text-slate-900">Deleted:</span> attendee lead records and
            survey responses — the data about people who never signed up for this.
          </p>
          <p>
            <span className="font-medium text-slate-900">Never deleted:</span> event briefs,
            budgets, logistics packs, ROI reports and post-mortems. An event&rsquo;s own history is
            your record of your own work, and it is not purged out from under you.
          </p>
          <p>
            Pipeline opportunities keep the deal and lose the contact&rsquo;s name and email, so
            revenue figures stay intact.
          </p>
          <p className="pt-1 text-xs text-slate-500">
            The purge runs daily and writes an entry to the access log each time, so an automated
            deletion can always be accounted for afterwards.
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
