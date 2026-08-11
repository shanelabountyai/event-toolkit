"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { collectLocalRecords, type MigrationPreview } from "@event-toolkit/local-store";

/** Kind names are storage identifiers. Nobody should have to read "pipelineOpportunities". */
const KIND_LABELS: Record<string, string> = {
  briefs: "Event briefs",
  promoAssetSets: "Promo campaign kits",
  pacingEntries: "Registration pacing entries",
  pacingConfigs: "Pacing settings",
  logisticsPack: "Logistics packs",
  "logisticsPack.session": "Run-of-show sessions",
  "logisticsPack.staff": "Staff assignments",
  "logisticsPack.shipping": "Shipping items",
  "logisticsPack.checklist": "Venue checklist items",
  "logisticsPack.contact": "On-site contacts",
  "logisticsPack.issue": "Issue log entries",
  budgetLineItems: "Budget line items",
  budgetSettings: "Budget settings",
  triageSessions: "Lead triage sessions",
  importBatches: "Lead imports",
  leadRecords: "Attendee lead records",
  scoringRubrics: "Lead scoring rubrics",
  followUpTemplates: "Follow-up templates",
  duplicateCandidates: "Duplicate candidates",
  roiReports: "ROI reports",
  attributionSettings: "Attribution settings",
  pipelineOpportunities: "Pipeline opportunities",
  pipelineImportBatches: "Pipeline imports",
  surveyResponses: "Survey responses",
  surveyImportBatches: "Survey imports",
  retros: "Post-mortems",
};

const BATCH_SIZE = 500;

type Phase = "reading" | "ready" | "empty" | "uploading" | "done" | "error";

interface Totals {
  inserted: number;
  updated: number;
  skipped: { kind: string; documentId: string; reason: string }[];
}

export function MigrateClient({
  workspaceId,
  workspaceName,
  alreadyMigrated,
}: {
  workspaceId: string;
  workspaceName: string;
  alreadyMigrated: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("reading");
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [records, setRecords] = useState<{ kind: string; documentId: string; document: unknown }[]>([]);
  const [progress, setProgress] = useState(0);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Reading happens in the browser because the data is in the browser. No server can see it.
    collectLocalRecords()
      .then(({ records: found, preview: p }) => {
        if (cancelled) return;
        setRecords(found);
        setPreview(p);
        setPhase(found.length === 0 ? "empty" : "ready");
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setError("Could not read this browser's saved data.");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload() {
    setPhase("uploading");
    setProgress(0);
    const running: Totals = { inserted: 0, updated: 0, skipped: [] };

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const response = await fetch("/api/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, records: batch }),
      });

      if (!response.ok) {
        const { error: message } = await response.json().catch(() => ({ error: null }));
        setError(message ?? "The upload failed partway through.");
        setTotals(running);
        setPhase("error");
        return;
      }

      const result = (await response.json()) as Totals;
      running.inserted += result.inserted;
      running.updated += result.updated;
      running.skipped.push(...result.skipped);
      setProgress(Math.min(i + BATCH_SIZE, records.length));
    }

    setTotals(running);
    setPhase("done");
  }

  if (phase === "reading") {
    return <Note>Reading what&rsquo;s saved in this browser…</Note>;
  }

  if (phase === "empty") {
    return (
      <Note>
        There&rsquo;s nothing saved in this browser to move. Anything you create from now on in{" "}
        {workspaceName} is stored there instead.
      </Note>
    );
  }

  if (phase === "done" && totals) {
    const skippedKinds = [...new Set(totals.skipped.map((s) => s.kind))];
    return (
      <Card>
        <CardBody className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Moved into {workspaceName}</h2>
          <p className="text-sm text-slate-700">
            {totals.inserted} added
            {totals.updated > 0 ? `, ${totals.updated} already there and updated` : ""}.
          </p>

          {skippedKinds.length > 0 ? (
            // Reported, never silent. A migration that quietly drops a third of somebody's data is
            // worse than one that refuses.
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              {totals.skipped.length} records weren&rsquo;t moved because your role in this
              workspace doesn&rsquo;t cover them:{" "}
              {skippedKinds.map((k) => KIND_LABELS[k] ?? k).join(", ")}. They&rsquo;re still in this
              browser. An owner or admin can move them.
            </p>
          ) : null}

          {/*
            FR-9: non-destructive. The local copy stays until the planner decides otherwise, and
            there is deliberately no button here to delete it. Somebody who has just moved two
            years of events should get to confirm it all arrived before anything is thrown away.
          */}
          <p className="text-sm text-slate-600">
            Your original copy is still in this browser, untouched. Check everything looks right in
            the workspace before clearing it.
          </p>

          <Link
            href="/brief"
            className="inline-flex rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Open the events
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-slate-900">What will move</h2>
        <span className="text-xs text-slate-500">{preview?.total ?? 0} items</span>
      </CardHeader>
      <CardBody className="space-y-4">
        {preview && preview.events.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Events</p>
            <ul className="text-sm text-slate-800">
              {preview.events.map((e) => (
                <li key={e.id}>{e.name || "Untitled event"}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Everything included</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {preview?.counts.map((c) => (
              <li key={c.kind} className="flex justify-between py-1">
                <span className="text-slate-800">{KIND_LABELS[c.kind] ?? c.kind}</span>
                <span className="tabular-nums text-slate-500">{c.count}</span>
              </li>
            ))}
          </ul>
        </div>

        {alreadyMigrated ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
            Data has been moved into this workspace before. Running it again updates what&rsquo;s
            already there rather than making a second copy.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={upload} disabled={phase === "uploading"}>
            {phase === "uploading"
              ? `Moving… ${progress} of ${records.length}`
              : `Move ${records.length} items into ${workspaceName}`}
          </Button>
          <span className="text-xs text-slate-500">
            Nothing is deleted from this browser.
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-slate-600">{children}</p>
      </CardBody>
    </Card>
  );
}
