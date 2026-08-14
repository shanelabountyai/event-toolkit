"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  pendingCount,
  resetStoreContext,
  setStoreContext,
  type Role,
} from "@event-toolkit/local-store";
import { syncOnce, type Conflict } from "@/lib/sync-client";

interface Me {
  signedIn: boolean;
  hosted: boolean;
  userId?: string;
  workspaces: { id: string; name: string; role: Role }[];
}

const ACTIVE_KEY = "event-toolkit:active-workspace";
/** Quiet enough not to be a background job, frequent enough that a colleague's edit shows up. */
const POLL_MS = 30_000;

type Status = "local" | "synced" | "syncing" | "pending" | "offline";

/**
 * Connects the browser to a workspace, and keeps it up to date.
 *
 * Mounted in the root layout but renders nothing until it knows the answer, so a planner who never
 * signs in sees no flicker and pays for one fetch. **Local-only mode is the default**: with no
 * account, `setStoreContext` is never called and every tool behaves exactly as it did before the
 * hosted tier existed.
 */
export function WorkspaceSync() {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<Status>("local");
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const active = useRef<string | null>(null);

  const run = useCallback(async () => {
    if (!active.current) return;
    setStatus("syncing");
    const outcome = await syncOnce(active.current);
    setConflicts((existing) => [...existing, ...outcome.conflicts]);
    const queued = await pendingCount();
    setPending(queued);
    setStatus(outcome.error ? "offline" : queued > 0 ? "pending" : "synced");
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/me")
      .then((r) => r.json())
      .then((data: Me) => {
        if (cancelled) return;
        setMe(data);
        if (!data.signedIn || data.workspaces.length === 0) {
          // Signed out, or signed in with no workspace yet: stay local. Nothing changes.
          resetStoreContext();
          return;
        }

        const stored = window.localStorage.getItem(ACTIVE_KEY);
        const chosen = data.workspaces.find((w) => w.id === stored) ?? data.workspaces[0];
        active.current = chosen.id;
        window.localStorage.setItem(ACTIVE_KEY, chosen.id);

        setStoreContext({
          mode: "workspace",
          workspaceId: chosen.id,
          userId: data.userId,
          role: chosen.role,
        });
        void run();
      })
      .catch(() => {
        // No session endpoint reachable means offline or local-only. Either way: keep working.
        if (!cancelled) resetStoreContext();
      });

    return () => {
      cancelled = true;
    };
  }, [run]);

  useEffect(() => {
    if (!active.current) return;
    const timer = setInterval(() => void run(), POLL_MS);
    // A tab that has been in the background is the one most likely to be stale, and coming back
    // online is the moment a queued edit can finally leave.
    const onFocus = () => void run();
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [run, me]);

  if (!me?.signedIn || !active.current) return null;

  return (
    <>
      <span className="text-xs text-content-muted" title={LABELS[status].title}>
        {LABELS[status].text(pending)}
      </span>

      {conflicts.length > 0 && !dismissed ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-warning-border bg-warning-subtle px-6 py-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-warning-text">
              {/*
                Surfaced, never auto-resolved. The same refusal PRD 2, 5, 7 and the dedupe pass all
                make: the product does not silently pick a winner when two people disagree.
              */}
              <span className="font-medium">
                {conflicts.length === 1
                  ? "1 change couldn't be saved"
                  : `${conflicts.length} changes couldn't be saved`}
              </span>{" "}
              — somebody else edited{" "}
              {conflicts.length === 1 ? "the same thing" : "the same things"} first. Your version is
              still on this device.
            </p>
            <div className="flex gap-2">
              <Link
                href={`/workspace/${active.current}/conflicts`}
                className="rounded-lg bg-warning px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-warning"
              >
                Review
              </Link>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-warning-text hover:bg-warning-subtle"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const LABELS: Record<Status, { text: (n: number) => string; title: string }> = {
  local: { text: () => "", title: "" },
  syncing: { text: () => "Syncing…", title: "Sending and fetching changes" },
  synced: { text: () => "Up to date", title: "Everything on this device has reached the server" },
  pending: {
    text: (n) => (n === 1 ? "1 change waiting" : `${n} changes waiting`),
    title: "Saved here and queued. They'll send when the connection allows.",
  },
  offline: {
    text: (n) => (n > 0 ? `Offline · ${n} waiting` : "Offline"),
    title: "Working offline. Everything is saved on this device and will send later.",
  },
};
