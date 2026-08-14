"use client";

/**
 * FR-5 — the inline-edit chrome shared by every brief section.
 *
 * A section renders read-only until "Edit" is pressed, then swaps to its form equivalent
 * without leaving the page. Save commits the section's draft to the brief; Cancel discards it.
 */

import { useState, type ReactNode } from "react";
import type { EventBrief } from "@event-toolkit/schema";
import { Button, Card, CardBody, CardFooter, CardHeader } from "@event-toolkit/ui";

export interface BriefSectionProps {
  brief: EventBrief;
  /** Commit an edited copy of the whole brief. */
  onSave: (next: EventBrief) => void;
}

export function SectionShell({
  id,
  title,
  description,
  editing,
  onEdit,
  onSave,
  onCancel,
  headerExtra,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-content">{title}</h2>
          {description ? <p className="text-xs text-content-muted">{description}</p> : null}
        </div>
        <div className="no-print flex items-center gap-2">
          {headerExtra}
          {editing ? null : (
            <Button size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody>{children}</CardBody>
      {editing ? (
        <CardFooter className="no-print flex justify-end gap-2">
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={onSave}>
            Save section
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

/** Hook that manages a per-section draft copy of the brief. */
export function useSectionDraft(brief: EventBrief, onSave: (next: EventBrief) => void) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EventBrief>(brief);

  return {
    editing,
    draft,
    /** Apply an updater to the draft (same signature as the intake steps' `onChange`). */
    updateDraft: (updater: (prev: EventBrief) => EventBrief) => setDraft((prev) => updater(prev)),
    start: () => {
      setDraft(brief);
      setEditing(true);
    },
    cancel: () => {
      setDraft(brief);
      setEditing(false);
    },
    commit: () => {
      onSave(draft);
      setEditing(false);
    },
  };
}

/** Read-view helper: a labelled definition row. */
export function ReadField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-content-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-content">{children}</dd>
    </div>
  );
}

/** Read-view helper: paragraphs from a plain-text field, or an em dash when empty. */
export function ReadText({ value, empty = "Not set" }: { value?: string | null; empty?: string }) {
  if (!value || value.trim() === "") {
    return <span className="text-sm italic text-content-subtle">{empty}</span>;
  }
  return (
    <div className="space-y-2 text-sm text-content">
      {value.split(/\n{2,}/).map((block, i) => (
        <p key={i} className="whitespace-pre-line">
          {block}
        </p>
      ))}
    </div>
  );
}
