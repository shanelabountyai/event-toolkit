"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@event-toolkit/ui";
import { loadDemoEvent } from "@/lib/demo-event";

/**
 * Loads a worked example so the product can be looked at rather than filled in.
 *
 * Seeds the brief and its budget only; every other tool builds itself from the brief on first
 * visit, which is the propagation the demo exists to show.
 */
export function DemoEventButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function load() {
    setState("loading");
    try {
      const id = await loadDemoEvent();
      // refresh() first, so the list behind the navigation is already rebuilt.
      router.refresh();
      router.push(`/brief/${id}`);
    } catch (error) {
      console.error("demo seed failed", error);
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button onClick={load} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Load a demo event"}
      </Button>
      {state === "error" ? (
        <span className="text-xs text-danger-text">Could not load the demo. Try creating a brief.</span>
      ) : null}
    </div>
  );
}
