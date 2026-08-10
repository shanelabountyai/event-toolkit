"use client";

/**
 * `/promo` with no `?briefId=`: pick which event to build a campaign for. With one, this
 * just forwards to the Kit tab.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EVENT_TYPE_LABELS, type EventBrief } from "@event-toolkit/schema";
import { listBriefs } from "@event-toolkit/local-store";
import { Badge, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { formatDateRange, formatRelative } from "@/lib/format";

export function PromoLanding() {
  const router = useRouter();
  const briefId = useSearchParams().get("briefId");
  const [briefs, setBriefs] = useState<EventBrief[] | null>(null);

  useEffect(() => {
    if (briefId) {
      router.replace(`/promo/kit?briefId=${briefId}`);
      return;
    }
    let cancelled = false;
    listBriefs().then((rows) => {
      if (!cancelled) setBriefs(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [briefId, router]);

  if (briefId || briefs === null) {
    return <p className="py-16 text-center text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Promo Campaign Kit</h1>
        <p className="mt-1 text-sm text-slate-600">
          Landing page, a five-email sequence, per-channel social posts and sales snippets —
          generated from an event brief you already have.
        </p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900">Choose an event</h2>
        </CardHeader>
        <CardBody>
          {briefs.length === 0 ? (
            <p className="text-sm text-slate-600">
              No briefs in this browser yet.{" "}
              <Link href="/brief/new" className="font-medium underline underline-offset-4">
                Create one first
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {briefs.map((brief) => (
                <li key={brief.id}>
                  <Link
                    href={`/promo/kit?briefId=${brief.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-slate-50"
                  >
                    <span>
                      <span className="block text-sm font-medium text-slate-900">
                        {brief.name || "Untitled brief"}
                      </span>
                      <span className="block text-xs text-slate-500">
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
