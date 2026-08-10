// packages/lead-triage-core/src/columnMapping.ts
//
// FR-2 — guess what each column in a badge-scan export means. Every guess is overridable;
// the wizard shows the suggestion and the planner confirms it before anything is imported.

import { newId, nowIso } from "@event-toolkit/schema";
import type {
  ColumnMapping,
  ImportBatch,
  LeadContact,
  LeadField,
  LeadRecord,
  LeadSignals,
} from "./types";
import { normalizeKey } from "./dedupe";

function normalise(header: string): string {
  return (header ?? "").toString().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Header patterns per field. Most specific first — "email address" before "address". */
const HINTS: Array<{ field: LeadField; patterns: string[] }> = [
  { field: "email", patterns: ["email address", "e mail", "email", "work email", "contact email"] },
  { field: "firstName", patterns: ["first name", "firstname", "given name", "first"] },
  { field: "lastName", patterns: ["last name", "lastname", "surname", "family name", "last"] },
  { field: "fullName", patterns: ["full name", "attendee name", "contact name", "name"] },
  { field: "company", patterns: ["company name", "company", "organisation", "organization", "employer", "account"] },
  { field: "jobTitle", patterns: ["job title", "title", "role", "position"] },
  { field: "phone", patterns: ["phone number", "mobile", "telephone", "phone"] },
  { field: "sessionsAttended", patterns: ["sessions attended", "sessions", "session list", "tracks attended"] },
  { field: "sessionsAttendedCount", patterns: ["session count", "sessions count", "number of sessions"] },
  { field: "boothInteractions", patterns: ["booth interactions", "booth scans", "booth visits", "scans", "interactions"] },
  { field: "demoRequested", patterns: ["demo requested", "requested demo", "demo request", "demo"] },
  { field: "registrationStatus", patterns: ["registration status", "attendance status", "status", "attended"] },
  { field: "owner", patterns: ["owner", "sales owner", "assigned to", "rep", "account executive", "ae"] },
];

/**
 * Suggest a target field per column.
 *
 * A field is claimed by at most one column: once "Email Address" takes `email`, a later
 * "Personal Email" falls through rather than fighting over it.
 */
export function suggestColumnMapping(headers: string[]): ColumnMapping[] {
  const claimed = new Set<LeadField>();

  return headers.map((sourceColumn) => {
    const normalised = normalise(sourceColumn);
    let targetField: ColumnMapping["targetField"] = "ignore";

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

/* -------------------------------------------------------------------------- */
/* Cell coercion                                                              */
/* -------------------------------------------------------------------------- */

const TRUTHY = new Set(["yes", "y", "true", "1", "requested", "x", "✓"]);
const FALSEY = new Set(["no", "n", "false", "0", "", "-"]);

export function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (TRUTHY.has(text)) return true;
  if (FALSEY.has(text)) return false;
  return Boolean(text);
}

export function parseCount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

/** A session list cell: "Keynote; Workshop A" or "Keynote, Workshop A" or a single value. */
export function parseList(value: unknown): string[] {
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text
    .split(/[;|]|,(?![^(]*\))/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseRegistrationStatus(value: unknown): LeadSignals["registrationStatus"] {
  const text = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (text.includes("no_show") || text.includes("noshow")) return "no_show";
  if (text.includes("attend")) return "attended";
  if (text.includes("regist")) return "registered";
  return undefined;
}

export interface MappedRow {
  contact: LeadContact;
  signals: LeadSignals;
  ownerName: string | null;
}

/** Apply a confirmed mapping to one raw row. */
export function applyMapping(
  row: Record<string, unknown>,
  mapping: ColumnMapping[],
): MappedRow {
  const contact: LeadContact = {};
  const signals: LeadSignals = {
    sessionsAttended: [],
    sessionsAttendedCount: 0,
    boothInteractions: 0,
    demoRequested: false,
  };
  let ownerName: string | null = null;

  for (const column of mapping) {
    if (column.targetField === "ignore") continue;
    const raw = row[column.sourceColumn];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    const text = String(raw).trim();

    switch (column.targetField) {
      case "firstName":
      case "lastName":
      case "fullName":
      case "email":
      case "company":
      case "jobTitle":
      case "phone":
        contact[column.targetField] = text;
        break;
      case "sessionsAttended":
        signals.sessionsAttended = parseList(raw);
        break;
      case "sessionsAttendedCount":
        signals.sessionsAttendedCount = parseCount(raw);
        break;
      case "boothInteractions":
        signals.boothInteractions = parseCount(raw);
        break;
      case "demoRequested":
        signals.demoRequested = parseBoolean(raw);
        break;
      case "registrationStatus":
        signals.registrationStatus = parseRegistrationStatus(raw);
        break;
      case "owner":
        ownerName = text;
        break;
      case "customSignal":
        if (column.customSignalKey) {
          signals.customSignals = { ...(signals.customSignals ?? {}), [column.customSignalKey]: text };
        }
        break;
    }
  }

  // A list of sessions is itself the count, unless the file only gave us a number.
  if (signals.sessionsAttended.length > 0) {
    signals.sessionsAttendedCount = Math.max(
      signals.sessionsAttended.length,
      signals.sessionsAttendedCount,
    );
  }

  return { contact, signals, ownerName };
}

/** Turn confirmed rows into fresh lead records, before dedupe and scoring run over them. */
export function rowsToLeads(
  rows: Array<Record<string, unknown>>,
  mapping: ColumnMapping[],
  triageSessionId: string,
  importBatchId: string,
): LeadRecord[] {
  const timestamp = nowIso();
  const leads: LeadRecord[] = [];

  rows.forEach((row, rowIndex) => {
    const { contact, signals, ownerName } = applyMapping(row, mapping);
    // A row with nothing identifying is noise, not a lead.
    if (!contact.email && !contact.fullName && !contact.firstName && !contact.lastName) return;

    leads.push({
      id: newId(),
      triageSessionId,
      dedupeKey: normalizeKey(contact),
      contact,
      signals,
      score: 0,
      scoreBreakdown: [],
      tier: "cold",
      ownerId: null,
      ownerName,
      assignmentMethod: ownerName ? "column_mapped" : null,
      status: "new",
      followUpDraft: null,
      sourceRows: [{ importBatchId, rowIndex }],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  return leads;
}

export function newImportBatch(
  triageSessionId: string,
  filename: string,
  mapping: ColumnMapping[],
  rowCount: number,
  sourceType?: ImportBatch["sourceType"],
): ImportBatch {
  return {
    id: newId(),
    triageSessionId,
    filename,
    sourceType,
    columnMapping: mapping,
    rowCount,
    importedAt: nowIso(),
  };
}
