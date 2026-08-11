import * as React from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/**
 * Tones map to semantic tokens, so a badge is legible in both themes.
 *
 * `info` used to be sky and `success` emerald while other parts of the app used blue and green
 * for the same meanings. One family each, named by what it means.
 */
const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-content-muted ring-line",
  info: "bg-accent-subtle text-accent-text ring-accent/20",
  success: "bg-success-subtle text-success-text ring-success-border",
  warning: "bg-warning-subtle text-warning-text ring-warning-border",
  danger: "bg-danger-subtle text-danger-text ring-danger-border",
};

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
