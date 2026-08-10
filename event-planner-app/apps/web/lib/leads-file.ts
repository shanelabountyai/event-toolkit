/**
 * File boundary for lead triage: XLSX in and out.
 *
 * CSV parsing lives in `@event-toolkit/lead-triage-core` (papaparse, testable in Node). Only
 * the spreadsheet path needs SheetJS, and it is imported dynamically so its ~160kB never
 * loads for a planner who only ever touches CSVs.
 *
 * Same dependency caveat as the budget tool: `xlsx` is pinned to SheetJS's CDN tarball rather
 * than the abandoned npm build, which carries unpatched prototype-pollution and ReDoS
 * advisories — and this path parses files handed over by third parties.
 */

import { parseCsv, isCsvFilename, toCsv, type ParsedTable, type SheetMatrix } from "@event-toolkit/lead-triage-core";
import { triggerDownload } from "./download";

/** Read a CSV or XLSX file into the same headers + rows shape. */
export async function readLeadFile(file: File): Promise<ParsedTable> {
  if (isCsvFilename(file.name)) return parseCsv(await file.text());

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [], warnings: ["That file has no sheets."] };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: 0 })[0] ?? [];
  const headers = headerRow.map((h) => String(h ?? "").trim()).filter(Boolean);

  return {
    headers: headers.length > 0 ? headers : Object.keys(rows[0] ?? {}),
    rows: rows.filter((row) => Object.values(row).some((v) => String(v ?? "").trim() !== "")),
    warnings: [],
  };
}

export function downloadLeadCsv(rows: SheetMatrix, basename: string): void {
  triggerDownload(`${basename}.csv`, toCsv(rows), "text/csv");
}

export async function downloadLeadXlsx(
  files: Array<{ sheetName: string; rows: SheetMatrix }>,
  basename: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const file of files) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(file.rows), file.sheetName.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${basename}.xlsx`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
