// packages/postmortem-core/src/exportRetro.ts
//
// FR-13 — the retro document as something you can circulate. Deterministic templates, and it
// has to read sensibly even when the retro is nearly empty.

import { DISPOSITION_DEFINITIONS, DISPOSITION_LABELS, SOURCE_TYPE_LABELS, type RetroDocument } from "./retro";
import type { LessonDisposition } from "@event-toolkit/schema";

const ORDER: LessonDisposition[] = ["repeat", "fix", "drop"];

export function renderRetroMarkdown(retro: RetroDocument): string {
  const lines: string[] = [
    `# ${retro.eventName} — post-mortem`,
    "",
    retro.status === "completed"
      ? `_Completed${retro.completedAt ? ` ${retro.completedAt.slice(0, 10)}` : ""}._`
      : "_Draft._",
    "",
  ];

  if (retro.lessons.length === 0) {
    lines.push("No lessons were recorded for this event.", "");
  } else {
    for (const disposition of ORDER) {
      const group = retro.lessons.filter((l) => l.disposition === disposition);
      if (group.length === 0) continue;
      lines.push(
        `## ${DISPOSITION_LABELS[disposition]} (${group.length})`,
        "",
        `_${DISPOSITION_DEFINITIONS[disposition]}_`,
        "",
      );
      for (const item of group) {
        lines.push(
          `- ${item.lesson}${item.category ? ` _(${item.category})_` : ""} — ${SOURCE_TYPE_LABELS[item.sourceType].toLowerCase()}${item.carryForward ? ", carried forward" : ", not carried forward"}`,
        );
      }
      lines.push("");
    }
  }

  lines.push("## What this was based on", "");
  const issue = retro.ingestedIssueLogSummary;
  lines.push(
    issue.available
      ? `- **Issue log:** ${issue.totalIssues} issues (${issue.bySeverity.high} high, ${issue.bySeverity.medium} medium, ${issue.bySeverity.low} low), ${issue.openAtIngestion} still open when this retro was started.`
      : "- **Issue log:** not available — no logistics pack for this event.",
  );

  const budget = retro.ingestedBudgetVarianceSummary;
  lines.push(
    budget.available
      ? `- **Budget:** $${Math.round(budget.totalActual).toLocaleString()} actual against $${Math.round(budget.totalBudgeted).toLocaleString()} budgeted${budget.variancePct === null ? "" : ` (${Math.round(budget.variancePct)}%)`}.`
      : "- **Budget:** not available — no budget was built for this event.",
  );

  const roi = retro.ingestedRoiScorecardSummary;
  lines.push(
    roi.available
      ? `- **ROI report:** ${roi.reportStatus} — recommendation "${roi.recommendation}". ${roi.recommendationRationale ?? ""}`.trim()
      : "- **ROI report:** not available — none has been built for this event.",
  );

  if (retro.successMetricAdjustments.length > 0) {
    lines.push("", "## Success metric corrections", "");
    for (const adjustment of retro.successMetricAdjustments) {
      lines.push(
        `- **${adjustment.metricName}:** ${adjustment.previousActual ?? "not set"} → ${adjustment.adjustedActual}. ${adjustment.reason}`,
      );
    }
  }

  if (retro.notes?.trim()) {
    lines.push("", "## Notes", "", retro.notes.trim());
  }

  return lines.join("\n");
}

export function renderRetroHtml(markdown: string, title: string): string {
  const escaped = markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         max-width: 46rem; margin: 2.5rem auto; padding: 0 1.5rem; color: #0f172a; line-height: 1.5; }
  pre { white-space: pre-wrap; font: inherit; }
  @media print { body { margin: 0; max-width: none; } @page { margin: 16mm; } }
</style>
</head>
<body><pre>${escaped}</pre></body>
</html>`;
}
