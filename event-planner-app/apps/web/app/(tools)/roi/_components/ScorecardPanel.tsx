"use client";

/**
 * FR-10 — the scorecard. Every dimension shows its raw value, the exact bands applied and its
 * verdict. A colour with no explanation attached is the thing this panel exists to prevent.
 */

import {
  RECOMMENDATION_LABELS,
  VERDICT_LABELS,
  type Scorecard,
  type ScorecardVerdict,
} from "@event-toolkit/roi-report-core";
import { Badge, Card, CardBody, CardHeader, Table, Td, Th, type BadgeTone } from "@event-toolkit/ui";

const TONES: Record<ScorecardVerdict, BadgeTone> = {
  green: "success",
  yellow: "warning",
  red: "danger",
  insufficient_data: "neutral",
};

const RECOMMENDATION_TONES: Record<Scorecard["recommendation"], BadgeTone> = {
  repeat: "success",
  change: "warning",
  kill: "danger",
  insufficient_data: "neutral",
};

export function ScorecardPanel({ scorecard }: { scorecard: Scorecard | null }) {
  if (!scorecard) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900">Repeat, change or kill</h2>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-600">Import some data to score this event.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Repeat, change or kill</h2>
          <p className="text-xs text-slate-500">
            {scorecard.scoreableDimensionCount} of {scorecard.dimensions.length} dimensions scored
            {scorecard.scorePct !== null ? ` · ${Math.round(scorecard.scorePct * 100)}%` : ""}
          </p>
        </div>
        <Badge tone={RECOMMENDATION_TONES[scorecard.recommendation]}>
          {RECOMMENDATION_LABELS[scorecard.recommendation]}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {scorecard.recommendationRationale}
        </p>

        <Table>
          <thead>
            <tr>
              <Th>Dimension</Th>
              <Th className="w-24 text-right">Value</Th>
              <Th className="w-28">Verdict</Th>
              <Th>Bands applied</Th>
              <Th className="w-20 text-right">Points</Th>
            </tr>
          </thead>
          <tbody>
            {scorecard.dimensions.map((dimension) => (
              <tr key={dimension.id}>
                <Td className="font-medium">{dimension.label}</Td>
                <Td className="text-right tabular-nums">
                  {dimension.rawValue === null ? "—" : dimension.rawValue}
                </Td>
                <Td>
                  <Badge tone={TONES[dimension.verdict]}>{VERDICT_LABELS[dimension.verdict]}</Badge>
                </Td>
                <Td className="text-xs text-slate-600">{dimension.thresholdsApplied}</Td>
                <Td className="text-right tabular-nums">
                  {dimension.points === null ? "—" : `${dimension.points}/2`}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <p className="text-xs text-slate-500">
          Pipeline drives this, not closed/won revenue — most deal cycles run longer than the
          window this report covers, so won figures are shown but not weighted.
        </p>
      </CardBody>
    </Card>
  );
}
