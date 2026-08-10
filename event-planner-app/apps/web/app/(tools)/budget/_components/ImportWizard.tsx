"use client";

/**
 * FR-6 — Upload → Column mapping → Preview → Matching → Summary.
 *
 * Nothing is written until the final confirm; every step before that operates on a plan the
 * planner can back out of.
 */

import { useMemo, useState } from "react";
import {
  BUDGET_CATEGORY_LABELS,
  type BudgetLineItem,
  type LineItemSource,
} from "@event-toolkit/schema";
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  buildImportPlan,
  suggestColumnMapping,
  type ImportCandidate,
  type ImportField,
  type ImportPlan,
  type SheetRow,
} from "@event-toolkit/budget-calc";
import { Badge, Button, EmptyRow, Select, Table, Td, Th } from "@event-toolkit/ui";
import { formatMoney } from "@/lib/format";
import { readSpreadsheet } from "@/lib/budget-file";

type Step = "upload" | "mapping" | "preview" | "matching" | "summary";

const STEP_LABELS: Record<Step, string> = {
  upload: "Upload",
  mapping: "Map columns",
  preview: "Preview",
  matching: "Review matches",
  summary: "Done",
};

const STEP_ORDER: Step[] = ["upload", "mapping", "preview", "matching", "summary"];

