"use client";

/** Intake screen 2 — goals & objectives, with the FR-11 carry-forward lessons sidebar. */

import { getPreset } from "@event-toolkit/schema";
import { Field, TextArea } from "@event-toolkit/ui";
import { LessonSuggestions } from "../LessonSuggestions";
import { StringListEditor } from "../StringListEditor";
import type { LessonStepProps } from "./types";

export function GoalsStep({
  brief,
  onChange,
  highlightMissing,
  lessons,
  dismissedLessonIds,
  onAcceptLesson,
  onDismissLesson,
}: LessonStepProps) {
  const preset = getPreset(brief.type);
  const missingPrimary = highlightMissing.includes("goals.primaryObjective");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Field
          label="Primary objective"
          htmlFor="primary-objective"
          required
          error={missingPrimary ? "This field is required" : null}
          hint="One sentence: the single most important reason this event exists."
        >
          <TextArea
            id="primary-objective"
            rows={3}
            invalid={missingPrimary}
            value={brief.goals.primaryObjective}
            placeholder={preset.primaryObjectivePlaceholder}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                goals: { ...prev.goals, primaryObjective: e.target.value },
              }))
            }
          />
        </Field>

        <Field
          label="Secondary objectives"
          hint="Supporting outcomes. Press Enter or click Add for each one."
        >
          <StringListEditor
            values={brief.goals.objectives ?? []}
            placeholder="e.g. Recruit 10 customer references for case studies"
            emptyLabel="No secondary objectives yet."
            onChange={(objectives) =>
              onChange((prev) => ({ ...prev, goals: { ...prev.goals, objectives } }))
            }
          />
        </Field>

        <Field
          label="Business justification"
          htmlFor="business-justification"
          hint="Why this event, why now, and how it ties to broader company goals."
        >
          <TextArea
            id="business-justification"
            rows={4}
            value={brief.goals.businessJustification ?? ""}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                goals: { ...prev.goals, businessJustification: e.target.value },
              }))
            }
          />
        </Field>
      </div>

      <aside className="space-y-4">
        <LessonSuggestions
          lessons={lessons}
          dismissedIds={dismissedLessonIds}
          acceptedItems={brief.constraints.items ?? []}
          onAccept={onAcceptLesson}
          onDismiss={onDismissLesson}
        />
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
          <p className="font-medium text-slate-800">What happens next</p>
          <p className="mt-1">
            Your {getPreset(brief.type).label.toLowerCase()} preset already added{" "}
            {brief.successMetrics.length} success metric
            {brief.successMetrics.length === 1 ? "" : "s"} and {brief.riskRegister.length} risk
            {brief.riskRegister.length === 1 ? "" : "s"}. You&apos;ll be able to edit or delete
            all of them on the brief once it&apos;s generated.
          </p>
        </div>
      </aside>
    </div>
  );
}
