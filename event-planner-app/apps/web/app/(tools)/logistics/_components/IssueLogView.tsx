"use client";

/** FR-10 — the issue log: filterable, sortable, resolvable. PRD 7 reads this later. */

import { useMemo, useState } from "react";
import {
  ARTIFACT_LABELS,
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABELS,
  resolveSessionTime,
  type IssueLogEntry,
  type IssueSeverity,
  type LogisticsPack,
} from "@event-toolkit/logistics";
import { nowIso } from "@event-toolkit/schema";
import { Badge, Button, EmptyRow, Select, Table, Td, Th, TextInput } from "@event-toolkit/ui";
import { formatIsoDateTime } from "@/lib/format";

const SEVERITY_TONES: Record<IssueSeverity, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

const SEVERITY_RANK: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };

export function IssueLogView({
  pack,
  onUpdate,
  readOnly = false,
}: {
  pack: LogisticsPack;
  onUpdate?: (updater: (prev: LogisticsPack) => LogisticsPack) => void;
  readOnly?: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | IssueSeverity>("all");
  const [sortBy, setSortBy] = useState<"newest" | "severity">("newest");

  const rows = useMemo(() => {
    const filtered = pack.issueLog.filter(
      (issue) =>
        (statusFilter === "all" || issue.status === statusFilter) &&
        (severityFilter === "all" || issue.severity === severityFilter),
    );
    return [...filtered].sort((a, b) =>
      sortBy === "severity"
        ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          (a.timestamp < b.timestamp ? 1 : -1)
        : a.timestamp < b.timestamp
          ? 1
          : -1,
    );
  }, [pack.issueLog, statusFilter, severityFilter, sortBy]);

  const patch = (id: string, changes: Partial<IssueLogEntry>) =>
    onUpdate?.((prev) => ({
      ...prev,
      issueLog: prev.issueLog.map((i) => (i.id === id ? { ...i, ...changes } : i)),
    }));

  return (
    <div className="space-y-3">
      {!readOnly ? (
        <div className="no-print flex flex-wrap items-end gap-3">
          <label className="text-xs text-content-muted">
            Status
            <Select
              className="mt-1"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </Select>
          </label>
          <label className="text-xs text-content-muted">
            Severity
            <Select
              className="mt-1"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
            >
              <option value="all">All</option>
              {ISSUE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {ISSUE_SEVERITY_LABELS[s]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs text-content-muted">
            Sort by
            <Select
              className="mt-1"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            >
              <option value="newest">Newest first</option>
              <option value="severity">Severity</option>
            </Select>
          </label>
        </div>
      ) : null}

      <Table stack>
        <thead>
          <tr>
            <Th className="w-40">Logged</Th>
            <Th>What happened</Th>
            <Th className="w-28">Severity</Th>
            <Th className="w-36">Where</Th>
            <Th className="w-28">Status</Th>
            {!readOnly ? <Th className="w-56">Resolution</Th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={readOnly ? 5 : 6}>
              {pack.issueLog.length === 0
                ? "No issues logged. Use “Flag an issue” from any view."
                : "No issues match these filters."}
            </EmptyRow>
          ) : (
            rows.map((issue) => {
              const session = resolveSessionTime(pack, issue.relatedSessionId);
              return (
                <tr key={issue.id} className="break-inside-avoid">
                  <Td label="Logged" className="text-xs text-content-muted">
                    {formatIsoDateTime(issue.timestamp)}
                    {issue.loggedBy ? <span className="block">by {issue.loggedBy}</span> : null}
                  </Td>
                  <Td label="What happened">{issue.description}</Td>
                  <Td label="Severity">
                    <Badge tone={SEVERITY_TONES[issue.severity]}>
                      {ISSUE_SEVERITY_LABELS[issue.severity]}
                    </Badge>
                  </Td>
                  <Td label="Where" className="text-xs text-content-muted">
                    {issue.relatedArtifact ? ARTIFACT_LABELS[issue.relatedArtifact] : "—"}
                    {session ? <span className="block">{session.label}</span> : null}
                  </Td>
                  <Td label="Status">
                    {readOnly ? (
                      <Badge tone={issue.status === "open" ? "danger" : "success"}>
                        {issue.status === "open" ? "Open" : "Resolved"}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant={issue.status === "open" ? "secondary" : "ghost"}
                        onClick={() =>
                          patch(issue.id, {
                            status: issue.status === "open" ? "resolved" : "open",
                            resolvedAt: issue.status === "open" ? nowIso() : undefined,
                          })
                        }
                      >
                        {issue.status === "open" ? "Mark resolved" : "Reopen"}
                      </Button>
                    )}
                  </Td>
                  {!readOnly ? (
                    <Td label="Resolution">
                      <TextInput
                        value={issue.resolutionNotes ?? ""}
                        aria-label="Resolution notes"
                        placeholder="What fixed it"
                        onChange={(e) => patch(issue.id, { resolutionNotes: e.target.value })}
                      />
                    </Td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </div>
  );
}
