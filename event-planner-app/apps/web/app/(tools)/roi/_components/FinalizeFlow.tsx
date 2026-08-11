"use client";

/**
 * FR-13/FR-14 — finalize, and the one write this whole tool is allowed to make.
 *
 * Every proposed `successMetrics[].actual` is shown with its source and value, and nothing is
 * written until the planner accepts it individually. Unmatched metrics are left alone, never
 * zeroed — a metric with no actual is "we don't know", which is different from "we scored 0".
 */

import { useState } from "react";
import {
  applyMetricWriteBacks,
  matchSuccessMetrics,
  type RoiReport,
  type SuccessMetricWriteBack,
} from "@event-toolkit/roi-report-core";
import type { EventBrief } from "@event-toolkit/schema";
import { nowIso } from "@event-toolkit/schema";
import { saveBrief } from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader, Table, Td, Th } from "@event-toolkit/ui";

export function FinalizeFlow({
  report,
  brief,
  onDone,
  onCancel,
}: {
  report: RoiReport;
  brief: EventBrief;
  onDone: (patch: Partial<RoiReport>, updatedBrief: EventBrief) => void | Promise<void>;
  onCancel: () => void;
}) {
  const matches = matchSuccessMetrics(brief.successMetrics, {
    pipelineSummary: report.pipelineSummary,
    surveySummary: report.surveySummary,
    costSummary: report.costSummary,
    scorecard: report.scorecard,
  });
  const writable = matches.filter((m) => m.matchedField !== null && m.proposedValue !== null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set(writable.map((m) => m.metric.id)));
  const [busy, setBusy] = useState(false);

  const finalize = async () => {
    setBusy(true);
    try {
      const toWrite = writable.filter((m) => accepted.has(m.metric.id));
      let updatedBrief = brief;
      const writeBacks: SuccessMetricWriteBack[] = [];

      if (toWrite.length > 0) {
        updatedBrief = await saveBrief(
          applyMetricWriteBacks(
            brief,
            toWrite.map((m) => ({ metricId: m.metric.id, value: m.proposedValue! })),
          ),
        );
        const writtenAt = nowIso();
        for (const match of toWrite) {
          writeBacks.push({
            metricId: match.metric.id,
            metricName: match.metric.metric,
            matchedField: match.matchedField!,
            valueWritten: match.proposedValue!,
            writtenAt,
          });
        }
      }

      await onDone(
        {
          status: "final",
          finalizedAt: nowIso(),
          successMetricWriteBacks: [...report.successMetricWriteBacks, ...writeBacks],
        },
        updatedBrief,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Finalise this report</h2>
          <p className="text-xs text-slate-500">
            Finalising makes this report available as a year-over-year comparator, and writes the
            values you accept below back onto the event brief.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </CardHeader>
      <CardBody className="space-y-4">
        <Table>
          <thead>
            <tr>
              <Th className="w-12">Write</Th>
              <Th>Success metric</Th>
              <Th className="w-24 text-right">Target</Th>
              <Th className="w-24 text-right">Current</Th>
              <Th>Matched to</Th>
              <Th className="w-28 text-right">Proposed</Th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => {
              const canWrite = match.matchedField !== null && match.proposedValue !== null;
              return (
                <tr key={match.metric.id} className={canWrite ? undefined : "text-slate-500"}>
                  <Td>
                    {canWrite ? (
                      <input
                        type="checkbox"
                        aria-label={`Write ${match.metric.metric}`}
                        checked={accepted.has(match.metric.id)}
                        onChange={(e) =>
                          setAccepted((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(match.metric.id);
                            else next.delete(match.metric.id);
                            return next;
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    ) : (
                      <span aria-hidden>—</span>
                    )}
                  </Td>
                  <Td className="font-medium">{match.metric.metric}</Td>
                  <Td className="text-right tabular-nums">{match.metric.target.toLocaleString()}</Td>
                  <Td className="text-right tabular-nums">
                    {match.metric.actual === null || match.metric.actual === undefined
                      ? "—"
                      : match.metric.actual.toLocaleString()}
                  </Td>
                  <Td className="text-xs">
                    {match.matchedField ?? <Badge tone="neutral">No match — left untouched</Badge>}
                    {match.unavailableReason ? (
                      <span className="block text-amber-700">{match.unavailableReason}</span>
                    ) : null}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {match.proposedValue === null ? "—" : match.proposedValue.toLocaleString()}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        <p className="text-xs text-slate-500">
          {accepted.size} of {writable.length} matched metric{writable.length === 1 ? "" : "s"} will
          be written. Metrics with no match are never modified.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void finalize()}>
            Write {accepted.size} value{accepted.size === 1 ? "" : "s"} and finalise
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
