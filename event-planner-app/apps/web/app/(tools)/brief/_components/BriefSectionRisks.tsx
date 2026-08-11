"use client";

/** Brief section — risk register. */

import {
  LIKERT_LEVELS,
  RISK_STATUSES,
  RISK_STATUS_LABELS,
  getPreset,
  newRiskItem,
  presetRiskRegister,
  type LikertLevel,
  type RiskStatus,
} from "@event-toolkit/schema";
import { Button, EmptyRow, Select, Table, Td, TextInput, Th } from "@event-toolkit/ui";
import { LikertBadge } from "./badges";
import { SectionShell, useSectionDraft, type BriefSectionProps } from "./SectionShell";

export function BriefSectionRisks({ brief, onSave }: BriefSectionProps) {
  const section = useSectionDraft(brief, onSave);
  const rows = section.editing ? section.draft.riskRegister : brief.riskRegister;
  const preset = getPreset(brief.type);

  const update = (id: string, patch: Partial<(typeof rows)[number]>) =>
    section.updateDraft((prev) => ({
      ...prev,
      riskRegister: prev.riskRegister.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  return (
    <SectionShell
      id="section-risks"
      title="Risk register"
      description="Status transitions beyond 'open' are owned by the Run-of-Show tool."
      editing={section.editing}
      onEdit={section.start}
      onSave={section.commit}
      onCancel={section.cancel}
    >
      {section.editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            {preset.risks.length > 0 ? (
              <Button
                onClick={() =>
                  section.updateDraft((prev) => ({
                    ...prev,
                    riskRegister: [...prev.riskRegister, ...presetRiskRegister(prev.type)],
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
                  riskRegister: [...prev.riskRegister, newRiskItem()],
                }))
              }
            >
              Add risk
            </Button>
          </div>
          <div className="grid gap-4">
            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-content-muted">
                No risks yet.
              </p>
            ) : null}
            {rows.map((r) => (
              <div key={r.id} className="space-y-3 rounded-lg border border-line p-3">
                <TextInput
                  aria-label="Risk"
                  value={r.risk}
                  placeholder="What could go wrong?"
                  onChange={(e) => update(r.id, { risk: e.target.value })}
                />
                <div className="grid gap-3 sm:grid-cols-4">
                  <Select
                    aria-label="Likelihood"
                    value={r.likelihood}
                    onChange={(e) => update(r.id, { likelihood: e.target.value as LikertLevel })}
                  >
                    {LIKERT_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        Likelihood: {l}
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label="Impact"
                    value={r.impact}
                    onChange={(e) => update(r.id, { impact: e.target.value as LikertLevel })}
                  >
                    {LIKERT_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        Impact: {l}
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label="Status"
                    value={r.status}
                    onChange={(e) => update(r.id, { status: e.target.value as RiskStatus })}
                  >
                    {RISK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {RISK_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                  <TextInput
                    aria-label="Owner"
                    value={r.owner ?? ""}
                    placeholder="Owner"
                    onChange={(e) => update(r.id, { owner: e.target.value })}
                  />
                </div>
                <TextInput
                  aria-label="Mitigation"
                  value={r.mitigation ?? ""}
                  placeholder="Mitigation / contingency"
                  onChange={(e) => update(r.id, { mitigation: e.target.value })}
                />
                <div className="flex justify-end">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      section.updateDraft((prev) => ({
                        ...prev,
                        riskRegister: prev.riskRegister.filter((row) => row.id !== r.id),
                      }))
                    }
                  >
                    Remove risk
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Risk</Th>
              <Th className="w-28">Likelihood</Th>
              <Th className="w-28">Impact</Th>
              <Th className="w-28">Status</Th>
              <Th className="w-32">Owner</Th>
              <Th>Mitigation</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>
                No risks yet — add at least one to reach 100% completeness.
              </EmptyRow>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.risk}</Td>
                <Td>
                  <LikertBadge level={r.likelihood} />
                </Td>
                <Td>
                  <LikertBadge level={r.impact} />
                </Td>
                <Td className="text-content-muted">{RISK_STATUS_LABELS[r.status]}</Td>
                <Td className="text-content-muted">{r.owner || "—"}</Td>
                <Td className="text-content-muted">{r.mitigation || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </SectionShell>
  );
}
