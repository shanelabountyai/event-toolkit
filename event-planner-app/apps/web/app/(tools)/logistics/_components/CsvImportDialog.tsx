"use client";

/**
 * FR-6 — shipping CSV import with a preview step. Nothing is written to the pack until the
 * planner has seen exactly what parsed and what didn't.
 */

import { useRef, useState } from "react";
import {
  SHIPPING_CSV_COLUMNS,
  SHIPPING_CSV_TEMPLATE,
  parseShippingCsv,
  type ParsedShippingCsv,
  type ShippingManifestItem,
} from "@event-toolkit/logistics";
import { Badge, Button, EmptyRow, Table, Td, Th } from "@event-toolkit/ui";
import { triggerDownload } from "@/lib/download";

export function CsvImportDialog({
  onImport,
  onClose,
}: {
  onImport: (items: ShippingManifestItem[]) => void;
  onClose: () => void;
}) {
  const [parsed, setParsed] = useState<ParsedShippingCsv | null>(null);
  const [filename, setFilename] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setFilename(file.name);
    setParsed(parseShippingCsv(await file.text()));
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-import-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
    >
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id="csv-import-title" className="text-base font-semibold text-slate-900">
            Import shipping manifest from CSV
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Columns: <code className="rounded bg-slate-100 px-1">{SHIPPING_CSV_COLUMNS.join(", ")}</code>.
            Only <strong>item</strong> and <strong>shipTo</strong> are required. A header row is
            detected automatically, in any column order.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
              className="block text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                triggerDownload("shipping-manifest-template.csv", SHIPPING_CSV_TEMPLATE, "text/csv")
              }
            >
              Download template
            </Button>
          </div>

          {parsed ? (
            <>
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <span className="font-medium">{filename}</span>
                <Badge tone={parsed.items.length > 0 ? "success" : "neutral"}>
                  {parsed.items.length} row{parsed.items.length === 1 ? "" : "s"} ready
                </Badge>
                {parsed.errors.length > 0 ? (
                  <Badge tone="warning">{parsed.errors.length} skipped</Badge>
                ) : null}
              </p>

              {parsed.errors.length > 0 ? (
                <ul className="max-h-32 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {parsed.errors.map((err) => (
                    <li key={`${err.row}-${err.reason}`}>
                      Line {err.row}: {err.reason}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Item</Th>
                      <Th className="text-right">Qty</Th>
                      <Th>Ship to</Th>
                      <Th>Carrier</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.items.length === 0 ? (
                      <EmptyRow colSpan={5}>Nothing importable in this file.</EmptyRow>
                    ) : (
                      parsed.items.map((item) => (
                        <tr key={item.id}>
                          <Td>{item.item}</Td>
                          <Td className="text-right tabular-nums">{item.quantity}</Td>
                          <Td>{item.shipTo}</Td>
                          <Td>{item.carrier ?? "—"}</Td>
                          <Td>{item.status}</Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Choose a file to preview what will be imported.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!parsed || parsed.items.length === 0}
            onClick={() => {
              if (parsed) onImport(parsed.items);
            }}
          >
            Import {parsed?.items.length ?? 0} row{parsed?.items.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </div>
  );
}
