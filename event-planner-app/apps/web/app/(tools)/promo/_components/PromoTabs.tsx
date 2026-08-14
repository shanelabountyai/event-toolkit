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
          <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
            Promo Campaign Kit
          </p>
          <h1 className="text-xl font-semibold text-content">{brief.name || "Untitled event"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-content-muted">
            <Badge>{EVENT_TYPE_LABELS[brief.type]}</Badge>
            <span>{formatDateRange(brief)}</span>
          </p>
        </div>
        <Link
          href={`/brief/${brief.id}`}
          className="rounded-md px-2.5 py-1.5 text-sm font-medium text-content-muted underline-offset-4 hover:text-content hover:underline"
        >
          ← Back to brief
        </Link>
      </div>

      <nav className="flex gap-1 border-b border-line" aria-label="Promo campaign kit sections">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active === tab.key ? "page" : undefined}
            className={
              active === tab.key
                ? "-mb-px border-b-2 border-accent px-3 py-2 text-sm font-semibold text-content"
                : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-content-muted hover:border-line-strong hover:text-content"
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
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-content">
        {notFound ? "That brief no longer exists" : "Pick an event brief first"}
      </h1>
      <p className="mt-2 text-sm text-content-muted">
        {notFound
          ? "The brief this kit was linked to has been deleted from this browser."
          : "The Promo Campaign Kit generates copy from an existing event brief, so it needs to know which event you mean."}
      </p>
      {/* /promo lists the briefs and forwards straight back here with one chosen. /brief would
          drop the planner into the brief editor with no route back into promo. */}
      <Link
        href="/promo"
        className="mt-5 inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
      >
        Choose an event
      </Link>
    </div>
  );
}
