"use client";

/**
 * FR-1 — `/logistics?briefId=X`: find the pack for that brief or seed one from it, then hand
 * off to `/logistics/[packId]`. With no `briefId`, offer the list of briefs instead.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EVENT_TYPE_LABELS, type EventBrief } from "@event-toolkit/schema";
import { findOrCreatePackForBrief, getBrief, listBriefs, logUsageEvent } from "@event-toolkit/local-store";
import { Badge, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { formatDateRange, formatRelative } from "@/lib/format";

export function LogisticsEntry() {
  const router = useRouter();
  const briefId = useSearchParams().get("briefId");
  const [briefs, setBriefs] = useState<EventBrief[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!briefId) {
      listBriefs().then((rows) => {
        if (!cancelled) setBriefs(rows);
      });
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const brief = await getBrief(briefId);
      if (cancelled) return;
      if (!brief) {
        setError("That brief no longer exists in this browser.");
        setBriefs(await listBriefs());
        return;
      }
      const pack = await findOrCreatePackForBrief(brief);
      await logUsageEvent({
        type: "tool_opened_direct",
        briefId: brief.id,
        briefName: brief.name || "Untitled brief",
        details: { tool: "logistics", packId: pack.id, sessions: pack.sessions.length },
      });
      if (!cancelled) router.replace(`/logistics/${pack.id}`);
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      cancelled = true;
    };
  }, [briefId, router]);

  if (briefId && !error) {
    return <p className="py-16 text-center text-sm text-content-muted">Opening the logistics pack…</p>;
  }
  if (briefs === null) {
    return <p className="py-16 text-center text-sm text-content-muted">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-content">Run-of-Show &amp; Logistics Pack</h1>
        <p className="mt-1 text-sm text-content-muted">
          Run of show, staffing, shipping, venue checklist and contacts — one set of facts, so a
          time changed once changes everywhere.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle px-4 py-2 text-sm text-danger-text">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-content">Choose an event</h2>
        </CardHeader>
        <CardBody>
          {briefs.length === 0 ? (
            <p className="text-sm text-content-muted">
              No briefs in this browser yet.{" "}
              <Link href="/brief/new" className="font-medium underline underline-offset-4">
                Create one first
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {briefs.map((brief) => (
                <li key={brief.id}>
                  <Link
                    href={`/logistics?briefId=${brief.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-surface-sunken"
                  >
                    <span>
                      <span className="block text-sm font-medium text-content">
                        {brief.name || "Untitled brief"}
                      </span>
                      <span className="block text-xs text-content-muted">
                        {formatDateRange(brief)} · updated {formatRelative(brief.updatedAt)}
                      </span>
                    </span>
                    <Badge>{EVENT_TYPE_LABELS[brief.type]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
