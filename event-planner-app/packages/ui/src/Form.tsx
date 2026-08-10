import * as React from "react";
import { cx } from "./cx";

const CONTROL =
  "block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 " +
  "placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-slate-800 disabled:bg-slate-50 disabled:text-slate-500";

const CONTROL_ERROR = "ring-red-400 focus:ring-red-500";

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
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-800">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
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
