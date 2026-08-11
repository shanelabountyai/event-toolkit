"use client";

/** One container for the ROI report's tabs, matching the pattern the other tools use. */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  mergePipelineRows,
  renderExecutiveSummary,
  renderFullReport,
  renderReportHtml,
  type MappedColumn,
  type PipelineField,
  type PipelineOpportunity,
  type SurveyField,
  type SurveyResponse,
} from "@event-toolkit/roi-report-core";
import { newId, nowIso } from "@event-toolkit/schema";
import {
  logUsageEvent,
  savePipelineImportBatch,
  savePipelineOpportunitiesBulk,
  saveSurveyImportBatch,
  saveSurveyResponsesBulk,
} from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader, NumberInput, Table, Td, Th } from "@event-toolkit/ui";
import { triggerDownload } from "@/lib/download";
import { formatIsoDateTime, slugify } from "@/lib/format";
import { refreshBudgetOnReport, useRoiReport } from "../_hooks/useRoiReport";
import { FinalizeFlow } from "./FinalizeFlow";
import { ImportWizard } from "./ImportWizard";
import {
  BudgetSection,
  CostSummaryPanel,
  LeadsSection,
  PipelineSection,
  SurveySection,
  YoyComparisonPanel,
} from "./RoiSections";
import { ScorecardPanel } from "./ScorecardPanel";

export type RoiTab = "overview" | "import-pipeline" | "import-survey" | "settings" | "yoy" | "export";

const TABS: Array<{ slug: string; label: string }> = [
  { slug: "", label: "Report" },
  { slug: "import-pipeline", label: "Pipeline" },
  { slug: "import-survey", label: "Survey" },
  { slug: "yoy", label: "Year over year" },
  { slug: "settings", label: "Attribution" },
  { slug: "export", label: "Export" },
];

