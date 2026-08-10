// packages/budget-calc/src/import-export.ts
//
// FR-6/FR-10 — the import wizard's logic and the export sheet builders.
//
// Deliberate split from the handoff's sketch: everything here is pure and works on plain rows
// and arrays-of-arrays. The ~20 lines that actually call `XLSX.read`/`XLSX.write` live in
// `apps/web/lib/budget-file.ts`, because that is the only part that needs the library and the
// browser File API. Keeping the parsing library out of this package means the mapping,
// validation and matching logic — the part with the bugs — stays testable headlessly.

import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_LABELS,
  LINE_ITEM_STATUSES,
  type BudgetLineItem,
  type BudgetLineItemCategory,
  type BudgetSettings,
  type EventBrief,
  type LineItemSource,
  type LineItemStatus,
} from "@event-toolkit/schema";
import { newLineItem } from "./presets";

/** What the export builders need off the brief — the same shape the ROI seam takes. */
type BudgetExportBrief = Pick<EventBrief, "id" | "budget">;
import { computeVariance, roundMoney } from "./variance";
import { computeBudgetActualsSummary } from "./summary";

/** A row as read out of a spreadsheet: header name → cell value. */
export type SheetRow = Record<string, string | number | boolean | null | undefined>;

/** The line-item fields an imported column can be mapped onto. */
export type ImportField =
  | "lineItemName"
  | "category"
  | "vendor"
  | "budgetedAmount"
  | "committedAmount"
  | "actualAmount"
  | "status"
  | "notes"
  | "ignore";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  lineItemName: "Line item name",
  category: "Category",
  vendor: "Vendor",
  budgetedAmount: "Budgeted amount",
  committedAmount: "Committed amount",
  actualAmount: "Actual amount",
  status: "Status",
  notes: "Notes",
  ignore: "Ignore this column",
};

export const IMPORT_FIELDS: ImportField[] = [
  "lineItemName",
  "category",
  "vendor",
  "budgetedAmount",
  "committedAmount",
  "actualAmount",
  "status",
  "notes",
  "ignore",
];

/**
 * Header patterns per field, matched against a normalised header. Ordered most-specific
 * first so "actual spend" maps to actuals rather than colliding with a looser "spend" rule.
 */
const HEADER_HINTS: Array<{ field: ImportField; patterns: string[] }> = [
  { field: "budgetedAmount", patterns: ["budgeted amount", "budget amount", "budgeted", "budget", "planned", "forecast"] },
  { field: "committedAmount", patterns: ["committed amount", "committed", "commitment", "po amount", "contracted"] },
  { field: "actualAmount", patterns: ["actual amount", "actual spend", "actuals", "actual", "spend", "invoiced amount", "paid"] },
  { field: "lineItemName", patterns: ["line item name", "line item", "item name", "description", "item", "name"] },
  { field: "category", patterns: ["category", "budget category", "type"] },
  { field: "vendor", patterns: ["vendor", "supplier", "payee", "merchant"] },
  { field: "status", patterns: ["status", "state"] },
  { field: "notes", patterns: ["notes", "note", "comment", "comments", "memo"] },
];

function normalise(text: string): string {
  return (text ?? "").toString().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** FR-6 — auto-suggest a field for each column header; unknown headers default to ignore. */
export function suggestColumnMapping(headers: string[]): Record<string, ImportField> {
  const mapping: Record<string, ImportField> = {};
  const claimed = new Set<ImportField>();

  for (const header of headers) {
    const normalised = normalise(header);
    let match: ImportField = "ignore";
    for (const hint of HEADER_HINTS) {
      if (claimed.has(hint.field)) continue;
      if (hint.patterns.some((p) => normalised === p || normalised.includes(p))) {
        match = hint.field;
        break;
      }
    }
    if (match !== "ignore") claimed.add(match);
    mapping[header] = match;
  }
  return mapping;
}

/** Money out of a spreadsheet cell: strips currency symbols, thousands separators, (parens). */
export function parseMoney(value: SheetRow[string]): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? roundMoney(value) : null;
  const text = String(value).trim();
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[()]/g, "").replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return roundMoney(negative ? -Math.abs(parsed) : parsed);
}

