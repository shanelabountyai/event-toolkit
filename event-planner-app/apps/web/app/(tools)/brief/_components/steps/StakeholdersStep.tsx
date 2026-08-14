"use client";

/** Intake screen 5 — stakeholders & RACI, seeded with the preset's suggested roles. */

import {
  RACI_LABELS,
  RACI_ROLES,
  getPreset,
  newStakeholder,
  presetStakeholders,
  type RaciRole,
} from "@event-toolkit/schema";
import { Button, EmptyRow, Select, Table, Td, TextInput, Th } from "@event-toolkit/ui";
import type { StepProps } from "./types";

export function StakeholdersStep({ brief, onChange }: StepProps) {
  const preset = getPreset(brief.type);
  const rows = brief.stakeholders;

  const update = (id: string, patch: Partial<(typeof rows)[number]>) =>
    onChange((prev) => ({
      ...prev,
      stakeholders: prev.stakeholders.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-content-muted">
        One RACI value per person for the event as a whole:{" "}
        {RACI_ROLES.map((r) => `${r} = ${RACI_LABELS[r]}`).join(", ")}. The preset&apos;s suggested
        roles are just prompts — any row still without a name is dropped when the brief is
        generated.
      </p>

      <div className="flex flex-wrap justify-end gap-2">
        {preset.stakeholders.length > 0 ? (
          <Button
            onClick={() =>
              onChange((prev) => ({
                ...prev,
                stakeholders: [...prev.stakeholders, ...presetStakeholders(prev.type)],
              }))
            }
          >
            Add {preset.label} starter roles
          </Button>
        ) : null}
        <Button
          variant="primary"
          onClick={() =>
            onChange((prev) => ({ ...prev, stakeholders: [...prev.stakeholders, newStakeholder()] }))
          }
        >
          Add stakeholder
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-surface">
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th className="w-40">RACI</Th>
              <Th>Department</Th>
              <Th>Email</Th>
              <Th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>No stakeholders yet.</EmptyRow>
            ) : null}
            {rows.map((s) => (
              <tr key={s.id}>
                <Td>
                  <TextInput
                    aria-label="Name"
                    value={s.name}
                    placeholder="Dana Rivera"
                    onChange={(e) => update(s.id, { name: e.target.value })}
                  />
                </Td>
                <Td>
                  <TextInput
                    aria-label="Role"
                    value={s.role}
                    placeholder="Field Marketing Manager"
                    onChange={(e) => update(s.id, { role: e.target.value })}
                  />
                </Td>
                <Td>
                  <Select
                    aria-label="RACI"
                    value={s.raci}
                    onChange={(e) => update(s.id, { raci: e.target.value as RaciRole })}
                  >
                    {RACI_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r} — {RACI_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <TextInput
                    aria-label="Department"
                    value={s.department ?? ""}
                    onChange={(e) => update(s.id, { department: e.target.value })}
                  />
                </Td>
                <Td>
                  <TextInput
                    aria-label="Email"
                    type="email"
                    value={s.email ?? ""}
                    onChange={(e) => update(s.id, { email: e.target.value })}
                  />
                </Td>
                <Td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onChange((prev) => ({
                        ...prev,
                        stakeholders: prev.stakeholders.filter((row) => row.id !== s.id),
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
    </div>
  );
}