export function RoiPage({ reportId, tab }: { reportId: string; tab: RoiTab }) {
  const state = useRoiReport(reportId);
  const [finalizing, setFinalizing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // FR-2 — refresh the budget snapshot whenever the report is opened, so a change in the
  // Budget Builder shows up here without anyone re-entering anything.
  useEffect(() => {
    if (!state.report || !state.brief) return;
    void refreshBudgetOnReport(state.report, state.brief).then(() => void state.refresh());
    // Deliberately keyed on ids alone. `state` is rebuilt on every derived recomputation, so
    // depending on it would make this effect retrigger its own refresh forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.report?.id, state.brief?.id]);

  if (state.loading) return <p className="py-16 text-center text-sm text-slate-500">Loading…</p>;
  if (state.notFound || !state.report || !state.brief || !state.settings) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">That report no longer exists</h1>
        <Link href="/roi" className="mt-5 inline-flex items-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Back to reports
        </Link>
      </div>
    );
  }

  const { report, brief, settings } = state;
  const base = `/roi/${report.id}`;
  const eventWindow = {
    eventStartDate: brief.dates?.eventStartDate ?? "",
    eventEndDate: brief.dates?.eventEndDate ?? "",
  };

  const onCommitPipeline = async (
    rows: PipelineOpportunity[],
    filename: string,
    mapping: MappedColumn<PipelineField>[],
  ) => {
    const batch = {
      id: newId(),
      roiReportId: report.id,
      filename,
      columnMapping: mapping,
      rowCount: rows.length,
      importedAt: nowIso(),
    };
    await savePipelineImportBatch(batch);
    const stamped = rows.map((row) => ({ ...row, sourceImportBatchId: batch.id }));
    const merged = mergePipelineRows(state.opportunities, stamped);
    await savePipelineOpportunitiesBulk(report.id, merged.rows);
    await logUsageEvent({
      type: "pipeline_imported",
      briefId: brief.id,
      details: { filename, created: merged.created, updated: merged.updated },
    });
    await state.refresh();
    return { updated: merged.updated, created: merged.created };
  };

  const onCommitSurvey = async (
    rows: SurveyResponse[],
    filename: string,
    mapping: MappedColumn<SurveyField>[],
  ) => {
    const batch = {
      id: newId(),
      roiReportId: report.id,
      filename,
      columnMapping: mapping,
      rowCount: rows.length,
      importedAt: nowIso(),
    };
    await saveSurveyImportBatch(batch);
    await saveSurveyResponsesBulk(rows.map((row) => ({ ...row, sourceImportBatchId: batch.id })));
    await logUsageEvent({ type: "survey_imported", briefId: brief.id, details: { filename, rows: rows.length } });
    await state.refresh();
    return rows.length;
  };

  const exportReport = async (kind: "full" | "summary", format: "md" | "html") => {
    const markdown = kind === "full" ? renderFullReport(report) : renderExecutiveSummary(report);
    const name = `${slugify(report.eventName)}-roi-${kind === "full" ? "report" : "summary"}`;
    if (format === "md") triggerDownload(`${name}.md`, markdown, "text/markdown");
    else triggerDownload(`${name}.html`, renderReportHtml(markdown, report.eventName), "text/html");
    await logUsageEvent({
      type: "export_triggered",
      briefId: brief.id,
      details: { tool: "roi", kind, format },
    });
  };

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Event ROI &amp; Attribution
            </p>
            <h1 className="text-xl font-semibold text-slate-900">{report.eventName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <Badge tone={report.status === "final" ? "success" : "neutral"}>
                {report.status === "final" ? "Final" : "Draft"}
              </Badge>
              {report.finalizedAt ? <span>Finalised {formatIsoDateTime(report.finalizedAt)}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {report.status === "draft" ? (
              <Button variant="primary" onClick={() => setFinalizing(true)}>
                Finalise
              </Button>
            ) : (
              <Button
                onClick={async () => {
                  await state.saveReportPatch({ status: "draft" });
                  await logUsageEvent({ type: "report_reverted_to_draft", briefId: brief.id, details: {} });
                  setNotice(
                    "Back to draft. It will not be offered as a year-over-year comparator, and any values already written to the brief stay as they are.",
                  );
                }}
              >
                Reopen as draft
              </Button>
            )}
            <Link href={`/brief/${brief.id}`} className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline">
              ← Back to brief
            </Link>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Report sections">
          {TABS.map((t) => {
            const href = t.slug ? `${base}/${t.slug}` : base;
            const isActive = (tab === "overview" ? "" : tab) === t.slug;
            return (
              <Link
                key={t.slug || "overview"}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "-mb-px border-b-2 border-slate-900 px-3 py-2 text-sm font-semibold text-slate-900"
                    : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:border-slate-300 hover:text-slate-800"
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {notice ? (
        <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
          {notice}{" "}
          <button type="button" className="font-medium underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      ) : null}

      {finalizing ? (
        <FinalizeFlow
          report={report}
          brief={brief}
          onCancel={() => setFinalizing(false)}
          onDone={async (patch, updatedBrief) => {
            await state.saveReportPatch(patch);
            setFinalizing(false);
            await logUsageEvent({
              type: "report_finalized",
              briefId: updatedBrief.id,
              details: { written: patch.successMetricWriteBacks?.length ?? 0 },
            });
            if ((patch.successMetricWriteBacks?.length ?? 0) > 0) {
              await logUsageEvent({
                type: "success_metrics_written",
                briefId: updatedBrief.id,
                details: { count: patch.successMetricWriteBacks!.length, briefVersion: updatedBrief.version },
              });
            }
            setNotice("Report finalised. It is now available as a year-over-year comparator.");
            await state.refresh();
          }}
        />
      ) : null}

      {tab === "overview" ? (
        <div className="space-y-4">
          <ScorecardPanel scorecard={report.scorecard} />
          <div className="grid gap-4 lg:grid-cols-2">
            <BudgetSection summary={report.budgetSummary} briefId={brief.id} />
            <LeadsSection
              report={report}
              leadSources={state.leadSources}
              costSummary={report.costSummary}
              onSetSource={state.setLeadSource}
            />
            <PipelineSection
              summary={report.pipelineSummary}
              outsideWindowCount={report.pipelineSummary?.outsideWindowCount ?? 0}
              importHref={`${base}/import-pipeline`}
            />
            <SurveySection summary={report.surveySummary} importHref={`${base}/import-survey`} />
          </div>
          <CostSummaryPanel costs={report.costSummary} currency={report.budgetSummary?.currency ?? "USD"} />
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-slate-900">Executive summary</h2>
              <Link href={`${base}/export`}>
                <Button size="sm">Export</Button>
              </Link>
            </CardHeader>
            <CardBody>
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800">
                {report.executiveSummaryText}
              </pre>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "import-pipeline" ? (
        <ImportWizard
          kind="pipeline"
          reportId={report.id}
          eventWindow={eventWindow}
          settings={settings}
          onCommitPipeline={onCommitPipeline}
        />
      ) : null}

      {tab === "import-survey" ? (
        <ImportWizard
          kind="survey"
          reportId={report.id}
          eventWindow={eventWindow}
          settings={settings}
          onCommitSurvey={onCommitSurvey}
        />
      ) : null}

      {tab === "yoy" ? (
        <YoyComparisonPanel report={report} comparators={state.comparators} onSelect={state.setComparator} />
      ) : null}

      {tab === "settings" ? (
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Attribution windows</h2>
              <p className="text-xs text-slate-500">
                Changing these reclassifies every imported record immediately — no re-import.
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <label className="block text-sm text-slate-700">
              <span className="block text-xs text-slate-500">Sourced window (days after the event ends)</span>
              <NumberInput
                className="mt-1 w-32 text-right"
                min={0}
                value={settings.sourcedWindowDays}
                onChange={(e) =>
                  void state.updateSettings({ ...settings, sourcedWindowDays: Math.max(0, Number(e.target.value) || 0) })
                }
              />
              <span className="mt-1 block text-xs text-slate-500">
                Opportunities created between the event start and this cut-off count as sourced by
                the event.
              </span>
            </label>

            <label className="block text-sm text-slate-700">
              <span className="block text-xs text-slate-500">Influenced window (days after the event ends)</span>
              <NumberInput
                className="mt-1 w-32 text-right"
                min={0}
                value={settings.influencedWindowDays}
                onChange={(e) =>
                  void state.updateSettings({ ...settings, influencedWindowDays: Math.max(0, Number(e.target.value) || 0) })
                }
              />
              <span className="mt-1 block text-xs text-slate-500">
                Everything else up to this cut-off — including pipeline that already existed
                before the event — counts as influenced. Beyond it, the event can&rsquo;t claim it.
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
                checked={settings.useExplicitAttributionTypeColumn}
                onChange={(e) =>
                  void state.updateSettings({ ...settings, useExplicitAttributionTypeColumn: e.target.checked })
                }
              />
              <span>
                Trust an attribution column from the CRM when the import has one
                <span className="mt-0.5 block text-xs text-slate-500">
                  It still can&rsquo;t pull a record back inside the window — a CRM claiming an
                  opportunity created a year later was &ldquo;sourced&rdquo; is a data-quality
                  problem, not a number to count.
                </span>
              </span>
            </label>

            {state.opportunities.length > 0 ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Record</Th>
                    <Th className="w-28">Created</Th>
                    <Th className="w-36">Timing says</Th>
                    <Th className="w-36">CRM says</Th>
                    <Th className="w-36">Counted as</Th>
                  </tr>
                </thead>
                <tbody>
                  {state.opportunities.map((row) => (
                    <tr key={row.id}>
                      <Td>{row.opportunityName ?? row.recordId}</Td>
                      <Td className="text-xs">{row.createdDate}</Td>
                      <Td className="text-xs">{row.computedAttributionType}</Td>
                      <Td className="text-xs">{row.importedAttributionType ?? "—"}</Td>
                      <Td className="text-xs font-medium">{row.effectiveAttributionType}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {tab === "export" ? (
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Export</h2>
              <p className="text-xs text-slate-500">
                The executive summary stands alone — it carries every headline number without
                needing the full report alongside it.
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void exportReport("full", "md")}>Full report (Markdown)</Button>
              <Button onClick={() => void exportReport("full", "html")}>Full report (HTML)</Button>
              <Button variant="primary" onClick={() => void exportReport("summary", "md")}>
                Executive summary (Markdown)
              </Button>
              <Button variant="primary" onClick={() => void exportReport("summary", "html")}>
                Executive summary (HTML)
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              HTML is printable from the browser — no PDF library, same as the brief export.
            </p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
