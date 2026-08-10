"use client";

/** Shared header for both promo tabs: which event, where to go back to, Kit vs Pacing. */

import Link from "next/link";
import type { EventBrief } from "@event-toolkit/schema";
import { EVENT_TYPE_LABELS } from "@event-toolkit/schema";
import { Badge } from "@event-toolkit/ui";
import { formatDateRange } from "@/lib/format";

export function PromoTabs({
  brief,
  active,
}: {
  brief: EventBrief;
  active: "kit" | "pacing";
}) {
  const tabs = [
    { key: "kit" as const, label: "Campaign kit", href: `/promo/kit?briefId=${brief.id}` },
    { key: "pacing" as const, label: "Registration pacing", href: `/promo/pacing?briefId=${brief.id}` },
  ];

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Promo Campaign Kit
          </p>
          <h1 className="text-xl font-semibold text-slate-900">{brief.name || "Untitled event"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge>{EVENT_TYPE_LABELS[brief.type]}</Badge>
            <span>{formatDateRange(brief)}</span>
          </p>
        </div>
        <Link
          href={`/brief/${brief.id}`}
          className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
        >
          ← Back to brief
        </Link>
      </div>

      <nav className="flex gap-1 border-b border-slate-200" aria-label="Promo campaign kit sections">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active === tab.key ? "page" : undefined}
            className={
              active === tab.key
                ? "-mb-px border-b-2 border-slate-900 px-3 py-2 text-sm font-semibold text-slate-900"
                : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/** Shared empty/blocked state: no `?briefId=`, or an id that no longer resolves. */
export function PromoBriefMissing({ notFound }: { notFound: boolean }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">
        {notFound ? "That brief no longer exists" : "Pick an event brief first"}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {notFound
          ? "The brief this kit was linked to has been deleted from this browser."
          : "The Promo Campaign Kit generates copy from an existing event brief, so it needs to know which event you mean."}
      </p>
      <Link
        href="/brief"
        className="mt-5 inline-flex items-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Choose a brief
      </Link>
    </div>
  );
}
