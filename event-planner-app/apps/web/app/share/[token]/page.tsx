import { Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { reassemblePack, type ExplodedRecord, type PackScalars } from "@event-toolkit/sync-engine";
import { resolveSessionTime } from "@event-toolkit/logistics";
import { getDb, loadPackRecords, resolveShareLink } from "@event-toolkit/server-db";
import { isHostedConfigured } from "@/lib/auth";
import { LogIssueForm } from "./LogIssueForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Run of show",
  // A shared link should not end up in a search index. It is a credential.
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isHostedConfigured()) return <Dead />;

  const resolved = await resolveShareLink(getDb(), token);
  // Expired, revoked and forged all land here. Distinguishing them would tell whoever holds the
  // URL something about it that they have not earned.
  if (!resolved) return <Dead />;

  const loaded = await loadPackRecords(getDb(), resolved.workspaceId, resolved.grant.logisticsPackId);
  if (!loaded) return <Dead />;

  const pack = reassemblePack(loaded.scalars as PackScalars, loaded.items as ExplodedRecord[]);
  const expires = new Date(resolved.grant.expiresAt);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Run of show</h1>
        <p className="text-xs text-slate-500">
          Shared, read-only. This link stops working on{" "}
          {expires.toLocaleDateString(undefined, { day: "numeric", month: "long" })}.
        </p>
      </div>

      <Section title="Schedule">
        {pack.sessions.length === 0 ? (
          <Empty>Nothing scheduled yet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pack.sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5 text-sm">
                <span className="font-medium text-slate-900">{s.label}</span>
                <span className="text-slate-600">
                  {[formatTime(s.startTime), s.location].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Who's on">
        {pack.staffAssignments.length === 0 ? (
          <Empty>No staffing recorded.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pack.staffAssignments.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5 text-sm">
                <span className="font-medium text-slate-900">{s.personName || "Unassigned"}</span>
                <span className="text-slate-600">
                  {[s.assignmentRole, formatTime(resolveSessionTime(pack, s.sessionId)?.startTime ?? s.customStartTime)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Contacts">
        {pack.contacts.length === 0 ? (
          <Empty>No contacts listed.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pack.contacts.map((c) => (
              <li key={c.id} className="space-y-0.5 px-5 py-2.5 text-sm">
                <p className="font-medium text-slate-900">
                  {c.name} <span className="font-normal text-slate-500">· {c.role}</span>
                </p>
                {/* Tap-to-call, because the person reading this is standing in a venue. */}
                {c.phone ? (
                  <a href={`tel:${c.phone}`} className="text-slate-700 underline underline-offset-2">
                    {c.phone}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Checklist">
        {pack.venueChecklist.length === 0 ? (
          <Empty>Nothing on the checklist.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pack.venueChecklist.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-5 py-2.5 text-sm">
                <span className={c.status === "done" ? "text-emerald-600" : "text-slate-300"}>
                  {c.status === "done" ? "✓" : "○"}
                </span>
                <span className={c.status === "done" ? "text-slate-500 line-through" : "text-slate-800"}>
                  {c.item}
                </span>
                {c.status === "blocked" ? (
                  <span className="text-xs font-medium text-red-700">blocked</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Report a problem</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <LogIssueForm token={token} />
          {pack.issueLog.length > 0 ? (
            <div className="space-y-1 border-t border-slate-200 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Already reported</p>
              <ul className="space-y-1 text-sm text-slate-700">
                {pack.issueLog.map((i) => (
                  <li key={i.id} className={i.status === "resolved" ? "text-slate-400 line-through" : undefined}>
                    {i.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </main>
  );
}

/** Times are stored as ISO datetimes; a phone in a venue wants "09:30". */
function formatTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </CardHeader>
      {children}
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <CardBody><p className="text-sm text-slate-500">{children}</p></CardBody>;
}

function Dead() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <Card>
        <CardBody className="space-y-2">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">This link isn&rsquo;t working</h1>
          <p className="text-sm text-slate-600">
            It may have expired or been turned off. Ask the event organiser for a new one.
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
