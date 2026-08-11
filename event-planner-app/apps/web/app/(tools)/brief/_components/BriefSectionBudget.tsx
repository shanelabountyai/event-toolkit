"use client";

/** Brief section — budget summary (planned only; actuals belong to the Budget tool). */

import { EmptyRow, Table, Td, Th } from "@event-toolkit/ui";
import { formatMoney, sumPlanned } from "@/lib/format";
import { BudgetStep } from "./steps/BudgetStep";
import { ReadField, ReadText, SectionShell, useSectionDraft, type BriefSectionProps } from "./SectionShell";

export function BriefSectionBudget({ brief, onSave }: BriefSectionProps) {
  const section = useSectionDraft(brief, onSave);
  const currency = brief.budget.currency || "USD";
  const allocations = (brief.budget.allocations ?? []).filter((a) => a.category.trim() !== "");

  return (
    <SectionShell
      id="section-budget"
      title="Budget"
      description="High-level planned figures. Actuals are written by the Budget Builder & Tracker."
      editing={section.editing}
      onEdit={section.start}
      onSave={section.commit}
      onCancel={section.cancel}
    >
      {section.editing ? (
        <BudgetStep brief={section.draft} onChange={section.updateDraft} highlightMissing={[]} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <ReadField label="Total planned budget">
              {formatMoney(brief.budget.totalBudget ?? null, currency)}
            </ReadField>
            <ReadField label="Currency">{currency}</ReadField>
            <ReadField label="Allocated across categories">
              {formatMoney(sumPlanned(brief), currency)}
            </ReadField>
          </div>

          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th className="w-32 text-right">Planned</Th>
                <Th className="w-32 text-right">Actual</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {allocations.length === 0 ? (
                <EmptyRow colSpan={4}>No budget categories.</EmptyRow>
              ) : null}
              {allocations.map((a) => (
                <tr key={a.id}>
                  <Td>{a.category}</Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(a.plannedAmount, currency)}
                  </Td>
                  <Td className="text-right tabular-nums text-content-subtle">
                    {a.actualAmount === null || a.actualAmount === undefined
                      ? "—"
                      : formatMoney(a.actualAmount, currency)}
                  </Td>
                  <Td className="text-content-muted">{a.notes || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <ReadField label="Notes">
            <ReadText value={brief.budget.notes} empty="No budget notes" />
          </ReadField>
        </div>
      )}
    </SectionShell>
  );
}
