"use client";

/**
 * The retro workspace: what happened (ingested), what we learned (three columns), and the
 * completion that writes lessons forward onto the brief.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DISPOSITIONS,
  DISPOSITION_DEFINITIONS,
  DISPOSITION_LABELS,
  SOURCE_TYPE_LABELS,
  applyCarryForward,
  applyMetricAdjustment,
  canComplete,
  lessonsBlockingCompletion,
  newManualLesson,
  previewCarryForward,
  renderRetroHtml,
  renderRetroMarkdown,
  type RetroDocument,
  type RetroLesson,
} from "@event-toolkit/postmortem-core";
import { nowIso, type EventBrief, type LessonDisposition } from "@event-toolkit/schema";
import {
  getBrief,
  getRetro,
  logUsageEvent,
  saveBrief,
  saveRetro,
} from "@event-toolkit/local-store";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  NumberInput,
  Select,
  Table,
  Td,
  Th,
  TextArea,
  TextInput,
} from "@event-toolkit/ui";
import { triggerDownload } from "@/lib/download";
import { formatIsoDateTime, formatMoney, slugify } from "@/lib/format";

export function RetroPage({ retroId }: { retroId: string }) {
  const [retro, setRetro] = useState<RetroDocument | null>(null);
  const [brief, setBrief] = useState<EventBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjustValue, setAdjustValue] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await getRetro(retroId);
      if (cancelled || !loaded) {
        setLoading(false);
        return;
      }
      setRetro(loaded);
      setBrief(await getBrief(loaded.eventBriefId));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [retroId]);

  const persist = useCallback(async (next: RetroDocument) => {
    setRetro(await saveRetro(next));
  }, []);

  if (loading) return <p className="py-16 text-center text-sm text-slate-500">Loading…</p>;
  if (!retro || !brief) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">That retro no longer exists</h1>
        <Link href="/retro" className="mt-5 inline-flex items-center rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Back to retros
        </Link>
      </div>
    );
  }

  const patchLesson = (id: string, changes: Partial<RetroLesson>) =>
    void persist({ ...retro, lessons: retro.lessons.map((l) => (l.id === id ? { ...l, ...changes } : l)) });

  const addManual = (disposition: LessonDisposition) =>
    void persist({ ...retro, lessons: [...retro.lessons, newManualLesson(retro.eventBriefId, disposition)] }).then(
      () => void logUsageEvent({ type: "lesson_added_manual", briefId: brief.id, details: { disposition } }),
    );

  const complete = async () => {
    const result = applyCarryForward(brief, retro.lessons);
    const savedBrief = await saveBrief(result.brief);
    setBrief(savedBrief);
    await persist({ ...retro, status: "completed", completedAt: nowIso(), lessons: result.lessons });
    setConfirming(false);
    await logUsageEvent({ type: "retro_completed", briefId: brief.id, details: { lessons: retro.lessons.length } });
    await logUsageEvent({
      type: "carry_forward_written",
      briefId: brief.id,
      details: { added: result.added, updated: result.updated, removed: result.removed, briefVersion: savedBrief.version },
    });
    setNotice(
      `Retro complete. ${result.added} lesson${result.added === 1 ? "" : "s"} added to the brief` +
        `${result.updated > 0 ? `, ${result.updated} updated` : ""}` +
        `${result.removed > 0 ? `, ${result.removed} removed` : ""}. They will surface during intake on your next ${brief.type.replace("_", " ")}.`,
    );
  };

  const adjustMetric = async () => {
    if (!adjusting || !adjustReason.trim()) return;
    const metric = brief.successMetrics.find((m) => m.id === adjusting);
    if (!metric) return;
    const savedBrief = await saveBrief(applyMetricAdjustment(brief, adjusting, adjustValue));
    setBrief(savedBrief);
    await persist({
      ...retro,
      successMetricAdjustments: [
        ...retro.successMetricAdjustments,
        {
          metricId: metric.id,
          metricName: metric.metric,
          previousActual: metric.actual ?? null,
          adjustedActual: adjustValue,
          reason: adjustReason.trim(),
          adjustedAt: nowIso(),
        },
      ],
    });
    await logUsageEvent({ type: "success_metric_adjusted", briefId: brief.id, details: { metric: metric.metric } });
    setAdjusting(null);
    setAdjustReason("");
  };

  const exportRetro = async (format: "md" | "html") => {
    const markdown = renderRetroMarkdown(retro);
    const name = `${slugify(retro.eventName)}-post-mortem`;
    if (format === "md") triggerDownload(`${name}.md`, markdown, "text/markdown");
    else triggerDownload(`${name}.html`, renderRetroHtml(markdown, retro.eventName), "text/html");
    await logUsageEvent({ type: "retro_exported", briefId: brief.id, details: { format } });
  };

  const blocking = lessonsBlockingCompletion(retro);
  const preview = previewCarryForward(retro);
  const issue = retro.ingestedIssueLogSummary;
  const budget = retro.ingestedBudgetVarianceSummary;
  const roi = retro.ingestedRoiScorecardSummary;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Post-mortem</p>
          <h1 className="text-xl font-semibold text-slate-900">{retro.eventName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge tone={retro.status === "completed" ? "success" : "neutral"}>
              {retro.status === "completed" ? "Completed" : "Draft"}
            </Badge>
            {retro.completedAt ? <span>{formatIsoDateTime(retro.completedAt)}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void exportRetro("md")}>Export Markdown</Button>
          <Button onClick={() => void exportRetro("html")}>Export HTML</Button>
          <Button variant="primary" disabled={!canComplete(retro)} onClick={() => setConfirming(true)}>
            {retro.status === "completed" ? "Re-complete" : "Complete retro"}
          </Button>
          <Link href={`/brief/${brief.id}`} className="rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline">
            ← Back to brief
          </Link>
        </div>
      </header>

      {notice ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {notice}{" "}
          <button type="button" className="font-medium underline" onClick={() => setNotice(null)}>Dismiss</button>
        </p>
      ) : null}

      {blocking.length > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {blocking.length} lesson{blocking.length === 1 ? "" : "s"} still need text before this
          retro can be completed.
        </p>
      ) : null}

      {/* Ingestion status — three tiles, each honest about what wasn't available. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-slate-900">Issue log</h2></CardHeader>
          <CardBody className="text-sm text-slate-700">
            {issue.available ? (
              <>
                <p className="text-lg font-semibold text-slate-900">{issue.totalIssues} issues</p>
                <p className="text-xs text-slate-600">
                  {issue.bySeverity.high} high · {issue.bySeverity.medium} medium · {issue.bySeverity.low} low
                </p>
                <p className="text-xs text-slate-500">{issue.openAtIngestion} still open</p>
              </>
            ) : (
              <p className="text-slate-500">
                Not available — no logistics pack was built for this event.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-slate-900">Budget variance</h2></CardHeader>
          <CardBody className="text-sm text-slate-700">
            {budget.available ? (
              <>
                <p className="text-lg font-semibold text-slate-900">
                  {formatMoney(budget.totalActual, "USD")}
                </p>
                <p className="text-xs text-slate-600">
                  against {formatMoney(budget.totalBudgeted, "USD")} budgeted
                  {budget.variancePct === null ? "" : ` (${Math.round(budget.variancePct)}%)`}
                </p>
                {!budget.varianceAtClose?.isFinal ? (
                  <p className="text-xs text-amber-700">Budget not reconciled — figures are provisional.</p>
                ) : null}
              </>
            ) : (
              <p className="text-slate-500">Not available — no budget was built for this event.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-slate-900">ROI scorecard</h2></CardHeader>
          <CardBody className="text-sm text-slate-700">
            {roi.available ? (
              <>
                <p className="text-lg font-semibold capitalize text-slate-900">{roi.recommendation}</p>
                <p className="text-xs text-slate-600">
                  From a {roi.reportStatus} report
                  {roi.scorePct === null ? "" : ` · ${Math.round(roi.scorePct * 100)}%`}
                </p>
                {roi.reportStatus === "draft" ? (
                  <p className="text-xs text-amber-700">The ROI report is still a draft.</p>
                ) : null}
              </>
            ) : (
              <p className="text-slate-500">Not available — no ROI report for this event yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Three-column lesson workspace. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {DISPOSITIONS.map((disposition) => {
          const group = retro.lessons.filter((l) => l.disposition === disposition);
          return (
            <section key={disposition} className="rounded-xl border border-slate-200 bg-slate-50/60">
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <span className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">{DISPOSITION_LABELS[disposition]}</h2>
                  <Badge>{group.length}</Badge>
                </span>
                <Button size="sm" variant="ghost" onClick={() => addManual(disposition)}>
                  + Add
                </Button>
              </div>
              <p className="px-4 pb-2 text-xs text-slate-500">{DISPOSITION_DEFINITIONS[disposition]}</p>

              <div className="space-y-3 px-4 pb-4">
                {group.length === 0 ? (
                  <p className="text-xs text-slate-500">Nothing here yet.</p>
                ) : (
                  group.map((lesson) => (
                    <article key={lesson.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <Badge tone={lesson.sourceType === "manual" ? "neutral" : "info"}>
                          {SOURCE_TYPE_LABELS[lesson.sourceType]}
                        </Badge>
                      </p>
                      <TextArea
                        rows={3}
                        value={lesson.lesson}
                        aria-label="Lesson"
                        placeholder="What should the next event do differently?"
                        onChange={(e) => patchLesson(lesson.id, { lesson: e.target.value })}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <TextInput
                          className="w-32"
                          value={lesson.category ?? ""}
                          aria-label="Category"
                          placeholder="Category"
                          onChange={(e) => patchLesson(lesson.id, { category: e.target.value })}
                        />
                        <Select
                          className="w-28"
                          value={lesson.disposition}
                          aria-label="Disposition"
                          onChange={(e) => {
                            patchLesson(lesson.id, { disposition: e.target.value as LessonDisposition });
                            void logUsageEvent({
                              type: "lesson_disposition_changed",
                              briefId: brief.id,
                              details: { from: lesson.disposition, to: e.target.value },
                            });
                          }}
                        >
                          {DISPOSITIONS.map((d) => (
                            <option key={d} value={d}>{DISPOSITION_LABELS[d]}</option>
                          ))}
                        </Select>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={lesson.carryForward}
                            onChange={(e) => patchLesson(lesson.id, { carryForward: e.target.checked })}
                            className="h-3.5 w-3.5 rounded border-slate-300"
                          />
                          Carry forward
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Remove lesson"
                          onClick={() =>
                            void persist({ ...retro, lessons: retro.lessons.filter((l) => l.id !== lesson.id) })
                          }
                        >
                          ✕
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Success metrics + corrections. */}
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Success metrics</h2>
            <p className="text-xs text-slate-500">
              Final retro corrections. A reason is required, and the previous value stays visible
              here so a correction always reads as a correction.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <Table>
            <thead>
              <tr>
                <Th>Metric</Th>
                <Th className="w-24 text-right">Target</Th>
                <Th className="w-24 text-right">Actual</Th>
                <Th className="w-28" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {brief.successMetrics.map((metric) => (
                <tr key={metric.id}>
                  <Td>{metric.metric}</Td>
                  <Td className="text-right tabular-nums">{metric.target.toLocaleString()}</Td>
                  <Td className="text-right tabular-nums">
                    {metric.actual === null || metric.actual === undefined ? "—" : metric.actual.toLocaleString()}
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAdjusting(metric.id);
                        setAdjustValue(metric.actual ?? 0);
                      }}
                    >
                      Adjust
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          {adjusting ? (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="text-xs text-slate-600">
                New actual
                <NumberInput
                  className="mt-1 w-32 text-right"
                  value={adjustValue}
                  onChange={(e) => setAdjustValue(Number(e.target.value) || 0)}
                />
              </label>
              <label className="flex-1 text-xs text-slate-600">
                Reason (required)
                <TextInput
                  className="mt-1"
                  value={adjustReason}
                  placeholder="Final numbers came in from the venue after the ROI report"
                  onChange={(e) => setAdjustReason(e.target.value)}
                />
              </label>
              <Button variant="primary" disabled={!adjustReason.trim()} onClick={() => void adjustMetric()}>
                Save correction
              </Button>
              <Button onClick={() => setAdjusting(null)}>Cancel</Button>
            </div>
          ) : null}

          {retro.successMetricAdjustments.length > 0 ? (
            <ul className="space-y-1 text-xs text-slate-600">
              {retro.successMetricAdjustments.map((adjustment) => (
                <li key={`${adjustment.metricId}-${adjustment.adjustedAt}`}>
                  <strong>{adjustment.metricName}:</strong>{" "}
                  {adjustment.previousActual ?? "not set"} → {adjustment.adjustedActual} —{" "}
                  {adjustment.reason} ({formatIsoDateTime(adjustment.adjustedAt)})
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </Card>

      {confirming ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">Complete this retro?</h2>
            <p className="mt-2 text-sm text-slate-600">
              {preview.total} lesson{preview.total === 1 ? "" : "s"} will carry forward onto the
              brief — {preview.repeat} repeat, {preview.fix} fix, {preview.drop} drop. They will
              be suggested during intake on your next {brief.type.replace("_", " ")}.
            </p>
            {retro.status === "completed" ? (
              <p className="mt-2 text-xs text-slate-500">
                This retro was completed before — re-completing updates the entries it already
                wrote rather than adding duplicates.
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => void complete()}>
                Complete and carry forward
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
