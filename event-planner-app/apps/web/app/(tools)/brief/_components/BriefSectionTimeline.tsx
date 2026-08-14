"use client";

/** Brief section — timeline, grouped by phase in the read view. */

import {
  EVENT_PHASES,
  EVENT_PHASE_LABELS,
  MILESTONE_STATUSES,
  MILESTONE_STATUS_LABELS,
  newMilestone,
  presetMilestones,
  getPreset,
  type EventPhase,
  type MilestoneStatus,
} from "@event-toolkit/schema";
import { Badge, Button, DateInput, EmptyRow, Select, Table, Td, TextInput, Th } from "@event-toolkit/ui";
import { formatIsoDate } from "@/lib/format";
import { SectionShell, useSectionDraft, type BriefSectionProps } from "./SectionShell";

export function BriefSectionTimeline({ brief, onSave }: BriefSectionProps) {
  const section = useSectionDraft(brief, onSave);
  const rows = section.editing ? section.draft.timeline.milestones : brief.timeline.milestones;
  const preset = getPreset(brief.type);

  const update = (id: string, patch: Partial<(typeof rows)[number]>) =>
    section.updateDraft((prev) => ({
      ...prev,
      timeline: {
        milestones: prev.timeline.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      },
    }));

  const grouped = EVENT_PHASES.map((phase) => ({
    phase,
    rows: rows
      .filter((m) => m.phase === phase)
      .slice()
      .sort((a, b) => (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0)),
  })).filter((group) => group.rows.length > 0);

  return (
    <SectionShell
      id="section-timeline"
      title="Timeline"
      description="High-level milestones across pre-event, during-event and post-event phases."
      editing={section.editing}
      onEdit={section.start}
      onSave={section.commit}
      onCancel={section.cancel}
    >
      {section.editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            {preset.milestones.length > 0 ? (
              <Button
                onClick={() =>
                  section.updateDraft((prev) => ({
                    ...prev,
                    timeline: {
                      milestones: [
                        ...prev.timeline.milestones,
                        ...presetMilestones(
                          prev.type,
                          prev.dates.eventStartDate,
                          prev.dates.eventEndDate,
                        ),
                      ],
                    },
                  }))
                }
                disabled={!section.draft.dates.eventStartDate}
                title={
                  section.draft.dates.eventStartDate
                    ? undefined
                    : "Set the event start date first — preset milestones are dated relative to it."
                }
              >
                Add {preset.label} milestones
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() =>
                section.updateDraft((prev) => ({
                  ...prev,
                  timeline: {
                    milestones: [
                      ...prev.timeline.milestones,
                      newMilestone({
                        targetDate: prev.dates.eventStartDate || undefined,
                      }),
                    ],
                  },
                }))
              }
            >
              Add milestone
            </Button>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Milestone</Th>
                <Th className="w-40">Phase</Th>
                <Th className="w-40">Target date</Th>
                <Th className="w-40">Status</Th>
                <Th className="w-32">Owner</Th>
                <Th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <EmptyRow colSpan={6}>No milestones yet.</EmptyRow> : null}
              {rows.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <TextInput
                      aria-label="Milestone"
                      value={m.label}
                      placeholder="Venue contract signed"
                      onChange={(e) => update(m.id, { label: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <Select
                      aria-label="Phase"
                      value={m.phase}
                      onChange={(e) => update(m.id, { phase: e.target.value as EventPhase })}
                    >
                      {EVENT_PHASES.map((p) => (
                        <option key={p} value={p}>
                          {EVENT_PHASE_LABELS[p]}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <DateInput
                      aria-label="Target date"
                      value={m.targetDate}
                      onChange={(e) => update(m.id, { targetDate: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <Select
                      aria-label="Status"
                      value={m.status}
                      onChange={(e) => update(m.id, { status: e.target.value as MilestoneStatus })}
                    >
                      {MILESTONE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {MILESTONE_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <TextInput
                      aria-label="Owner"
                      value={m.owner ?? ""}
                      onChange={(e) => update(m.id, { owner: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        section.updateDraft((prev) => ({
                          ...prev,
                          timeline: {
                            milestones: prev.timeline.milestones.filter((row) => row.id !== m.id),
                          },
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
      ) : grouped.length === 0 ? (
        <p className="text-sm italic text-content-subtle">
          No milestones yet — add at least one to reach 100% completeness.
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.phase}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">
                {EVENT_PHASE_LABELS[group.phase]}
              </h3>
              <Table>
                <thead>
                  <tr>
                    <Th>Milestone</Th>
                    <Th className="w-40">Target date</Th>
                    <Th className="w-32">Owner</Th>
                    <Th className="w-32">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((m) => (
                    <tr key={m.id}>
                      <Td className="font-medium">{m.label}</Td>
                      <Td className="tabular-nums">{formatIsoDate(m.targetDate)}</Td>
                      <Td className="text-content-muted">{m.owner || "—"}</Td>
                      <Td>
                        <Badge tone={m.status === "at_risk" ? "danger" : m.status === "done" ? "success" : "neutral"}>
                          {MILESTONE_STATUS_LABELS[m.status]}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
