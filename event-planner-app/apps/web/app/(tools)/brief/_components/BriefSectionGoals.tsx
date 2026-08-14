"use client";

/** Brief section — objectives. */

import { GoalsStep } from "./steps/GoalsStep";
import { ReadField, ReadText, SectionShell, useSectionDraft, type BriefSectionProps } from "./SectionShell";

const NO_LESSONS = {
  lessons: [],
  dismissedLessonIds: [],
  onAcceptLesson: () => {},
  onDismissLesson: () => {},
};

export function BriefSectionGoals({ brief, onSave }: BriefSectionProps) {
  const section = useSectionDraft(brief, onSave);
  const objectives = (brief.goals.objectives ?? []).filter((o) => o.trim() !== "");

  return (
    <SectionShell
      id="section-goals"
      title="Objectives"
      description="Why this event exists."
      editing={section.editing}
      onEdit={section.start}
      onSave={section.commit}
      onCancel={section.cancel}
    >
      {section.editing ? (
        <GoalsStep
          brief={section.draft}
          onChange={section.updateDraft}
          highlightMissing={[]}
          {...NO_LESSONS}
        />
      ) : (
        <div className="space-y-4">
          <ReadField label="Primary objective">
            <ReadText value={brief.goals.primaryObjective} empty="No primary objective set" />
          </ReadField>
          <ReadField label="Secondary objectives">
            {objectives.length === 0 ? (
              <span className="text-sm italic text-content-subtle">None</span>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            )}
          </ReadField>
          <ReadField label="Business justification">
            <ReadText value={brief.goals.businessJustification} empty="Not provided" />
          </ReadField>
        </div>
      )}
    </SectionShell>
  );
}
