import * as React from "react";
import { cx } from "./cx";

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-xl border border-slate-200 bg-white shadow-sm print:border-slate-300 print:shadow-none",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5",
        className,
      )}
      {...rest}
    />
  );
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("px-5 py-4", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("border-t border-slate-200 bg-slate-50/60 px-5 py-3", className)}
      {...rest}
    />
  );
}
