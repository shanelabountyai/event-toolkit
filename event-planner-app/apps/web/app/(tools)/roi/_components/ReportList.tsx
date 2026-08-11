"use client";

/** `/roi` — every report, plus the brief picker that creates one (FR-1: no standalone mode). */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EVENT_TYPE_LABELS, newId, nowIso, type EventBrief } from "@event-toolkit/schema";
import {
  RECOMMENDATION_LABELS,
  computeCostSummary,
  type RoiReport,
} from "@event-toolkit/roi-report-core";
import {
  getReportByBriefId,
  listBriefs,
  listReports,
  loadBudgetSummary,
  logUsageEvent,
  saveReport,
} from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader, EmptyRow, Select, Table, Td, Th, type BadgeTone } from "@event-toolkit/ui";
import { formatDateRange, formatIsoDateTime } from "@/lib/format";

const TONES: Record<string, BadgeTone> = {
  repeat: "success",
  change: "warning",
  kill: "danger",
  insufficient_data: "neutral",
};

export function ReportList({ startOnPicker = false }: { startOnPicker?: boolean }) {
  const router = useRouter();
  const [reports, setReports] = useState<RoiReport[] | null>(null);
  const [briefs, setBriefs] = useState<EventBrief[]>([]);
  const [picking, setPicking] = useState(startOnPicker);
  const [briefId, setBriefId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [allReports, allBriefs] = await Promise.all([listReports(), listBriefs()]);
      setReports(allReports);
      setBriefs(allBriefs);
      if (allBriefs.length > 0) setBriefId(allBriefs[0].id);
    })();
  }, []);

  const create = async () => {
    const brief = briefs.find((b) => b.id === briefId);
    if (!brief) return;
    setBusy(true);
    try {
      // FR-1 — one report per brief; opening an existing one rather than making a second.
      const existing = await getReportByBriefId(brief.id);
      if (existing) {
        router.push(`/roi/${existing.id}`);
        return;
      }
      const budgetSummary = await loadBudgetSummary(brief);
      const report = await saveReport({
        id: newId(),
        eventBriefId: brief.id,
        eventName: brief.name || "Untitled event",
        status: "draft",
        finalizedAt: null,
        budgetSummary,
        pipelineSummary: null,
        surveySummary: null,
        costSummary: computeCostSummary(budgetSummary, null, null, "unavailable"),
        yoyComparison: null,
        scorecard: null,
        executiveSummaryText: null,
        successMetricWriteBacks: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      await logUsageEvent({
        type: "roi_report_created",
        briefId: brief.id,
        briefName: brief.name,
        details: { reportId: report.id, hasBudget: budgetSummary ? "yes" : "no" },
      });
      router.push(`/roi/${report.id}`);
    } finally {
      setBusy(false);
    }
  };

  if (reports === null) return <p className="py-16 text-center text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Event ROI &amp; Attribution</h1>
          <p className="mt-1 text-sm text-slate-600">
            Budget, pipeline, leads and sentiment in one report, with a transparent repeat /
            change / kill call you can defend in a budget conversation.
          </p>
        </div>
        <Button variant="primary" onClick={() => setPicking(true)}>
          New report
        </Button>
      </header>

      {picking ? (
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Which event?</h2>
              <p className="text-xs text-slate-500">
                A report is always built on an existing brief — that is what connects it to the
                budget and lead data.
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {briefs.length === 0 ? (
              <p className="text-sm text-slate-600">
                No briefs in this browser yet.{" "}
                <Link href="/brief/new" className="font-medium underline underline-offset-4">
                  Create one first
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Select className="w-80" value={briefId} onChange={(e) => setBriefId(e.target.value)} aria-label="Event brief">
                  {briefs.map((brief) => (
                    <option key={brief.id} value={brief.id}>
                      {brief.name || "Untitled brief"} ({EVENT_TYPE_LABELS[brief.type]})
                    </option>
                  ))}
                </Select>
                <Button variant="primary" disabled={busy} onClick={() => void create()}>
                  Build the report
                </Button>
                <Button onClick={() => setPicking(false)}>Cancel</Button>
              </div>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900">Reports</h2>
        </CardHeader>
        <CardBody>
          <Table>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th className="w-24">Status</Th>
                <Th className="w-32">Verdict</Th>
                <Th className="w-40">Updated</Th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <EmptyRow colSpan={4}>No reports yet. Build one once an event has closed.</EmptyRow>
              ) : (
                reports.map((report) => {
                  const brief = briefs.find((b) => b.id === report.eventBriefId);
                  return (
                    <tr key={report.id}>
                      <Td>
                        <Link href={`/roi/${report.id}`} className="font-medium text-slate-900 underline-offset-4 hover:underline">
                          {report.eventName}
                        </Link>
                        {brief ? (
                          <span className="block text-xs text-slate-500">{formatDateRange(brief)}</span>
                        ) : null}
                      </Td>
                      <Td>
                        <Badge tone={report.status === "final" ? "success" : "neutral"}>
                          {report.status === "final" ? "Final" : "Draft"}
                        </Badge>
                      </Td>
                      <Td>
                        {report.scorecard ? (
                          <Badge tone={TONES[report.scorecard.recommendation]}>
                            {RECOMMENDATION_LABELS[report.scorecard.recommendation]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Not scored</span>
                        )}
                      </Td>
                      <Td className="text-xs text-slate-600">{formatIsoDateTime(report.updatedAt)}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
