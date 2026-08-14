"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { countLocalEvents } from "@event-toolkit/local-store";

/**
 * FR-9's prompt: "You have 3 events saved in this browser. Move them into your workspace?"
 *
 * Client-side because the answer is in this browser's IndexedDB and no server can see it. Renders
 * nothing until it knows, so the page never flashes a banner it then retracts.
 *
 * `workspaceId` is null on the workspace *list*, where more than one workspace may exist and which
 * one the events belong in is the planner's call, not a guess we make for them. There the banner
 * still says what is here and why it matters — it just points at the list instead of a target.
 */
export function LocalDataBanner({ workspaceId }: { workspaceId: string | null }) {
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
        <span className="text-content-subtle">
          {workspaceId
            ? `Move ${count === 1 ? "it" : "them"} in to reach ${count === 1 ? "it" : "them"} from anywhere.`
            : `Pick or create the workspace you want ${count === 1 ? "it" : "them"} in, then move ${count === 1 ? "it" : "them"} across.`}
        </span>
      </p>
      {workspaceId && (
        <Link
          href={`/workspace/${workspaceId}/migrate`}
          className="rounded-lg bg-surface px-3 py-1.5 text-sm font-medium text-content hover:bg-surface-hover"
        >
          Review what moves
        </Link>
      )}
    </div>
  );
}
