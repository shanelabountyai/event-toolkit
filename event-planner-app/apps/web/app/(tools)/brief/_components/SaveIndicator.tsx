"use client";

import type { SaveState } from "../_hooks/useBriefDocument";

const LABELS: Record<SaveState, string> = {
  idle: "Saved locally",
  dirty: "Unsaved changes…",
  saving: "Saving…",
  saved: "Saved locally",
  error: "Save failed",
};

export function SaveIndicator({ state, className }: { state: SaveState; className?: string }) {
  const tone =
    state === "error" ? "text-red-600" : state === "dirty" || state === "saving" ? "text-amber-600" : "text-slate-400";
  return (
    <span className={`text-xs ${tone} ${className ?? ""}`} role="status" aria-live="polite">
      {LABELS[state]}
    </span>
  );
}
