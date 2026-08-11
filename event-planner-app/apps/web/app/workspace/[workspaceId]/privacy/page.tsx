import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { can } from "@event-toolkit/access";
import { getDb, getRetentionPolicy, getWorkspace } from "@event-toolkit/server-db";
import { isHostedConfigured } from "@/lib/auth";
import { accessContextFor, currentUser } from "@/lib/session";
import { SubjectTool } from "./SubjectTool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Attendee data requests — Event Planner Suite" };

export default async function PrivacyPage({ params }: { params: Promise<{ workspaceId: string }> }) {
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
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Attendee data requests</h1>
        <p className="text-sm text-slate-600">
          Find everything this workspace holds about one person, export it, or delete it. Use this
          when somebody asks what you have about them, or asks you to remove it.
        </p>
      </div>

      {can(ctx, "leads:view") ? (
        <SubjectTool workspaceId={workspaceId} canDelete={can(ctx, "leads:edit")} />
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-700">
              Your role doesn&rsquo;t include access to attendee data, so this screen has nothing to
              show you. That&rsquo;s deliberate — it&rsquo;s the same permission that hides the Leads
              tool, and this page is not a way around it.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">What you should know</h2>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-900">Deletion is permanent.</span> Records are
            removed, not hidden, and the removal reaches every signed-in device on its next sync.
          </p>
          <p>
            <span className="font-medium text-slate-900">Totals aren&rsquo;t recalculated.</span>{" "}
            Lead counts, cost per lead and the ROI scorecard stay as they were. They contain no
            personal data, and rewriting a past report to pretend somebody was never there would not
            remove anything about them.
          </p>
          <p>
            <span className="font-medium text-slate-900">
              Attendee data is deleted automatically after {policy.months} months
            </span>{" "}
            from an event&rsquo;s last activity.{" "}
            <Link
              href={`/workspace/${workspaceId}/retention`}
              className="font-medium text-slate-900 underline underline-offset-2"
            >
              Change that
            </Link>
            . Briefs, budgets and post-mortems are never purged.
          </p>
          <p>
            <span className="font-medium text-slate-900">You are the data controller</span>, not this
            product. It gives you the mechanism; the relationship with the person asking is yours.
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