export function ImportWizard({
  lineItems,
  currency,
  onCommit,
  onClose,
}: {
  lineItems: BudgetLineItem[];
  currency: string;
  onCommit: (candidates: ImportCandidate[], source: LineItemSource) => Promise<number>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [source, setSource] = useState<LineItemSource>("csv_import");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, ImportField>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [committedCount, setCommittedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const plan: ImportPlan = useMemo(
    () => (rows.length > 0 ? buildImportPlan(rows, mapping, lineItems) : { candidates: [], errors: [], willUpdate: 0, willCreate: 0, skipped: 0 }),
    [rows, mapping, lineItems],
  );

  const included = plan.candidates.filter((c) => !excluded.has(c.row) && c.outcome !== "skipped");

  const onFile = async (file: File) => {
    setError(null);
    setFilename(file.name);
    setSource(/\.xlsx?$/i.test(file.name) ? "xlsx_import" : "csv_import");
    try {
      const parsed = await readSpreadsheet(file);
      if (parsed.rows.length === 0) {
        setError("That file has no data rows.");
        return;
      }
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(suggestColumnMapping(parsed.headers));
      setStep("mapping");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  const commit = async () => {
    const written = await onCommit(included, source);
    setCommittedCount(written);
    setStep("summary");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
    >
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id="import-title" className="text-base font-semibold text-slate-900">
            Import budget data
          </h2>
          <ol className="mt-2 flex flex-wrap gap-2 text-xs">
            {STEP_ORDER.map((s, i) => (
              <li
                key={s}
                aria-current={step === s ? "step" : undefined}
                className={
                  step === s
                    ? "rounded-full bg-slate-900 px-2.5 py-1 font-medium text-white"
                    : STEP_ORDER.indexOf(step) > i
                      ? "rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                      : "rounded-full bg-slate-100 px-2.5 py-1 text-slate-500"
                }
              >
                {i + 1}. {STEP_LABELS[s]}
              </li>
            ))}
          </ol>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          {error ? (
            <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {step === "upload" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Choose a CSV or XLSX file. Columns are matched to fields automatically and you can
                correct them on the next step. Nothing is saved until you confirm.
              </p>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                }}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
              />
            </div>
          ) : null}

          {step === "mapping" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {filename} · {rows.length} row{rows.length === 1 ? "" : "s"}. Map each column, or
                leave it ignored.
              </p>
              <Table>
                <thead>
                  <tr>
                    <Th>Column in your file</Th>
                    <Th className="w-56">Imports as</Th>
                    <Th>First value</Th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header) => (
                    <tr key={header}>
                      <Td className="font-medium">{header}</Td>
                      <Td>
                        <Select
                          value={mapping[header] ?? "ignore"}
                          aria-label={`Map column ${header}`}
                          onChange={(e) =>
                            setMapping((prev) => ({ ...prev, [header]: e.target.value as ImportField }))
                          }
                        >
                          {IMPORT_FIELDS.map((field) => (
                            <option key={field} value={field}>
                              {IMPORT_FIELD_LABELS[field]}
                            </option>
                          ))}
                        </Select>
                      </Td>
                      <Td className="text-xs text-slate-500">{String(rows[0]?.[header] ?? "")}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : null}

          {step === "preview" ? (
            <div className="space-y-3">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="success">{plan.candidates.length} rows readable</Badge>
                {plan.errors.length > 0 ? <Badge tone="warning">{plan.errors.length} unusable</Badge> : null}
              </p>
              {plan.errors.length > 0 ? (
                <ul className="max-h-28 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {plan.errors.map((e) => (
                    <li key={`${e.row}-${e.reason}`}>Row {e.row}: {e.reason}</li>
                  ))}
                </ul>
              ) : null}
              <Table>
                <thead>
                  <tr>
                    <Th className="w-12">Row</Th>
                    <Th>Line item</Th>
                    <Th className="w-28">Category</Th>
                    <Th className="w-28 text-right">Budgeted</Th>
                    <Th className="w-28 text-right">Committed</Th>
                    <Th className="w-28 text-right">Actual</Th>
                  </tr>
                </thead>
                <tbody>
                  {plan.candidates.slice(0, 5).map((c) => (
                    <tr key={c.row}>
                      <Td>{c.row}</Td>
                      <Td>
                        {c.lineItemName}
                        {c.warnings.map((w) => (
                          <span key={w} className="block text-xs text-amber-700">{w}</span>
                        ))}
                      </Td>
                      <Td>{BUDGET_CATEGORY_LABELS[c.category]}</Td>
                      <Td className="text-right">{c.budgetedAmount === undefined ? "—" : formatMoney(c.budgetedAmount, currency)}</Td>
                      <Td className="text-right">{c.committedAmount === undefined ? "—" : formatMoney(c.committedAmount, currency)}</Td>
                      <Td className="text-right">{c.actualAmount === undefined ? "—" : formatMoney(c.actualAmount, currency)}</Td>
                    </tr>
                  ))}
                  {plan.candidates.length === 0 ? <EmptyRow colSpan={6}>Nothing importable.</EmptyRow> : null}
                </tbody>
              </Table>
              {plan.candidates.length > 5 ? (
                <p className="text-xs text-slate-500">Showing the first 5 of {plan.candidates.length} rows.</p>
              ) : null}
            </div>
          ) : null}

          {step === "matching" ? (
            <div className="space-y-4">
              {(["update", "create", "skipped"] as const).map((outcome) => {
                const group = plan.candidates.filter((c) => c.outcome === outcome);
                if (group.length === 0) return null;
                const heading =
                  outcome === "update"
                    ? `Will update ${group.length} existing line item${group.length === 1 ? "" : "s"}`
                    : outcome === "create"
                      ? `Will create ${group.length} new line item${group.length === 1 ? "" : "s"}`
                      : `Skipped ${group.length} ambiguous row${group.length === 1 ? "" : "s"}`;
                return (
                  <section key={outcome}>
                    <h3 className="text-sm font-semibold text-slate-900">{heading}</h3>
                    <ul className="mt-1 space-y-1">
                      {group.map((c) => (
                        <li key={c.row} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-1.5 text-sm">
                          <span>
                            {c.lineItemName}
                            <span className="ml-2 text-xs text-slate-500">
                              {BUDGET_CATEGORY_LABELS[c.category]}
                            </span>
                            {c.warnings.map((w) => (
                              <span key={w} className="block text-xs text-amber-700">{w}</span>
                            ))}
                          </span>
                          {outcome === "skipped" ? (
                            <Badge tone="neutral">Not imported</Badge>
                          ) : (
                            <label className="flex items-center gap-1.5 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={!excluded.has(c.row)}
                                onChange={() =>
                                  setExcluded((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(c.row)) next.delete(c.row);
                                    else next.add(c.row);
                                    return next;
                                  })
                                }
                                className="h-3.5 w-3.5 rounded border-slate-300"
                              />
                              Include
                            </label>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : null}

          {step === "summary" ? (
            <p className="text-sm text-slate-700">
              Imported {committedCount} line item{committedCount === 1 ? "" : "s"} from {filename}.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
          <p className="text-xs text-slate-500">
            {step === "matching"
              ? `${included.length} row${included.length === 1 ? "" : "s"} will be written.`
              : "Nothing is saved until the final step."}
          </p>
          <span className="flex gap-2">
            {step === "summary" ? (
              <Button variant="primary" onClick={onClose}>Done</Button>
            ) : (
              <>
                <Button onClick={onClose}>Cancel</Button>
                {step !== "upload" ? (
                  <Button
                    onClick={() => setStep(STEP_ORDER[Math.max(0, STEP_ORDER.indexOf(step) - 1)])}
                  >
                    Back
                  </Button>
                ) : null}
                {step === "mapping" || step === "preview" ? (
                  <Button
                    variant="primary"
                    disabled={step === "preview" && plan.candidates.length === 0}
                    onClick={() => setStep(step === "mapping" ? "preview" : "matching")}
                  >
                    Continue
                  </Button>
                ) : null}
                {step === "matching" ? (
                  <Button variant="primary" disabled={included.length === 0} onClick={() => void commit()}>
                    Import {included.length} row{included.length === 1 ? "" : "s"}
                  </Button>
                ) : null}
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
