"use client";

/**
 * FR-4/FR-7 — one wizard for both imports. Pipeline and survey differ only in their field
 * list and what "confirm" does, so they share the upload → map → preview → confirm shell.
 *
 * The pipeline preview shows each row's computed attribution *before* committing, which is
 * the point: a planner should see how their data will be classified while they can still
 * change the mapping.
 */

import { useMemo, useState } from "react";
import {
  ATTRIBUTION_LABELS,
  parseCsv,
  rowsToPipelineOpportunities,
  rowsToSurveyResponses,
  suggestPipelineColumnMapping,
  suggestSurveyColumnMapping,
  type AttributionSettings,
  type MappedColumn,
  type PipelineField,
  type PipelineOpportunity,
  type SurveyField,
  type SurveyResponse,
} from "@event-toolkit/roi-report-core";
import { Badge, Button, Card, CardBody, CardHeader, Select, Table, Td, Th } from "@event-toolkit/ui";

const PIPELINE_FIELDS: Array<PipelineField | "ignore"> = [
  "recordId", "recordType", "opportunityName", "contactName", "contactEmail", "company",
  "createdDate", "amount", "stage", "isWon", "closeDate", "attributionType", "ignore",
];

const SURVEY_FIELDS: Array<SurveyField | "ignore"> = [
  "respondentId", "respondentEmail", "respondentType", "npsScore", "csatScore", "comment",
  "respondedAt", "ignore",
];

const FIELD_LABELS: Record<string, string> = {
  recordId: "Record id (required)",
  recordType: "Record type (opportunity/meeting)",
  opportunityName: "Opportunity name",
  contactName: "Contact name",
  contactEmail: "Contact email",
  company: "Company / account",
  createdDate: "Created date (required)",
  amount: "Amount",
  stage: "Stage",
  isWon: "Closed won",
  closeDate: "Close date",
  attributionType: "CRM attribution",
  respondentId: "Respondent id",
  respondentEmail: "Respondent email",
  respondentType: "Respondent type",
  npsScore: "NPS score (0-10)",
  csatScore: "CSAT score",
  comment: "Comment",
  respondedAt: "Responded at",
  ignore: "Ignore this column",
};

type Step = "upload" | "mapping" | "preview" | "done";

