/**
 * The only place the spreadsheet library is touched.
 *
 * `packages/budget-calc` owns the mapping, validation and sheet-building logic as pure
 * functions; this file is the thin boundary that turns a browser `File` into rows and a
 * workbook definition into a download.
 *
 * The library is imported dynamically inside each function rather than at module scope: it is
 * ~160kB and only needed the moment someone actually imports or exports a spreadsheet, so
 * eager-loading it would put that on every visit to the budget page.
 *
 * Note on the dependency: `xlsx` is installed from SheetJS's own CDN tarball, not from npm.
 * The npm-published 0.18.5 is abandoned and carries two unpatched high-severity advisories
 * (prototype pollution, ReDoS) — and this code path parses files a planner was handed by a
 * vendor. Keep it pinned to the CDN build when upgrading.
 */

import type { ExportWorkbook, SheetRow } from "@event-toolkit/budget-calc";
import { sheetToCsv } from "@event-toolkit/budget-calc";
import { triggerDownload } from "./download";

export interface ParsedSheet {
  headers: string[];
  rows: SheetRow[];
}

/** Read the first sheet of a CSV or XLSX file into headers + row objects. */
export async function readSpreadsheet(file: File): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[firstSheetName];
  // `defval: ""` keeps empty cells present, so a column that is blank in the first rows still
  // shows up in the mapping step instead of silently disappearing.
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "", raw: true });

  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: 0 })[0] ?? [];
  const headers = headerRow.map((h) => String(h ?? "").trim()).filter(Boolean);

  return { headers: headers.length > 0 ? headers : Object.keys(rows[0] ?? {}), rows };
}

/** FR-10 — download the three-sheet finance workbook. */
export async function downloadWorkbook(workbook: ExportWorkbook, filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sheet of workbook.sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** FR-10 — the flat CSV alternative: the Line Items sheet only. */
export function downloadCsv(workbook: ExportWorkbook, filename: string): void {
  const lineItems = workbook.sheets[0];
  triggerDownload(filename, sheetToCsv(lineItems.rows), "text/csv");
}
