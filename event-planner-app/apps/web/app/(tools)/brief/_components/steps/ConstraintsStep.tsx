"use client";

/** Intake screen 6 — constraints, pre-filled with any carry-forward lessons accepted earlier. */

import { Field, TextArea } from "@event-toolkit/ui";
import { LessonSuggestions } from "../LessonSuggestions";
import { StringListEditor } from "../StringListEditor";
import type { LessonStepProps } from "./types";

export function ConstraintsStep({
  brief,
  onChange,
  lessons,
  dismissedLessonIds,
  onAcceptLesson,
  onDismissLesson,
}: LessonStepProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Field
          label="Constraints"
          hint="One per entry — budget caps, compliance requirements, immovable dates, staffing limits."
        >
          <StringListEditor
            values={brief.constraints.items ?? []}
            placeholder="e.g. Exec sponsor must be on-site for the keynote"
            emptyLabel="No constraints yet. Anything you accepted from past lessons appears here."
            onChange={(items) =>
              onChange((prev) => ({ ...prev, constraints: { ...prev.constraints, items } }))
            }
          />
        </Field>

        <Field
          label="Notes"
          htmlFor="constraints-notes"
          hint="Anything that doesn't fit neatly as a single constraint."
        >
          <TextArea
            id="constraints-notes"
            rows={4}
            value={brief.constraints.notes ?? ""}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                constraints: { ...prev.constraints, notes: e.target.value },
              }))
            }
          />
        </Field>
      </div>

      <aside>
        <LessonSuggestions
          lessons={lessons}
          dismissedIds={dismissedLessonIds}
          acceptedItems={brief.constraints.items ?? []}
          onAccept={onAcceptLesson}
          onDismiss={onDismissLesson}
        />
      </aside>
    </div>
  );
}
