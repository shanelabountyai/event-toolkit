"use client";

/** Manual registration entry plus CSV import, with per-row error reporting. */

import { useRef, useState } from "react";
import { todayIsoDate, type CsvRowError } from "@event-toolkit/schema";
import { Button, Card, CardBody, CardHeader, DateInput, Field, NumberInput } from "@event-toolkit/ui";

export function PacingEntryForm({
  onAdd,
  onImport,
}: {
  onAdd: (date: string, count: number) => Promise<void>;
  onImport: (csvText: string) => Promise<{ importedCount: number; errors: CsvRowError[] }>;
}) {
  const [date, setDate] = useState(todayIsoDate());
  const [count, setCount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{ importedCount: number; errors: CsvRowError[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const parsed = Number(count);
    if (!date) return setFormError("Pick a date.");
    if (!count.trim() || !Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      return setFormError("Enter a whole, non-negative registration count.");
    }
    setFormError(null);
    await onAdd(date, parsed);
    setCount("");
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    setImportSummary(await onImport(text));
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-content">Add registration numbers</h2>
          <p className="text-xs text-content-muted">
            Cumulative totals, not daily deltas — re-entering a date corrects it.
          </p>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Date" htmlFor="pacing-date" className="w-44">
            <DateInput id="pacing-date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Registrations so far" htmlFor="pacing-count" className="w-52" error={formError}>
            <NumberInput
              id="pacing-count"
              min={0}
              step={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              invalid={Boolean(formError)}
            />
          </Field>
          <Button variant="primary" onClick={() => void submit()} className="mb-1">
            Add
          </Button>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-sm font-medium text-content">Or import a CSV</p>
          <p className="mt-0.5 text-xs text-content-muted">
            Two columns with a header row: <code className="rounded bg-surface-hover px-1">date,count</code>, dates
            as YYYY-MM-DD. Valid rows import even if others fail.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
            className="mt-2 block w-full text-sm text-content-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-fg hover:file:bg-accent-hover"
          />

          {importSummary ? (
            <div
              role="status"
              className={
                importSummary.errors.length > 0
                  ? "mt-3 rounded-lg border border-warning-border bg-warning-subtle px-3 py-2"
                  : "mt-3 rounded-lg border border-success-border bg-success-subtle px-3 py-2"
              }
            >
              <p className="text-sm font-medium text-content">
                Imported {importSummary.importedCount} row{importSummary.importedCount === 1 ? "" : "s"}
                {importSummary.errors.length > 0 ? `, skipped ${importSummary.errors.length}` : ""}.
              </p>
              {importSummary.errors.length > 0 ? (
                <ul className="mt-1 list-inside list-disc text-xs text-warning-text">
                  {importSummary.errors.map((err) => (
                    <li key={`${err.row}-${err.reason}`}>
                      Line {err.row}: {err.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
