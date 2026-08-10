"use client";

/**
 * FR-3/FR-4/FR-5 — the line-item table: budgeted, committed and actual side by side, with
 * live variance per row, per-category subtotals and a grand total that rolls up the worst flag.
 */

import { useState } from "react";
import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_LABELS,
  LINE_ITEM_STATUSES,
  LINE_ITEM_STATUS_LABELS,
  type BudgetLineItem,
  type BudgetLineItemCategory,
  type BudgetSettings,
  type LineItemStatus,
} from "@event-toolkit/schema";
import { computeVariance, roundMoney, worstFlagForLineItems } from "@event-toolkit/budget-calc";
import {
  Badge,
  Button,
  NumberInput,
  Select,
  Table,
  Td,
  Th,
  TextInput,
} from "@event-toolkit/ui";
import { formatMoney } from "@/lib/format";
import { FlagPill, VarianceBadge } from "./VarianceBadge";

export function BudgetTable({
  lineItems,
  settings,
  highlightCategories,
  onPatch,
  onDelete,
  onAdd,
}: {
  lineItems: BudgetLineItem[];
  settings: BudgetSettings;
  /** Categories the reforecast flow wants drawn attention to. */
  highlightCategories?: BudgetLineItemCategory[];
  onPatch: (id: string, changes: Partial<BudgetLineItem>) => void;
  onDelete: (id: string) => void;
  onAdd: (category: BudgetLineItemCategory) => void;
}) {
  const currency = settings.currency;
  const totals = {
    budgeted: roundMoney(lineItems.reduce((s, i) => s + i.budgetedAmount, 0)),
    committed: roundMoney(lineItems.reduce((s, i) => s + i.committedAmount, 0)),
    actual: roundMoney(lineItems.reduce((s, i) => s + i.actualAmount, 0)),
  };
  const grandVariance = roundMoney(totals.actual - totals.budgeted);

  return (
    <div className="space-y-4">
      {/* Sticky grand total, so the number that matters stays on screen while scrolling. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="font-semibold text-slate-900">Total</span>
          <Money label="Budgeted" amount={totals.budgeted} currency={currency} />
          <Money label="Committed" amount={totals.committed} currency={currency} />
          <Money label="Actual" amount={totals.actual} currency={currency} />
          <span className={grandVariance > 0 ? "text-red-700" : "text-emerald-700"}>
            <span className="block text-xs text-slate-500">Variance</span>
            {grandVariance > 0 ? "+" : ""}
            {formatMoney(grandVariance, currency)}
          </span>
        </div>
        <FlagPill flag={worstFlagForLineItems(lineItems, settings)} />
      </div>

      {BUDGET_CATEGORIES.map((category) => (
        <CategorySection
          key={category}
          category={category}
          settings={settings}
          highlighted={highlightCategories?.includes(category) ?? false}
          items={lineItems.filter((item) => item.category === category)}
          onPatch={onPatch}
          onDelete={onDelete}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}

function Money({ label, amount, currency }: { label: string; amount: number; currency: string }) {
  return (
    <span className="text-slate-800">
      <span className="block text-xs text-slate-500">{label}</span>
      {formatMoney(amount, currency)}
    </span>
  );
}

function CategorySection({
  category,
  items,
  settings,
  highlighted,
  onPatch,
  onDelete,
  onAdd,
}: {
  category: BudgetLineItemCategory;
  items: BudgetLineItem[];
  settings: BudgetSettings;
  highlighted: boolean;
  onPatch: (id: string, changes: Partial<BudgetLineItem>) => void;
  onDelete: (id: string) => void;
  onAdd: (category: BudgetLineItemCategory) => void;
}) {
  const [open, setOpen] = useState(true);
  const subtotal = {
    budgeted: roundMoney(items.reduce((s, i) => s + i.budgetedAmount, 0)),
    committed: roundMoney(items.reduce((s, i) => s + i.committedAmount, 0)),
    actual: roundMoney(items.reduce((s, i) => s + i.actualAmount, 0)),
  };

  return (
    <section
      className={
        highlighted
          ? "rounded-xl border-2 border-sky-400 bg-sky-50/40"
          : "rounded-xl border border-slate-200 bg-slate-50/60"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left"
        >
          <span aria-hidden className="text-slate-400">{open ? "▾" : "▸"}</span>
          <span className="text-sm font-semibold text-slate-900">
            {BUDGET_CATEGORY_LABELS[category]}
          </span>
          <Badge>{items.length}</Badge>
          {highlighted ? <Badge tone="info">Likely affected</Badge> : null}
        </button>
        <span className="flex items-center gap-4 text-xs text-slate-600">
          <span>Budgeted {formatMoney(subtotal.budgeted, settings.currency)}</span>
          <span>Committed {formatMoney(subtotal.committed, settings.currency)}</span>
          <span>Actual {formatMoney(subtotal.actual, settings.currency)}</span>
          <FlagPill flag={worstFlagForLineItems(items, settings)} />
        </span>
      </div>

      {open ? (
        <div className="px-4 pb-4">
          <Table>
            <thead>
              <tr>
                <Th className="w-56">Line item</Th>
                <Th className="w-36">Vendor</Th>
                <Th className="w-28 text-right">Budgeted</Th>
                <Th className="w-28 text-right">Committed</Th>
                <Th className="w-28 text-right">Actual</Th>
                <Th className="w-32 text-right">Variance</Th>
                <Th className="w-32">Flag</Th>
                <Th className="w-32">Status</Th>
                <Th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-sm text-slate-500">
                    Nothing budgeted under {BUDGET_CATEGORY_LABELS[category]} yet.
                  </td>
                </tr>
              ) : (
                items.map((lineItem) => {
                  const variance = computeVariance(lineItem, settings);
                  return (
                    <tr key={lineItem.id} className={variance.flag === "red" ? "bg-red-50/50" : undefined}>
                      <Td>
                        <TextInput
                          value={lineItem.lineItemName}
                          aria-label="Line item name"
                          placeholder="What is this spend"
                          onChange={(e) => onPatch(lineItem.id, { lineItemName: e.target.value })}
                        />
                      </Td>
                      <Td>
                        <TextInput
                          value={lineItem.vendor ?? ""}
                          aria-label="Vendor"
                          onChange={(e) => onPatch(lineItem.id, { vendor: e.target.value })}
                        />
                      </Td>
                      <Td>
                        <AmountInput
                          label="Budgeted"
                          value={lineItem.budgetedAmount}
                          onChange={(budgetedAmount) => onPatch(lineItem.id, { budgetedAmount })}
                        />
                      </Td>
                      <Td>
                        <AmountInput
                          label="Committed"
                          value={lineItem.committedAmount}
                          onChange={(committedAmount) => onPatch(lineItem.id, { committedAmount })}
                        />
                      </Td>
                      <Td>
                        <AmountInput
                          label="Actual"
                          value={lineItem.actualAmount}
                          onChange={(actualAmount) => onPatch(lineItem.id, { actualAmount })}
                        />
                      </Td>
                      <Td className="text-right tabular-nums">
                        <span className={variance.actualVarianceAmount > 0 ? "text-red-700" : "text-slate-600"}>
                          {variance.actualVarianceAmount > 0 ? "+" : ""}
                          {formatMoney(variance.actualVarianceAmount, settings.currency)}
                        </span>
                      </Td>
                      <Td>
                        <VarianceBadge variance={variance} />
                      </Td>
                      <Td>
                        <Select
                          value={lineItem.status}
                          aria-label="Status"
                          onChange={(e) =>
                            onPatch(lineItem.id, { status: e.target.value as LineItemStatus })
                          }
                        >
                          {LINE_ITEM_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {LINE_ITEM_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                      </Td>
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${lineItem.lineItemName || "line item"}`}
                          onClick={() => onDelete(lineItem.id)}
                        >
                          ✕
                        </Button>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>

          <div className="mt-2">
            <Button size="sm" variant="ghost" onClick={() => onAdd(category)}>
              + Add line item
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * A money cell. Kept as local text state while focused so typing "1200" doesn't fight the
 * parsed value, and committed as a number on change so variance updates live.
 */
function AmountInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberInput
      min={0}
      step="0.01"
      value={value === 0 ? "" : value}
      placeholder="0"
      aria-label={label}
      className="text-right"
      onChange={(e) => {
        const next = Number(e.target.value);
        onChange(Number.isFinite(next) && next >= 0 ? roundMoney(next) : 0);
      }}
    />
  );
}
