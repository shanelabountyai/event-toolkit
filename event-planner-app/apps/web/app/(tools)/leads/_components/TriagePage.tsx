"use client";

/**
 * One container for every tab of a triage session — same pattern as the logistics pack, so the
 * load/persist/shell wiring exists once rather than seven times.
 */

import Link from "next/link";
import { useState } from "react";
import {
  contactName,
  tierCounts,
  type DuplicateCandidate,
  type LeadRecord,
} from "@event-toolkit/lead-triage-core";
import { logUsageEvent } from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { formatIsoDateTime } from "@/lib/format";
import { useTriageSession } from "../_hooks/useTriageSession";
import { ExportDialog } from "./ExportDialog";
import { ImportWizard } from "./ImportWizard";
import { LeadTable } from "./LeadTable";
import { LeadsLoading, LeadsNotFound, LeadsShell } from "./LeadsShell";
import { MergeReviewQueue } from "./MergeReviewQueue";
import { OwnerAssignmentPanel } from "./OwnerAssignmentPanel";
import { RubricEditor } from "./RubricEditor";
import { TemplateEditor } from "./TemplateEditor";

export type TriageTab = "overview" | "import" | "merge-review" | "rubric" | "triage" | "templates" | "export";

export function TriagePage({ sessionId, tab }: { sessionId: string; tab: TriageTab }) {
  const state = useTriageSession(sessionId);
  const [notice, setNotice] = useState<string | null>(null);

  if (state.loading) return <LeadsLoading />;
  if (state.notFound || !state.session) return <LeadsNotFound />;

  const { session, brief, leads, rubric, templates, candidates, batches } = state;

  const resolveCandidate = async (
    candidate: DuplicateCandidate,
    decision: "merged" | "rejected",
    nextLeads: LeadRecord[],
  ) => {
    if (decision === "merged") await state.updateLeads(nextLeads);
    await state.updateCandidates(
      candidates.map((c) => (c.id === candidate.id ? { ...c, status: decision } : c)),
    );
    await logUsageEvent({
      type: "dedupe_resolved",
      details: { sessionId, decision, similarity: candidate.similarity },
    });
  };

  return (
    <LeadsShell
      session={session}
      brief={brief}
      leads={leads}
      candidates={candidates}
      active={tab === "overview" ? "" : tab}
    >
      {notice ? (
        <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
          {notice}{" "}
          <button type="button" className="font-medium underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      ) : null}

      {tab === "overview" ? <Overview state={state} /> : null}

      {tab === "import" ? (
        <ImportWizard
          sessionId={sessionId}
          batches={batches}
          onImported={async (imported, batch) => {
            const { saveImportBatch } = await import("@event-toolkit/local-store");
            await saveImportBatch(batch);
            await state.reloadBatches();
            const result = await state.runDedupe([...leads, ...imported]);
            await logUsageEvent({
              type: "lead_import_completed",
              details: { sessionId, filename: batch.filename, rows: batch.rowCount, merged: result.merged },
            });
            return result;
          }}
        />
      ) : null}

      {tab === "merge-review" ? (
        <MergeReviewQueue candidates={candidates} leads={leads} onResolve={resolveCandidate} />
      ) : null}

      {tab === "rubric" && rubric ? (
        <RubricEditor
          rubric={rubric}
          leads={leads}
          personaTitlesAvailable={state.personaTitles.length > 0}
          onChange={state.updateRubric}
        />
      ) : null}

      {tab === "triage" ? (
        <div className="space-y-6">
          <OwnerAssignmentPanel
            session={session}
            leads={leads}
            onSessionChange={state.updateSession}
            onLeadsChange={state.updateLeads}
            onAssignmentRun={async (method, count) => {
              setNotice(`${count} lead${count === 1 ? "" : "s"} assigned by ${method.replace("_", " ")}.`);
              await logUsageEvent({ type: "assignment_run", details: { sessionId, method, count } });
            }}
          />
          <LeadTable leads={leads} owners={session.owners} onChange={state.updateLeads} />
        </div>
      ) : null}

      {tab === "templates" ? (
        <TemplateEditor
          session={session}
          templates={templates}
          leads={leads}
          onTemplatesChange={state.updateTemplates}
          onLeadsChange={state.updateLeads}
          onDraftsGenerated={async (generated, preserved) => {
            setNotice(
              preserved > 0
                ? `${generated} drafts generated. ${preserved} edited draft${preserved === 1 ? "" : "s"} left untouched.`
                : `${generated} drafts generated.`,
            );
            await logUsageEvent({ type: "drafts_generated", details: { sessionId, generated, preserved } });
          }}
        />
      ) : null}

      {tab === "export" ? (
        <ExportDialog
          session={session}
          leads={leads}
          onExported={async (format, scope, files) => {
            await logUsageEvent({
              type: "export_triggered",
              details: { tool: "leads", sessionId, format, scope, files },
            });
          }}
        />
      ) : null}
    </LeadsShell>
  );
}

function Overview({ state }: { state: ReturnType<typeof useTriageSession> }) {
  const { session, brief, leads, batches, candidates } = state;
  if (!session) return null;
  const tiers = tierCounts(leads);
  const pending = candidates.filter((c) => c.status === "pending").length;
  const unassigned = leads.filter((l) => !l.ownerId).length;
  const undrafted = leads.filter((l) => !l.followUpDraft).length;
  const base = `/leads/${session.id}`;

  const next: Array<{ label: string; href: string; done: boolean }> = [
    { label: "Import your lead files", href: `${base}/import`, done: batches.length > 0 },
    { label: `Review ${pending} possible duplicate${pending === 1 ? "" : "s"}`, href: `${base}/merge-review`, done: pending === 0 },
    { label: "Check the scoring rubric", href: `${base}/rubric`, done: leads.some((l) => l.score > 0) },
    { label: `Assign ${unassigned} unassigned lead${unassigned === 1 ? "" : "s"}`, href: `${base}/triage`, done: unassigned === 0 && leads.length > 0 },
    { label: `Generate ${undrafted} missing draft${undrafted === 1 ? "" : "s"}`, href: `${base}/templates`, done: undrafted === 0 && leads.length > 0 },
    { label: "Export for sales", href: `${base}/export`, done: false },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900">What&rsquo;s left</h2>
        </CardHeader>
        <CardBody>
          <ol className="space-y-2">
            {next.map((step) => (
              <li key={step.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <span aria-hidden className={step.done ? "text-emerald-600" : "text-slate-300"}>
                    {step.done ? "✓" : "○"}
                  </span>
                  <span className={step.done ? "text-slate-500" : "text-slate-900"}>{step.label}</span>
                </span>
                <Link href={step.href}>
                  <Button size="sm" variant={step.done ? "ghost" : "secondary"}>
                    Open
                  </Button>
                </Link>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-900">Lead pool</h2>
          </CardHeader>
          <CardBody>
            <p className="flex flex-wrap gap-2">
              <Badge tone="danger">{tiers.hot} hot</Badge>
              <Badge tone="warning">{tiers.warm} warm</Badge>
              <Badge tone="neutral">{tiers.cold} cold</Badge>
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {leads.length} leads from {batches.length} file{batches.length === 1 ? "" : "s"}.
            </p>
            {leads.length > 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Top lead: {contactName([...leads].sort((a, b) => b.score - a.score)[0].contact)} (
                {[...leads].sort((a, b) => b.score - a.score)[0].score} points)
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-900">Event</h2>
          </CardHeader>
          <CardBody className="space-y-1 text-sm text-slate-700">
            <p>Closed {formatIsoDateTime(session.eventClosedAt)}</p>
            {brief ? (
              <>
                <p className="text-xs text-slate-600">Objective: {brief.goals?.primaryObjective || "—"}</p>
                <p className="text-xs text-slate-600">
                  Target personas:{" "}
                  {(brief.audience?.targetPersonas ?? []).map((p) => p.name).join(", ") || "none"}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Shown read-only — this tool never writes to the brief.
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500">Standalone session, not linked to a brief.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
