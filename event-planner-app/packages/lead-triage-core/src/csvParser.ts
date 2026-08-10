// packages/lead-triage-core/src/csvParser.ts
//
// CSV parsing via papaparse — real badge-scan exports carry quoted commas, BOMs, CRLF and
// ragged rows, and hand-rolling that is exactly the kind of "small" code that eats an evening.
//
// XLSX is deliberately NOT handled here: SheetJS is browser-and-bundle-heavy and belongs at
// the app boundary (`apps/web/lib/leads-file.ts`), which converts a workbook into the same
// `ParsedTable` shape this module returns. Keeping CSV here means the parsing path that
// matters most stays testable in Node with no browser and no 160kB dependency.

import Papa from "papaparse";

export interface ParsedTable {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  /** Non-fatal parse complaints, surfaced in the import wizard. */
  warnings: string[];
}

/** Parse CSV text into headers + row objects. */
export function parseCsv(text: string): ParsedTable {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    // Values stay strings; the mapping layer owns coercion so every source behaves the same.
    dynamicTyping: false,
    transformHeader: (header) => header.trim(),
  });

  const warnings = (result.errors ?? [])
    .slice(0, 10)
    .map((error) => `Row ${(error.row ?? 0) + 2}: ${error.message}`);

  const headers = (result.meta?.fields ?? []).filter(Boolean);
  const rows = (result.data ?? []).filter((row) =>
    Object.values(row).some((value) => String(value ?? "").trim() !== ""),
  );

  return { headers, rows, warnings };
}

/** True for filenames this module can handle directly. */
export function isCsvFilename(filename: string): boolean {
  return /\.(csv|tsv|txt)$/i.test(filename);
}
