// packages/roi-report-core/src/pipelineMapping.ts
//
// FR-4 — guess what a CRM opportunity export's columns mean, then let the planner correct it.

import { newId, nowIso } from "@event-toolkit/schema";
import type {
  AttributionSettings,
  AttributionType,
  MappedColumn,
  PipelineField,
  PipelineImportSource,
  PipelineOpportunity,
} from "./types";
import { computeAttribution, effectiveAttribution, type EventWindow } from "./attribution";

const HINTS: Array<{ field: PipelineField; patterns: string[] }> = [
  { field: "recordId", patterns: ["opportunity id", "opp id", "record id", "crm id", "id"] },
  { field: "opportunityName", patterns: ["opportunity name", "opportunity", "deal name", "name"] },
  { field: "contactEmail", patterns: ["contact email", "email address", "email"] },
  { field: "contactName", patterns: ["contact name", "contact", "primary contact"] },
  { field: "company", patterns: ["account name", "company name", "account", "company"] },
  { field: "createdDate", patterns: ["created date", "create date", "opened", "created"] },
  { field: "amount", patterns: ["amount", "value", "deal size", "arr", "acv"] },
  { field: "stage", patterns: ["stage", "status"] },
  { field: "isWon", patterns: ["is won", "won", "closed won"] },
  { field: "closeDate", patterns: ["close date", "closed date"] },
  { field: "attributionType", patterns: ["attribution", "source type", "campaign type"] },
  { field: "recordType", patterns: ["record type", "type"] },
];

function normalise(header: string): string {
  return (header ?? "").toString().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function suggestPipelineColumnMapping(headers: string[]): MappedColumn<PipelineField>[] {
  const claimed = new Set<PipelineField>();
  return headers.map((sourceColumn) => {
    const normalised = normalise(sourceColumn);
    let targetField: PipelineField | "ignore" = "ignore";
    for (const hint of HINTS) {
      if (claimed.has(hint.field)) continue;
      if (hint.patterns.some((p) => normalised === p || normalised.includes(p))) {
        targetField = hint.field;
        claimed.add(hint.field);
        break;
      }
    }
    return { sourceColumn, targetField, confidence: "auto" as const };
  });
}

export function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[()]/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((negative ? -Math.abs(parsed) : parsed) * 100) / 100;
}

/** Normalise a date cell to YYYY-MM-DD, accepting the usual CRM export formats. */
export function parseIsoDateCell(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // US-style m/d/yyyy — the dominant CRM export format.
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, "0")}-${`${parsed.getDate()}`.padStart(2, "0")}`;
  }
  return "";
}

function parseBool(value: unknown): boolean | undefined {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return undefined;
  if (["yes", "y", "true", "1", "won", "closed won"].includes(text)) return true;
  if (["no", "n", "false", "0", "lost", "open"].includes(text)) return false;
  return undefined;
}

function parseAttributionType(value: unknown): AttributionType | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (text.includes("source")) return "sourced";
  if (text.includes("influence")) return "influenced";
  return null;
}

export interface PipelineRowIssue {
  row: number;
  reason: string;
}

export interface ParsedPipelineRows {
  rows: PipelineOpportunity[];
  errors: PipelineRowIssue[];
  /** True when no column was mapped to `amount` — every ROI figure would be zero. */
  amountUnmapped: boolean;
}

export function rowsToPipelineOpportunities(
  rawRows: Array<Record<string, unknown>>,
  mapping: MappedColumn<PipelineField>[],
  reportId: string,
  batchId: string,
  window: EventWindow,
  settings: AttributionSettings,
  source: PipelineImportSource,
): ParsedPipelineRows {
  const errors: PipelineRowIssue[] = [];
  const rows: PipelineOpportunity[] = [];
  const timestamp = nowIso();
  const columnFor = (field: PipelineField) =>
    mapping.find((m) => m.targetField === field)?.sourceColumn;

  const idColumn = columnFor("recordId");
  const dateColumn = columnFor("createdDate");
  const amountColumn = columnFor("amount");

  rawRows.forEach((raw, index) => {
    const rowNo = index + 1;
    const cell = (field: PipelineField): string => {
      const column = columnFor(field);
      return column ? String(raw[column] ?? "").trim() : "";
    };

    const recordId = idColumn ? String(raw[idColumn] ?? "").trim() : "";
    if (!recordId) {
      errors.push({ row: rowNo, reason: "Missing a record id — needed to dedupe re-imports" });
      return;
    }

    const createdDate = dateColumn ? parseIsoDateCell(raw[dateColumn]) : "";
    if (!createdDate) {
      errors.push({ row: rowNo, reason: "Missing or unreadable created date — attribution needs it" });
      return;
    }

    const importedAttributionType = parseAttributionType(cell("attributionType"));
    const computed = computeAttribution(createdDate, window, settings);
    const recordTypeCell = cell("recordType").toLowerCase();

    rows.push({
      id: newId(),
      roiReportId: reportId,
      recordId,
      recordType: recordTypeCell.includes("meeting") ? "meeting" : "opportunity",
      opportunityName: cell("opportunityName") || undefined,
      contactName: cell("contactName") || undefined,
      contactEmail: cell("contactEmail") || undefined,
      company: cell("company") || undefined,
      createdDate,
      amount: amountColumn ? parseAmount(raw[amountColumn]) : 0,
      stage: cell("stage") || undefined,
      isWon: parseBool(cell("isWon")),
      closeDate: parseIsoDateCell(cell("closeDate")) || undefined,
      importedAttributionType,
      computedAttributionType: computed,
      effectiveAttributionType: effectiveAttribution(computed, importedAttributionType, settings),
      leadMatchStatus: "not_checked",
      source,
      sourceImportBatchId: batchId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  return { rows, errors, amountUnmapped: !amountColumn };
}

/** FR-4 — re-importing updates the matching `recordId` rather than duplicating it. */
export function mergePipelineRows(
  existing: PipelineOpportunity[],
  incoming: PipelineOpportunity[],
): { rows: PipelineOpportunity[]; updated: number; created: number } {
  const byRecordId = new Map(existing.map((row) => [row.recordId, row]));
  let updated = 0;
  let created = 0;

  for (const row of incoming) {
    const prior = byRecordId.get(row.recordId);
    if (prior) {
      byRecordId.set(row.recordId, { ...row, id: prior.id, createdAt: prior.createdAt });
      updated += 1;
    } else {
      byRecordId.set(row.recordId, row);
      created += 1;
    }
  }

  return { rows: [...byRecordId.values()], updated, created };
}
