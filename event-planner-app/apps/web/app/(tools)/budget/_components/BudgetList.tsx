"use client";

/** `/budget` — every local brief with its budget totals, worst flag and reconciled state. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { EVENT_TYPE_LABELS, type BudgetSettings, type EventBrief } from "@event-toolkit/schema";
import type { VarianceDirection } from "@event-toolkit/budget-calc";
import { aggregateVarianceForLineItems, computeBudgetActualsSummary, type VarianceFlag } from "@event-toolkit/budget-calc";
import { getBudgetSettings, getLineItems, listBriefs } from "@event-toolkit/local-store";
import { Badge, Card, CardBody, CardHeader, EmptyRow, Table, Td, Th } from "@event-toolkit/ui";
import { formatDateRange, formatMoney } from "@/lib/format";
import { FlagPill } from "./VarianceBadge";

interface Row {
  brief: EventBrief;
  settings: BudgetSettings | null;
  totalBudgeted: number;
  totalActual: number;
  flag: VarianceFlag;
  direction: VarianceDirection;
}

export function BudgetList() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const briefs = await listBriefs();
      const built: Row[] = [];
      for (const brief of briefs) {
        const settings = await getBudgetSettings(brief.id);
        if (!settings) {
          built.push({ brief, settings: null, totalBudgeted: 0, totalActual: 0, flag: "none", direction: "none" });
          continue;
        }
        const lineItems = await getLineItems(brief.id);
        const summary = computeBudgetActualsSummary(lineItems, settings, brief);
        built.push({
          brief,
          settings,
          totalBudgeted: summary.totalBudgeted,
          totalActual: summary.totalActual,
          ...aggregateVarianceForLineItems(lineItems, settings),
        });
      }
      if (!cancelled) setRows(built);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null) {
    return <p className="py-16 text-center text-sm text-content-muted">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-content">Budget Builder &amp; Tracker</h1>
        <p className="mt-1 text-sm text-content-muted">
          Line-item budgets with budgeted, committed and actual tracking, variance flags and a
          finance-ready export. Opening an event for the first time builds its template.
        </p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-content">Budgets</h2>
        </CardHeader>
        <CardBody>
          <Table stack>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th className="w-28">Type</Th>
                <Th className="w-32 text-right">Budgeted</Th>
                <Th className="w-32 text-right">Actual</Th>
                <Th className="w-28">Status</Th>
                <Th className="w-28">Reconciled</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={6}>
                  No briefs in this browser yet.{" "}
                  <Link href="/brief/new" className="font-medium underline underline-offset-4">
                    Create one first
                  </Link>
                  .
                </EmptyRow>
              ) : (
                rows.map((row) => (
                  <tr key={row.brief.id}>
                    <Td label="Event">
                      <Link
                        href={`/budget/${row.brief.id}`}
                        className="font-medium text-content underline-offset-4 hover:underline"
                      >
                        {row.brief.name || "Untitled brief"}
                      </Link>
                      <span className="block text-xs text-content-muted">{formatDateRange(row.brief)}</span>
                    </Td>
                    <Td label="Type">
                      <Badge>{EVENT_TYPE_LABELS[row.brief.type]}</Badge>
                    </Td>
                    <Td label="Budgeted" className="text-right tabular-nums">
                      {row.settings ? formatMoney(row.totalBudgeted, row.settings.currency) : "—"}
                    </Td>
                    <Td label="Actual" className="text-right tabular-nums">
                      {row.settings ? formatMoney(row.totalActual, row.settings.currency) : "—"}
                    </Td>
                    <Td label="Status">{row.settings ? <FlagPill flag={row.flag} direction={row.direction} /> : <Badge tone="neutral">Not started</Badge>}</Td>
                    <Td label="Reconciled">
                      {row.settings?.reconciledAt ? (
                        <Badge tone="success">Yes</Badge>
                      ) : (
                        <Badge tone="neutral">No</Badge>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