/** Map a free-text category cell onto the taxonomy; unrecognised text becomes `other`. */
export function parseCategory(value: SheetRow[string]): BudgetLineItemCategory {
  const normalised = normalise(String(value ?? ""));
  if (!normalised) return "other";
  const direct = BUDGET_CATEGORIES.find((c) => normalise(c) === normalised);
  if (direct) return direct;
  const byLabel = BUDGET_CATEGORIES.find(
    (c) => normalise(BUDGET_CATEGORY_LABELS[c]) === normalised,
  );
  return byLabel ?? "other";
}

function parseStatus(value: SheetRow[string]): LineItemStatus {
  const normalised = normalise(String(value ?? ""));
  return (LINE_ITEM_STATUSES.find((s) => normalise(s) === normalised) ?? "planned") as LineItemStatus;
}

export interface ImportRowIssue {
  /** 1-based data-row number as the planner sees it in the spreadsheet (header excluded). */
  row: number;
  reason: string;
}

export type MatchOutcome = "update" | "create" | "skipped";

export interface ImportCandidate {
  row: number;
  outcome: MatchOutcome;
  /** Existing line item this row matched, when `outcome === "update"`. */
  existingId?: string;
  lineItemName: string;
  category: BudgetLineItemCategory;
  vendor?: string;
  /** Only the amounts the mapping actually supplied — absent fields are left untouched. */
  budgetedAmount?: number;
  committedAmount?: number;
  actualAmount?: number;
  status?: LineItemStatus;
  notes?: string;
  /** Non-fatal notes shown in the preview (e.g. "category not recognised, using Other"). */
  warnings: string[];
}

export interface ImportPlan {
  candidates: ImportCandidate[];
  errors: ImportRowIssue[];
  willUpdate: number;
  willCreate: number;
  skipped: number;
}

/**
 * FR-6 — turn mapped rows into a reviewable plan. Nothing here writes; the caller commits
 * only what the planner confirms.
 *
 * Matching is by category + normalised name, which is the pairing a planner would make by
 * eye. An ambiguous match (two existing items with the same name in one category) is treated
 * as `skipped` rather than guessing which one to overwrite.
 */
