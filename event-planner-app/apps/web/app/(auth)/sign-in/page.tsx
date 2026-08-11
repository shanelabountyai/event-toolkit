import Link from "next/link";
import { Card, CardBody } from "@event-toolkit/ui";
import { isEmailConfigured, isHostedConfigured } from "@/lib/auth";
import { SignInForm } from "./SignInForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in — Event Planner Suite" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const configured = isHostedConfigured() && isEmailConfigured();
  // Arrives from an invitation link, so the address is the one the invitation was sent to.
  const { email } = await searchParams;

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-600">
            We&rsquo;ll email you a link. There is no password to remember or lose.
          </p>
        </div>

        {configured ? (
          <SignInForm defaultEmail={email} />
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            Accounts aren&rsquo;t configured on this deployment. You can still use every tool
            without one — your work is saved in this browser.
          </p>
        )}

        {/*
          Local-only mode is a real product, not a downgrade, so it is offered here as a peer
          rather than buried. A planner who never wants an account should not have to work out
          that they are allowed to leave.
        */}
        <div className="border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-600">
            Don&rsquo;t want an account?{" "}
            <Link href="/brief" className="font-medium text-slate-900 underline underline-offset-2">
              Use the tools without signing in
            </Link>
            . Everything is saved in this browser, and you can move it into a workspace later.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