export function ImportWizard({
  kind,
  reportId,
  eventWindow,
  settings,
  onCommitPipeline,
  onCommitSurvey,
}: {
  kind: "pipeline" | "survey";
  reportId: string;
  eventWindow: { eventStartDate: string; eventEndDate: string };
  settings: AttributionSettings;
  onCommitPipeline?: (rows: PipelineOpportunity[], filename: string, mapping: MappedColumn<PipelineField>[]) => Promise<{ updated: number; created: number }>;
  onCommitSurvey?: (rows: SurveyResponse[], filename: string, mapping: MappedColumn<SurveyField>[]) => Promise<number>;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [mapping, setMapping] = useState<Array<MappedColumn<string>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const fields = kind === "pipeline" ? PIPELINE_FIELDS : SURVEY_FIELDS;

  const onFile = async (file: File) => {
    setError(null);
    setFilename(file.name);
    try {
      const isCsv = /\.(csv|tsv|txt)$/i.test(file.name);
      let table: { headers: string[]; rows: Array<Record<string, unknown>> };
      if (isCsv) {
        table = parseCsv(await file.text());
      } else {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
        const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: 0 })[0] ?? [];
        table = { headers: headerRow.map((h) => String(h ?? "").trim()).filter(Boolean), rows };
      }
      if (table.rows.length === 0) {
        setError("That file has no data rows.");
        return;
      }
      setHeaders(table.headers);
      setRawRows(table.rows);
      setMapping(
        kind === "pipeline"
          ? suggestPipelineColumnMapping(table.headers)
          : suggestSurveyColumnMapping(table.headers),
      );
      setStep("mapping");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  const parsedPipeline = useMemo(() => {
    if (kind !== "pipeline" || rawRows.length === 0) return null;
    return rowsToPipelineOpportunities(
      rawRows,
      mapping as MappedColumn<PipelineField>[],
      reportId,
      "preview",
      eventWindow,
      settings,
      /\.xlsx?$/i.test(filename) ? "xlsx_import" : "csv_import",
    );
  }, [kind, rawRows, mapping, reportId, eventWindow, settings, filename]);

  const parsedSurvey = useMemo(() => {
    if (kind !== "survey" || rawRows.length === 0) return null;
    return rowsToSurveyResponses(rawRows, mapping as MappedColumn<SurveyField>[], reportId, "preview");
  }, [kind, rawRows, mapping, reportId]);

  const commit = async () => {
    if (kind === "pipeline" && parsedPipeline && onCommitPipeline) {
      const result = await onCommitPipeline(parsedPipeline.rows, filename, mapping as MappedColumn<PipelineField>[]);
      setSummary(`${result.created} new record${result.created === 1 ? "" : "s"}, ${result.updated} updated.`);
    } else if (kind === "survey" && parsedSurvey && onCommitSurvey) {
      const count = await onCommitSurvey(parsedSurvey, filename, mapping as MappedColumn<SurveyField>[]);
      setSummary(`${count} response${count === 1 ? "" : "s"} imported.`);
    }
    setStep("done");
  };

  const reset = () => {
    setStep("upload");
    setHeaders([]);
    setRawRows([]);
    setMapping([]);
    setFilename("");
    setSummary(null);
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-content">
            {kind === "pipeline" ? "Import pipeline outcomes" : "Import survey results"}
          </h2>
          <p className="text-xs text-content-muted">
            {kind === "pipeline"
              ? "A CRM opportunity export. Re-importing updates matching records rather than duplicating them."
              : "A survey export. NPS is computed from the 0-10 recommend question."}
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        ) : null}

        {step === "upload" ? (
          <input
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
            className="block w-full text-sm text-content-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-fg hover:file:bg-accent-hover"
          />
        ) : null}

        {step === "mapping" ? (
          <>
            <p className="text-sm text-content-muted">
              {filename} · {rawRows.length} rows
            </p>
            {kind === "pipeline" && parsedPipeline?.amountUnmapped ? (
              <p className="rounded-lg border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-warning-text">
                No column is mapped to <strong>Amount</strong>. Every pipeline figure and the ROI
                ratio will be zero — map it unless your export genuinely has no values.
              </p>
            ) : null}
            <Table>
              <thead>
                <tr>
                  <Th>Column</Th>
                  <Th className="w-64">Imports as</Th>
                  <Th>First value</Th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((column, index) => (
                  <tr key={column.sourceColumn}>
                    <Td className="font-medium">{column.sourceColumn}</Td>
                    <Td>
                      <Select
                        value={column.targetField}
                        aria-label={`Map column ${column.sourceColumn}`}
                        onChange={(e) =>
                          setMapping((prev) =>
                            prev.map((m, i) =>
                              i === index ? { ...m, targetField: e.target.value, confidence: "manual" } : m,
                            ),
                          )
                        }
                      >
                        {fields.map((field) => (
                          <option key={field} value={field}>
                            {FIELD_LABELS[field] ?? field}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td className="text-xs text-content-muted">
                      {String(rawRows[0]?.[column.sourceColumn] ?? "")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {headers.length === 0 ? <p className="text-sm text-content-muted">No columns detected.</p> : null}
          </>
        ) : null}

        {step === "preview" ? (
          kind === "pipeline" && parsedPipeline ? (
            <>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="success">{parsedPipeline.rows.length} readable</Badge>
                {parsedPipeline.errors.length > 0 ? (
                  <Badge tone="warning">{parsedPipeline.errors.length} unusable</Badge>
                ) : null}
              </p>
              {parsedPipeline.errors.length > 0 ? (
                <ul className="max-h-24 overflow-y-auto rounded-lg border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-text">
                  {parsedPipeline.errors.map((e) => (
                    <li key={`${e.row}-${e.reason}`}>Row {e.row}: {e.reason}</li>
                  ))}
                </ul>
              ) : null}
              <Table>
                <thead>
                  <tr>
                    <Th>Record</Th>
                    <Th className="w-28">Created</Th>
                    <Th className="w-28 text-right">Amount</Th>
                    <Th className="w-44">Will classify as</Th>
                  </tr>
                </thead>
                <tbody>
                  {parsedPipeline.rows.slice(0, 5).map((row) => (
                    <tr key={row.recordId}>
                      <Td>
                        {row.opportunityName ?? row.recordId}
                        <span className="block text-xs text-content-muted">{row.recordType}</span>
                      </Td>
                      <Td className="text-xs">{row.createdDate}</Td>
                      <Td className="text-right tabular-nums">{row.amount.toLocaleString()}</Td>
                      <Td>
                        <Badge tone={row.effectiveAttributionType === "outside_window" ? "neutral" : "info"}>
                          {ATTRIBUTION_LABELS[row.effectiveAttributionType]}
                        </Badge>
                        {row.importedAttributionType && row.importedAttributionType !== row.computedAttributionType ? (
                          <span className="block text-xs text-warning-text">
                            CRM says {row.importedAttributionType}, timing says {row.computedAttributionType}
                          </span>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          ) : parsedSurvey ? (
            <Table>
              <thead>
                <tr>
                  <Th>Respondent</Th>
                  <Th className="w-24 text-right">NPS</Th>
                  <Th className="w-24 text-right">CSAT</Th>
                  <Th>Comment</Th>
                </tr>
              </thead>
              <tbody>
                {parsedSurvey.slice(0, 5).map((row) => (
                  <tr key={row.id}>
                    <Td>{row.respondentEmail ?? row.respondentId ?? "anonymous"}</Td>
                    <Td className="text-right tabular-nums">{row.npsScore ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{row.csatScore ?? "—"}</Td>
                    <Td className="text-xs">{row.comment ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : null
        ) : null}

        {step === "done" && summary ? <p className="text-sm text-content-muted">{summary}</p> : null}

        <div className="flex flex-wrap gap-2">
          {step === "mapping" ? (
            <>
              <Button onClick={reset}>Cancel</Button>
              <Button variant="primary" onClick={() => setStep("preview")}>
                Preview
              </Button>
            </>
          ) : null}
          {step === "preview" ? (
            <>
              <Button onClick={() => setStep("mapping")}>Back</Button>
              <Button variant="primary" onClick={() => void commit()}>
                Import
              </Button>
            </>
          ) : null}
          {step === "done" ? <Button variant="primary" onClick={reset}>Import another file</Button> : null}
        </div>
      </CardBody>
    </Card>
  );
}
