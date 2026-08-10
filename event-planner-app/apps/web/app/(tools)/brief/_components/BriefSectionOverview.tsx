"use client";

/** Brief section — event basics (name, type, dates, delivery, venue/platform). */

import { DELIVERY_MODE_LABELS, EVENT_TYPE_LABELS } from "@event-toolkit/schema";
import { formatDateRange, formatIsoDateTime } from "@/lib/format";
import { EventBasicsStep } from "./steps/EventBasicsStep";
import { ReadField, SectionShell, useSectionDraft, type BriefSectionProps } from "./SectionShell";

export function BriefSectionOverview({ brief, onSave }: BriefSectionProps) {
  const section = useSectionDraft(brief, onSave);
  const venue = brief.format.venueOrPlatform;

  return (
    <SectionShell
      id="section-basics"
      title="Event basics"
      description="Identity, dates and delivery."
      editing={section.editing}
      onEdit={section.start}
      onSave={section.commit}
      onCancel={section.cancel}
    >
      {section.editing ? (
        <EventBasicsStep brief={section.draft} onChange={section.updateDraft} highlightMissing={[]} />
      ) : (
        <dl className="grid gap-4 sm:grid-cols-3">
          <ReadField label="Event name">{brief.name || "—"}</ReadField>
          <ReadField label="Event type">{EVENT_TYPE_LABELS[brief.type]}</ReadField>
          <ReadField label="Delivery mode">
            {DELIVERY_MODE_LABELS[brief.format.deliveryMode]}
          </ReadField>
          <ReadField label="Dates">{formatDateRange(brief)}</ReadField>
          <ReadField label="Timezone">{brief.dates.timezone || "—"}</ReadField>
          <ReadField label="Prepared by">{brief.createdBy || "—"}</ReadField>
          <ReadField label="Venue / platform">
            {venue?.name || venue?.locationOrUrl ? (
              <>
                {venue?.name}
                {venue?.name && venue?.locationOrUrl ? " — " : ""}
                {venue?.locationOrUrl}
                {venue?.capacity ? ` (capacity ${venue.capacity.toLocaleString()})` : ""}
              </>
            ) : (
              "—"
            )}
          </ReadField>
          <ReadField label="Created">{formatIsoDateTime(brief.createdAt)}</ReadField>
          <ReadField label="Last updated">
            {formatIsoDateTime(brief.updatedAt)}
            <span className="ml-1 text-xs text-slate-400">
              (revision {brief.version} · schema {brief.schemaVersion})
            </span>
          </ReadField>
        </dl>
      )}
    </SectionShell>
  );
}
