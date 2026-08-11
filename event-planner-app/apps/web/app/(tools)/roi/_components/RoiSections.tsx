"use client";

/**
 * The dashboard's read-only sections: budget, leads, cost per outcome and year-over-year.
 *
 * Every one of them has an explicit "not available" state. A missing input must never render
 * as a zero — "$0 per lead" reads like a triumph, and "0 opportunities" reads like failure,
 * when both actually mean "nothing imported yet".
 */

import { useState } from "react";
import Link from "next/link";
import {
  ATTRIBUTION_LABELS,
  LEAD_SOURCE_MODE_LABELS,
  type ComparatorCandidate,
  type CostSummary,
  type DeltaFigure,
  type PipelineSummary,
  type RoiReport,
  type SurveySummary,
} from "@event-toolkit/roi-report-core";
import type { BudgetActualsSummary } from "@event-toolkit/budget-calc";
import type { LeadSourceOption } from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader, NumberInput, Select, Table, Td, Th } from "@event-toolkit/ui";
import { formatMoney } from "@/lib/format";

function EmptySection({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-content">{title}</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-content-muted">{message}</p>
        {action}
      </CardBody>
    </Card>
  );
}

export function BudgetSection({
  summary,
  briefId,
}: {
  summary: BudgetActualsSummary | null;
  briefId: string;
}) {
  if (!summary) {
    return (
      <EmptySection
        title="Budget"
        message="No budget has been built for this event, so spend and every cost-per-outcome figure are unavailable."
        action={
          <Link href={`/budget/${briefId}`}>
            <Button size="sm" variant="primary">Open the Budget Builder</Button>
          </Link>
        }
      />
    );
  }

  const currency = summary.currency;
  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-content">Budget</h2>
          <p className="text-xs text-content-muted">
            Read straight from the Budget Builder — nothing is re-entered or re-derived here.
          </p>
        </div>
        <Badge tone={summary.varianceAtClose.isFinal ? "success" : "neutral"}>
          {summary.varianceAtClose.isFinal ? "Reconciled" : "Not reconciled"}
        </Badge>
      </CardHeader>
      <CardBody>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Budgeted" value={formatMoney(summary.totalBudgeted, currency)} />
          <Stat label="Committed" value={formatMoney(summary.totalCommitted, currency)} />
          <Stat label="Actual" value={formatMoney(summary.totalActual, currency)} />
          <Stat
            label="Variance"
            value={formatMoney(summary.varianceAmount, currency)}
            tone={summary.varianceAmount > 0 ? "danger" : "success"}
          />
        </dl>
      </CardBody>
    </Card>
  );
}

