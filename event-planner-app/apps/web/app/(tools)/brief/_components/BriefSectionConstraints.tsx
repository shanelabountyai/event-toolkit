"use client";

/** Brief section — constraints and any lessons carried forward into this brief. */

import { ConstraintsStep } from "./steps/ConstraintsStep";
import { ReadField, ReadText, SectionShell, useSectionDraft, type BriefSectionProps } from "./SectionShell";

const NO_LESSONS = {
  lessons: [],
  dismissedLessonIds: [],
  onAcceptLesson: () => {},
  onDismissLesson: () => {},
};

export function BriefSectionConstraints({ brief, onSave }: BriefSectionProps) {
  const section = useSectionDraft(brief, onSave);
  const items = (brief.constraints.items ?? []).filter((c) => c.trim() !== "");
  const lessons = (brief.carryForwardLessons ?? []).filter((l) => l.lesson.trim() !== "");

  return (
    <SectionShell
      id="section-constraints"
      title="Constraints"
      description="Limits the plan has to respect."
      editing={section.editing}
      onEdit={section.start}
      onSave={section.commit}
      onCancel={section.cancel}
    >
      {section.editing ? (
        <ConstraintsStep
          brief={section.draft}
          onChange={section.updateDraft}
          highlightMissing={[]}
          {...NO_LESSONS}
        />
      ) : (
        <div className="space-y-4">
          <ReadField label="Constraints">
            {items.length === 0 ? (
              <span className="text-sm italic text-content-subtle">None recorded</span>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {items.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </ReadField>
          <ReadField label="Notes">
            <ReadText value={brief.constraints.notes} empty="No notes" />
          </ReadField>
          {lessons.length > 0 ? (
            <ReadField label="Lessons carried forward">
              <ul className="list-disc space-y-1 pl-5">
                {lessons.map((l) => (
                  <li key={l.id}>
                    {l.lesson}
                    {l.category ? (
                      <span className="ml-1 text-xs text-content-muted">({l.category})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ReadField>
          ) : null}
        </div>
      )}
    </SectionShell>
  );
}
