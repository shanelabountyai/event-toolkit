import * as React from "react";
import { cx } from "./cx";

export function ProgressBar({
  value,
  className,
  label,
}: {
  /** 0-100. */
  value: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const tone =
    clamped >= 100 ? "bg-success" : clamped >= 60 ? "bg-accent" : "bg-warning";
  return (
    <div
      className={cx("h-2 w-full overflow-hidden rounded-full bg-surface-hover", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Completeness"}
    >
      <div className={cx("h-full rounded-full transition-all", tone)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
