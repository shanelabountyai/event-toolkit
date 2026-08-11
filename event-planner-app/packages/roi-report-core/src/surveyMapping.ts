// packages/roi-report-core/src/surveyMapping.ts
//
// FR-7 — survey exports. The NPS question is rarely called "npsScore" in the wild.

import { newId, nowIso } from "@event-toolkit/schema";
import type { MappedColumn, SurveyField, SurveyResponse } from "./types";

const HINTS: Array<{ field: SurveyField; patterns: string[] }> = [
  { field: "npsScore", patterns: ["nps", "recommend", "likelihood to recommend", "net promoter"] },
  { field: "csatScore", patterns: ["csat", "satisfaction", "overall rating", "rating"] },
  { field: "respondentEmail", patterns: ["email address", "email", "respondent email"] },
  { field: "respondentId", patterns: ["respondent id", "response id", "id"] },
  { field: "respondentType", patterns: ["respondent type", "attendee type", "role", "type"] },
  { field: "comment", patterns: ["comment", "feedback", "what could", "open text", "notes"] },
  { field: "respondedAt", patterns: ["responded at", "response date", "submitted", "date"] },
];

function normalise(header: string): string {
  return (header ?? "").toString().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function suggestSurveyColumnMapping(headers: string[]): MappedColumn<SurveyField>[] {
  const claimed = new Set<SurveyField>();
  return headers.map((sourceColumn) => {
    const normalised = normalise(sourceColumn);
    let targetField: SurveyField | "ignore" = "ignore";
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

function parseScore(value: unknown, max: number): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > max) return null;
  return parsed;
}

function parseRespondentType(value: unknown): SurveyResponse["respondentType"] {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return undefined;
  if (text.includes("speaker")) return "speaker";
  if (text.includes("sponsor")) return "sponsor";
  if (text.includes("exhibit")) return "exhibitor";
  if (text.includes("attend")) return "attendee";
  return "other";
}

export function rowsToSurveyResponses(
  rawRows: Array<Record<string, unknown>>,
  mapping: MappedColumn<SurveyField>[],
  reportId: string,
  batchId: string,
): SurveyResponse[] {
  const timestamp = nowIso();
  const columnFor = (field: SurveyField) => mapping.find((m) => m.targetField === field)?.sourceColumn;

  return rawRows.map((raw) => {
    const cell = (field: SurveyField) => {
      const column = columnFor(field);
      return column ? raw[column] : undefined;
    };
    return {
      id: newId(),
      roiReportId: reportId,
      respondentId: String(cell("respondentId") ?? "").trim() || undefined,
      respondentEmail: String(cell("respondentEmail") ?? "").trim() || undefined,
      respondentType: parseRespondentType(cell("respondentType")),
      npsScore: parseScore(cell("npsScore"), 10),
      csatScore: parseScore(cell("csatScore"), 10),
      comment: String(cell("comment") ?? "").trim() || undefined,
      respondedAt: String(cell("respondedAt") ?? "").trim() || undefined,
      sourceImportBatchId: batchId,
      createdAt: timestamp,
    };
  });
}
