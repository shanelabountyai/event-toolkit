// packages/roi-report-core/src/execSummary.ts
//
// FR-11/FR-12 — the two exports. Deterministic template rendering, no LLM, same convention as
// the rest of the suite: regenerating from unchanged data produces byte-identical text.
//
// The executive summary must stand alone. Someone reading only that page should get every
// headline number and the recommendation without a single "see the full report" hop.

import {
  ATTRIBUTION_LABELS,
  RECOMMENDATION_LABELS,
  VERDICT_LABELS,
  type RoiReport,
} from "./types";

function money(value: number | null | undefined, currency = "USD"): string {
  if (value === null || value === undefined) return "not available";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

function num(value: number | null | undefined): string {
  return value === null || value === undefined ? "not available" : value.toLocaleString();
}

function deltaText(figure: { deltaPct: number | null; deltaAbsolute: number | null } | undefined): string {
  if (!figure || figure.deltaPct === null) return "no comparison";
  const direction = figure.deltaPct > 0 ? "up" : figure.deltaPct < 0 ? "down" : "flat";
  return `${direction} ${Math.abs(figure.deltaPct)}%`;
}

/** FR-11 — the one-page summary. Self-contained by design. */
export function renderExecutiveSummary(report: RoiReport): string {
  const currency = report.budgetSummary?.currency ?? "USD";
  const pipeline = report.pipelineSummary;
  const totalPipeline = pipeline ? pipeline.sourcedAmount + pipeline.influencedAmount : null;
  const scorecard = report.scorecard;

  const lines: string[] = [
    `# ${report.eventName} — event ROI summary`,
    "",
    report.status === "final"
      ? `_Finalised${report.finalizedAt ? ` ${report.finalizedAt.slice(0, 10)}` : ""}._`
      : "_Draft — figures may still change._",
    "",
    "## The headline",
    "",
  ];

  if (scorecard && scorecard.recommendation !== "insufficient_data") {
    lines.push(
      `**Recommendation: ${RECOMMENDATION_LABELS[scorecard.recommendation]}.** ${scorecard.recommendationRationale}`,
    );
  } else {
    lines.push(
      `**Recommendation: not enough data yet.** ${scorecard?.recommendationRationale ?? "Import budget, pipeline and survey data to score this event."}`,
    );
  }

  lines.push(
    "",
    "## The numbers",
    "",
    `- **Total spend:** ${money(report.budgetSummary?.totalActual ?? null, currency)}`,
    `- **Pipeline generated:** ${money(totalPipeline, currency)}${
      pipeline ? ` (${money(pipeline.sourcedAmount, currency)} sourced, ${money(pipeline.influencedAmount, currency)} influenced)` : ""
    }`,
    `- **Opportunities:** ${num(pipeline?.opportunitiesCount)} · **Meetings:** ${num(pipeline?.meetingsCount)}`,
    `- **Leads:** ${num(report.costSummary.totalLeads)}`,
    `- **Cost per lead:** ${money(report.costSummary.costPerLead, currency)} · **per opportunity:** ${money(report.costSummary.costPerOpportunity, currency)} · **per meeting:** ${money(report.costSummary.costPerMeeting, currency)}`,
    `- **Attendee NPS:** ${
      report.surveySummary?.npsScore === null || report.surveySummary === null
        ? "not available"
        : `${report.surveySummary.npsScore}${report.surveySummary.npsSmallSample ? " (small sample — treat with caution)" : ""}`
    }`,
  );

  if (pipeline && pipeline.wonAmount > 0) {
    lines.push(
      `- **Closed/won so far:** ${money(pipeline.wonAmount, currency)} across ${num(pipeline.wonCount)} deals — most cycles are longer than this reporting window, so pipeline is the fairer read.`,
    );
  }

  if (report.yoyComparison) {
    const d = report.yoyComparison.deltas;
    lines.push(
      "",
      `## Against ${report.yoyComparison.comparatorEventName}`,
      "",
      `- Spend ${deltaText(d.totalActual)} · sourced pipeline ${deltaText(d.sourcedAmount)}`,
      `- Cost per lead ${deltaText(d.costPerLead)} · cost per opportunity ${deltaText(d.costPerOpportunity)}`,
      `- NPS ${deltaText(d.npsScore)}`,
    );
  }

  if (scorecard) {
    lines.push("", "## How that was judged", "");
    for (const dimension of scorecard.dimensions) {
      lines.push(
        `- **${dimension.label}:** ${VERDICT_LABELS[dimension.verdict]}${
          dimension.rawValue === null ? "" : ` (${dimension.rawValue})`
        } — ${dimension.thresholdsApplied}`,
      );
    }
  }

  return lines.join("\n");
}

/** FR-12 — the full report: everything above plus the section detail. */
export function renderFullReport(report: RoiReport): string {
  const currency = report.budgetSummary?.currency ?? "USD";
  const lines: string[] = [renderExecutiveSummary(report), "", "---", "", "## Budget detail", ""];

  if (!report.budgetSummary) {
    lines.push("No budget data for this event — build one in the Budget Builder to include it here.");
  } else {
    lines.push(
      `Total budgeted ${money(report.budgetSummary.totalBudgeted, currency)}, committed ${money(report.budgetSummary.totalCommitted, currency)}, actual ${money(report.budgetSummary.totalActual, currency)}.`,
      report.budgetSummary.varianceAtClose.isFinal
        ? `Budget reconciled — variance at close ${money(report.budgetSummary.varianceAtClose.varianceAmount, currency)}.`
        : "Budget is not yet reconciled, so variance at close is provisional.",
      "",
      "| Category | Budgeted | Actual | Variance |",
      "| --- | ---: | ---: | ---: |",
      ...report.budgetSummary.spendByCategory
        .filter((c) => c.budgeted !== 0 || c.actual !== 0)
        .map(
          (c) =>
            `| ${c.category} | ${money(c.budgeted, currency)} | ${money(c.actual, currency)} | ${money(c.varianceAmount, currency)} |`,
        ),
    );
  }

  lines.push("", "## Pipeline detail", "");
  if (!report.pipelineSummary) {
    lines.push("No pipeline data imported yet.");
  } else {
    const p = report.pipelineSummary;
    lines.push(
      `| Attribution | Records | Amount |`,
      `| --- | ---: | ---: |`,
      `| ${ATTRIBUTION_LABELS.sourced} | ${p.sourcedCount} | ${money(p.sourcedAmount, currency)} |`,
      `| ${ATTRIBUTION_LABELS.influenced} | ${p.influencedCount} | ${money(p.influencedAmount, currency)} |`,
      `| ${ATTRIBUTION_LABELS.outside_window} | ${p.outsideWindowCount} | — |`,
      "",
      p.leadMatchRatePct === null
        ? "Contact-to-lead cross-check was not run."
        : `${p.leadMatchRatePct}% of pipeline contacts matched a lead from this event (informational only — it never affects attribution).`,
    );
  }

  lines.push("", "## Survey detail", "");
  if (!report.surveySummary) {
    lines.push("No survey data imported yet.");
  } else {
    lines.push(
      `${report.surveySummary.responseCount} responses.`,
      `NPS ${report.surveySummary.npsScore ?? "not available"}${report.surveySummary.npsSmallSample ? " — fewer than 5 scored responses, treat with caution" : ""}.`,
      report.surveySummary.csatAverage === null
        ? "No CSAT scores in the import."
        : `Average CSAT ${report.surveySummary.csatAverage}.`,
    );
  }

  if (report.successMetricWriteBacks.length > 0) {
    lines.push("", "## Success metrics written back to the brief", "");
    lines.push("| Metric | Source | Value |", "| --- | --- | ---: |");
    for (const write of report.successMetricWriteBacks) {
      lines.push(`| ${write.metricName} | ${write.matchedField} | ${num(write.valueWritten)} |`);
    }
  }

  return lines.join("\n");
}

/** Minimal printable HTML, matching PRD 1's export precedent. No PDF library. */
export function renderReportHtml(markdown: string, title: string): string {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
