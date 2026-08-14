"use client";

/** Brief section — audience and personas. */

import { AudienceStep } from "./steps/AudienceStep";
import { ReadField, ReadText, SectionShell, useSectionDraft, type BriefSectionProps } from "./SectionShell";

export function BriefSectionAudience({ brief, onSave }: BriefSectionProps) {
  const section = useSectionDraft(brief, onSave);
  const personas = (brief.audience.targetPersonas ?? []).filter((p) => p.name.trim() !== "");
  const segments = (brief.audience.segments ?? []).filter((s) => s.trim() !== "");
  const takeaways = (brief.audience.attendeeValue?.takeaways ?? []).filter((t) => t.trim() !== "");

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

          {/*
            Shown here because it is the only part of the brief written in the attendee's language,
            and because the promo generator uses it and nothing else. A field you can type and then
            never see again reads as ignored.
          */}
          <ReadField label="Why should they come?">
            <ReadText
              value={brief.audience.attendeeValue?.promise ?? ""}
              empty="Not written yet — promo copy will show a placeholder until it is"
            />
          </ReadField>
          <ReadField label="What they leave with">
            {takeaways.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {takeaways.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              "—"
            )}
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
              <span className="text-sm italic text-content-subtle">None yet</span>
            ) : (
              <div className="mt-1 grid gap-3 sm:grid-cols-2">
                {personas.map((p, i) => (
                  <div key={i} className="rounded-lg border border-line p-3">
                    <p className="text-sm font-medium text-content">
                      {p.name}
                      {p.title ? <span className="font-normal text-content-muted"> — {p.title}</span> : null}
                    </p>
                    {p.description ? (
                      <p className="mt-1 whitespace-pre-line text-sm text-content-muted">
                        {p.description}
                      </p>
                    ) : null}
                    {(p.painPoints ?? []).filter((x) => x.trim() !== "").length > 0 ? (
                      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-content-muted">
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
