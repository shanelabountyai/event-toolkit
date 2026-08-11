"use client";

/**
 * The calibration read-out. Loads everything the suite has stored locally and reports what it
 * says about each documented default.
 *
 * On a fresh install this page is almost entirely "not enough data yet" — and that is the
 * correct, useful output. It exists so the first real event produces evidence rather than
 * anecdotes; it is not going to tell anyone anything before then.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  attributionSensitivity,
  runCalibration,
  summarise,
  type CalibrationInputs,
  type CalibrationStatus,
} from "@/lib/calibration";
import {
  getBudgetSettings,
  getBrief,
  getRubric,
  listBriefs,
  listLeads,
  listDuplicateCandidates,
  listPipelineOpportunities,
  listReports,
  listRetros,
  listSessions,
  getLineItems,
} from "@event-toolkit/local-store";
import type { BudgetLineItem, BudgetSettings } from "@event-toolkit/schema";
import type { DuplicateCandidate, LeadRecord, ScoringRubric } from "@event-toolkit/lead-triage-core";
import { Badge, Card, CardBody, CardHeader, Table, Td, Th, type BadgeTone } from "@event-toolkit/ui";
import { formatMoney } from "@/lib/format";

const STATUS_TONES: Record<CalibrationStatus, BadgeTone> = {
  no_data: "neutral",
  too_early: "neutral",
  supports: "success",
  questions: "warning",
};

const STATUS_LABELS: Record<CalibrationStatus, string> = {
  no_data: "No data yet",
  too_early: "Too early to say",
  supports: "Holding up",
  questions: "Worth revisiting",
};

export function CalibrationView() {
  const [inputs, setInputs] = useState<CalibrationInputs | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const briefs = await listBriefs();

      // Leads, rubrics and duplicate candidates across every triage session.
      const sessions = await listSessions();
      const leads: LeadRecord[] = [];
      const rubrics: ScoringRubric[] = [];
      const duplicateCandidates: DuplicateCandidate[] = [];
      for (const session of sessions) {
        leads.push(...(await listLeads(session.id)));
        const rubric = await getRubric(session.id);
        if (rubric) rubrics.push(rubric);
        duplicateCandidates.push(...(await listDuplicateCandidates(session.id)));
      }

      // Budget data across every brief.
      const budgetLineItems: BudgetLineItem[] = [];
      const budgetSettings: BudgetSettings[] = [];
      for (const brief of briefs) {
        const settings = await getBudgetSettings(brief.id);
        if (!settings) continue;
        budgetSettings.push(settings);
        budgetLineItems.push(...(await getLineItems(brief.id)));
      }

      // Pipeline opportunities paired with their event's end date, for the window analysis.
      const reports = await listReports();
      const attributionSamples: CalibrationInputs["attributionSamples"] = [];
      for (const report of reports) {
        const brief = await getBrief(report.eventBriefId);
        const eventEndDate = brief?.dates?.eventEndDate;
        if (!eventEndDate) continue;
        for (const opportunity of await listPipelineOpportunities(report.id)) {
          attributionSamples.push({ opportunity, eventEndDate });
        }
      }

      if (cancelled) return;
      setInputs({
        briefs,
        leads,
        rubrics,
        duplicateCandidates,
        budgetLineItems,
        budgetSettings,
        reports,
        attributionSamples,
        surveySummaries: reports.map((r) => r.surveySummary).filter((s): s is NonNullable<typeof s> => Boolean(s)),
        retros: await listRetros(),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!inputs) return <p className="py-16 text-center text-sm text-slate-500">Loading…</p>;

  const summary = summarise(runCalibration(inputs));
  const sensitivity = attributionSensitivity(inputs);
  const hasPipeline = inputs.attributionSamples.length > 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Calibration</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Every tool in this suite shipped with defaults marked{" "}
          <em>&ldquo;assumption — pending validation&rdquo;</em>: scoring weights, variance
          thresholds, attribution windows, retro timing. This page reads what the suite has
          actually recorded and reports what it says about each one.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          On a new install almost everything here will say &ldquo;not enough data yet&rdquo;.
          That is the honest answer — it exists so the first real event produces evidence
          instead of a hunch.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Badge tone="success">{summary.readyCount} holding up</Badge>
        <Badge tone="warning">{summary.questioningCount} worth revisiting</Badge>
        <Badge tone="neutral">{summary.waitingCount} waiting on data</Badge>
      </div>

      <div className="space-y-3">
        {summary.findings.map((f) => (
          <Card key={f.id}>
            <CardHeader>
              <div>
                <h2 className="text-base font-semibold text-slate-900">{f.label}</h2>
                <p className="text-xs text-slate-500">PRD {f.prd} · {f.assumption}</p>
              </div>
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  n={f.sampleSize}
                  {f.sampleSize < f.minSample ? ` of ${f.minSample} needed` : ""}
                </span>
                <Badge tone={STATUS_TONES[f.status]}>{STATUS_LABELS[f.status]}</Badge>
              </span>
            </CardHeader>
            <CardBody className="space-y-2">
              <p className="text-sm text-slate-800">{f.evidence}</p>
              {f.suggestion ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {f.suggestion}
                </p>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Attribution window sensitivity
            </h2>
            <p className="text-xs text-slate-500">
              How much the sourced-pipeline figure moves as the window moves.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This is not validation, and it cannot become validation. Which opportunities the
            event actually <em>caused</em> is not knowable from a spreadsheet of created dates —
            no window setting makes it knowable. What this shows is how much of your headline
            number is a choice.
          </p>
          {hasPipeline ? (
            <Table>
              <thead>
                <tr>
                  <Th>Sourced window</Th>
                  <Th className="w-32 text-right">Opportunities</Th>
                  <Th className="w-40 text-right">Sourced pipeline</Th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.map((row) => (
                  <tr key={row.sourcedWindowDays} className={row.sourcedWindowDays === 30 ? "bg-sky-50/60" : undefined}>
                    <Td>
                      {row.sourcedWindowDays} days
                      {row.sourcedWindowDays === 30 ? (
                        <Badge tone="info" className="ml-2">Current default</Badge>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular-nums">{row.sourcedCount}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(row.sourcedAmount, "USD")}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-slate-600">
              No pipeline data imported yet. Import a CRM opportunity export into an{" "}
              <Link href="/roi" className="font-medium underline underline-offset-4">ROI report</Link>{" "}
              and this table will show how sensitive the number is.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900">What this can&rsquo;t tell you</h2>
        </CardHeader>
        <CardBody>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
            <li>
              <strong>Duplicates you never caught.</strong> Rejected pairs are visible; missed
              ones leave no trace. This page can tell you the threshold is too loose, never that
              it is too tight.
            </li>
            <li>
              <strong>Whether the lead rubric predicts anything.</strong> That needs conversion
              outcomes, which arrive a sales cycle later — compare a past event&rsquo;s hot leads
              against its imported pipeline once you have both.
            </li>
            <li>
              <strong>Anything only a planner knows.</strong> Whether the retro prompt is
              annoying, whether the logistics artifacts are in a useful order, whether the copy
              sounds like your company. Ask them; no amount of stored data answers it.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
