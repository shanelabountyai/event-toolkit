import * as React from "react";
import { cx } from "./cx";

export function Table({ className, ...rest }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cx("w-full border-collapse text-left text-sm", className)}
        {...rest}
      />
    </div>
  );
}

export function Th({ className, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cx(
        "border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content-subtle",
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cx("border-b border-line px-3 py-2 align-top text-content", className)}
      {...rest}
    />
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-sm text-content-subtle">
        {children}
      </td>
    </tr>
  );
}
