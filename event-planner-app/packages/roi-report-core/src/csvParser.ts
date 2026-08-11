// packages/roi-report-core/src/csvParser.ts
//
// Same split as PRD 5: CSV here (papaparse, testable in Node), XLSX at the app boundary.

import Papa from "papaparse";

export interface ParsedTable {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  warnings: string[];
}

export function parseCsv(text: string): ParsedTable {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (header) => header.trim(),
  });

  return {
    headers: (result.meta?.fields ?? []).filter(Boolean),
    rows: (result.data ?? []).filter((row) =>
      Object.values(row).some((value) => String(value ?? "").trim() !== ""),
    ),
    warnings: (result.errors ?? []).slice(0, 10).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`),
  };
}

export function isCsvFilename(filename: string): boolean {
  return /\.(csv|tsv|txt)$/i.test(filename);
}
