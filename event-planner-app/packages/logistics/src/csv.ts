// packages/logistics/src/csv.ts
//
// Shipping manifest CSV import (FR-6). Pure parsing: the UI shows a preview of what this
// returns and only commits on confirm, so a bad file is visible before it touches the pack.

import { newShippingItem } from "./defaults";
import { SHIPPING_STATUSES, type ShippingManifestItem, type ShippingStatus } from "./logistics-pack";

/** The fixed column template offered as a downloadable header row. */
export const SHIPPING_CSV_COLUMNS = [
  "item",
  "quantity",
  "shipTo",
  "carrier",
  "trackingNumber",
  "shipByDate",
  "status",
  "owner",
  "notes",
] as const;

export const SHIPPING_CSV_TEMPLATE = `${SHIPPING_CSV_COLUMNS.join(",")}\nBooth panels,2,Moscone West Loading Dock,FedEx,1234567890,2026-11-05,not_shipped,Dana Rivera,Crate 1 of 2\n`;

export interface CsvRowIssue {
  /** 1-based line number in the source file, matching what the planner sees in a text editor. */
  row: number;
  reason: string;
}

export interface ParsedShippingCsv {
  items: ShippingManifestItem[];
  errors: CsvRowIssue[];
}

/**
 * Split one CSV line, honouring double-quoted fields (so a quoted "notes" cell may contain
 * commas). Doubled quotes inside a quoted field are an escaped quote, per RFC 4180.
 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

/**
 * Parse a shipping manifest CSV.
 *
 * Column order is taken from the header row when one is present, so a planner who reorders
 * columns in Excel still gets a correct import; without a header, the fixed template order is
 * assumed. Rows that fail validation are reported with a line number and reason rather than
 * failing the whole file.
 */
export function parseShippingCsv(csvText: string): ParsedShippingCsv {
  const items: ShippingManifestItem[] = [];
  const errors: CsvRowIssue[] = [];
  const lines = (csvText ?? "").split(/\r\n|\n|\r/);

  // Column names are matched case-insensitively throughout, so the fallback order is
  // lower-cased up front — `shipTo` would otherwise never match a lookup for `shipto`.
  const KNOWN = SHIPPING_CSV_COLUMNS.map((c) => c.toLowerCase());
  let columns: string[] = [...KNOWN];
  let headerSeen = false;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (!raw.trim()) continue;

    const cells = splitCsvLine(raw);

    if (!headerSeen) {
      headerSeen = true;
      // A header is a row whose cells are (mostly) column names — checking every cell rather
      // than just the first means a planner who reorders columns in Excel still imports right.
      const lowered = cells.map((c) => c.toLowerCase());
      const known = lowered.filter((c) => KNOWN.includes(c)).length;
      if (known >= 2 && known >= lowered.length - 1) {
        columns = lowered;
        continue;
      }
    }

    const value = (name: (typeof SHIPPING_CSV_COLUMNS)[number]): string => {
      const index = columns.indexOf(name.toLowerCase());
      return index === -1 ? "" : (cells[index] ?? "");
    };

    const item = value("item");
    if (!item) {
      errors.push({ row: lineNo, reason: "Missing an item name" });
      continue;
    }

    const quantityCell = value("quantity") || "1";
    if (!/^\d+$/.test(quantityCell) || Number(quantityCell) < 1) {
      errors.push({ row: lineNo, reason: `"${quantityCell}" is not a whole quantity of 1 or more` });
      continue;
    }

    const shipTo = value("shipTo");
    if (!shipTo) {
      errors.push({ row: lineNo, reason: "Missing a ship-to destination" });
      continue;
    }

    const statusCell = (value("status") || "not_shipped").toLowerCase().replace(/[\s-]+/g, "_");
    if (!SHIPPING_STATUSES.includes(statusCell as ShippingStatus)) {
      errors.push({
        row: lineNo,
        reason: `"${value("status")}" is not one of: ${SHIPPING_STATUSES.join(", ")}`,
      });
      continue;
    }

    const shipByDate = value("shipByDate");
    if (shipByDate && !/^\d{4}-\d{2}-\d{2}$/.test(shipByDate)) {
      errors.push({ row: lineNo, reason: `"${shipByDate}" is not an ISO date (YYYY-MM-DD)` });
      continue;
    }

    items.push(
      newShippingItem({
        item,
        quantity: Number(quantityCell),
        shipTo,
        carrier: value("carrier") || undefined,
        trackingNumber: value("trackingNumber") || undefined,
        shipByDate: shipByDate || undefined,
        status: statusCell as ShippingStatus,
        owner: value("owner") || undefined,
        notes: value("notes") || undefined,
      }),
    );
  }

  return { items, errors };
}
