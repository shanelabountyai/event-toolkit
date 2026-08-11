"use client";

/** `/leads` — the tool's home: every triage session with its key numbers. */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TRIAGE_STATUS_LABELS,
  computeProgress,
  tierCounts,
  type LeadRecord,
  type TriageSession,
} from "@event-toolkit/lead-triage-core";
import { listDuplicateCandidates, listLeads, listSessions } from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader, EmptyRow, Table, Td, Th } from "@event-toolkit/ui";
import { formatIsoDateTime } from "@/lib/format";

interface Row {
  session: TriageSession;
  leads: LeadRecord[];
  pending: number;
}

export function SessionList() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessions = await listSessions();
      const built: Row[] = [];
      for (const session of sessions) {
        const [leads, candidates] = await Promise.all([
          listLeads(session.id),
          listDuplicateCandidates(session.id),
        ]);
        built.push({
          session,
          leads,
          pending: candidates.filter((c) => c.status === "pending").length,
        });
      }
      if (!cancelled) setRows(built);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null) {
    return <p className="py-16 text-center text-sm text-content-muted">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-content">Lead Triage &amp; Follow-Up</h1>
          <p className="mt-1 text-sm text-content-muted">
            Turn badge scans and registration exports into a deduped, scored, routed list with a
            follow-up draft per lead — in hours, not a week.
          </p>
        </div>
        <Link
          href="/leads/new"
          className="inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        >
          New triage session
        </Link>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-content">Sessions</h2>
        </CardHeader>
        <CardBody>
          <Table>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th className="w-24">Status</Th>
                <Th className="w-20 text-right">Leads</Th>
                <Th className="w-32">Tiers</Th>
                <Th className="w-24 text-right">Routed</Th>
                <Th className="w-24 text-right">Drafted</Th>
                <Th className="w-28">Since close</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={7}>
                  No triage sessions yet. Start one after your next event closes.
                </EmptyRow>
              ) : (
                rows.map(({ session, leads, pending }) => {
                  const progress = computeProgress(leads, session, pending);
                  const tiers = tierCounts(leads);
                  return (
                    <tr key={session.id}>
                      <Td>
                        <Link
                          href={`/leads/${session.id}`}
                          className="font-medium text-content underline-offset-4 hover:underline"
                        >
                          {session.eventName}
                        </Link>
                        <span className="block text-xs text-content-muted">
                          Closed {formatIsoDateTime(session.eventClosedAt)}
                          {session.eventBriefId ? " · linked to a brief" : ""}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={session.status === "routed" ? "success" : "neutral"}>
                          {TRIAGE_STATUS_LABELS[session.status]}
                        </Badge>
                        {pending > 0 ? (
                          <Badge tone="warning" className="ml-1">
                            {pending}
                          </Badge>
                        ) : null}
                      </Td>
                      <Td className="text-right tabular-nums">{leads.length}</Td>
                      <Td className="text-xs text-content-muted">
                        {tiers.hot}H / {tiers.warm}W / {tiers.cold}C
                      </Td>
                      <Td className="text-right tabular-nums">{progress.routedPct}%</Td>
                      <Td className="text-right tabular-nums">{progress.draftReadyPct}%</Td>
                      <Td className="text-xs text-content-muted">
                        {progress.hoursSinceClose === null ? "—" : `${progress.hoursSinceClose}h`}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

export { Button };