export function LeadsSection({
  report,
  leadSources,
  costSummary,
  onSetSource,
}: {
  report: RoiReport;
  leadSources: LeadSourceOption[];
  costSummary: CostSummary;
  onSetSource: (mode: CostSummary["leadSourceMode"], sessionId: string | null, manual: number | null) => void | Promise<void>;
}) {
  const [manual, setManual] = useState(report.manualLeadCount ?? 0);

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-content">Leads</h2>
          <p className="text-xs text-content-muted">
            Source: {LEAD_SOURCE_MODE_LABELS[costSummary.leadSourceMode]}
          </p>
        </div>
        <Badge tone={costSummary.totalLeads === null ? "neutral" : "info"}>
          {costSummary.totalLeads === null ? "Not available" : `${costSummary.totalLeads} leads`}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-3">
        {leadSources.length === 0 ? (
          <p className="text-sm text-content-muted">
            No lead triage session is linked to this event. Enter a lead count manually, or run
            one in Lead Triage first.
          </p>
        ) : leadSources.length === 1 ? (
          <p className="text-sm text-content-muted">
            Auto-linked to “{leadSources[0].eventName}” ({leadSources[0].leadCount} leads).
          </p>
        ) : (
          <label className="block text-xs text-content-muted">
            More than one triage session is linked — choose which to use
            <Select
              className="mt-1 w-72"
              value={report.leadSessionId ?? ""}
              onChange={(e) => void onSetSource("planner_selected_session", e.target.value || null, null)}
            >
              <option value="">Choose a session…</option>
              {leadSources.map((source) => (
                <option key={source.sessionId} value={source.sessionId}>
                  {source.eventName} ({source.leadCount} leads)
                </option>
              ))}
            </Select>
          </label>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <label className="text-xs text-content-muted">
            Or enter a lead count manually
            <NumberInput
              className="mt-1 w-32 text-right"
              min={0}
              value={manual}
              onChange={(e) => setManual(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <Button size="sm" onClick={() => void onSetSource("manual_entry", null, manual)}>
            Use manual count
          </Button>
          {costSummary.leadSourceMode === "manual_entry" ? (
            <Badge tone="warning">Manual figure — not from a triage session</Badge>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

export function PipelineSection({
  summary,
  outsideWindowCount,
  importHref,
}: {
  summary: PipelineSummary | null;
  outsideWindowCount: number;
  importHref: string;
}) {
  if (!summary) {
    return (
      <EmptySection
        title="Pipeline"
        message="No pipeline data yet. Export opportunities from your CRM and import the file."
        action={
          <Link href={importHref}>
            <Button size="sm" variant="primary">Import pipeline outcomes</Button>
          </Link>
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-content">Pipeline</h2>
          <p className="text-xs text-content-muted">
            {summary.opportunitiesCount} opportunities · {summary.meetingsCount} meetings
          </p>
        </div>
        <Link href={importHref}>
          <Button size="sm">Import more</Button>
        </Link>
      </CardHeader>
      <CardBody className="space-y-3">
        <Table>
          <thead>
            <tr>
              <Th>Attribution</Th>
              <Th className="w-24 text-right">Records</Th>
              <Th className="w-32 text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>{ATTRIBUTION_LABELS.sourced}</Td>
              <Td className="text-right tabular-nums">{summary.sourcedCount}</Td>
              <Td className="text-right tabular-nums">{formatMoney(summary.sourcedAmount, "USD")}</Td>
            </tr>
            <tr>
              <Td>{ATTRIBUTION_LABELS.influenced}</Td>
              <Td className="text-right tabular-nums">{summary.influencedCount}</Td>
              <Td className="text-right tabular-nums">{formatMoney(summary.influencedAmount, "USD")}</Td>
            </tr>
            <tr className="text-content-muted">
              <Td>{ATTRIBUTION_LABELS.outside_window}</Td>
              <Td className="text-right tabular-nums">{outsideWindowCount}</Td>
              <Td className="text-right">—</Td>
            </tr>
          </tbody>
        </Table>
        <p className="text-xs text-content-muted">
          Closed/won so far: {formatMoney(summary.wonAmount, "USD")} across {summary.wonCount} deals.
          Shown for completeness — the scorecard weighs pipeline, since most cycles outlast this
          reporting window.
          {summary.leadMatchRatePct !== null
            ? ` ${summary.leadMatchRatePct}% of contacts matched a lead from this event (informational only).`
            : ""}
        </p>
      </CardBody>
    </Card>
  );
}

export function SurveySection({
  summary,
  importHref,
}: {
  summary: SurveySummary | null;
  importHref: string;
}) {
  if (!summary) {
    return (
      <EmptySection
        title="Attendee sentiment"
        message="No survey data yet. Export responses from your survey tool and import the file."
        action={
          <Link href={importHref}>
            <Button size="sm" variant="primary">Import survey results</Button>
          </Link>
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-content">Attendee sentiment</h2>
        {summary.npsSmallSample ? <Badge tone="warning">Small sample</Badge> : null}
      </CardHeader>
      <CardBody>
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Responses" value={String(summary.responseCount)} />
          <Stat label="NPS" value={summary.npsScore === null ? "Not available" : String(summary.npsScore)} />
          <Stat label="Avg CSAT" value={summary.csatAverage === null ? "Not available" : String(summary.csatAverage)} />
        </dl>
        {summary.npsSmallSample ? (
          <p className="mt-2 text-xs text-warning-text">
            Fewer than 5 scored responses — the NPS figure is shown but not scored.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function CostSummaryPanel({ costs, currency }: { costs: CostSummary; currency: string }) {
  const value = (amount: number | null) => (amount === null ? "Not available" : formatMoney(amount, currency));
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-content">Cost per outcome</h2>
      </CardHeader>
      <CardBody>
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Per lead" value={value(costs.costPerLead)} />
          <Stat label="Per meeting" value={value(costs.costPerMeeting)} />
          <Stat label="Per opportunity" value={value(costs.costPerOpportunity)} />
        </dl>
      </CardBody>
    </Card>
  );
}

export function YoyComparisonPanel({
  report,
  comparators,
  onSelect,
}: {
  report: RoiReport;
  comparators: ComparatorCandidate[];
  onSelect: (comparator: ComparatorCandidate | null) => void | Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const eligible = comparators.filter((c) => c.report.status === "final" && c.brief.id !== report.eventBriefId);

  if (!report.yoyComparison) {
    return (
      <EmptySection
        title="Year over year"
        message={
          eligible.length === 0
            ? "No finalised report from another event to compare against yet. Finalise one and it becomes available here."
            : "No comparator chosen yet."
        }
        action={
          eligible.length > 0 ? (
            <Select
              className="w-72"
              defaultValue=""
              aria-label="Choose a comparator"
              onChange={(e) => {
                const found = eligible.find((c) => c.brief.id === e.target.value);
                if (found) void onSelect(found);
              }}
            >
              <option value="">Choose an event…</option>
              {eligible.map((c) => (
                <option key={c.brief.id} value={c.brief.id}>
                  {c.brief.name} ({c.brief.type})
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
    );
  }

  const rows: Array<{ label: string; figure: DeltaFigure; money?: boolean }> = [
    { label: "Total spend", figure: report.yoyComparison.deltas.totalActual, money: true },
    { label: "Sourced pipeline", figure: report.yoyComparison.deltas.sourcedAmount, money: true },
    { label: "Influenced pipeline", figure: report.yoyComparison.deltas.influencedAmount, money: true },
    { label: "Cost per lead", figure: report.yoyComparison.deltas.costPerLead, money: true },
    { label: "Cost per opportunity", figure: report.yoyComparison.deltas.costPerOpportunity, money: true },
    { label: "NPS", figure: report.yoyComparison.deltas.npsScore },
  ];

  const show = (value: number | null, money?: boolean) =>
    value === null ? "—" : money ? formatMoney(value, "USD") : String(value);

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-content">
            Against {report.yoyComparison.comparatorEventName}
          </h2>
          <p className="text-xs text-content-muted">
            {report.yoyComparison.selectionMode === "auto_suggested"
              ? "Auto-suggested — the most recent finalised report of the same event type."
              : "Chosen by you."}
          </p>
        </div>
        <Button size="sm" onClick={() => setPicking((v) => !v)}>
          Change comparator
        </Button>
      </CardHeader>
      <CardBody className="space-y-3">
        {picking ? (
          <Select
            className="w-72"
            value={report.yoyComparison.comparatorEventBriefId}
            aria-label="Choose a comparator"
            onChange={(e) => {
              const found = eligible.find((c) => c.brief.id === e.target.value);
              void onSelect(found ?? null);
              setPicking(false);
            }}
          >
            {eligible.map((c) => (
              <option key={c.brief.id} value={c.brief.id}>
                {c.brief.name} ({c.brief.type})
              </option>
            ))}
          </Select>
        ) : null}

        <Table>
          <thead>
            <tr>
              <Th>Figure</Th>
              <Th className="w-32 text-right">This event</Th>
              <Th className="w-32 text-right">Prior</Th>
              <Th className="w-28 text-right">Change</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <Td>{row.label}</Td>
                <Td className="text-right tabular-nums">{show(row.figure.current, row.money)}</Td>
                <Td className="text-right tabular-nums">{show(row.figure.prior, row.money)}</Td>
                <Td className="text-right tabular-nums">
                  {row.figure.deltaPct === null ? (
                    "—"
                  ) : (
                    <span className={row.figure.deltaPct >= 0 ? "text-success-text" : "text-danger-text"}>
                      {row.figure.deltaPct > 0 ? "+" : ""}
                      {row.figure.deltaPct}%
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardBody>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) {
  return (
    <div className="rounded-md bg-surface-sunken px-3 py-2">
      <dt className="text-xs text-content-muted">{label}</dt>
      <dd
        className={
          tone === "danger"
            ? "text-lg font-semibold text-danger-text"
            : tone === "success"
              ? "text-lg font-semibold text-success-text"
              : "text-lg font-semibold text-content"
        }
      >
        {value}
      </dd>
    </div>
  );
}
