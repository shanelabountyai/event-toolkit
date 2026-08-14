"use client";

/** Intake screen 4 — high-level budget: total, currency and preset category placeholders. */

import { newBudgetAllocation } from "@event-toolkit/schema";
import {
  Button,
  Field,
  NumberInput,
  Table,
  Td,
  TextArea,
  TextInput,
  Th,
  EmptyRow,
} from "@event-toolkit/ui";
import { formatMoney, sumPlanned } from "@/lib/format";
import type { StepProps } from "./types";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "SGD", "INR", "CHF", "SEK"];

export function BudgetStep({ brief, onChange, highlightMissing }: StepProps) {
  const allocations = brief.budget.allocations ?? [];
  const currency = brief.budget.currency || "USD";
  const missingCurrency = highlightMissing.includes("budget.currency");
  const allocated = sumPlanned(brief);

  const updateAllocation = (id: string, patch: Partial<(typeof allocations)[number]>) =>
    onChange((prev) => ({
      ...prev,
      budget: {
        ...prev.budget,
        allocations: (prev.budget.allocations ?? []).map((a) =>
          a.id === id ? { ...a, ...patch } : a,
        ),
      },
    }));

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-accent/20 bg-accent-subtle px-4 py-3 text-sm text-accent-text">
        High-level only — detailed vendor budgets, commitments and actuals are managed in the
        Budget Builder &amp; Tracker (coming soon). Leave categories at 0 if you don&apos;t know
        yet.
      </p>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Total budget" htmlFor="total-budget" hint="Optional at brief time.">
          <NumberInput
            id="total-budget"
            min={0}
            value={brief.budget.totalBudget ?? ""}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                budget: {
                  ...prev.budget,
                  totalBudget: e.target.value === "" ? undefined : Number(e.target.value),
                },
              }))
            }
          />
        </Field>
        <Field
          label="Currency"
          htmlFor="currency"
          required
          error={missingCurrency ? "This field is required" : null}
          hint="ISO 4217 code for every monetary field in this brief."
        >
          <TextInput
            id="currency"
            list="currency-options"
            value={brief.budget.currency}
            invalid={missingCurrency}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                budget: { ...prev.budget, currency: e.target.value.toUpperCase() },
              }))
            }
          />
          <datalist id="currency-options">
            {CURRENCIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="flex flex-col justify-end pb-1 text-sm">
          <span className="text-xs uppercase tracking-wide text-content-subtle">Allocated</span>
          <span className="text-content">{formatMoney(allocated, currency)}</span>
          {brief.budget.totalBudget !== undefined && brief.budget.totalBudget !== null ? (
            <span
              className={
                allocated > brief.budget.totalBudget ? "text-xs text-warning-text" : "text-xs text-content-muted"
              }
            >
              {allocated > brief.budget.totalBudget
                ? `${formatMoney(allocated - brief.budget.totalBudget, currency)} over total`
                : `${formatMoney(brief.budget.totalBudget - allocated, currency)} unallocated`}
            </span>
          ) : null}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-content">Budget categories</h3>
          <Button
            onClick={() =>
              onChange((prev) => ({
                ...prev,
                budget: {
                  ...prev.budget,
                  allocations: [...(prev.budget.allocations ?? []), newBudgetAllocation()],
                },
              }))
            }
          >
            Add category
          </Button>
        </div>

        <div className="rounded-lg border border-line bg-surface">
          <Table>
            <thead>
              <tr>
                <Th className="w-2/5">Category</Th>
                <Th className="w-32">Planned</Th>
                <Th>Notes</Th>
                <Th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {allocations.length === 0 ? (
                <EmptyRow colSpan={4}>
                  No categories yet — add one, or skip this step entirely.
                </EmptyRow>
              ) : null}
              {allocations.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <TextInput
                      aria-label="Category"
                      value={a.category}
                      onChange={(e) => updateAllocation(a.id, { category: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <NumberInput
                      aria-label="Planned amount"
                      min={0}
                      value={Number.isFinite(a.plannedAmount) ? a.plannedAmount : 0}
                      onChange={(e) =>
                        updateAllocation(a.id, {
                          plannedAmount: e.target.value === "" ? 0 : Number(e.target.value),
                        })
                      }
                    />
                  </Td>
                  <Td>
                    <TextInput
                      aria-label="Notes"
                      value={a.notes ?? ""}
                      onChange={(e) => updateAllocation(a.id, { notes: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onChange((prev) => ({
                          ...prev,
                          budget: {
                            ...prev.budget,
                            allocations: (prev.budget.allocations ?? []).filter(
                              (row) => row.id !== a.id,
                            ),
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
      </section>

      <Field label="Budget notes" htmlFor="budget-notes" hint="Assumptions, approvals pending, etc.">
        <TextArea
          id="budget-notes"
          rows={3}
          value={brief.budget.notes ?? ""}
          onChange={(e) =>
            onChange((prev) => ({ ...prev, budget: { ...prev.budget, notes: e.target.value } }))
          }
        />
      </Field>
    </div>
  );
}
