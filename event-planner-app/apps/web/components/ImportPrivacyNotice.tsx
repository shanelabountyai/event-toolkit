"use client";

import { useEffect, useState } from "react";
import { getStoreContext } from "@event-toolkit/local-store";

/**
 * PRD 10 FR-13 — the moment the responsibility is taken on.
 *
 * A planner importing a badge-scan file is uploading the personal data of people who have never
 * heard of this product. One sentence, once per session, at exactly that moment — not buried in a
 * privacy page nobody opens. The wording differs by mode because the obligation does: with no
 * account nothing leaves the browser, and claiming otherwise would be false.
 */
export function ImportPrivacyNotice() {
  const [state, setState] = useState<{ mode: "local" | "workspace"; months: number } | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const ctx = getStoreContext();
    const seen = window.sessionStorage.getItem("event-toolkit:import-notice");
    setDismissed(seen === "1");

    if (ctx.mode !== "workspace") {
      setState({ mode: "local", months: 0 });
      return;
    }

    fetch("/api/me")
      .then((r) => r.json())
      .then((me: { workspaces: { id: string; retentionMonths: number }[] }) => {
        const active = me.workspaces.find((w) => w.id === ctx.workspaceId);
        setState({ mode: "workspace", months: active?.retentionMonths ?? 12 });
      })
      .catch(() => setState({ mode: "workspace", months: 12 }));
  }, []);

  if (!state || dismissed) return null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-warning-subtle px-4 py-3 ring-1 ring-inset ring-warning-border">
      <p className="max-w-prose text-sm text-warning-text">
        {state.mode === "workspace" ? (
          <>
            You&rsquo;re about to upload other people&rsquo;s personal data — names, emails, job
            titles — to a server. It will be deleted automatically after{" "}
            <span className="font-medium">{state.months} months</span>. You are the data controller
            for it, not this product: if one of these people asks what you hold or asks you to
            delete it, that request is yours to answer, and the Attendee data requests screen is how.
          </>
        ) : (
          <>
            You&rsquo;re about to import other people&rsquo;s personal data. Without an account it
            stays in this browser and goes nowhere else — but you are still responsible for it, and
            for answering anyone who asks what you hold about them.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => {
          window.sessionStorage.setItem("event-toolkit:import-notice", "1");
          setDismissed(true);
        }}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-warning-text hover:bg-warning-subtle"
      >
        Understood
      </button>
    </div>
  );
}
