import Link from "next/link";
import { Card, CardBody } from "@event-toolkit/ui";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@event-toolkit/access";
import { getDb, getInvitationByToken } from "@event-toolkit/server-db";
import { isHostedConfigured } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import { AcceptForm } from "./AcceptForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Invitation — Event Planner Suite" };

const DEAD: Record<string, string> = {
  revoked: "This invitation was revoked.",
  expired: "This invitation has expired.",
  accepted: "This invitation has already been used.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isHostedConfigured()) {
    return <Message title="Invitations aren't available here">This deployment has no accounts configured.</Message>;
  }

  const invitation = await getInvitationByToken(getDb(), token);
  // Same message for a forged token and a real-but-dead one, so the page cannot be used to
  // discover which tokens exist.
  if (!invitation) {
    return (
      <Message title="That link isn't valid">
        Ask whoever invited you to send a new one.
      </Message>
    );
  }
  if (invitation.status !== "pending") {
    return (
      <Message title="That link isn't valid">
        {DEAD[invitation.status]} Ask whoever invited you to send a new one.
      </Message>
    );
  }

  const user = await currentUser();
  const role = invitation.role as Role;

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            Join {invitation.workspaceName}
          </h1>
          <p className="text-sm text-slate-600">
            You&rsquo;ve been invited as{" "}
            <span className="font-medium text-slate-900">{ROLE_LABELS[role]}</span>.
          </p>
          <p className="text-sm text-slate-600">{ROLE_DESCRIPTIONS[role]}</p>
        </div>

        {!user ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
              Sign in as <span className="font-medium">{invitation.email}</span> to accept. The
              invitation only works for that address.
            </p>
            <Link
              href={`/sign-in?email=${encodeURIComponent(invitation.email)}`}
              className="inline-flex rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Sign in to accept
            </Link>
          </div>
        ) : user.email !== invitation.email ? (
          // Stated rather than silently failing on submit: being signed in as the wrong person is
          // the single most likely reason a forwarded invitation does not work.
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            This invitation was sent to <span className="font-medium">{invitation.email}</span>, but
            you&rsquo;re signed in as <span className="font-medium">{user.email}</span>. Sign out and
            sign back in with the invited address.
          </p>
        ) : (
          <AcceptForm token={token} workspaceName={invitation.workspaceName} />
        )}
      </CardBody>
    </Card>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="space-y-2">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">{children}</p>
      </CardBody>
    </Card>
  );
}