export function buildImportPlan(
  rows: SheetRow[],
  mapping: Record<string, ImportField>,
  existing: BudgetLineItem[],
): ImportPlan {
  const candidates: ImportCandidate[] = [];
  const errors: ImportRowIssue[] = [];

  const byKey = new Map<string, BudgetLineItem[]>();
  for (const item of existing) {
    const key = `${item.category}|${normalise(item.lineItemName)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }

  const columnFor = (field: ImportField): string | undefined =>
    Object.keys(mapping).find((header) => mapping[header] === field);

  const nameColumn = columnFor("lineItemName");
  if (!nameColumn) {
    return {
      candidates: [],
      errors: [{ row: 0, reason: "No column is mapped to the line item name." }],
      willUpdate: 0,
      willCreate: 0,
      skipped: 0,
    };
  }

  rows.forEach((row, index) => {
    const rowNo = index + 1;
    const warnings: string[] = [];

    const lineItemName = String(row[nameColumn] ?? "").trim();
    if (!lineItemName) {
      errors.push({ row: rowNo, reason: "Missing a line item name" });
      return;
    }

    const categoryColumn = columnFor("category");
    const rawCategory = categoryColumn ? row[categoryColumn] : undefined;
    const category = parseCategory(rawCategory);
    if (categoryColumn && rawCategory && category === "other" && normalise(String(rawCategory)) !== "other") {
      warnings.push(`Category “${String(rawCategory)}” not recognised — filed under Other`);
    }

    const amount = (field: ImportField): number | undefined => {
      const column = columnFor(field);
      if (!column) return undefined;
      const raw = row[column];
      if (raw === null || raw === undefined || raw === "") return undefined;
      const parsed = parseMoney(raw);
      if (parsed === null) {
        warnings.push(`“${String(raw)}” in ${IMPORT_FIELD_LABELS[field]} is not a number — left unchanged`);
        return undefined;
      }
      return parsed;
    };

    const budgetedAmount = amount("budgetedAmount");
    const committedAmount = amount("committedAmount");
    const actualAmount = amount("actualAmount");

    if (budgetedAmount === undefined && committedAmount === undefined && actualAmount === undefined) {
      errors.push({ row: rowNo, reason: "No budgeted, committed or actual amount to import" });
      return;
    }

    const statusColumn = columnFor("status");
    const notesColumn = columnFor("notes");
    const vendorColumn = columnFor("vendor");

    const matches = byKey.get(`${category}|${normalise(lineItemName)}`) ?? [];
    let outcome: MatchOutcome = matches.length === 1 ? "update" : matches.length === 0 ? "create" : "skipped";
    if (outcome === "skipped") {
      warnings.push(`${matches.length} existing line items share this name and category — review manually`);
    }

    candidates.push({
      row: rowNo,
      outcome,
      existingId: outcome === "update" ? matches[0].id : undefined,
      lineItemName,
      category,
      vendor: vendorColumn ? (String(row[vendorColumn] ?? "").trim() || undefined) : undefined,
      budgetedAmount,
      committedAmount,
      actualAmount,
      status: statusColumn ? parseStatus(row[statusColumn]) : undefined,
      notes: notesColumn ? (String(row[notesColumn] ?? "").trim() || undefined) : undefined,
      warnings,
    });
  });

  return {
    candidates,
    errors,
    willUpdate: candidates.filter((c) => c.outcome === "update").length,
    willCreate: candidates.filter((c) => c.outcome === "create").length,
    skipped: candidates.filter((c) => c.outcome === "skipped").length,
  };
}

/**
 * Apply the confirmed candidates. Returns the full next set of line items — updates in place,
 * creations appended, skipped rows untouched.
 */
export function applyImportPlan(
  existing: BudgetLineItem[],
  candidates: ImportCandidate[],
  eventBriefId: string,
  source: LineItemSource,
  timestamp: string,
): BudgetLineItem[] {
  const updates = new Map<string, ImportCandidate>();
  const creations: ImportCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.outcome === "update" && candidate.existingId) updates.set(candidate.existingId, candidate);
    else if (candidate.outcome === "create") creations.push(candidate);
  }

  const merged = existing.map((item) => {
    const candidate = updates.get(item.id);
    if (!candidate) return item;
    return {
      ...item,
      // Only overwrite the amounts this import actually carried.
      budgetedAmount: candidate.budgetedAmount ?? item.budgetedAmount,
      committedAmount: candidate.committedAmount ?? item.committedAmount,
      actualAmount: candidate.actualAmount ?? item.actualAmount,
      vendor: candidate.vendor ?? item.vendor,
      status: candidate.status ?? item.status,
      notes: candidate.notes ?? item.notes,
      source,
      updatedAt: timestamp,
    };
  });

  const created = creations.map((candidate) =>
    newLineItem(eventBriefId, {
      category: candidate.category,
      lineItemName: candidate.lineItemName,
      vendor: candidate.vendor,
      budgetedAmount: candidate.budgetedAmount ?? 0,
      committedAmount: candidate.committedAmount ?? 0,
      actualAmount: candidate.actualAmount ?? 0,
      status: candidate.status ?? "planned",
      notes: candidate.notes,
      source,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );

  return [...merged, ...created];
}

/* -------------------------------------------------------------------------- */
/* Export (FR-10)                                                              */
/* -------------------------------------------------------------------------- */

export type SheetMatrix = Array<Array<string | number | null>>;

export interface ExportWorkbook {
  sheets: Array<{ name: string; rows: SheetMatrix }>;
}

/** The flat line-items table — also exactly what the CSV export writes. */
export function buildLineItemsSheet(
  lineItems: BudgetLineItem[],
  settings: BudgetSettings,
): SheetMatrix {
  const header = [
    "Category",
    "Line item",
    "Vendor",
    "Budgeted",
    "Committed",
    "Actual",
    "Variance amount",
    "Variance %",
    "Flag",
    "Status",
    "Source",
    "Notes",
  ];

  const rows = lineItems.map((item) => {
    const variance = computeVariance(item, settings);
    return [
      BUDGET_CATEGORY_LABELS[item.category],
      item.lineItemName,
      item.vendor ?? "",
      item.budgetedAmount,
      item.committedAmount,
      item.actualAmount,
      variance.actualVarianceAmount,
      variance.actualVariancePct === null ? null : roundMoney(variance.actualVariancePct),
      variance.flag,
      item.status,
      item.source,
      item.notes ?? "",
    ];
  });

  return [header, ...rows];
}

function summarySheet(
  lineItems: BudgetLineItem[],
  settings: BudgetSettings,
  brief: BudgetExportBrief,
): SheetMatrix {
  const summary = computeBudgetActualsSummary(lineItems, settings, brief);
  const header = ["Category", "Budgeted", "Committed", "Actual", "Variance amount", "Variance %"];
  const rows = summary.spendByCategory.map((entry) => [
    BUDGET_CATEGORY_LABELS[entry.category],
    entry.budgeted,
    entry.committed,
    entry.actual,
    entry.varianceAmount,
    entry.variancePct === null ? null : roundMoney(entry.variancePct),
  ]);
  const total = [
    "Total",
    summary.totalBudgeted,
    summary.totalCommitted,
    summary.totalActual,
    summary.varianceAmount,
    summary.variancePct === null ? null : roundMoney(summary.variancePct),
  ];
  return [header, ...rows, total];
}

function budgetVsBriefSheet(
  lineItems: BudgetLineItem[],
  settings: BudgetSettings,
  brief: BudgetExportBrief,
): SheetMatrix {
  const summary = computeBudgetActualsSummary(lineItems, settings, brief);
  const briefTotal = brief.budget?.totalBudget ?? null;
  return [
    ["Measure", "Amount"],
    ["Currency", summary.currency],
    ["Total budget on the brief", briefTotal],
    ["Total budgeted (line items)", summary.totalBudgeted],
    ["Difference vs brief", briefTotal === null ? null : roundMoney(summary.totalBudgeted - briefTotal)],
    ["Total committed", summary.totalCommitted],
    ["Total actual", summary.totalActual],
    ["Variance (actual − budgeted)", summary.varianceAmount],
    ["Variance %", summary.variancePct === null ? null : roundMoney(summary.variancePct)],
    ["Line items", summary.lineItemCount],
    ["Line items with actuals (%)", summary.reconciledLineItemPct],
    ["Reconciled", summary.varianceAtClose.isFinal ? "Yes" : "No"],
    ["Reconciled at", summary.varianceAtClose.reconciledAt ?? ""],
  ];
}

/** FR-10 — the three-sheet finance workbook. */
export function buildExportWorkbook(
  lineItems: BudgetLineItem[],
  settings: BudgetSettings,
  brief: BudgetExportBrief,
): ExportWorkbook {
  return {
    sheets: [
      { name: "Line Items", rows: buildLineItemsSheet(lineItems, settings) },
      { name: "Summary by Category", rows: summarySheet(lineItems, settings, brief) },
      { name: "Budget vs Brief", rows: budgetVsBriefSheet(lineItems, settings, brief) },
    ],
  };
}

/** RFC 4180 CSV for a single sheet — the flat CSV export path. */
export function sheetToCsv(rows: SheetMatrix): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          const text = String(cell);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
}
