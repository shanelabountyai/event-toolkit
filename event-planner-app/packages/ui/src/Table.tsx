import * as React from "react";
import { cx } from "./cx";

/**
 * `stack` turns rows into blocks below the `md` breakpoint.
 *
 * A table that only scrolls sideways is the wrong container on a phone: a horizontal swipe inside
 * a sub-region fights both the page's vertical scroll and the browser's back-swipe, and this
 * product's hardest case is a planner reading a run of show one-handed in a venue.
 *
 * Stacked cells take their heading from `Td`'s `label`, rendered by CSS from a data attribute —
 * see `.stack-table` in globals.css. Without a label a cell still stacks, it just has no heading,
 * which is right for a cell holding only an action button.
 *
 * Leave `stack` off for genuinely wide analytical tables where scanning columns is the point and
 * the reader is at a desk.
 */
export function Table({
  className,
  stack = false,
  ...rest
}: React.TableHTMLAttributes<HTMLTableElement> & { stack?: boolean }) {
  return (
    <div className={stack ? "md:overflow-x-auto" : "overflow-x-auto"}>
      <table
        className={cx("w-full border-collapse text-left text-sm", stack && "stack-table", className)}
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

export function Td({
  className,
  label,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & { label?: string }) {
  return (
    <td
      data-label={label}
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
