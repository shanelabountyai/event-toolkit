"use client";

/** Brief section — audience and personas. */

import { AudienceStep } from "./steps/AudienceStep";
import { ReadField, ReadText, SectionShell, useSectionDraft, type BriefSectionProps } from "./SectionShell";

export function BriefSectionAudience({ brief, onSave }: BriefSectionProps) {
  const section = useSectionDraft(brief, onSave);
  const personas = (brief.audience.targetPersonas ?? []).filter((p) => p.name.trim() !== "");
  const segments = (brief.audience.segments ?? []).filter((s) => s.trim() !== "");

  return (
    <SectionShell
      id="section-audience"
      title="Audience & personas"
      description="Who the event is for."
      editing={section.editing}
      onEdit={section.start}
      onSave={section.commit}
      onCancel={section.cancel}
    >
      {section.editing ? (
        <AudienceStep brief={section.draft} onChange={section.updateDraft} highlightMissing={[]} />
      ) : (
        <div className="space-y-4">
          <ReadField label="Description">
            <ReadText value={brief.audience.description} empty="No audience described" />
          </ReadField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ReadField label="Estimated size">
              {brief.audience.estimatedSize !== undefined && brief.audience.estimatedSize !== null
                ? brief.audience.estimatedSize.toLocaleString()
                : "—"}
            </ReadField>
            <ReadField label="Segments">
              {segments.length > 0 ? segments.join(", ") : "—"}
            </ReadField>
          </div>
          <ReadField label="Target personas">
            {personas.length === 0 ? (
              <span className="text-sm italic text-slate-400">None yet</span>
            ) : (
              <div className="mt-1 grid gap-3 sm:grid-cols-2">
                {personas.map((p, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium text-slate-900">
                      {p.name}
                      {p.title ? <span className="font-normal text-slate-500"> — {p.title}</span> : null}
                    </p>
                    {p.description ? (
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                        {p.description}
                      </p>
                    ) : null}
                    {(p.painPoints ?? []).filter((x) => x.trim() !== "").length > 0 ? (
                      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                        {(p.painPoints ?? [])
                          .filter((x) => x.trim() !== "")
                          .map((pp, j) => (
                            <li key={j}>{pp}</li>
                          ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </ReadField>
        </div>
      )}
    </SectionShell>
  );
}
