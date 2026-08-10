"use client";

/** Brief section — success metrics (targets only; `actual` is owned by downstream tools). */

import { newSuccessMetric, presetSuccessMetrics, getPreset } from "@event-toolkit/schema";
import { Button, EmptyRow, NumberInput, Table, Td, TextInput, Th } from "@event-toolkit/ui";
import { formatMetricValue } from "@/lib/format";
import { SectionShell, useSectionDraft, type BriefSectionProps } from "./SectionShell";

export function BriefSectionMetrics({ brief, onSave }: BriefSectionProps) {
  const section = useSectionDraft(brief, onSave);
  const rows = section.editing ? section.draft.successMetrics : brief.successMetrics;
  const preset = getPreset(brief.type);

  const update = (id: string, patch: Partial<(typeof rows)[number]>) =>
    section.updateDraft((prev) => ({
      ...prev,
      successMetrics: prev.successMetrics.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));

  return (
    <SectionShell
      id="section-metrics"
      title="Success metrics"
      description="How we'll know this event worked. Actuals are filled in post-event by the ROI report."
      editing={section.editing}
      onEdit={section.start}
      onSave={section.commit}
      onCancel={section.cancel}
    >
      {section.editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            {preset.successMetrics.length > 0 ? (
              <Button
                onClick={() =>
                  section.updateDraft((prev) => ({
                    ...prev,
                    successMetrics: [...prev.successMetrics, ...presetSuccessMetrics(prev.type)],
                  }))
                }
              >
                Add {preset.label} defaults
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() =>
                section.updateDraft((prev) => ({
                  ...prev,
                  successMetrics: [...prev.successMetrics, newSuccessMetric()],
                }))
              }
            >
              Add metric
            </Button>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Metric</Th>
                <Th className="w-28">Target</Th>
                <Th className="w-28">Unit</Th>
                <Th>Notes</Th>
                <Th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <EmptyRow colSpan={5}>No metrics yet.</EmptyRow> : null}
              {rows.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <TextInput
                      aria-label="Metric"
                      value={m.metric}
                      placeholder="Registrations"
                      onChange={(e) => update(m.id, { metric: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <NumberInput
                      aria-label="Target"
                      value={Number.isFinite(m.target) ? m.target : 0}
                      onChange={(e) =>
                        update(m.id, { target: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                    />
                  </Td>
                  <Td>
                    <TextInput
                      aria-label="Unit"
                      value={m.unit ?? ""}
                      placeholder="count"
                      onChange={(e) => update(m.id, { unit: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <TextInput
                      aria-label="Notes"
                      value={m.notes ?? ""}
                      onChange={(e) => update(m.id, { notes: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        section.updateDraft((prev) => ({
                          ...prev,
                          successMetrics: prev.successMetrics.filter((row) => row.id !== m.id),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Metric</Th>
              <Th className="w-32 text-right">Target</Th>
              <Th className="w-32 text-right">Actual</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={4}>
                No success metrics yet — add at least one to reach 100% completeness.
              </EmptyRow>
            ) : null}
            {rows.map((m) => (
              <tr key={m.id}>
                <Td className="font-medium">{m.metric}</Td>
                <Td className="text-right tabular-nums">{formatMetricValue(m.target, m.unit)}</Td>
                <Td className="text-right tabular-nums text-slate-400">
                  {m.actual === null || m.actual === undefined
                    ? "—"
                    : formatMetricValue(m.actual, m.unit)}
                </Td>
                <Td className="text-slate-600">{m.notes || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </SectionShell>
  );
}
