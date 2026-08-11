import * as React from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * Primary is the accent, not near-black.
 *
 * The accent token existed and the primary button ignored it, so the product had a defined
 * interactive colour that nothing interactive used. On a dark canvas a near-black button is also
 * close to invisible.
 *
 * No `focus-visible:outline-*` here: `globals.css` sets one focus ring for the whole app, and a
 * per-variant override is how that becomes four slightly different rings.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover disabled:bg-line-strong disabled:text-content-subtle",
  secondary:
    "bg-surface text-content ring-1 ring-inset ring-line-strong hover:bg-surface-hover disabled:text-content-subtle",
  ghost:
    "bg-transparent text-content-muted hover:bg-surface-hover hover:text-content disabled:text-content-subtle",
  danger:
    "bg-surface text-danger-text ring-1 ring-inset ring-danger-border hover:bg-danger-subtle disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
