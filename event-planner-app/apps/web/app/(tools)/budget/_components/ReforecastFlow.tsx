"use client";

/**
 * FR-7/FR-8 — the reforecast banner and its focused editing view.
 *
 * Both paths (reforecast or dismiss) record a `ReforecastEvent` and re-snapshot the scope, so
 * the same change never nags twice. Rendered as a modal on the main page rather than its own
 * route — the handoff explicitly leaves that call open, and keeping it in place means the
 * planner never loses their spot in the table.
 */

import { useState } from "react";
import {
  BUDGET_CATEGORY_LABELS,
  type BudgetLineItem,
  type BudgetLineItemCategory,
} from "@event-toolkit/schema";
import {
  affectedCategories,
  roundMoney,
  type ReforecastTrigger,
} from "@event-toolkit/budget-calc";
import { Badge, Button, NumberInput, Table, Td, Th } from "@event-toolkit/ui";
import { formatMoney } from "@/lib/format";

export function ReforecastBanner({
  triggers,
  onOpen,
  onDismiss,
}: {
  triggers: ReforecastTrigger[];
  onOpen: () => void;
  onDismiss: () => void;
}) {
  if (triggers.length === 0) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <div>
        <p className="text-sm font-medium text-amber-900">
          The event&rsquo;s scope has changed since this budget was last reviewed.
        </p>
        <ul className="mt-1 list-inside list-disc text-xs text-amber-900">
          {triggers.map((trigger) => (
            <li key={trigger.field}>
              {trigger.label}: {trigger.before} → {trigger.after}
            </li>
          ))}
        </ul>
      </div>
      <span className="flex gap-2">
        <Button size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
        <Button size="sm" variant="primary" onClick={onOpen}>
          Reforecast
        </Button>
      </span>
    </div>
  );
}

export function ReforecastFlow({
  triggers,
  lineItems,
  currency,
  onCancel,
  onSave,
}: {
  triggers: ReforecastTrigger[];
  lineItems: BudgetLineItem[];
  currency: string;
  onCancel: () => void;
  onSave: (updated: Array<{ id: string; budgetedAmount: number }>) => void;
}) {
  const focus = affectedCategories(triggers);
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  // Likely-affected categories first, but every line item stays reachable — the trigger is a
  // hint about where to look, not a restriction on what can be re-budgeted.
  const ordered = [...lineItems].sort((a, b) => {
    const aFocus = focus.includes(a.category) ? 0 : 1;
    const bFocus = focus.includes(b.category) ? 0 : 1;
    return aFocus - bFocus;
  });

  const valueFor = (item: BudgetLineItem) => drafts[item.id] ?? item.budgetedAmount;
  const before = roundMoney(lineItems.reduce((s, i) => s + i.budgetedAmount, 0));
  const after = roundMoney(ordered.reduce((s, i) => s + valueFor(i), 0));
  const changed = Object.entries(drafts).filter(
    ([id, amount]) => lineItems.find((i) => i.id === id)?.budgetedAmount !== amount,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reforecast-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
    >
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id="reforecast-title" className="text-base font-semibold text-slate-900">
            Reforecast the budget
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {triggers.map((t) => `${t.label}: ${t.before} → ${t.after}`).join(" · ")}
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-3">
          <Table>
            <thead>
              <tr>
                <Th>Line item</Th>
                <Th className="w-32">Category</Th>
                <Th className="w-32 text-right">Budgeted</Th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((item) => (
                <tr key={item.id} className={focus.includes(item.category) ? "bg-sky-50/50" : undefined}>
                  <Td>{item.lineItemName || "Untitled"}</Td>
                  <Td>
                    <span className="flex items-center gap-1.5 text-xs text-slate-600">
                      {BUDGET_CATEGORY_LABELS[item.category]}
                      {focus.includes(item.category) ? <Badge tone="info">Check</Badge> : null}
                    </span>
                  </Td>
                  <Td>
                    <NumberInput
                      min={0}
                      step="0.01"
                      className="text-right"
                      aria-label={`Budgeted amount for ${item.lineItemName || "line item"}`}
                      value={valueFor(item) === 0 ? "" : valueFor(item)}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [item.id]: roundMoney(Math.max(0, Number(e.target.value) || 0)),
                        }))
                      }
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
          <p className="text-xs text-slate-600">
            Total budgeted {formatMoney(before, currency)} → {formatMoney(after, currency)}
            {changed.length > 0 ? ` · ${changed.length} line item${changed.length === 1 ? "" : "s"} changed` : ""}
          </p>
          <span className="flex gap-2">
            <Button onClick={onCancel}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() =>
                onSave(changed.map(([id, budgetedAmount]) => ({ id, budgetedAmount })))
              }
            >
              Save reforecast
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

export type { BudgetLineItemCategory };
