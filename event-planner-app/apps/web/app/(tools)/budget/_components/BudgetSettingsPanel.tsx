"use client";

/** The event-level variance threshold, plus the reforecast history for this budget. */

import type { BudgetSettings, ReforecastEvent } from "@event-toolkit/schema";
import { Badge, Button, Card, CardBody, CardHeader, Field, NumberInput } from "@event-toolkit/ui";
import { formatIsoDateTime, formatMoney } from "@/lib/format";

export function BudgetSettingsPanel({
  settings,
  reforecastHistory,
  onChange,
  onClose,
}: {
  settings: BudgetSettings;
  reforecastHistory: ReforecastEvent[];
  onChange: (next: BudgetSettings) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-content">Budget settings</h2>
          <p className="text-xs text-content-muted">
            The default threshold applies to every line item without its own override.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field
            label="Variance threshold"
            htmlFor="variance-threshold"
            className="w-52"
            hint={`Amber at ${settings.defaultVarianceThresholdPct}%, red at ${settings.defaultVarianceThresholdPct * 2}%.`}
          >
            <NumberInput
              id="variance-threshold"
              min={1}
              max={100}
              step={1}
              value={settings.defaultVarianceThresholdPct}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next >= 1) {
                  void onChange({ ...settings, defaultVarianceThresholdPct: Math.round(next) });
                }
              }}
            />
          </Field>
          <p className="mb-2 text-xs text-content-muted">
            Currency is {settings.currency}, taken from the brief. A budget is single-currency.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-content">Reforecast history</h3>
          {reforecastHistory.length === 0 ? (
            <p className="mt-1 text-sm text-content-muted">No reforecasts yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {[...reforecastHistory].reverse().map((event) => (
                <li key={event.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={event.action === "reforecasted" ? "success" : "neutral"}>
                      {event.action === "reforecasted" ? "Reforecast" : "Dismissed"}
                    </Badge>
                    <span className="text-xs text-content-muted">
                      {formatIsoDateTime(event.triggeredAt)} · brief v{event.briefVersionAtTrigger}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-content-muted">{event.triggerReason}</span>
                  {event.action === "reforecasted" &&
                  event.totalBudgetedBefore !== undefined &&
                  event.totalBudgetedAfter !== undefined ? (
                    <span className="mt-0.5 block text-xs text-content-muted">
                      Total budgeted {formatMoney(event.totalBudgetedBefore, settings.currency)} →{" "}
                      {formatMoney(event.totalBudgetedAfter, settings.currency)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
