"use client";

/**
 * Actual-vs-target registrations: a hand-rolled inline SVG plus the same numbers as a table.
 *
 * No charting dependency — two polylines over a linear scale is not worth 40kB, and the
 * table underneath is what makes the numbers accessible to a screen reader anyway.
 */

import {
  addDaysToIsoDate,
  daysBetweenIsoDates,
  targetAtDate,
  type PacingCurveStyle,
  type PacingEntry,
  type PacingPoint,
  type PacingWindow,
} from "@event-toolkit/schema";
import { Button, Table, Td, Th, EmptyRow } from "@event-toolkit/ui";
import { formatIsoDate } from "@/lib/format";

const W = 720;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

export function PacingCurveChart({
  points,
  entries,
  window: pacingWindow,
  style,
  registrationTarget,
  onDeleteEntry,
}: {
  points: PacingPoint[];
  entries: PacingEntry[];
  window: PacingWindow;
  style: PacingCurveStyle;
  registrationTarget: number;
  onDeleteEntry: (id: string) => void;
}) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const totalDays = Math.max(1, pacingWindow.totalDays);
  const maxY = Math.max(registrationTarget, ...points.map((p) => p.actual ?? 0), 1);

  const x = (date: string) => {
    const elapsed = daysBetweenIsoDates(pacingWindow.campaignStartDate, date);
    const frac = Math.max(0, Math.min(1, elapsed / totalDays));
    return PAD.left + frac * plotW;
  };
  const y = (value: number) => PAD.top + plotH - (Math.max(0, value) / maxY) * plotH;

  // The target line is drawn from the curve itself (weekly samples), not from the data
  // points, so its shape is visible even before anything has been reported.
  const sampleCount = 24;
  const targetLine = Array.from({ length: sampleCount + 1 }, (_, i) => {
    const dayOffset = Math.round((i / sampleCount) * totalDays);
    const date = addDaysToIsoDate(pacingWindow.campaignStartDate, dayOffset);
    return `${x(date).toFixed(1)},${y(targetAtDate(date, pacingWindow, style, registrationTarget)).toFixed(1)}`;
  }).join(" ");

  const actualPoints = points.filter((p) => p.actual !== null);
  const actualLine = actualPoints.map((p) => `${x(p.date).toFixed(1)},${y(p.actual!).toFixed(1)}`).join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label={`Registration pacing: actual versus ${style === "linear" ? "linear" : "backloaded"} target curve toward a goal of ${registrationTarget}.`}
        >
          {yTicks.map((value) => (
            <g key={value}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(value) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
                {value.toLocaleString()}
              </text>
            </g>
          ))}

          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeWidth={1} />
          <text x={PAD.left} y={H - 8} className="fill-slate-400 text-[10px]">
            {formatIsoDate(pacingWindow.campaignStartDate)}
          </text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" className="fill-slate-400 text-[10px]">
            {formatIsoDate(pacingWindow.eventStartDate)}
          </text>

          <polyline points={targetLine} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" />
          {actualPoints.length > 0 ? (
            <>
              <polyline points={actualLine} fill="none" stroke="#0f172a" strokeWidth={2.5} />
              {actualPoints.map((p) => (
                <circle key={p.date} cx={x(p.date)} cy={y(p.actual!)} r={3.5} fill="#0f172a" />
              ))}
            </>
          ) : null}
        </svg>

        <p className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-5 bg-slate-900" /> Actual
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-5 border-t-2 border-dashed border-slate-400" /> Target
          </span>
        </p>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th className="text-right">Registrations</Th>
            <Th className="text-right">Target</Th>
            <Th className="text-right">Difference</Th>
            <Th className="w-10" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <EmptyRow colSpan={5}>No registration counts entered yet.</EmptyRow>
          ) : (
            entries.map((entry) => {
              const target = targetAtDate(entry.date, pacingWindow, style, registrationTarget);
              const diff = entry.cumulativeRegistrations - target;
              return (
                <tr key={entry.id}>
                  <Td>{formatIsoDate(entry.date)}</Td>
                  <Td className="text-right tabular-nums">{entry.cumulativeRegistrations.toLocaleString()}</Td>
                  <Td className="text-right tabular-nums text-slate-500">{target.toLocaleString()}</Td>
                  <Td className={`text-right tabular-nums ${diff < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {diff > 0 ? "+" : ""}
                    {diff.toLocaleString()}
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDeleteEntry(entry.id)}
                      aria-label={`Delete the entry for ${formatIsoDate(entry.date)}`}
                    >
                      ✕
                    </Button>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </div>
  );
}
