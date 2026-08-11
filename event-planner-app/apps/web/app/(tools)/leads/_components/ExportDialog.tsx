"use client";

/** FR-10 — the handoff. Per-owner files or one combined file, CSV or XLSX. */

import { useState } from "react";
import {
  buildCombinedExport,
  buildPerOwnerExport,
  type LeadRecord,
  type TriageSession,
} from "@event-toolkit/lead-triage-core";
import { Badge, Button, Card, CardBody, CardHeader, Table, Td, Th } from "@event-toolkit/ui";
import { downloadLeadCsv, downloadLeadXlsx } from "@/lib/leads-file";

export function ExportDialog({
  session,
  leads,
  onExported,
}: {
  session: TriageSession;
  leads: LeadRecord[];
  onExported: (format: "csv" | "xlsx", scope: "per_owner" | "combined", files: number) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const perOwner = buildPerOwnerExport(leads, session, session.owners);
  const combined = buildCombinedExport(leads, session, session.owners);
  const undrafted = leads.filter((lead) => !lead.followUpDraft).length;

  const run = async (format: "csv" | "xlsx", scope: "per_owner" | "combined") => {
    setBusy(true);
    try {
      if (scope === "combined") {
        if (format === "csv") downloadLeadCsv(combined.rows, combined.basename);
        else await downloadLeadXlsx([{ sheetName: combined.sheetName, rows: combined.rows }], combined.basename);
        await onExported(format, scope, 1);
        setDone(`Exported ${combined.leadCount} leads in one file.`);
      } else {
        if (format === "csv") {
          // One CSV per owner: a spreadsheet can't hold multiple sheets, so this is several
          // downloads. The browser will ask about multiple files — that's expected.
          for (const file of perOwner) downloadLeadCsv(file.rows, file.basename);
        } else {
          // XLSX can hold a sheet per owner, so it stays one download.
          await downloadLeadXlsx(
            perOwner.map((f) => ({ sheetName: f.sheetName, rows: f.rows })),
            `${combined.basename.replace(/-all$/, "")}-by-owner`,
          );
        }
        await onExported(format, scope, perOwner.length);
        setDone(
          format === "csv"
            ? `Exported ${perOwner.length} files, one per owner.`
            : `Exported one workbook with ${perOwner.length} sheets, one per owner.`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-base font-semibold text-content">Export for sales</h2>
            <p className="text-xs text-content-muted">
              Sorted tier first, then score — the top of each file is the first call to make.
              Draft subject and body travel with each lead.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {leads.length === 0 ? (
            <p className="text-sm text-content-muted">Nothing to export yet.</p>
          ) : (
            <>
              {undrafted > 0 ? (
                <p className="rounded-lg border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-text">
                  {undrafted} lead{undrafted === 1 ? " has" : "s have"} no follow-up draft yet — they
                  will export with empty draft columns.
                </p>
              ) : null}

              <Table>
                <thead>
                  <tr>
                    <Th>File</Th>
                    <Th className="w-24 text-right">Leads</Th>
                  </tr>
                </thead>
                <tbody>
                  {perOwner.map((file) => (
                    <tr key={file.basename}>
                      <Td className="font-mono text-xs">{file.basename}</Td>
                      <Td className="text-right tabular-nums">{file.leadCount}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void run("csv", "per_owner")}>
                  CSV per owner
                </Button>
                <Button disabled={busy} onClick={() => void run("xlsx", "per_owner")}>
                  XLSX per owner
                </Button>
                <Button disabled={busy} onClick={() => void run("csv", "combined")}>
                  CSV combined
                </Button>
                <Button variant="primary" disabled={busy} onClick={() => void run("xlsx", "combined")}>
                  XLSX combined
                </Button>
              </div>

              {done ? (
                <p role="status" className="text-sm text-success-text">
                  {done}
                </p>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-content">What happens next</h2>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-content-muted">
            Export is the whole handoff in v1 — nothing is sent, and nothing is pushed to a CRM.
            Each owner works their file and sends the drafts themselves.
          </p>
          <p className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge tone="neutral">No CRM write-back</Badge>
            <Badge tone="neutral">No automated sending</Badge>
            <Badge tone="neutral">No enrichment</Badge>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
