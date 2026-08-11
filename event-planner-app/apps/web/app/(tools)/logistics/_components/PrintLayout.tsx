"use client";

/**
 * FR-11 — the shared print wrapper for every `print/*` route.
 *
 * Browser-native only: a `window.print()` button plus `@media print` rules in globals.css.
 * No PDF library — that is a named, deferred P1.
 */

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import type { LogisticsPack } from "@event-toolkit/logistics";
import type { EventBrief } from "@event-toolkit/schema";
import { Button } from "@event-toolkit/ui";
import { formatDateRange, formatIsoDateTime } from "@/lib/format";

export function PrintLayout({
  pack,
  brief,
  title,
  autoPrint = false,
  children,
}: {
  pack: LogisticsPack;
  brief: EventBrief | null;
  title: string;
  autoPrint?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    // Let the tables lay out before the dialog freezes the page.
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="print-sheet space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-sm">
        <p className="text-sm text-content-muted">
          Print preview — use your browser&rsquo;s print dialog to print or save as PDF.
        </p>
        <span className="flex gap-2">
          <Button variant="primary" onClick={() => window.print()}>
            Print
          </Button>
          <Link
            href={`/logistics/${pack.id}`}
            className="inline-flex items-center rounded-md bg-surface px-3.5 py-2 text-sm font-medium text-content ring-1 ring-inset ring-line-strong hover:bg-surface-sunken"
          >
            Back to pack
          </Link>
        </span>
      </div>

      {/* Timezone appears once, in the document header — not repeated on every row. */}
      <header className="border-b border-line-strong pb-3">
        <h1 className="text-xl font-semibold text-content">
          {brief?.name || "Event"} — {title}
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          {brief ? formatDateRange(brief) : ""}
          {brief?.format?.venueOrPlatform?.name ? ` · ${brief.format.venueOrPlatform.name}` : ""}
          {brief?.dates?.timezone ? ` · all times ${brief.dates.timezone}` : ""}
        </p>
        <p className="text-xs text-content-muted">
          Printed from pack version {pack.version} · last updated {formatIsoDateTime(pack.updatedAt)}
        </p>
      </header>

      {children}
    </div>
  );
}

/** One section of the full-pack print, each starting on a fresh page. */
export function PrintSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="print-section space-y-2">
      <h2 className="text-lg font-semibold text-content">{title}</h2>
      {children}
    </section>
  );
}
