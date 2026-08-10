"use client";

/** Intake screen 1 — event basics: name, type, dates, timezone, delivery mode, venue/platform. */

import {
  DELIVERY_MODES,
  DELIVERY_MODE_LABELS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  getPreset,
  presetBudgetAllocations,
  presetPersonas,
  presetRiskRegister,
  presetSuccessMetrics,
  type EventType,
  type FormatMode,
} from "@event-toolkit/schema";
import { DateInput, Field, NumberInput, Select, TextArea, TextInput } from "@event-toolkit/ui";
import type { StepProps } from "./types";

/** Common IANA zones offered as a datalist; the field accepts any string. */
function timezoneOptions(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  try {
    if (typeof intl.supportedValuesOf === "function") {
      return intl.supportedValuesOf("timeZone");
    }
  } catch {
    /* fall through */
  }
  return [
    "UTC",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
}

export function EventBasicsStep({ brief, onChange, highlightMissing }: StepProps) {
  const preset = getPreset(brief.type);
  const showVenue = brief.format.deliveryMode !== "virtual";
  const showPlatform = brief.format.deliveryMode !== "in_person";
  const missing = (path: string) => (highlightMissing.includes(path) ? "This field is required" : null);

  const setType = (type: EventType) => {
    onChange((prev) => {
      const next = { ...prev, type };
      // Only auto-apply preset content when the corresponding sections are still empty, so
      // switching type never destroys work the planner has already done.
      if (prev.successMetrics.length === 0) next.successMetrics = presetSuccessMetrics(type);
      if (prev.riskRegister.length === 0) next.riskRegister = presetRiskRegister(type);
      if ((prev.budget.allocations ?? []).length === 0) {
        next.budget = { ...prev.budget, allocations: presetBudgetAllocations(type) };
      }
      if ((prev.audience.targetPersonas ?? []).length === 0) {
        next.audience = { ...prev.audience, targetPersonas: presetPersonas(type) };
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Event name"
          htmlFor="event-name"
          required
          error={missing("name")}
          hint="How this event is referred to internally, e.g. 'Q4 Customer Summit 2026'."
          className="sm:col-span-2"
        >
          <TextInput
            id="event-name"
            value={brief.name}
            invalid={Boolean(missing("name"))}
            placeholder="Q4 Customer Summit 2026"
            onChange={(e) => onChange((prev) => ({ ...prev, name: e.target.value }))}
          />
        </Field>

        <Field
          label="Event type"
          htmlFor="event-type"
          required
          hint={preset.tagline}
        >
          <Select
            id="event-type"
            value={brief.type}
            onChange={(e) => setType(e.target.value as EventType)}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Delivery mode"
          htmlFor="delivery-mode"
          required
          error={missing("format.deliveryMode")}
        >
          <Select
            id="delivery-mode"
            value={brief.format.deliveryMode}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                format: { ...prev.format, deliveryMode: e.target.value as FormatMode },
              }))
            }
          >
            {DELIVERY_MODES.map((m) => (
              <option key={m} value={m}>
                {DELIVERY_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Start date"
          htmlFor="start-date"
          required
          error={missing("dates.eventStartDate")}
        >
          <DateInput
            id="start-date"
            value={brief.dates.eventStartDate}
            invalid={Boolean(missing("dates.eventStartDate"))}
            onChange={(e) => {
              const eventStartDate = e.target.value;
              onChange((prev) => ({
                ...prev,
                dates: {
                  ...prev.dates,
                  eventStartDate,
                  // Keep the end date sane: default it to the start, never leave it earlier.
                  eventEndDate:
                    !prev.dates.eventEndDate || prev.dates.eventEndDate < eventStartDate
                      ? eventStartDate
                      : prev.dates.eventEndDate,
                },
              }));
            }}
          />
        </Field>

        <Field
          label="End date"
          htmlFor="end-date"
          required
          error={
            missing("dates.eventEndDate") ??
            (brief.dates.eventStartDate &&
            brief.dates.eventEndDate &&
            brief.dates.eventEndDate < brief.dates.eventStartDate
              ? "End date cannot be before the start date"
              : null)
          }
          hint="Same as the start date for a single-day event."
        >
          <DateInput
            id="end-date"
            value={brief.dates.eventEndDate}
            min={brief.dates.eventStartDate || undefined}
            invalid={Boolean(missing("dates.eventEndDate"))}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                dates: { ...prev.dates, eventEndDate: e.target.value },
              }))
            }
          />
        </Field>

        <Field
          label="Timezone"
          htmlFor="timezone"
          required
          error={missing("dates.timezone")}
          hint="Detected from your browser. All dates in this brief are read in this zone."
        >
          <TextInput
            id="timezone"
            list="tz-options"
            value={brief.dates.timezone}
            invalid={Boolean(missing("dates.timezone"))}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                dates: { ...prev.dates, timezone: e.target.value },
              }))
            }
          />
          <datalist id="tz-options">
            {timezoneOptions().map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </Field>

        <Field label="Prepared by" htmlFor="created-by" hint="Optional — free text, no accounts in v1.">
          <TextInput
            id="created-by"
            value={brief.createdBy ?? ""}
            placeholder="Dana Rivera"
            onChange={(e) => onChange((prev) => ({ ...prev, createdBy: e.target.value }))}
          />
        </Field>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <legend className="px-1 text-sm font-medium text-slate-700">
          {showVenue && showPlatform
            ? "Venue and platform"
            : showVenue
              ? "Venue"
              : "Platform"}
        </legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={showVenue ? "Venue / platform name" : "Platform name"}
            htmlFor="venue-name"
          >
            <TextInput
              id="venue-name"
              value={brief.format.venueOrPlatform?.name ?? ""}
              placeholder={showVenue ? "Moscone Center" : "Zoom Webinar"}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  format: {
                    ...prev.format,
                    venueOrPlatform: { ...prev.format.venueOrPlatform, name: e.target.value },
                  },
                }))
              }
            />
          </Field>
          <Field label={showVenue ? "Location or URL" : "Platform URL"} htmlFor="venue-location">
            <TextInput
              id="venue-location"
              value={brief.format.venueOrPlatform?.locationOrUrl ?? ""}
              placeholder={showVenue ? "747 Howard St, San Francisco, CA" : "https://…"}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  format: {
                    ...prev.format,
                    venueOrPlatform: {
                      ...prev.format.venueOrPlatform,
                      locationOrUrl: e.target.value,
                    },
                  },
                }))
              }
            />
          </Field>
          <Field label="Capacity" htmlFor="venue-capacity" hint="Optional.">
            <NumberInput
              id="venue-capacity"
              min={0}
              value={brief.format.venueOrPlatform?.capacity ?? ""}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  format: {
                    ...prev.format,
                    venueOrPlatform: {
                      ...prev.format.venueOrPlatform,
                      capacity: e.target.value === "" ? undefined : Number(e.target.value),
                    },
                  },
                }))
              }
            />
          </Field>
          <Field label="Notes" htmlFor="venue-notes">
            <TextArea
              id="venue-notes"
              rows={2}
              value={brief.format.venueOrPlatform?.notes ?? ""}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  format: {
                    ...prev.format,
                    venueOrPlatform: { ...prev.format.venueOrPlatform, notes: e.target.value },
                  },
                }))
              }
            />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}
