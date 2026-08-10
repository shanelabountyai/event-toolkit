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
            <h3 className="text-sm font-semibold text-slate-800">Target personas</h3>
            <p className="text-xs text-slate-500">
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
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            No personas yet — add at least one to reach 100% completeness.
          </p>
        ) : null}

        <div className="grid gap-4">
          {personas.map((persona, index) => (
            <div
              key={index}
              className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
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
