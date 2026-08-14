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
import { aggregateVarianceForLineItems, computeVariance, roundMoney } from "@event-toolkit/budget-calc";
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
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="font-semibold text-content">Total</span>
          <Money label="Budgeted" amount={totals.budgeted} currency={currency} />
          <Money label="Committed" amount={totals.committed} currency={currency} />
          <Money label="Actual" amount={totals.actual} currency={currency} />
          <span className={grandVariance > 0 ? "text-danger-text" : "text-success-text"}>
            <span className="block text-xs text-content-muted">Variance</span>
            {grandVariance > 0 ? "+" : ""}
            {formatMoney(grandVariance, currency)}
          </span>
        </div>
        <FlagPill {...aggregateVarianceForLineItems(lineItems, settings)} />
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
    <span className="text-content">
      <span className="block text-xs text-content-muted">{label}</span>
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
  /**
   * Categories with nothing in them start collapsed.
   *
   * All nine render for every event type, so a webinar showed Venue, F&B, Travel and Swag as
   * open, empty sections — four of nine that will never be used, above the four that matter. They
   * stay reachable, because a planner may well add a venue line to a webinar; they just do not
   * take up the screen until they hold something.
   */
  const [open, setOpen] = useState(items.length > 0);
  const subtotal = {
    budgeted: roundMoney(items.reduce((s, i) => s + i.budgetedAmount, 0)),
    committed: roundMoney(items.reduce((s, i) => s + i.committedAmount, 0)),
    actual: roundMoney(items.reduce((s, i) => s + i.actualAmount, 0)),
  };

  return (
    <section
      className={
        highlighted
          ? "rounded-xl border-2 border-accent bg-accent-subtle/40"
          : "rounded-xl border border-line bg-surface-sunken"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left"
        >
          <span aria-hidden className="text-content-subtle">{open ? "▾" : "▸"}</span>
          <span className="text-sm font-semibold text-content">
            {BUDGET_CATEGORY_LABELS[category]}
          </span>
          <Badge>{items.length}</Badge>
          {highlighted ? <Badge tone="info">Likely affected</Badge> : null}
        </button>
        <span className="flex items-center gap-4 text-xs text-content-muted">
          <span>Budgeted {formatMoney(subtotal.budgeted, settings.currency)}</span>
          <span>Committed {formatMoney(subtotal.committed, settings.currency)}</span>
          <span>Actual {formatMoney(subtotal.actual, settings.currency)}</span>
          <FlagPill {...aggregateVarianceForLineItems(items, settings)} />
        </span>
      </div>

      {open ? (
        <div className="px-4 pb-4">
          {/*
            Two layouts, not one that shrinks. At 375px the shared column widths squeezed line-item
            names to a single character — "V", "C", "B" — inside a nested horizontal scroller. A
            field showing one character still *looks* like data: a planner can scan the page,
            believe they have reviewed the budget, and have read nothing. On money that is worse
            than refusing to render.
          */}
          <div className="hidden md:block">
          <Table>
            <thead>
              <tr>
                <Th className="min-w-[12rem]">Line item</Th>
                <Th className="min-w-[10rem]">Vendor</Th>
                <Th className="w-28 text-right">Budgeted</Th>
                <Th className="w-28 text-right">Committed</Th>
                <Th className="w-28 text-right">Actual</Th>
                <Th className="w-28 text-right">Variance</Th>
                <Th className="w-24">Flag</Th>
                <Th className="w-32">Status</Th>
                <Th className="w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-sm text-content-muted">
                    Nothing budgeted under {BUDGET_CATEGORY_LABELS[category]} yet.
                  </td>
                </tr>
              ) : (
                items.map((lineItem) => {
                  const variance = computeVariance(lineItem, settings);
                  return (
                    <tr key={lineItem.id} className={variance.flag === "red" ? "bg-danger-subtle/50" : undefined}>
                      <Td>
                        <TextInput
                          value={lineItem.lineItemName}
                          title={lineItem.lineItemName}
                          aria-label="Line item name"
                          placeholder="What is this spend"
                          onChange={(e) => onPatch(lineItem.id, { lineItemName: e.target.value })}
                        />
                      </Td>
                      <Td>
                        <TextInput
                          value={lineItem.vendor ?? ""}
                          title={lineItem.vendor ?? ""}
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
                        <span className={variance.actualVarianceAmount > 0 ? "text-danger-text" : "text-content-muted"}>
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
          </div>

          <ul className="space-y-3 md:hidden">
            {items.length === 0 ? (
              <li className="py-3 text-center text-sm text-content-muted">
                Nothing budgeted under {BUDGET_CATEGORY_LABELS[category]} yet.
              </li>
            ) : (
              items.map((lineItem) => (
                <LineItemCard
                  key={lineItem.id}
                  lineItem={lineItem}
                  settings={settings}
                  onPatch={onPatch}
                  onDelete={onDelete}
                />
              ))
            )}
          </ul>

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
 * One line item on a phone.
 *
 * Full-width name, then the three amounts as a labelled row, then variance and status. Every
 * value is readable without a sideways swipe, which is the whole point — a nested horizontal
 * scroller competes with both the page scroll and the browser's back-swipe when you are holding
 * the phone one-handed.
 */
function LineItemCard({
  lineItem,
  settings,
  onPatch,
  onDelete,
}: {
  lineItem: BudgetLineItem;
  settings: BudgetSettings;
  onPatch: (id: string, patch: Partial<BudgetLineItem>) => void;
  onDelete: (id: string) => void;
}) {
  const variance = computeVariance(lineItem, settings);

  return (
    <li
      className={`space-y-3 rounded-lg border border-line p-3 ${
        variance.flag === "red" ? "bg-danger-subtle/50" : "bg-surface"
      }`}
    >
      <TextInput
        value={lineItem.lineItemName}
        aria-label="Line item name"
        placeholder="What is this spend"
        onChange={(e) => onPatch(lineItem.id, { lineItemName: e.target.value })}
      />
      <TextInput
        value={lineItem.vendor ?? ""}
        aria-label="Vendor"
        placeholder="Vendor"
        onChange={(e) => onPatch(lineItem.id, { vendor: e.target.value })}
      />

      <div className="grid grid-cols-3 gap-2">
        {([
          ["Budgeted", lineItem.budgetedAmount, (v: number) => onPatch(lineItem.id, { budgetedAmount: v })],
          ["Committed", lineItem.committedAmount, (v: number) => onPatch(lineItem.id, { committedAmount: v })],
          ["Actual", lineItem.actualAmount, (v: number) => onPatch(lineItem.id, { actualAmount: v })],
        ] as const).map(([label, value, onValue]) => (
          <label key={label} className="space-y-1">
            <span className="block text-xs font-medium text-content-muted">{label}</span>
            <AmountInput label={label} value={value} onChange={onValue} />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <VarianceBadge variance={variance} />
          <span
            className={`text-sm tabular-nums ${
              variance.actualVarianceAmount > 0 ? "text-danger-text" : "text-content-muted"
            }`}
          >
            {variance.actualVarianceAmount > 0 ? "+" : ""}
            {formatMoney(variance.actualVarianceAmount, settings.currency)}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Delete ${lineItem.lineItemName || "line item"}`}
          onClick={() => onDelete(lineItem.id)}
        >
          Delete
        </Button>
      </div>

      <Select
        value={lineItem.status}
        aria-label="Status"
        onChange={(e) => onPatch(lineItem.id, { status: e.target.value as LineItemStatus })}
      >
        {LINE_ITEM_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LINE_ITEM_STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
    </li>
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
