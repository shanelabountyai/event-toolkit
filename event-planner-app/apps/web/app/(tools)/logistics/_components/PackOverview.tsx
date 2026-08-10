"use client";

/**
 * FR-13/FR-14 — the pack dashboard: completeness rollup, open issues, and the two write-backs
 * this tool is allowed to make into the brief (risk status, milestone status).
 */

import { useState } from "react";
import Link from "next/link";
import { packCompleteness, type LogisticsPack } from "@event-toolkit/logistics";
import {
  MILESTONE_STATUSES,
  MILESTONE_STATUS_LABELS,
  RISK_STATUSES,
  RISK_STATUS_LABELS,
  type EventBrief,
  type MilestoneStatus,
  type RiskStatus,
} from "@event-toolkit/schema";
import { saveBrief } from "@event-toolkit/local-store";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ProgressBar,
  Select,
  Table,
  Td,
  Th,
  EmptyRow,
} from "@event-toolkit/ui";
import { formatIsoDate } from "@/lib/format";

export function PackOverview({
  pack,
  brief,
  onBriefWritten,
}: {
  pack: LogisticsPack;
  brief: EventBrief | null;
  onBriefWritten: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const completeness = packCompleteness(pack);
  const base = `/logistics/${pack.id}`;

  /**
   * The only writes this tool makes to the brief. They go through `saveBrief`, so `version`
   * and `updatedAt` bump exactly as they would from any other brief edit.
   */
  const writeBrief = async (mutate: (b: EventBrief) => EventBrief, key: string) => {
    if (!brief) return;
    setSaving(key);
    try {
      await saveBrief(mutate(brief));
      onBriefWritten();
    } finally {
      setSaving(null);
    }
  };

  const setRiskStatus = (riskId: string, status: RiskStatus) =>
    writeBrief(
      (b) => ({
        ...b,
        riskRegister: b.riskRegister.map((r) => (r.id === riskId ? { ...r, status } : r)),
      }),
      riskId,
    );

  const setMilestoneStatus = (milestoneId: string, status: MilestoneStatus) =>
    writeBrief(
      (b) => ({
        ...b,
        timeline: {
          ...b.timeline,
          milestones: b.timeline.milestones.map((m) =>
            m.id === milestoneId ? { ...m, status } : m,
          ),
        },
      }),
      milestoneId,
    );

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {completeness.artifacts.map((artifact) => (
          <Link
            key={artifact.key}
            href={`${base}/${artifact.key}`}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 hover:bg-slate-50"
          >
            <p className="text-sm font-medium text-slate-900">{artifact.label}</p>
            <p className="mt-1 text-xs text-slate-600">{artifact.summary}</p>
            <div className="mt-3">
              <ProgressBar
                value={artifact.total === 0 ? 0 : (artifact.count / artifact.total) * 100}
              />
            </div>
          </Link>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Badge tone={completeness.openIssues > 0 ? "danger" : "success"}>
          {completeness.openIssues} open issue{completeness.openIssues === 1 ? "" : "s"}
        </Badge>
        <Link
          href={`${base}/issues`}
          className="text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-900"
        >
          Open the issue log
        </Link>
      </section>

      {brief ? (
        <>
          <Card>
            <CardHeader>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Known risks</h2>
                <p className="text-xs text-slate-500">
                  From the event brief. Changing a status here writes back to the brief itself.
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <Table>
                <thead>
                  <tr>
                    <Th>Risk</Th>
                    <Th className="w-24">Likelihood</Th>
                    <Th className="w-24">Impact</Th>
                    <Th className="w-32">Owner</Th>
                    <Th className="w-44">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {brief.riskRegister.length === 0 ? (
                    <EmptyRow colSpan={5}>No risks recorded on the brief.</EmptyRow>
                  ) : (
                    brief.riskRegister.map((risk) => (
                      <tr key={risk.id}>
                        <Td>{risk.risk}</Td>
                        <Td className="capitalize">{risk.likelihood}</Td>
                        <Td className="capitalize">{risk.impact}</Td>
                        <Td>{risk.owner ?? "—"}</Td>
                        <Td>
                          <Select
                            value={risk.status}
                            aria-label={`Status for ${risk.risk}`}
                            disabled={saving === risk.id}
                            onChange={(e) => void setRiskStatus(risk.id, e.target.value as RiskStatus)}
                          >
                            {RISK_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {RISK_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </Select>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Milestones</h2>
                <p className="text-xs text-slate-500">
                  Also written back to the brief, so the brief stays the single source of truth.
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <Table>
                <thead>
                  <tr>
                    <Th>Milestone</Th>
                    <Th className="w-32">Phase</Th>
                    <Th className="w-32">Target</Th>
                    <Th className="w-44">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {brief.timeline.milestones.length === 0 ? (
                    <EmptyRow colSpan={4}>No milestones on the brief.</EmptyRow>
                  ) : (
                    brief.timeline.milestones.map((milestone) => (
                      <tr key={milestone.id}>
                        <Td>{milestone.label}</Td>
                        <Td className="text-xs text-slate-600">
                          {milestone.phase.replace(/_/g, " ")}
                        </Td>
                        <Td>{formatIsoDate(milestone.targetDate)}</Td>
                        <Td>
                          <Select
                            value={milestone.status}
                            aria-label={`Status for ${milestone.label}`}
                            disabled={saving === milestone.id}
                            onChange={(e) =>
                              void setMilestoneStatus(milestone.id, e.target.value as MilestoneStatus)
                            }
                          >
                            {MILESTONE_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {MILESTONE_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </Select>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}
