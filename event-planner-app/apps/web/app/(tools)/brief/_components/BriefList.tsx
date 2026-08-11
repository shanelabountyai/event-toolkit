"use client";

/**
 * FR-7 — brief list (the tool's home).
 * Also hosts FR-13's "download usage log as CSV" action and the JSON import path
 * (PRD §8: JSON export/import is the v1 portability story).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  computeCompleteness,
  migrateBrief,
  validateBrief,
  type EventBrief,
} from "@event-toolkit/schema";
import {
  deleteBrief,
  exportUsageLogCsv,
  getIntakeProgress,
  listBriefs,
  saveBrief,
} from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { formatDateRange, formatRelative } from "@/lib/format";
import { triggerDownload } from "@/lib/download";
import { CompletenessBadge } from "./CompletenessBadge";
import { StatusBadge, TypeBadge } from "./badges";

interface Row {
  brief: EventBrief;
  /** True when intake was started but never generated — offer "Resume intake". */
  intakeInProgress: boolean;
  intakeStep: number;
}

export function BriefList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const briefs = await listBriefs();
      const withProgress = await Promise.all(
        briefs.map(async (brief) => {
          const progress = await getIntakeProgress(brief.id);
          return {
            brief,
            intakeInProgress: Boolean(progress && !progress.generated),
            intakeStep: progress?.stepIndex ?? 0,
          };
        }),
      );
      setRows(withProgress);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = async (brief: EventBrief) => {
    const ok =
      typeof window === "undefined" ||
      window.confirm(`Delete "${brief.name || "Untitled brief"}"? This cannot be undone.`);
    if (!ok) return;
    await deleteBrief(brief.id);
    await load();
  };

  const onDownloadUsageLog = async () => {
    const csv = await exportUsageLogCsv();
    triggerDownload(
      `event-toolkit-usage-log-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv",
    );
    setNotice("Usage log downloaded as CSV.");
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const migrated = migrateBrief(parsed);
      const result = validateBrief(migrated);
      if (!result.ok) {
        setError(
          `Import failed — the file is not a valid Event Brief: ${result.issues
            .slice(0, 3)
            .map((i) => `${i.path || "(root)"}: ${i.message}`)
            .join("; ")}`,
        );
        return;
      }
      await saveBrief(result.brief);
      setNotice(`Imported "${result.brief.name}".`);
      setError(null);
      await load();
    } catch (err: unknown) {
      setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (rows === null) {
    return <p className="text-sm text-content-muted">Loading briefs…</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-content">Event briefs</h1>
          <p className="mt-1 text-sm text-content-muted">
            Every brief is stored in this browser. Start here, then launch the rest of the suite
            from a brief.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
              e.target.value = "";
            }}
          />
          <Button onClick={() => fileInputRef.current?.click()}>Import JSON</Button>
          <Button onClick={() => void onDownloadUsageLog()}>Download usage log (CSV)</Button>
          <Link href="/brief/new">
            <Button variant="primary">New brief</Button>
          </Link>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-success-border bg-success-subtle px-4 py-3 text-sm text-success-text">
          {notice}
        </div>
      ) : null}

      {rows.length === 0 ? <EmptyState /> : null}

      {/*
        grid-cols-1, not bare grid. A grid item defaults to min-width:auto, so the `truncate`
        below (which sets white-space:nowrap) gave this track a min-content width of 933px and
        slid the whole landing page sideways on a phone. grid-cols-1 expands to
        repeat(1, minmax(0, 1fr)), which caps the track.
      */}
      <div className="grid grid-cols-1 gap-4">
        {rows.map(({ brief, intakeInProgress, intakeStep }) => {
          const completeness = computeCompleteness(brief);
          return (
            <Card key={brief.id}>
              <CardHeader>
                <div className="min-w-0">
                  <Link
                    href={`/brief/${brief.id}`}
                    className="text-base font-semibold text-content hover:underline"
                  >
                    {brief.name || "Untitled brief"}
                  </Link>
                  <p className="mt-0.5 truncate text-sm text-content-muted">
                    {brief.goals.primaryObjective || "No primary objective yet"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={brief.type} />
                  <StatusBadge status={brief.status} />
                  <CompletenessBadge brief={brief} />
                  {intakeInProgress ? (
                    <Badge tone="warning">Intake in progress · step {intakeStep + 1}</Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-content-muted">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-content-subtle">Dates</dt>
                    <dd>{formatDateRange(brief)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-content-subtle">Last updated</dt>
                    <dd>{formatRelative(brief.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-content-subtle">Revision</dt>
                    <dd>
                      v{brief.version} · schema {brief.schemaVersion}
                    </dd>
                  </div>
                  {completeness.missingRecommended.length > 0 ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-content-subtle">Gaps</dt>
                      <dd className="text-warning-text">
                        {completeness.missingRecommended.length} section
                        {completeness.missingRecommended.length === 1 ? "" : "s"} empty
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="flex flex-wrap gap-2">
                  {intakeInProgress ? (
                    <Link href={`/brief/${brief.id}/intake`}>
                      <Button variant="primary" size="sm">
                        Resume intake
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/brief/${brief.id}/intake`}>
                      <Button size="sm">Re-run intake</Button>
                    </Link>
                  )}
                  <Link href={`/brief/${brief.id}`}>
                    <Button size="sm" variant={intakeInProgress ? "secondary" : "primary"}>
                      Open brief
                    </Button>
                  </Link>
                  <Button size="sm" variant="danger" onClick={() => void onDelete(brief)}>
                    Delete
                  </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardBody className="py-12 text-center">
        <h2 className="text-lg font-semibold text-content">No briefs yet</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-content-muted">
          An event brief is the shared spine for everything that follows — objectives, audience,
          budget shell, RACI, success metrics, risks and timeline in one structured document.
          Pick an event-type preset and the guided intake fills in sensible defaults you can edit.
        </p>
        <div className="mt-6">
          <Link href="/brief/new">
            <Button variant="primary">Create your first brief</Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
