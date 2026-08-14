"use client";

/** FR-5 — the scoring rubric, with a live tier preview so the effect of a change is visible. */

import {
  tierCounts,
  type LeadRecord,
  type ScoringRubric,
  type ScoringRule,
} from "@event-toolkit/lead-triage-core";
import { Badge, Button, Card, CardBody, CardHeader, NumberInput, Table, Td, Th, TextInput } from "@event-toolkit/ui";

export function RubricEditor({
  rubric,
  leads,
  personaTitlesAvailable,
  onChange,
}: {
  rubric: ScoringRubric;
  leads: LeadRecord[];
  personaTitlesAvailable: boolean;
  onChange: (next: ScoringRubric) => void | Promise<void>;
}) {
  const counts = tierCounts(leads);

  const patchRule = (id: string, changes: Partial<ScoringRule>) =>
    void onChange({
      ...rubric,
      rules: rubric.rules.map((rule) => (rule.id === id ? { ...rule, ...changes } : rule)),
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-base font-semibold text-content">Scoring rubric</h2>
            <p className="text-xs text-content-muted">
              Every change re-scores the whole pool immediately — no re-import needed.
            </p>
          </div>
          <span className="flex gap-2">
            <Badge tone="danger">{counts.hot} hot</Badge>
            <Badge tone="warning">{counts.warm} warm</Badge>
            <Badge tone="neutral">{counts.cold} cold</Badge>
          </span>
        </CardHeader>
        <CardBody>
          <Table>
            <thead>
              <tr>
                <Th className="w-16">On</Th>
                <Th>Rule</Th>
                <Th className="w-28 text-right">Points each</Th>
                <Th className="w-28 text-right">Flat points</Th>
                <Th className="w-24 text-right">Cap</Th>
              </tr>
            </thead>
            <tbody>
              {rubric.rules.map((rule) => {
                const usesPerUnit = rule.signal === "boothInteractions" || rule.signal === "sessionsAttended";
                const unavailable = rule.signal === "personaTitleMatch" && !personaTitlesAvailable;
                return (
                  <tr key={rule.id}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        disabled={unavailable}
                        aria-label={`Enable ${rule.label}`}
                        onChange={(e) => patchRule(rule.id, { enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-line-strong"
                      />
                    </Td>
                    <Td>
                      <TextInput
                        value={rule.label}
                        aria-label="Rule label"
                        onChange={(e) => patchRule(rule.id, { label: e.target.value })}
                      />
                      {unavailable ? (
                        <span className="mt-1 block text-xs text-content-muted">
                          Needs a linked brief with target personas.
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      {usesPerUnit || rule.signal === "customSignal" ? (
                        <NumberInput
                          className="text-right"
                          value={rule.pointsPerUnit ?? 0}
                          aria-label="Points per unit"
                          onChange={(e) => patchRule(rule.id, { pointsPerUnit: Number(e.target.value) || 0 })}
                        />
                      ) : (
                        <span className="block text-right text-xs text-content-subtle">—</span>
                      )}
                    </Td>
                    <Td>
                      {!usesPerUnit ? (
                        <NumberInput
                          className="text-right"
                          value={rule.flatPoints ?? 0}
                          aria-label="Flat points"
                          onChange={(e) => patchRule(rule.id, { flatPoints: Number(e.target.value) || 0 })}
                        />
                      ) : (
                        <span className="block text-right text-xs text-content-subtle">—</span>
                      )}
                    </Td>
                    <Td>
                      {usesPerUnit ? (
                        <NumberInput
                          className="text-right"
                          value={rule.cap ?? 0}
                          aria-label="Cap"
                          onChange={(e) => patchRule(rule.id, { cap: Number(e.target.value) || 0 })}
                        />
                      ) : (
                        <span className="block text-right text-xs text-content-subtle">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-content">Tier thresholds</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm text-content-muted">
              <span className="block text-xs text-content-muted">Hot at or above</span>
              <NumberInput
                className="mt-1 w-28 text-right"
                value={rubric.tierThresholds.hot}
                aria-label="Hot threshold"
                onChange={(e) =>
                  void onChange({
                    ...rubric,
                    tierThresholds: { ...rubric.tierThresholds, hot: Number(e.target.value) || 0 },
                  })
                }
              />
            </label>
            <label className="text-sm text-content-muted">
              <span className="block text-xs text-content-muted">Warm at or above</span>
              <NumberInput
                className="mt-1 w-28 text-right"
                value={rubric.tierThresholds.warm}
                aria-label="Warm threshold"
                onChange={(e) =>
                  void onChange({
                    ...rubric,
                    tierThresholds: { ...rubric.tierThresholds, warm: Number(e.target.value) || 0 },
                  })
                }
              />
            </label>
            <p className="mb-2 text-xs text-content-muted">
              Anything below the warm threshold is cold. Defaults of 70 / 40 are a documented
              starting point, not a validated model.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export { Button };
