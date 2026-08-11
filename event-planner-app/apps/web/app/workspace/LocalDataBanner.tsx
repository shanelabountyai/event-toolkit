"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { countLocalEvents } from "@event-toolkit/local-store";

/**
 * FR-9's prompt: "You have 3 events saved in this browser. Move them into your workspace?"
 *
 * Client-side because the answer is in this browser's IndexedDB and no server can see it. Renders
 * nothing until it knows, so the page never flashes a banner it then retracts.
 */
export function LocalDataBanner({ workspaceId }: { workspaceId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    countLocalEvents()
      .then((n) => !cancelled && setCount(n))
      .catch(() => !cancelled && setCount(0));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!count) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent px-5 py-4 text-accent-fg">
      <p className="text-sm">
        You have {count === 1 ? "1 event" : `${count} events`} saved in this browser.{" "}
        <span className="text-content-subtle">Move them in to reach them from anywhere.</span>
      </p>
      <Link
        href={`/workspace/${workspaceId}/migrate`}
        className="rounded-lg bg-surface px-3 py-1.5 text-sm font-medium text-content hover:bg-surface-hover"
      >
        Review what moves
      </Link>
    </div>
  );
}
