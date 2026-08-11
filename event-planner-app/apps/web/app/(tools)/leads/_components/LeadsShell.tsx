"use client";

/** Shared chrome for a triage session: context, tabs, and the FR-11 progress bar. */

import Link from "next/link";
import type { ReactNode } from "react";
import {
  TRIAGE_STATUS_LABELS,
  computeProgress,
  type DuplicateCandidate,
  type LeadRecord,
  type TriageSession,
} from "@event-toolkit/lead-triage-core";
import type { EventBrief } from "@event-toolkit/schema";
import { Badge, ProgressBar } from "@event-toolkit/ui";
import { formatIsoDateTime } from "@/lib/format";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "import", label: "Import" },
  { slug: "merge-review", label: "Merge review" },
  { slug: "rubric", label: "Scoring" },
  { slug: "triage", label: "Leads" },
  { slug: "templates", label: "Templates" },
  { slug: "export", label: "Export" },
];

export function LeadsShell({
  session,
  brief,
  leads,
  candidates,
  active,
  children,
}: {
  session: TriageSession;
  brief: EventBrief | null;
  leads: LeadRecord[];
  candidates: DuplicateCandidate[];
  active: string;
  children: ReactNode;
}) {
  const pending = candidates.filter((c) => c.status === "pending").length;
  const progress = computeProgress(leads, session, pending);
  const base = `/leads/${session.id}`;

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
              Lead Triage &amp; Follow-Up
            </p>
            <h1 className="text-xl font-semibold text-content">{session.eventName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-content-muted">
              <Badge tone={session.status === "routed" ? "success" : "neutral"}>
                {TRIAGE_STATUS_LABELS[session.status]}
              </Badge>
              <span>Closed {formatIsoDateTime(session.eventClosedAt)}</span>
              {progress.hoursSinceClose !== null ? (
                <Badge tone={progress.hoursSinceClose > 48 ? "warning" : "info"}>
                  {progress.hoursSinceClose}h since close
                </Badge>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {brief ? (
              <Link
                href={`/brief/${brief.id}`}
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-content-muted underline-offset-4 hover:text-content hover:underline"
              >
                View linked brief
              </Link>
            ) : null}
            <Link
              href="/leads"
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-content-muted underline-offset-4 hover:text-content hover:underline"
            >
              ← All sessions
            </Link>
          </div>
        </div>

        {/* FR-11 — visible on every screen of the tool, not a separate dashboard page. */}
        <div className="rounded-lg border border-line bg-surface px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Stat label="Leads" value={String(progress.leadCount)} />
            <Stat label="Deduped" value={`${progress.dedupedPct}%`} />
            <Stat label="Scored" value={`${progress.scoredPct}%`} />
            <Stat label="Routed" value={`${progress.routedPct}%`} />
            <Stat label="Drafted" value={`${progress.draftReadyPct}%`} />
            {pending > 0 ? (
              <Link href={`${base}/merge-review`}>
                <Badge tone="warning">{pending} to review</Badge>
              </Link>
            ) : null}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <ProgressBar value={progress.dedupedPct} />
            <ProgressBar value={progress.scoredPct} />
            <ProgressBar value={progress.routedPct} />
            <ProgressBar value={progress.draftReadyPct} />
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Triage sections">
          {TABS.map((tab) => {
            const href = tab.slug ? `${base}/${tab.slug}` : base;
            const isActive = active === tab.slug;
            return (
              <Link
                key={tab.slug || "overview"}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "-mb-px flex items-center gap-1.5 border-b-2 border-accent px-3 py-2 text-sm font-semibold text-content"
                    : "-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-content-muted hover:border-line-strong hover:text-content"
                }
              >
                {tab.label}
                {tab.slug === "merge-review" && pending > 0 ? (
                  <Badge tone="warning">{pending}</Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </header>

      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="block text-xs text-content-muted">{label}</span>
      <span className="font-semibold text-content">{value}</span>
    </span>
  );
}

export function LeadsLoading() {
  return <p className="py-16 text-center text-sm text-content-muted">Loading…</p>;
}

export function LeadsNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-content">That triage session no longer exists</h1>
      <Link
        href="/leads"
        className="mt-5 inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
      >
        Back to sessions
      </Link>
    </div>
  );
}
