import Link from "next/link";
import { Card, CardBody } from "@event-toolkit/ui";

export const metadata = { title: "Check your email — Event Planner Suite" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <Card>
      <CardBody className="space-y-4">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Check your email</h1>
        <p className="text-sm text-slate-600">
          {email ? (
            <>
              We sent a sign-in link to <span className="font-medium text-slate-900">{email}</span>.
            </>
          ) : (
            <>We sent you a sign-in link.</>
          )}{" "}
          {/* Stating the expiry here saves the support conversation that starts "the link didn't work". */}
          It works once and expires in 15 minutes.
        </p>
        <p className="text-sm text-slate-600">
          Nothing arrived? Check spam, then{" "}
          <Link href="/sign-in" className="font-medium text-slate-900 underline underline-offset-2">
            request another
          </Link>
          .
        </p>
      </CardBody>
    </Card>
  );
}
