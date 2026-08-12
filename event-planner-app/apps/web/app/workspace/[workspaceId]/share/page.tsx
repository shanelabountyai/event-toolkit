import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { can } from "@event-toolkit/access";
import { getDb, getWorkspace, listPacksInWorkspace, listShareLinks } from "@event-toolkit/server-db";
import { isHostedConfigured } from "@/lib/auth";
import { accessContextFor, currentUser } from "@/lib/session";
import { ShareLinkManager } from "./ShareLinkManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "On-site links — Event Planner Suite" };

export default async function SharePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  if (!isHostedConfigured()) redirect("/brief");

  const { workspaceId } = await params;
  if (!(await currentUser())) redirect("/sign-in");

  const ctx = await accessContextFor(workspaceId);
  if (!ctx?.role) notFound();
  const workspace = await getWorkspace(getDb(), ctx);
  if (!workspace) notFound();

  if (!can(ctx, "logistics:view")) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-10">
        <Card>
          <CardBody>
            <p className="text-sm text-content-muted">
              Your role in this workspace doesn&rsquo;t include logistics, so there&rsquo;s nothing
              here for you.
            </p>
          </CardBody>
        </Card>
      </main>
    );
  }

  const packs = await listPacksInWorkspace(getDb(), ctx);
  const links = await Promise.all(
    packs.map(async (p) => ({ packId: p.id, links: await listShareLinks(getDb(), ctx, p.id) })),
  );

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="space-y-1">
        <Link href={`/workspace/${workspaceId}/members`} className="inline-flex min-h-11 items-center text-sm text-content-muted hover:text-content">
          ← {workspace.name}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-content">On-site links</h1>
        <p className="text-sm text-content-muted">
          A link anyone can open on a phone to read the run of show, staffing and contacts, and
          report a problem. No account needed.
        </p>
      </div>

      {packs.length === 0 ? (
        <Card>
          <CardBody className="space-y-2">
            <p className="text-sm text-content-muted">
              No logistics packs have reached this workspace yet.
            </p>
            <p className="text-sm text-content-muted">
              Build one in the Logistics tool, then move it in from{" "}
              <Link
                href={`/workspace/${workspaceId}/migrate`}
                className="font-medium text-content underline underline-offset-2"
              >
                your browser
              </Link>
              .
            </p>
          </CardBody>
        </Card>
      ) : (
        <ShareLinkManager
          workspaceId={workspaceId}
          canManage={can(ctx, "logistics:edit")}
          packs={packs.map((p) => ({
            id: p.id,
            links: (links.find((l) => l.packId === p.id)?.links ?? []).map((link) => ({
              id: link.id,
              token: link.token,
              expiresAt: link.expiresAt.toISOString(),
              revoked: link.revokedAt !== null,
            })),
          }))}
        />
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-content">What a link can and can&rsquo;t do</h2>
        </CardHeader>
        <CardBody className="space-y-1 text-sm text-content-muted">
          {/* Written out because a link is a credential someone will forward, and the person
              forwarding it should know exactly what they are handing over. */}
          <p>✓ Read the run of show, staffing, contacts and the checklist for one event.</p>
          <p>✓ Report a problem, which appears in the issue log.</p>
          <p>✗ See attendee data, budgets, the ROI report, or any other event.</p>
          <p>✗ Change anything.</p>
          <p className="pt-1 text-content-muted">
            Anyone with the link can use it until it expires or you turn it off — including someone
            it was forwarded to.
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
