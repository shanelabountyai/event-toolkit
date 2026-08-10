import type { EventBrief } from "@event-toolkit/schema";

/** "12 Mar 2026" from an ISO date, without timezone drift. */
export function formatIsoDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "12 Mar 2026, 14:05" from an ISO datetime. */
export function formatIsoDateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Relative "3 minutes ago" style label used in the brief list. */
export function formatRelative(iso: string | undefined | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatIsoDateTime(iso);
}

export function formatMoney(amount: number | undefined | null, currency: string): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function formatMetricValue(
  value: number | null | undefined,
  unit: string | undefined,
): string {
  if (value === null || value === undefined) return "—";
  const n = value.toLocaleString();
  if (!unit || unit === "count") return n;
  if (unit === "%") return `${n}%`;
  if (unit === "$") return `$${n}`;
  return `${n} ${unit}`;
}

/** Date range label: single date when start === end. */
export function formatDateRange(brief: EventBrief): string {
  const { eventStartDate, eventEndDate } = brief.dates;
  if (!eventStartDate && !eventEndDate) return "Dates not set";
  if (!eventEndDate || eventEndDate === eventStartDate) return formatIsoDate(eventStartDate);
  return `${formatIsoDate(eventStartDate)} – ${formatIsoDate(eventEndDate)}`;
}

/** File-system-safe slug for export filenames. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "event-brief"
  );
}

export function sumPlanned(brief: EventBrief): number {
  return (brief.budget.allocations ?? []).reduce(
    (total, a) => total + (Number.isFinite(a.plannedAmount) ? a.plannedAmount : 0),
    0,
  );
}
