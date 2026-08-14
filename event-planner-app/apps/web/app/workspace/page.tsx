import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@event-toolkit/access";
import { isHostedConfigured } from "@/lib/auth";
import { currentUser, myWorkspaces } from "@/lib/session";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";
import { LocalDataBanner } from "./LocalDataBanner";
import { SignOutButton } from "./SignOutButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Workspace — Event Planner Suite" };

export default async function WorkspacePage() {
  if (!isHostedConfigured()) redirect("/brief");

  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const memberships = await myWorkspaces();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-content">Your workspaces</h1>
          <p className="text-sm text-content-muted">Signed in as {user.email}</p>
        </div>
        <SignOutButton />
      </div>

      {/*
        Sign-in lands here, and until now it landed on a workspace that looked empty while every
        event the planner had built sat in this browser's IndexedDB with nothing saying so. One
        workspace gets a direct link; several means the target is theirs to pick.
      */}
      <LocalDataBanner workspaceId={memberships.length === 1 ? memberships[0].workspaceId : null} />

      {memberships.length > 0 ? (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-content">
              {memberships.length === 1 ? "1 workspace" : `${memberships.length} workspaces`}
            </h2>
          </CardHeader>
          <ul className="divide-y divide-line">
            {memberships.map((m) => (
              <li key={m.workspaceId}>
                <Link
                  href={`/workspace/${m.workspaceId}/members`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-sunken"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-content">{m.name}</p>
                    <p className="text-xs text-content-muted">{ROLE_DESCRIPTIONS[m.role as Role]}</p>
                  </div>
                  <Badge>{ROLE_LABELS[m.role as Role]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold text-content">Create a workspace</h2>
              <p className="text-sm text-content-muted">
                A workspace is where your team&rsquo;s events live. You&rsquo;ll be its owner, and
                you can invite colleagues afterwards.
              </p>
            </div>
            <CreateWorkspaceForm />
          </CardBody>
        </Card>
      )}
    </main>
  );
}
