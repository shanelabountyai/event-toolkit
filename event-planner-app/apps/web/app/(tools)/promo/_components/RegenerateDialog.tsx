"use client";

/**
 * Per-asset regenerate diff + confirm.
 *
 * The important bit is the middle column: edited assets are skipped by default, and the only
 * way to lose an edit is to tick "regenerate anyway" for that specific asset.
 */

import { useState } from "react";
import type { RegeneratePlanRow } from "@event-toolkit/local-store";
import { Badge, Button } from "@event-toolkit/ui";

const OUTCOME_LABELS: Record<RegeneratePlanRow["outcome"], { label: string; tone: "neutral" | "info" | "success" | "warning" }> = {
  update: { label: "Will update", tone: "success" },
  add: { label: "New asset", tone: "info" },
  skip_edited: { label: "Edited — will be skipped", tone: "warning" },
  override: { label: "Edits will be discarded", tone: "warning" },
};

export function RegenerateDialog({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: RegeneratePlanRow[];
  onConfirm: (overrides: string[]) => void;
  onCancel: () => void;
}) {
  const [overrides, setOverrides] = useState<string[]>([]);

  const toggle = (assetId: string) =>
    setOverrides((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId],
    );

  const edited = plan.filter((r) => r.outcome === "skip_edited" || r.outcome === "override");
  const updating = plan.filter((r) => r.outcome === "update" && r.bodyChanged).length;
  const unchanged = plan.filter((r) => r.outcome === "update" && !r.bodyChanged).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="regen-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-accent/40 p-4 sm:p-8"
    >
      <div className="w-full max-w-2xl rounded-xl bg-surface shadow-xl">
        <div className="border-b border-line px-5 py-4">
          <h2 id="regen-title" className="text-base font-semibold text-content">
            Regenerate from the updated brief
          </h2>
          <p className="mt-1 text-xs text-content-muted">
            {updating} asset{updating === 1 ? "" : "s"} will pick up new copy, {unchanged} would not
            change, and {edited.length} you have edited {edited.length === 1 ? "is" : "are"} skipped
            unless you choose otherwise.
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-3">
          <ul className="divide-y divide-line">
            {plan.map((row) => {
              const isOverridden = overrides.includes(row.assetId);
              const outcome = isOverridden && row.outcome === "skip_edited" ? "override" : row.outcome;
              const meta = OUTCOME_LABELS[outcome];
              return (
                <li key={row.assetId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm text-content">
                    {row.label}
                    {row.outcome === "update" && !row.bodyChanged ? (
                      <span className="ml-2 text-xs text-content-subtle">no change</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {row.outcome === "skip_edited" || row.outcome === "override" ? (
                      <label className="flex items-center gap-1.5 text-xs text-content-muted">
                        <input
                          type="checkbox"
                          checked={isOverridden}
                          onChange={() => toggle(row.assetId)}
                          className="h-3.5 w-3.5 rounded border-line-strong"
                        />
                        Regenerate anyway
                      </label>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-sunken px-5 py-3">
          <p className="text-xs text-content-muted">
            {overrides.length > 0
              ? `${overrides.length} edited asset${overrides.length === 1 ? "" : "s"} will lose your changes.`
              : "No edits will be lost."}
          </p>
          <span className="flex gap-2">
            <Button onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={() => onConfirm(overrides)}>
              Regenerate
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
