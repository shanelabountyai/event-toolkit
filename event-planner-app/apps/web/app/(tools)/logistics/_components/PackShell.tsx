"use client";

/**
 * Shared chrome for every logistics artifact view: event context, tab nav, save state, the
 * always-present "Flag an issue" button, and a print link.
 *
 * Everything here is `no-print` — the print routes render through `PrintLayout` instead.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { LogisticsPack, RelatedArtifact } from "@event-toolkit/logistics";
import { packCompleteness } from "@event-toolkit/logistics";
import type { EventBrief } from "@event-toolkit/schema";
import { Badge, Button } from "@event-toolkit/ui";
import { formatDateRange } from "@/lib/format";
import { FlagIssueButton } from "./FlagIssueButton";
import type { SaveState } from "../_hooks/useLogisticsPack";

const TABS: Array<{ slug: string; label: string }> = [
  { slug: "", label: "Overview" },
  { slug: "run-of-show", label: "Run of show" },
  { slug: "staffing", label: "Staffing" },
  { slug: "shipping", label: "Shipping" },
  { slug: "checklist", label: "Checklist" },
  { slug: "contacts", label: "Contacts" },
  { slug: "issues", label: "Issues" },
];

const SAVE_LABELS: Record<SaveState, string> = {
  idle: "",
  dirty: "Unsaved changes…",
  saving: "Saving…",
  saved: "All changes saved",
  error: "Could not save",
};

export function PackShell({
  pack,
  brief,
  active,
  artifact,
  saveState,
  onUpdate,
  children,
}: {
  pack: LogisticsPack;
  brief: EventBrief | null;
  /** Tab slug, "" for the overview. */
  active: string;
  /** Which artifact a flagged issue should be attributed to. */
  artifact: RelatedArtifact;
  saveState: SaveState;
  onUpdate: (updater: (prev: LogisticsPack) => LogisticsPack) => void;
  children: ReactNode;
}) {
  const openIssues = packCompleteness(pack).openIssues;
  const base = `/logistics/${pack.id}`;

  return (
    <div className="space-y-6">
      <header className="no-print space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
              Run-of-Show &amp; Logistics Pack
            </p>
            <h1 className="text-xl font-semibold text-content">
              {brief?.name || "Untitled event"}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-content-muted">
              {brief ? <span>{formatDateRange(brief)}</span> : null}
              {brief?.dates?.timezone ? <Badge>{brief.dates.timezone}</Badge> : null}
              {brief?.format?.venueOrPlatform?.name ? (
                <span>{brief.format.venueOrPlatform.name}</span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-content-muted">{SAVE_LABELS[saveState]}</span>
            <FlagIssueButton artifact={artifact} onLog={onUpdate} />
            <Link
              href={`${base}/print`}
              className="inline-flex items-center rounded-md bg-surface px-3.5 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line-strong hover:bg-surface-sunken"
            >
              Print full pack
            </Link>
            {brief ? (
              <Link
                href={`/brief/${brief.id}`}
                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-content-muted underline-offset-4 hover:text-content hover:underline"
              >
                ← Back to brief
              </Link>
            ) : null}
          </div>
        </div>

        {brief?.status === "draft" ? (
          <p
            role="status"
            className="rounded-lg border border-warning-border bg-warning-subtle px-4 py-2 text-sm text-warning-text"
          >
            This event brief is still a draft — logistics built on it may change.
          </p>
        ) : null}

        <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Logistics pack sections">
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
                {tab.slug === "issues" && openIssues > 0 ? (
                  <Badge tone="danger">{openIssues}</Badge>
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

/** Header row inside an artifact view: title, count, and its own actions. */
export function ArtifactHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-content">{title}</h2>
        {description ? <p className="text-xs text-content-muted">{description}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function PackLoading() {
  return <p className="py-16 text-center text-sm text-content-muted">Loading…</p>;
}

export function PackNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-content">That logistics pack no longer exists</h1>
      <p className="mt-2 text-sm text-content-muted">
        It may have been deleted along with its event brief.
      </p>
      <Link
        href="/brief"
        className="mt-5 inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
      >
        Choose a brief
      </Link>
    </div>
  );
}

export { Button };
