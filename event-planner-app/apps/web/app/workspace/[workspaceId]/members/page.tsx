import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can, type Role } from "@event-toolkit/access";
import {
  getDb,
  getWorkspace,
  listAccessEvents,
  listInvitations,
  listMembersWithUsers,
} from "@event-toolkit/server-db";
import { isHostedConfigured } from "@/lib/auth";
import { accessContextFor, currentUser } from "@/lib/session";
import { InviteForm } from "./InviteForm";
import { MemberRow } from "./MemberRow";
import { RevokeInvitationButton } from "./RevokeInvitationButton";
import { LocalDataBanner } from "../../LocalDataBanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Members — Event Planner Suite" };

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isHostedConfigured()) redirect("/brief");

  const { workspaceId } = await params;
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const ctx = await accessContextFor(workspaceId);
  // A non-member gets "no such workspace" rather than "you may not see this one". Confirming a
  // workspace exists to somebody outside it leaks the fact that it does.
  if (!ctx?.role) notFound();
  // Captured immediately after the guard: narrowing on a property does not survive the awaits below.
  const actorRole: Role = ctx.role;

  const workspace = await getWorkspace(getDb(), ctx);
  if (!workspace) notFound();

  const members = await listMembersWithUsers(getDb(), ctx);
  const manages = can(ctx, "members:manage");
  const invitations = manages ? await listInvitations(getDb(), ctx) : [];
  const events = manages ? await listAccessEvents(getDb(), ctx) : [];
  const owners = members.filter((m) => m.role === "owner").length;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-10">
      <div className="space-y-1">
        <Link href="/workspace" className="text-sm text-slate-600 hover:text-slate-900">
          ← All workspaces
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{workspace.name}</h1>
        <p className="text-sm text-slate-600">
          You are {ROLE_LABELS[actorRole].toLowerCase()} here.{" "}
          {!manages ? "Only owners and admins can change who has access." : null}
        </p>
      </div>

      <LocalDataBanner workspaceId={workspaceId} />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`/workspace/${workspaceId}/share`} className="font-medium text-slate-900 underline underline-offset-2">
          On-site links
        </Link>
        <Link href={`/workspace/${workspaceId}/migrate`} className="font-medium text-slate-900 underline underline-offset-2">
          Move browser data in
        </Link>
        <Link href={`/workspace/${workspaceId}/privacy`} className="font-medium text-slate-900 underline underline-offset-2">
          Attendee data requests
        </Link>
        <Link href={`/workspace/${workspaceId}/retention`} className="font-medium text-slate-900 underline underline-offset-2">
          Retention
        </Link>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">
            {members.length === 1 ? "1 person" : `${members.length} people`}
          </h2>
        </CardHeader>
        <ul className="divide-y divide-slate-200">
          {members.map((m) => (
            <MemberRow
              key={m.userId}
              workspaceId={workspaceId}
              member={{
                userId: m.userId,
                email: m.email,
                name: m.name,
                role: m.role as Role,
              }}
              canManage={manages}
              isSelf={m.userId === user.id}
              isLastOwner={m.role === "owner" && owners === 1}
              actorRole={actorRole}
            />
          ))}
        </ul>
      </Card>

      {manages ? (
        <>
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-slate-900">Invite someone</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <InviteForm workspaceId={workspaceId} />
              <div className="space-y-1.5 border-t border-slate-200 pt-3 text-xs text-slate-600">
                {/* Roles are explained where they are chosen. A dropdown of five words is a
                    dropdown somebody guesses at, and guessing wrong here hands out attendee data. */}
                {(Object.keys(ROLE_DESCRIPTIONS) as Role[]).map((role) => (
                  <p key={role}>
                    <span className="font-medium text-slate-900">{ROLE_LABELS[role]}</span> —{" "}
                    {ROLE_DESCRIPTIONS[role]}
                  </p>
                ))}
              </div>
            </CardBody>
          </Card>

          {invitations.length > 0 ? (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-900">Pending invitations</h2>
              </CardHeader>
              <ul className="divide-y divide-slate-200">
                {invitations.map((invite) => {
                  const expired = invite.expiresAt <= new Date();
                  return (
                    <li
                      key={invite.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                    >
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-slate-900">{invite.email}</p>
                        <p className="text-xs text-slate-500">
                          {ROLE_LABELS[invite.role as Role]} ·{" "}
                          {expired
                            ? "expired"
                            : `expires ${invite.expiresAt.toLocaleDateString(undefined, {
                                day: "numeric",
                                month: "short",
                              })}`}
                        </p>
                      </div>
                      <RevokeInvitationButton workspaceId={workspaceId} invitationId={invite.id} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-slate-900">Access log</h2>
              <span className="text-xs text-slate-500">Every change to who can see what</span>
            </CardHeader>
            {events.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-600">Nothing recorded yet.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-200 text-sm">
                {[...events]
                  .sort((a, b) => b.at.getTime() - a.at.getTime())
                  .slice(0, 25)
                  .map((event) => (
                    <li key={event.id} className="flex flex-wrap justify-between gap-3 px-5 py-2.5">
                      <span className="text-slate-800">{describeEvent(event.action, event.detail)}</span>
                      <span className="text-xs text-slate-500">
                        {event.at.toLocaleString(undefined, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </main>
  );
}

/** Plain sentences rather than event codes. An audit log nobody can read is not an audit log. */
function describeEvent(action: string, detail: unknown): string {
  const d = (detail ?? {}) as Record<string, unknown>;
  switch (action) {
    case "workspace.created":
      return "Workspace created";
    case "invitation.sent":
      return `Invited ${d.email} as ${d.role}`;
    case "invitation.revoked":
      return "Invitation revoked";
    case "invitation.accepted":
      return `Invitation accepted as ${d.role}`;
    case "member.role_changed":
      return `Role changed from ${d.from} to ${d.to}`;
    case "member.removed":
      return `Removed a ${d.role}`;
    case "privacy.subject_searched":
      return `Attendee data searched (${d.matches} matches)`;
    case "privacy.subject_deleted":
      return `Attendee data deleted (${d.deletedRecords} records)`;
    case "privacy.retention_purge":
      return `Retention purge removed ${d.purged} records`;
    default:
      return action;
  }
}
