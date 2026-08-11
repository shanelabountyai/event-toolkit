"use client";

/** FR-2/FR-3 — upload → map columns → preview → confirm. Repeatable into one lead pool. */

import { useState } from "react";
import {
  LEAD_FIELDS,
  LEAD_FIELD_LABELS,
  newImportBatch,
  rowsToLeads,
  suggestColumnMapping,
  type ColumnMapping,
  type ImportBatch,
  type LeadField,
  type LeadRecord,
  type ParsedTable,
} from "@event-toolkit/lead-triage-core";
import { Badge, Button, Card, CardBody, CardHeader, Select, Table, Td, Th, TextInput } from "@event-toolkit/ui";
import { readLeadFile } from "@/lib/leads-file";
import { ImportPrivacyNotice } from "@/components/ImportPrivacyNotice";

type Step = "upload" | "mapping" | "preview" | "done";

export function ImportWizard({
  sessionId,
  onImported,
  batches,
}: {
  sessionId: string;
  onImported: (leads: LeadRecord[], batch: ImportBatch) => Promise<{ merged: number; queued: number }>;
  batches: ImportBatch[];
}) {
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ imported: number; merged: number; queued: number } | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    setFilename(file.name);
    try {
      const table = await readLeadFile(file);
      if (table.rows.length === 0) {
        setError("That file has no data rows.");
        return;
      }
      setParsed(table);
      setMapping(suggestColumnMapping(table.headers));
      setStep("mapping");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  };

  const preview = parsed ? rowsToLeads(parsed.rows.slice(0, 5), mapping, sessionId, "preview") : [];

  const confirm = async () => {
    if (!parsed) return;
    const batch = newImportBatch(sessionId, filename, mapping, parsed.rows.length);
    const leads = rowsToLeads(parsed.rows, mapping, sessionId, batch.id);
    const result = await onImported(leads, batch);
    setSummary({ imported: leads.length, ...result });
    setStep("done");
  };

  const reset = () => {
    setStep("upload");
    setParsed(null);
    setMapping([]);
    setFilename("");
    setSummary(null);
  };

  return (
    <div className="space-y-4">
      {/* PRD 10 FR-13. Placed above everything, because it is about the file that is about to be
          chosen rather than about the results below. */}
      <ImportPrivacyNotice />
      {batches.length > 0 ? (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-900">Files imported so far</h2>
          </CardHeader>
          <CardBody>
            <ul className="space-y-1 text-sm text-slate-700">
              {batches.map((batch) => (
                <li key={batch.id} className="flex items-center justify-between gap-3">
                  <span>{batch.filename}</span>
                  <Badge>{batch.rowCount} rows</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {step === "done" ? "Import complete" : "Import a lead file"}
            </h2>
            <p className="text-xs text-slate-500">
              CSV or XLSX. Import as many files as you like — they all merge into one pool, and
              dedupe runs automatically after each one.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
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
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
          ) : null}

          {step === "mapping" && parsed ? (
            <>
              <p className="text-sm text-slate-600">
                {filename} · {parsed.rows.length} rows. Check each column before importing.
              </p>
              {parsed.warnings.length > 0 ? (
                <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {parsed.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <Table>
                <thead>
                  <tr>
                    <Th>Column</Th>
                    <Th className="w-56">Imports as</Th>
                    <Th className="w-40">Custom signal key</Th>
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
                                i === index
                                  ? {
                                      ...m,
                                      targetField: e.target.value as LeadField | "customSignal" | "ignore",
                                      confidence: "manual",
                                    }
                                  : m,
                              ),
                            )
                          }
                        >
                          {LEAD_FIELDS.map((field) => (
                            <option key={field} value={field}>
                              {LEAD_FIELD_LABELS[field]}
                            </option>
                          ))}
                        </Select>
                      </Td>
                      <Td>
                        {column.targetField === "customSignal" ? (
                          <TextInput
                            value={column.customSignalKey ?? ""}
                            placeholder="e.g. survey_score"
                            aria-label="Custom signal key"
                            onChange={(e) =>
                              setMapping((prev) =>
                                prev.map((m, i) =>
                                  i === index ? { ...m, customSignalKey: e.target.value } : m,
                                ),
                              )
                            }
                          />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </Td>
                      <Td className="text-xs text-slate-500">
                        {String(parsed.rows[0]?.[column.sourceColumn] ?? "")}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          ) : null}

          {step === "preview" && parsed ? (
            <>
              <p className="text-sm text-slate-600">
                First {preview.length} of {parsed.rows.length} rows, as they will be imported.
              </p>
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Company</Th>
                    <Th className="w-20 text-right">Booth</Th>
                    <Th className="w-20">Demo</Th>
                    <Th>Sessions</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((lead) => (
                    <tr key={lead.id}>
                      <Td>{lead.contact.fullName ?? `${lead.contact.firstName ?? ""} ${lead.contact.lastName ?? ""}`.trim()}</Td>
                      <Td>{lead.contact.email ?? "—"}</Td>
                      <Td>{lead.contact.company ?? "—"}</Td>
                      <Td className="text-right">{lead.signals.boothInteractions}</Td>
                      <Td>{lead.signals.demoRequested ? "Yes" : "No"}</Td>
                      <Td className="text-xs">{lead.signals.sessionsAttended.join(", ") || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {preview.length === 0 ? (
                <p className="text-sm text-amber-800">
                  Nothing usable — make sure a column is mapped to a name or an email.
                </p>
              ) : null}
            </>
          ) : null}

          {step === "done" && summary ? (
            <div className="space-y-1 text-sm text-slate-700">
              <p>
                Imported {summary.imported} rows from {filename}.
              </p>
              {summary.merged > 0 ? <p>{summary.merged} merged automatically on matching email.</p> : null}
              {summary.queued > 0 ? (
                <p className="text-amber-800">
                  {summary.queued} possible duplicate{summary.queued === 1 ? "" : "s"} need your review.
                </p>
              ) : null}
            </div>
          ) : null}

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
                <Button variant="primary" disabled={preview.length === 0} onClick={() => void confirm()}>
                  Import {parsed?.rows.length} rows
                </Button>
              </>
            ) : null}
            {step === "done" ? <Button variant="primary" onClick={reset}>Import another file</Button> : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
