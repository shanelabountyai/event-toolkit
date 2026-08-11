"use client";

/** Brief section — stakeholders / RACI table. */

import { RACI_LABELS } from "@event-toolkit/schema";
import { Badge, EmptyRow, Table, Td, Th } from "@event-toolkit/ui";
import { StakeholdersStep } from "./steps/StakeholdersStep";
import { SectionShell, useSectionDraft, type BriefSectionProps } from "./SectionShell";

export function BriefSectionStakeholders({ brief, onSave }: BriefSectionProps) {
  const section = useSectionDraft(brief, onSave);

  return (
    <SectionShell
      id="section-stakeholders"
      title="Stakeholders & RACI"
      description="One RACI designation per person for the event as a whole."
      editing={section.editing}
      onEdit={section.start}
      onSave={section.commit}
      onCancel={section.cancel}
    >
      {section.editing ? (
        <StakeholdersStep brief={section.draft} onChange={section.updateDraft} highlightMissing={[]} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th className="w-40">RACI</Th>
              <Th>Department</Th>
              <Th>Email</Th>
            </tr>
          </thead>
          <tbody>
            {brief.stakeholders.length === 0 ? (
              <EmptyRow colSpan={5}>
                No stakeholders yet — add at least one to reach 100% completeness.
              </EmptyRow>
            ) : null}
            {brief.stakeholders.map((s) => (
              <tr key={s.id}>
                <Td className="font-medium">{s.name || "—"}</Td>
                <Td>{s.role || "—"}</Td>
                <Td>
                  <Badge tone={s.raci === "A" ? "warning" : s.raci === "R" ? "info" : "neutral"}>
                    {s.raci} — {RACI_LABELS[s.raci]}
                  </Badge>
                </Td>
                <Td className="text-content-muted">{s.department || "—"}</Td>
                <Td className="text-content-muted">{s.email || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </SectionShell>
  );
}
