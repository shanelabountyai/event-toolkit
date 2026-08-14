"use client";

/**
 * FR-5 / FR-8 / FR-10 / FR-12 — the brief view/edit screen.
 *
 * Renders the brief as a structured document with a per-section inline edit affordance, a
 * persistent top bar (completeness, status toggle, export) and the stubbed downstream-tool
 * launch links.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  EVENT_TYPE_LABELS,
  computeCompleteness,
  missingRequiredFields,
  newLessonLearned,
  type EventBrief,
} from "@event-toolkit/schema";
import { logUsageEvent } from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { formatDateRange, formatIsoDateTime } from "@/lib/format";
import { useBriefDocument } from "../_hooks/useBriefDocument";
import { CompletenessMeter } from "./CompletenessBadge";
import { StatusBadge, TypeBadge } from "./badges";
import { SaveIndicator } from "./SaveIndicator";
import { ExportDialog } from "./ExportDialog";
import { ToolLaunchLinks } from "./ToolLaunchLinks";
import { BriefSectionOverview } from "./BriefSectionOverview";
import { BriefSectionGoals } from "./BriefSectionGoals";
import { BriefSectionAudience } from "./BriefSectionAudience";
import { BriefSectionBudget } from "./BriefSectionBudget";
import { BriefSectionStakeholders } from "./BriefSectionStakeholders";
import { BriefSectionMetrics } from "./BriefSectionMetrics";
import { BriefSectionRisks } from "./BriefSectionRisks";
import { BriefSectionTimeline } from "./BriefSectionTimeline";
import { BriefSectionConstraints } from "./BriefSectionConstraints";

export function BriefView({ briefId }: { briefId: string }) {
  const { brief, updateBrief, flush, loading, notFound, saveState } = useBriefDocument(briefId);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Commit a section's edited copy. A section's draft is snapshotted when its Edit button is
   * pressed, so document-level fields that can change while the form is open (status toggle,
   * export history, revision counter, lessons written by another action) are taken from the
   * live document rather than the stale draft.
   */
  const saveSection = useCallback(
    (next: EventBrief) => {
      updateBrief((current) => ({
        ...next,
        id: current.id,
        schemaVersion: current.schemaVersion,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
        version: current.version,
        status: current.status,
        exportHistory: current.exportHistory,
        carryForwardLessons: current.carryForwardLessons,
      }));
      void flush();
    },
    [flush, updateBrief],
  );

  const toggleStatus = useCallback(async () => {
    if (!brief) return;
    const nextStatus = brief.status === "complete" ? "draft" : "complete";
    updateBrief((prev) => ({ ...prev, status: nextStatus }));
    const saved = await flush();
    const doc = saved ?? brief;
    await logUsageEvent({
      type: nextStatus === "complete" ? "brief_marked_complete" : "brief_marked_draft",
      briefId: doc.id,
      briefName: doc.name || "Untitled brief",
      details: {
        completenessPct: computeCompleteness(doc).percent,
        createdAt: doc.createdAt,
        minutesFromCreate: Math.round(
          (new Date(doc.updatedAt).getTime() - new Date(doc.createdAt).getTime()) / 60000,
        ),
      },
    });
    setNotice(
      nextStatus === "complete"
        ? "Marked complete — the brief list badge is updated."
        : "Back to draft.",
    );
  }, [brief, flush, updateBrief]);

  /**
   * Test utility: PRD 7 (Post-Mortem Generator) is the real writer of `carryForwardLessons`.
   * It doesn't exist yet, so this button simulates its output to make the FR-11 carry-forward
   * flow testable end-to-end today. Clearly labelled, and it is the only place PRD 1 writes
   * this field.
   */
  const addTestLesson = useCallback(() => {
    if (!brief) return;
    const text = typeof window === "undefined" ? "" : window.prompt("Lesson learned to carry forward into future briefs of this type:", "Book the AV vendor 90 days out — 60 was too late.");
    if (!text || !text.trim()) return;
    updateBrief((prev) => ({
      ...prev,
      carryForwardLessons: [
        ...(prev.carryForwardLessons ?? []),
        newLessonLearned({ lesson: text.trim(), sourceEventId: prev.id, category: "Retro" }),
      ],
    }));
    void flush();
    setNotice("Lesson added. Start a new brief of this event type to see it suggested at intake.");
  }, [brief, flush, updateBrief]);

  if (loading) return <p className="text-sm text-content-muted">Loading brief…</p>;

  if (notFound || !brief) {
    return (
      <Card>
        <CardBody className="space-y-3 py-10 text-center">
          <h1 className="text-lg font-semibold text-content">Brief not found</h1>
          <p className="text-sm text-content-muted">
            This brief isn&apos;t stored in this browser. Briefs live in IndexedDB on the device
            that created them — import a JSON export to bring one over.
          </p>
          <div>
            <Link href="/brief">
              <Button variant="primary">Back to briefs</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }

  const missing = missingRequiredFields(brief);
  const sectionProps = { brief, onSave: saveSection };

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link href="/brief" className="text-sm text-content-muted hover:underline">
          ← All briefs
        </Link>
        <Link href={`/brief/${brief.id}/intake`} className="text-sm text-content-muted hover:underline">
          Re-run guided intake
        </Link>
        <SaveIndicator state={saveState} className="ml-auto" />
      </div>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-content">
              {brief.name || "Untitled brief"}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-content-muted">
              <TypeBadge type={brief.type} />
              <StatusBadge status={brief.status} />
              <span>{formatDateRange(brief)}</span>
              <span className="text-content-subtle">·</span>
              <span>updated {formatIsoDateTime(brief.updatedAt)}</span>
            </p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button onClick={() => void toggleStatus()}>
              {brief.status === "complete" ? "Mark as draft" : "Mark as complete"}
            </Button>
            <Button variant="primary" onClick={() => setExportOpen(true)}>
              Export
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <CompletenessMeter brief={brief} showChecklist />
          {missing.length > 0 ? (
            <p className="rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-text">
              Required fields still missing: {missing.map((m) => m.label).join(", ")}. Edit the
              relevant section below, or{" "}
              <Link href={`/brief/${brief.id}/intake`} className="underline">
                re-run the guided intake
              </Link>
              .
            </p>
          ) : null}
          {notice ? <p className="text-xs text-success-text">{notice}</p> : null}
        </CardBody>
      </Card>

      <BriefSectionOverview {...sectionProps} />
      <BriefSectionGoals {...sectionProps} />
      <BriefSectionAudience {...sectionProps} />
      <BriefSectionBudget {...sectionProps} />
      <BriefSectionStakeholders {...sectionProps} />
      <BriefSectionMetrics {...sectionProps} />
      <BriefSectionRisks {...sectionProps} />
      <BriefSectionTimeline {...sectionProps} />
      <BriefSectionConstraints {...sectionProps} />

      <ToolLaunchLinks brief={brief} />

      <Card className="no-print">
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-content">Export history & test utilities</h2>
            <p className="text-xs text-content-muted">
              {(brief.exportHistory ?? []).length} export
              {(brief.exportHistory ?? []).length === 1 ? "" : "s"} recorded on this brief.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          {(brief.exportHistory ?? []).length > 0 ? (
            <ul className="space-y-1 text-xs text-content-muted">
              {(brief.exportHistory ?? [])
                .slice()
                .reverse()
                .slice(0, 5)
                .map((rec) => (
                  <li key={rec.id}>
                    <Badge tone="neutral">{rec.format}</Badge>{" "}
                    <span className="ml-1">{rec.filename ?? "(no filename)"}</span>{" "}
                    <span className="text-content-subtle">{formatIsoDateTime(rec.generatedAt)}</span>
                  </li>
                ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line-strong bg-surface-sunken px-3 py-2.5">
            <p className="flex-1 text-xs text-content-muted">
              <strong>Test utility.</strong> Lessons learned are normally written by the
              Post-Mortem Generator (PRD 7, not built yet). Add one here to exercise the
              carry-forward suggestion flow on your next {EVENT_TYPE_LABELS[brief.type]} brief.
            </p>
            <Button size="sm" onClick={addTestLesson}>
              Add carry-forward lesson
            </Button>
          </div>
        </CardBody>
      </Card>

      {exportOpen ? (
        <ExportDialog
          brief={brief}
          onClose={() => setExportOpen(false)}
          onBriefChange={(next) => {
            updateBrief(() => next);
            void flush();
          }}
        />
      ) : null}
    </div>
  );
}
