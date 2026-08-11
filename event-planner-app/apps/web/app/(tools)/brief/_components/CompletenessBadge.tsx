"use client";

/** FR-10 — completeness signal shown on the brief list and the brief view. */

import { computeCompleteness, type EventBrief } from "@event-toolkit/schema";
import { Badge, ProgressBar } from "@event-toolkit/ui";

export function CompletenessBadge({ brief }: { brief: EventBrief }) {
  const { percent, passed, total } = computeCompleteness(brief);
  const tone = percent >= 100 ? "success" : percent >= 60 ? "info" : "warning";
  return (
    <Badge tone={tone} title={`${passed} of ${total} completeness checks passed`}>
      {percent}% complete
    </Badge>
  );
}

export function CompletenessMeter({
  brief,
  showChecklist = false,
}: {
  brief: EventBrief;
  showChecklist?: boolean;
}) {
  const result = computeCompleteness(brief);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-content-muted">Completeness</span>
        <span className="text-sm tabular-nums text-content-muted">
          {result.percent}%{" "}
          <span className="text-xs text-content-subtle">
            ({result.passed}/{result.total} checks)
          </span>
        </span>
      </div>
      <ProgressBar value={result.percent} />
      {showChecklist ? (
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {result.checks.map((check) => (
            <li
              key={check.key}
              className={`flex items-start gap-1.5 text-xs ${
                check.ok ? "text-content-muted" : "text-warning-text"
              }`}
            >
              <span aria-hidden="true">{check.ok ? "✓" : "○"}</span>
              <span>
                {check.label}
                {check.kind === "required" ? (
                  <span className="ml-1 text-[10px] uppercase tracking-wide text-content-subtle">
                    required
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
