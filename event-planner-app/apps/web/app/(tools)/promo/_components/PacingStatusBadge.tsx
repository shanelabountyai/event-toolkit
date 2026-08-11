"use client";

import {
  PACING_STATUS_LABELS,
  type PacingAssessment,
  type PacingStatus,
} from "@event-toolkit/schema";
import { Badge, type BadgeTone } from "@event-toolkit/ui";

const TONES: Record<PacingStatus, BadgeTone> = {
  on_pace: "success",
  behind_pace: "warning",
  critical: "danger",
};

export function PacingStatusBadge({ status }: { status: PacingStatus }) {
  return <Badge tone={TONES[status]}>{PACING_STATUS_LABELS[status]}</Badge>;
}

/** Headline numbers above the chart: status, where you are, and how long is left. */
export function PacingSummary({
  assessment,
  registrationTarget,
}: {
  assessment: PacingAssessment;
  registrationTarget: number;
}) {
  const stats = [
    { label: "Registrations so far", value: assessment.actual.toLocaleString() },
    { label: "Expected by now", value: assessment.target.toLocaleString() },
    { label: "Goal", value: registrationTarget.toLocaleString() },
    { label: "Days to event", value: assessment.daysRemaining.toLocaleString() },
  ];

  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PacingStatusBadge status={assessment.status} />
          <span className="text-sm text-content-muted">
            {assessment.status === "on_pace"
              ? `${assessment.pctOfGoal}% of the goal, at or ahead of the target curve.`
              : `${assessment.shortfallPct}% below where the target curve expects you to be.`}
          </span>
        </div>
        {assessment.latestEntryDate ? null : (
          <span className="text-xs text-content-muted">No registration data entered yet.</span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md bg-surface-sunken px-3 py-2">
            <dt className="text-xs text-content-muted">{s.label}</dt>
            <dd className="text-lg font-semibold text-content">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
