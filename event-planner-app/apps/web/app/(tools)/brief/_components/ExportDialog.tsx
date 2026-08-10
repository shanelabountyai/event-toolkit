"use client";

/**
 * FR-8 — export dialog. Markdown (.md) or printable HTML, plus the plain JSON portability
 * export. Each export logs `export_triggered` (FR-13) and appends an `ExportRecord` to the
 * brief's `exportHistory`.
 */

import { useState } from "react";
import { computeCompleteness, withExportRecord, type EventBrief, type ExportFormat } from "@event-toolkit/schema";
import { logUsageEvent } from "@event-toolkit/local-store";
import { Button, Card, CardBody, CardFooter, CardHeader } from "@event-toolkit/ui";
import { briefToJson, briefToMarkdown, briefToPrintableHtml, exportBaseFilename } from "@/lib/brief-export";
import { openPrintableWindow, triggerDownload } from "@/lib/download";

type Choice = "markdown" | "html" | "json";

const CHOICES: Array<{ key: Choice; label: string; blurb: string; extension: string }> = [
  {
    key: "markdown",
    label: "Markdown (.md)",
    blurb: "Prose plus Markdown tables — paste into email, Notion, Confluence or a PR.",
    extension: "md",
  },
  {
    key: "html",
    label: "Printable HTML",
    blurb: "A styled, standalone document. Open it and print to PDF for execs or vendors.",
    extension: "html",
  },
  {
    key: "json",
    label: "JSON (data backup)",
    blurb: "The raw brief document — re-importable from the brief list. Not a shareable doc.",
    extension: "json",
  },
];

export function ExportDialog({
  brief,
  onClose,
  onBriefChange,
}: {
  brief: EventBrief;
  onClose: () => void;
  onBriefChange: (next: EventBrief) => void;
}) {
  const [choice, setChoice] = useState<Choice>("markdown");
  const [done, setDone] = useState<string | null>(null);

  const record = async (format: ExportFormat, filename: string) => {
    onBriefChange(withExportRecord(brief, format, filename));
    await logUsageEvent({
      type: "export_triggered",
      briefId: brief.id,
      briefName: brief.name || "Untitled brief",
      details: {
        format,
        filename,
        completenessPct: computeCompleteness(brief).percent,
      },
    });
  };

  const doExport = async () => {
    const base = exportBaseFilename(brief);
    if (choice === "markdown") {
      const filename = `${base}.md`;
      triggerDownload(filename, briefToMarkdown(brief), "text/markdown");
      await record("markdown", filename);
      setDone(`Downloaded ${filename}`);
    } else if (choice === "html") {
      const filename = `${base}.html`;
      triggerDownload(filename, briefToPrintableHtml(brief), "text/html");
      await record("html", filename);
      setDone(`Downloaded ${filename}`);
    } else {
      const filename = `${base}.json`;
      triggerDownload(filename, briefToJson(brief), "application/json");
      // JSON is a data backup, not one of the schema's shareable-document formats, so it is
      // logged but not recorded in exportHistory (whose `format` enum has no "json" member).
      await logUsageEvent({
        type: "export_triggered",
        briefId: brief.id,
        briefName: brief.name || "Untitled brief",
        details: { format: "json", filename },
      });
      setDone(`Downloaded ${filename}`);
    }
  };

  const doPrint = async () => {
    const opened = openPrintableWindow(briefToPrintableHtml(brief));
    if (opened) {
      await record("html", `${exportBaseFilename(brief)}.html`);
      setDone("Opened the printable view in a new tab.");
    } else {
      setDone("Your browser blocked the popup — use 'Download' and open the file instead.");
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-20"
      role="dialog"
      aria-modal="true"
      aria-label="Export brief"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900">Export brief</h2>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {CHOICES.map((c) => (
            <label
              key={c.key}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                choice === c.key ? "border-slate-900 bg-slate-50" : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="export-format"
                className="mt-1"
                checked={choice === c.key}
                onChange={() => {
                  setChoice(c.key);
                  setDone(null);
                }}
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">{c.label}</span>
                <span className="block text-xs text-slate-500">{c.blurb}</span>
              </span>
            </label>
          ))}
          {done ? <p className="text-sm text-emerald-700">{done}</p> : null}
        </CardBody>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          {choice === "html" ? (
            <Button onClick={() => void doPrint()}>Open printable view</Button>
          ) : null}
          <Button variant="primary" onClick={() => void doExport()}>
            Download
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
