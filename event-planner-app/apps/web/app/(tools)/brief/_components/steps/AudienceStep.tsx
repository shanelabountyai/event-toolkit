"use client";

/** Intake screen 3 — target audience, size, segments and repeatable persona cards. */

import { getPreset, newPersona } from "@event-toolkit/schema";
import { Button, Field, NumberInput, TextArea, TextInput } from "@event-toolkit/ui";
import { StringListEditor } from "../StringListEditor";
import type { StepProps } from "./types";

export function AudienceStep({ brief, onChange, highlightMissing }: StepProps) {
  const preset = getPreset(brief.type);
  const personas = brief.audience.targetPersonas ?? [];
  const missingDescription = highlightMissing.includes("audience.description");

  const updatePersona = (index: number, patch: Partial<(typeof personas)[number]>) => {
    onChange((prev) => {
      const list = [...(prev.audience.targetPersonas ?? [])];
      list[index] = { ...list[index], ...patch };
      return { ...prev, audience: { ...prev.audience, targetPersonas: list } };
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Audience description"
          htmlFor="audience-description"
          required
          error={missingDescription ? "This field is required" : null}
          hint="Who is this event for? Roles, seniority, industry, region."
          className="sm:col-span-2"
        >
          <TextArea
            id="audience-description"
            rows={3}
            invalid={missingDescription}
            value={brief.audience.description}
            placeholder={preset.audiencePlaceholder}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                audience: { ...prev.audience, description: e.target.value },
              }))
            }
          />
        </Field>

        {/*
          The only two fields in this brief written in the attendee's language.
          Everything under Goals is internal — revenue targets, lead counts — and promo copy
          generated from those told prospects the reason to attend was "capture 60 qualified leads
          and influence $900K of pipeline". The generator reads these and nothing else.
        */}
        <Field
          label="Why should they come?"
          htmlFor="attendee-promise"
          className="sm:col-span-2"
          hint="One sentence, in their words, not yours. This is the only line the promo generator uses to sell the event — it will not borrow from your objectives."
        >
          <TextArea
            id="attendee-promise"
            rows={2}
            value={brief.audience.attendeeValue?.promise ?? ""}
            placeholder="See what three plants did to cut changeover time by half"
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                audience: {
                  ...prev.audience,
                  attendeeValue: { ...prev.audience.attendeeValue, promise: e.target.value },
                },
              }))
            }
          />
        </Field>

        <Field
          label="What do they leave with?"
          htmlFor="attendee-takeaways"
          className="sm:col-span-2"
          hint="One per line. These become the 'what you'll get' bullets in emails and the landing page."
        >
          <TextArea
            id="attendee-takeaways"
            rows={3}
            value={(brief.audience.attendeeValue?.takeaways ?? []).join("\n")}
            placeholder={"A benchmark of your changeover times against peers\nA teardown of the retrofit that paid back in 14 months"}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                audience: {
                  ...prev.audience,
                  attendeeValue: {
                    ...prev.audience.attendeeValue,
                    // Split on save rather than on every keystroke, so a trailing newline while
                    // typing the next line does not momentarily drop an empty bullet in.
                    takeaways: e.target.value.split("\n").map((t) => t.trim()).filter(Boolean),
                  },
                },
              }))
            }
          />
        </Field>

        <Field label="Estimated size" htmlFor="audience-size" hint="Optional headcount estimate.">
          <NumberInput
            id="audience-size"
            min={0}
            value={brief.audience.estimatedSize ?? ""}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                audience: {
                  ...prev.audience,
                  estimatedSize: e.target.value === "" ? undefined : Number(e.target.value),
                },
              }))
            }
          />
        </Field>

        <Field label="Segments" hint="e.g. existing customers, prospects, partners.">
          <StringListEditor
            values={brief.audience.segments ?? []}
            placeholder="existing customers"
            emptyLabel="No segments yet."
            onChange={(segments) =>
              onChange((prev) => ({ ...prev, audience: { ...prev.audience, segments } }))
            }
          />
        </Field>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-content">Target personas</h3>
            <p className="text-xs text-content-muted">
              Counts toward completeness. The {preset.label.toLowerCase()} preset added{" "}
              {preset.personas.length} starter persona
              {preset.personas.length === 1 ? "" : "s"} you can rewrite or delete.
            </p>
          </div>
          <Button
            onClick={() =>
              onChange((prev) => ({
                ...prev,
                audience: {
                  ...prev.audience,
                  targetPersonas: [...(prev.audience.targetPersonas ?? []), newPersona()],
                },
              }))
            }
          >
            Add persona
          </Button>
        </div>

        {personas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-content-muted">
            No personas yet — add at least one to reach 100% completeness.
          </p>
        ) : null}

        <div className="grid gap-4">
          {personas.map((persona, index) => (
            <div
              key={index}
              className="space-y-4 rounded-lg border border-line bg-surface p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Persona name" htmlFor={`persona-name-${index}`}>
                  <TextInput
                    id={`persona-name-${index}`}
                    value={persona.name}
                    placeholder="VP of Marketing, Mid-Market SaaS"
                    onChange={(e) => updatePersona(index, { name: e.target.value })}
                  />
                </Field>
                <Field label="Title" htmlFor={`persona-title-${index}`}>
                  <TextInput
                    id={`persona-title-${index}`}
                    value={persona.title ?? ""}
                    onChange={(e) => updatePersona(index, { title: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Description" htmlFor={`persona-desc-${index}`}>
                <TextArea
                  id={`persona-desc-${index}`}
                  rows={2}
                  value={persona.description ?? ""}
                  onChange={(e) => updatePersona(index, { description: e.target.value })}
                />
              </Field>
              <Field label="Pain points">
                <StringListEditor
                  values={persona.painPoints ?? []}
                  placeholder="What problem does this event solve for them?"
                  emptyLabel="No pain points yet."
                  onChange={(painPoints) => updatePersona(index, { painPoints })}
                />
              </Field>
              <div className="flex justify-end">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      audience: {
                        ...prev.audience,
                        targetPersonas: (prev.audience.targetPersonas ?? []).filter(
                          (_, i) => i !== index,
                        ),
                      },
                    }))
                  }
                >
                  Remove persona
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
