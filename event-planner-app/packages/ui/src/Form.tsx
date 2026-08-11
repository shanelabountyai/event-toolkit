import * as React from "react";
import { cx } from "./cx";

const CONTROL =
  "block w-full rounded-md border-0 bg-surface px-3 py-2 text-sm text-content shadow-sm ring-1 ring-inset ring-line-strong " +
  // min-h-11: a 44px touch target. Below that a select is genuinely hard to hit one-handed, which
  // is how this product is used standing in a venue.
  "min-h-11 placeholder:text-content-subtle focus:ring-2 focus:ring-inset focus:ring-focus " +
  "disabled:bg-surface-sunken disabled:text-content-subtle";

const CONTROL_ERROR = "ring-danger focus:ring-danger";

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Label + hint + error wrapper shared by every form control in the suite. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-content">
        {label}
        {required ? <span className="ml-1 text-danger-text">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger-text">{error}</p>
      ) : hint ? (
        <p className="text-xs text-content-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function TextInput({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      type="text"
      className={cx(CONTROL, invalid && CONTROL_ERROR, className)}
      {...rest}
    />
  );
});

export const DateInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function DateInput({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      type="date"
      className={cx(CONTROL, invalid && CONTROL_ERROR, className)}
      {...rest}
    />
  );
});

/** Native datetime picker — its value format (YYYY-MM-DDTHH:mm) is what sessions store. */
export const DateTimeInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function DateTimeInput({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      type="datetime-local"
      className={cx(CONTROL, invalid && CONTROL_ERROR, className)}
      {...rest}
    />
  );
});

export const NumberInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function NumberInput({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      type="number"
      inputMode="decimal"
      className={cx(CONTROL, invalid && CONTROL_ERROR, className)}
      {...rest}
    />
  );
});

export const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function TextArea({ className, invalid, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cx(CONTROL, "resize-y", invalid && CONTROL_ERROR, className)}
      {...rest}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(CONTROL, "pr-8", invalid && CONTROL_ERROR, className)} {...rest}>
      {children}
    </select>
  );
});
