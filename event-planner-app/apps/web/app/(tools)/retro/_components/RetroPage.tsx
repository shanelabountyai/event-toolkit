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

  if (loading) return <p className="py-16 text-center text-sm text-content-muted">Loading…</p>;
  if (!retro || !brief) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-content">That retro no longer exists</h1>
        <Link href="/retro" className="mt-5 inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover">
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
          <p className="text-xs font-medium uppercase tracking-wide text-content-muted">Post-mortem</p>
          <h1 className="text-xl font-semibold text-content">{retro.eventName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-content-muted">
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
          <Link href={`/brief/${brief.id}`} className="rounded-md px-2.5 py-1.5 text-sm font-medium text-content-muted underline-offset-4 hover:text-content hover:underline">
            ← Back to brief
          </Link>
        </div>
      </header>

      {notice ? (
        <p role="status" className="rounded-lg border border-success-border bg-success-subtle px-4 py-2 text-sm text-success-text">
          {notice}{" "}
          <button type="button" className="font-medium underline" onClick={() => setNotice(null)}>Dismiss</button>
        </p>
      ) : null}

      {blocking.length > 0 ? (
        <p className="rounded-lg border border-warning-border bg-warning-subtle px-4 py-2 text-sm text-warning-text">
          {blocking.length} lesson{blocking.length === 1 ? "" : "s"} still need text before this
          retro can be completed.
        </p>
      ) : null}

      {/* Ingestion status — three tiles, each honest about what wasn't available. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-content">Issue log</h2></CardHeader>
          <CardBody className="text-sm text-content-muted">
            {issue.available ? (
              <>
                <p className="text-lg font-semibold text-content">{issue.totalIssues} issues</p>
                <p className="text-xs text-content-muted">
                  {issue.bySeverity.high} high · {issue.bySeverity.medium} medium · {issue.bySeverity.low} low
                </p>
                <p className="text-xs text-content-muted">{issue.openAtIngestion} still open</p>
              </>
            ) : (
              <p className="text-content-muted">
                Not available — no logistics pack was built for this event.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-content">Budget variance</h2></CardHeader>
          <CardBody className="text-sm text-content-muted">
            {budget.available ? (
              <>
                <p className="text-lg font-semibold text-content">
                  {formatMoney(budget.totalActual, "USD")}
                </p>
                <p className="text-xs text-content-muted">
                  against {formatMoney(budget.totalBudgeted, "USD")} budgeted
                  {budget.variancePct === null ? "" : ` (${Math.round(budget.variancePct)}%)`}
                </p>
                {!budget.varianceAtClose?.isFinal ? (
                  <p className="text-xs text-warning-text">Budget not reconciled — figures are provisional.</p>
                ) : null}
              </>
            ) : (
              <p className="text-content-muted">Not available — no budget was built for this event.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-content">ROI scorecard</h2></CardHeader>
          <CardBody className="text-sm text-content-muted">
            {roi.available ? (
              <>
                <p className="text-lg font-semibold capitalize text-content">{roi.recommendation}</p>
                <p className="text-xs text-content-muted">
                  From a {roi.reportStatus} report
                  {roi.scorePct === null ? "" : ` · ${Math.round(roi.scorePct * 100)}%`}
                </p>
                {roi.reportStatus === "draft" ? (
                  <p className="text-xs text-warning-text">The ROI report is still a draft.</p>
                ) : null}
              </>
            ) : (
              <p className="text-content-muted">Not available — no ROI report for this event yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Three-column lesson workspace. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {DISPOSITIONS.map((disposition) => {
          const group = retro.lessons.filter((l) => l.disposition === disposition);
          return (
            <section key={disposition} className="rounded-xl border border-line bg-surface-sunken">
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <span className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-content">{DISPOSITION_LABELS[disposition]}</h2>
                  <Badge>{group.length}</Badge>
                </span>
                <Button size="sm" variant="ghost" onClick={() => addManual(disposition)}>
                  + Add
                </Button>
              </div>
              <p className="px-4 pb-2 text-xs text-content-muted">{DISPOSITION_DEFINITIONS[disposition]}</p>

              <div className="space-y-3 px-4 pb-4">
                {group.length === 0 ? (
                  <p className="text-xs text-content-muted">Nothing here yet.</p>
                ) : (
                  group.map((lesson) => (
                    <article key={lesson.id} className="rounded-lg border border-line bg-surface p-3">
                      <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-content-muted">
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
                        <label className="flex items-center gap-1.5 text-xs text-content-muted">
                          <input
                            type="checkbox"
                            checked={lesson.carryForward}
                            onChange={(e) => patchLesson(lesson.id, { carryForward: e.target.checked })}
                            className="h-3.5 w-3.5 rounded border-line-strong"
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
            <h2 className="text-base font-semibold text-content">Success metrics</h2>
            <p className="text-xs text-content-muted">
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
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-sunken p-3">
              <label className="text-xs text-content-muted">
                New actual
                <NumberInput
                  className="mt-1 w-32 text-right"
                  value={adjustValue}
                  onChange={(e) => setAdjustValue(Number(e.target.value) || 0)}
                />
              </label>
              <label className="flex-1 text-xs text-content-muted">
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
            <ul className="space-y-1 text-xs text-content-muted">
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
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-accent/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl">
            <h2 className="text-base font-semibold text-content">Complete this retro?</h2>
            <p className="mt-2 text-sm text-content-muted">
              {preview.total} lesson{preview.total === 1 ? "" : "s"} will carry forward onto the
              brief — {preview.repeat} repeat, {preview.fix} fix, {preview.drop} drop. They will
              be suggested during intake on your next {brief.type.replace("_", " ")}.
            </p>
            {retro.status === "completed" ? (
              <p className="mt-2 text-xs text-content-muted">
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
