/**
 * FR-8 — export a brief as a shareable document.
 *
 * Two pure functions: `briefToMarkdown()` and `briefToPrintableHtml()`. Both take an
 * `EventBrief` and render every *populated* section in readable prose + tables (never raw
 * JSON), so the output mirrors the on-screen brief view.
 */

import {
  DELIVERY_MODE_LABELS,
  EVENT_PHASE_LABELS,
  EVENT_PHASES,
  EVENT_TYPE_LABELS,
  MILESTONE_STATUS_LABELS,
  RACI_LABELS,
  RISK_STATUS_LABELS,
  computeCompleteness,
  type EventBrief,
  type Milestone,
} from "@event-toolkit/schema";
import { formatDateRange, formatIsoDate, formatIsoDateTime, formatMoney, formatMetricValue, slugify, sumPlanned } from "./format";

/* -------------------------------------------------------------------------- */
/* shared helpers                                                             */
/* -------------------------------------------------------------------------- */

const has = (s: string | undefined | null): boolean => Boolean(s && s.trim().length > 0);

function venueLine(brief: EventBrief): string {
  const v = brief.format.venueOrPlatform;
  if (!v) return "";
  const bits = [v.name, v.locationOrUrl].filter(has) as string[];
  const capacity = v.capacity ? `capacity ${v.capacity.toLocaleString()}` : "";
  return [bits.join(" — "), capacity].filter(has).join(" · ");
}

function milestonesByPhase(brief: EventBrief): Array<{ phase: string; rows: Milestone[] }> {
  return EVENT_PHASES.map((phase) => ({
    phase: EVENT_PHASE_LABELS[phase],
    rows: brief.timeline.milestones
      .filter((m) => m.phase === phase)
      .slice()
      .sort((a, b) => (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0)),
  })).filter((group) => group.rows.length > 0);
}

/** Suggested filename (no extension) for an export of this brief. */
export function exportBaseFilename(brief: EventBrief): string {
  return `${slugify(brief.name || "event-brief")}-brief`;
}

/* -------------------------------------------------------------------------- */
/* Markdown                                                                   */
/* -------------------------------------------------------------------------- */

/** Escape a value for use inside a Markdown table cell. */
function mdCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const s = String(value).trim();
  if (s === "") return "—";
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function mdTable(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const head = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`);
  return [head, divider, ...body].join("\n");
}

export function briefToMarkdown(brief: EventBrief): string {
  const completeness = computeCompleteness(brief);
  const currency = brief.budget.currency || "USD";
  const out: string[] = [];

  out.push(`# ${brief.name || "Untitled event brief"}`);
  out.push("");

  const meta: string[] = [
    `**Event type:** ${EVENT_TYPE_LABELS[brief.type]}`,
    `**Status:** ${brief.status === "complete" ? "Complete" : "Draft"}`,
    `**Completeness:** ${completeness.percent}% (${completeness.passed}/${completeness.total} checks)`,
    `**Dates:** ${formatDateRange(brief)} (${brief.dates.timezone || "timezone not set"})`,
    `**Delivery:** ${DELIVERY_MODE_LABELS[brief.format.deliveryMode]}${
      has(venueLine(brief)) ? ` — ${venueLine(brief)}` : ""
    }`,
  ];
  if (has(brief.createdBy)) meta.push(`**Prepared by:** ${brief.createdBy}`);
  meta.push(`**Last updated:** ${formatIsoDateTime(brief.updatedAt)}`);
  out.push(meta.join("  \n"));
  out.push("");

  // Objectives -------------------------------------------------------------
  out.push("## Objectives");
  out.push("");
  out.push(`**Primary objective.** ${brief.goals.primaryObjective || "_Not set_"}`);
  const secondary = (brief.goals.objectives ?? []).filter(has);
  if (secondary.length > 0) {
    out.push("");
    out.push("**Secondary objectives**");
    out.push("");
    secondary.forEach((o) => out.push(`- ${o}`));
  }
  if (has(brief.goals.businessJustification)) {
    out.push("");
    out.push("**Business justification**");
    out.push("");
    out.push(brief.goals.businessJustification as string);
  }
  out.push("");

  // Audience ---------------------------------------------------------------
  out.push("## Audience");
  out.push("");
  out.push(brief.audience.description || "_Not set_");
  const audienceMeta: string[] = [];
  if (brief.audience.estimatedSize !== undefined && brief.audience.estimatedSize !== null) {
    audienceMeta.push(`**Estimated size:** ${brief.audience.estimatedSize.toLocaleString()}`);
  }
  const segments = (brief.audience.segments ?? []).filter(has);
  if (segments.length > 0) audienceMeta.push(`**Segments:** ${segments.join(", ")}`);
  if (audienceMeta.length > 0) {
    out.push("");
    out.push(audienceMeta.join("  \n"));
  }

  const personas = (brief.audience.targetPersonas ?? []).filter((p) => has(p.name));
  if (personas.length > 0) {
    out.push("");
    out.push("### Target personas");
    for (const p of personas) {
      out.push("");
      out.push(`**${p.name}**${has(p.title) ? ` — ${p.title}` : ""}`);
      if (has(p.description)) {
        out.push("");
        out.push(p.description as string);
      }
      const pains = (p.painPoints ?? []).filter(has);
      if (pains.length > 0) {
        out.push("");
        out.push("Pain points:");
        pains.forEach((pp) => out.push(`- ${pp}`));
      }
    }
  }
  out.push("");

  // Budget -----------------------------------------------------------------
  const allocations = (brief.budget.allocations ?? []).filter((a) => has(a.category));
  const budgetHasContent =
    allocations.length > 0 ||
    brief.budget.totalBudget !== undefined ||
    has(brief.budget.notes);
  if (budgetHasContent) {
    out.push("## Budget");
    out.push("");
    out.push(
      `**Total planned budget:** ${formatMoney(brief.budget.totalBudget ?? null, currency)} (${currency})`,
    );
    if (allocations.length > 0) {
      out.push("");
      out.push(
        mdTable(
          ["Category", "Planned", "Actual", "Notes"],
          allocations.map((a) => [
            a.category,
            formatMoney(a.plannedAmount, currency),
            a.actualAmount === null || a.actualAmount === undefined
              ? "—"
              : formatMoney(a.actualAmount, currency),
            a.notes ?? "",
          ]),
        ),
      );
      out.push("");
      out.push(
        `_Allocated across categories: ${formatMoney(sumPlanned(brief), currency)}. Actuals are populated by the Budget Builder & Tracker._`,
      );
    }
    if (has(brief.budget.notes)) {
      out.push("");
      out.push(brief.budget.notes as string);
    }
    out.push("");
  }

  // Stakeholders -----------------------------------------------------------
  const stakeholders = brief.stakeholders.filter((s) => has(s.name) || has(s.role));
  if (stakeholders.length > 0) {
    out.push("## Stakeholders & RACI");
    out.push("");
    out.push(
      mdTable(
        ["Name", "Role", "RACI", "Department", "Email"],
        stakeholders.map((s) => [
          s.name,
          s.role,
          `${s.raci} — ${RACI_LABELS[s.raci]}`,
          s.department ?? "",
          s.email ?? "",
        ]),
      ),
    );
    out.push("");
  }

  // Success metrics --------------------------------------------------------
  const metrics = brief.successMetrics.filter((m) => has(m.metric));
  if (metrics.length > 0) {
    out.push("## Success metrics");
    out.push("");
    out.push(
      mdTable(
        ["Metric", "Target", "Actual", "Notes"],
        metrics.map((m) => [
          m.metric,
          formatMetricValue(m.target, m.unit),
          m.actual === null || m.actual === undefined ? "—" : formatMetricValue(m.actual, m.unit),
          m.notes ?? "",
        ]),
      ),
    );
    out.push("");
    out.push("_Actuals are populated post-event by the ROI & Attribution report._");
    out.push("");
  }

  // Risks ------------------------------------------------------------------
  const risks = brief.riskRegister.filter((r) => has(r.risk));
  if (risks.length > 0) {
    out.push("## Risk register");
    out.push("");
    out.push(
      mdTable(
        ["Risk", "Likelihood", "Impact", "Status", "Owner", "Mitigation"],
        risks.map((r) => [
          r.risk,
          r.likelihood,
          r.impact,
          RISK_STATUS_LABELS[r.status],
          r.owner ?? "",
          r.mitigation ?? "",
        ]),
      ),
    );
    out.push("");
  }

  // Timeline ---------------------------------------------------------------
  const phases = milestonesByPhase(brief);
  if (phases.length > 0) {
    out.push("## Timeline");
    for (const group of phases) {
      out.push("");
      out.push(`### ${group.phase}`);
      out.push("");
      out.push(
        mdTable(
          ["Milestone", "Target date", "Owner", "Status", "Notes"],
          group.rows.map((m) => [
            m.label,
            formatIsoDate(m.targetDate),
            m.owner ?? "",
            MILESTONE_STATUS_LABELS[m.status],
            m.notes ?? "",
          ]),
        ),
      );
    }
    out.push("");
  }

  // Constraints ------------------------------------------------------------
  const constraints = (brief.constraints.items ?? []).filter(has);
  if (constraints.length > 0 || has(brief.constraints.notes)) {
    out.push("## Constraints");
    out.push("");
    constraints.forEach((c) => out.push(`- ${c}`));
    if (has(brief.constraints.notes)) {
      out.push("");
      out.push(brief.constraints.notes as string);
    }
    out.push("");
  }

  // Carry-forward lessons --------------------------------------------------
  const lessons = (brief.carryForwardLessons ?? []).filter((l) => has(l.lesson));
  if (lessons.length > 0) {
    out.push("## Lessons carried forward");
    out.push("");
    lessons.forEach((l) =>
      out.push(`- ${l.lesson}${has(l.category) ? ` _(${l.category})_` : ""}`),
    );
    out.push("");
  }

  out.push("---");
  out.push("");
  out.push(
    `_Generated by the Event Brief Generator on ${formatIsoDateTime(new Date().toISOString())} · schema v${brief.schemaVersion} · brief revision ${brief.version} · id ${brief.id}_`,
  );
  out.push("");

  return out.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Printable HTML                                                             */
/* -------------------------------------------------------------------------- */

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escOrDash(value: string | number | null | undefined): string {
  const s = esc(value).trim();
  return s === "" ? "—" : s;
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${esc(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function htmlTable(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return `<table>
  <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>
${rows
  .map((r) => `    <tr>${r.map((c) => `<td>${escOrDash(c)}</td>`).join("")}</tr>`)
  .join("\n")}
  </tbody>
</table>`;
}

const PRINT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a; margin: 0; padding: 40px; line-height: 1.55; background: #fff;
  }
  .doc { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: -0.02em; }
  h2 { font-size: 18px; margin: 34px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
  h3 { font-size: 14px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .06em; color: #475569; }
  h4 { font-size: 14px; margin: 14px 0 4px; }
  p { margin: 0 0 10px; }
  ul { margin: 0 0 12px; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 14px 0 4px; padding: 12px 16px;
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13px; }
  .meta div { min-width: 180px; }
  .meta span { display: block; text-transform: uppercase; font-size: 10px; letter-spacing: .08em; color: #64748b; }
  .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 999px;
           border: 1px solid #cbd5e1; background: #f1f5f9; color: #334155; }
  .badge.complete { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
  .badge.draft { background: #fffbeb; border-color: #fde68a; color: #b45309; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 13px; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 9px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #475569; }
  .note { font-size: 12px; color: #64748b; font-style: italic; margin-top: -6px; }
  .persona { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
  footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; }
  @page { margin: 16mm; }
  @media print {
    body { padding: 0; }
    h2 { break-after: avoid; }
    table, .persona { break-inside: avoid; }
  }
`;

export function briefToPrintableHtml(brief: EventBrief): string {
  const completeness = computeCompleteness(brief);
  const currency = brief.budget.currency || "USD";
  const s: string[] = [];

  s.push(`<h1>${escOrDash(brief.name || "Untitled event brief")}</h1>`);
  s.push(`<div class="badges">
    <span class="badge">${esc(EVENT_TYPE_LABELS[brief.type])}</span>
    <span class="badge ${brief.status}">${brief.status === "complete" ? "Complete" : "Draft"}</span>
    <span class="badge">${completeness.percent}% complete</span>
  </div>`);

  const metaCells: Array<[string, string]> = [
    ["Dates", `${formatDateRange(brief)}`],
    ["Timezone", brief.dates.timezone || "—"],
    ["Delivery", DELIVERY_MODE_LABELS[brief.format.deliveryMode]],
  ];
  if (has(venueLine(brief))) metaCells.push(["Venue / platform", venueLine(brief)]);
  if (has(brief.createdBy)) metaCells.push(["Prepared by", brief.createdBy as string]);
  metaCells.push(["Last updated", formatIsoDateTime(brief.updatedAt)]);
  s.push(
    `<div class="meta">${metaCells
      .map(([k, v]) => `<div><span>${esc(k)}</span>${escOrDash(v)}</div>`)
      .join("")}</div>`,
  );

  // Objectives
  s.push("<h2>Objectives</h2>");
  s.push(`<p><strong>Primary objective.</strong> ${escOrDash(brief.goals.primaryObjective)}</p>`);
  const secondary = (brief.goals.objectives ?? []).filter(has);
  if (secondary.length > 0) {
    s.push("<h3>Secondary objectives</h3>");
    s.push(`<ul>${secondary.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`);
  }
  if (has(brief.goals.businessJustification)) {
    s.push("<h3>Business justification</h3>");
    s.push(paragraphs(brief.goals.businessJustification as string));
  }

  // Audience
  s.push("<h2>Audience</h2>");
  s.push(paragraphs(brief.audience.description || "Not set"));
  const audienceBits: string[] = [];
  if (brief.audience.estimatedSize !== undefined && brief.audience.estimatedSize !== null) {
    audienceBits.push(`<strong>Estimated size:</strong> ${esc(brief.audience.estimatedSize.toLocaleString())}`);
  }
  const segments = (brief.audience.segments ?? []).filter(has);
  if (segments.length > 0) {
    audienceBits.push(`<strong>Segments:</strong> ${esc(segments.join(", "))}`);
  }
  if (audienceBits.length > 0) s.push(`<p>${audienceBits.join(" &nbsp;·&nbsp; ")}</p>`);

  const personas = (brief.audience.targetPersonas ?? []).filter((p) => has(p.name));
  if (personas.length > 0) {
    s.push("<h3>Target personas</h3>");
    for (const p of personas) {
      const pains = (p.painPoints ?? []).filter(has);
      s.push(`<div class="persona">
        <h4>${esc(p.name)}${has(p.title) ? ` — ${esc(p.title)}` : ""}</h4>
        ${has(p.description) ? paragraphs(p.description as string) : ""}
        ${pains.length > 0 ? `<ul>${pains.map((pp) => `<li>${esc(pp)}</li>`).join("")}</ul>` : ""}
      </div>`);
    }
  }

  // Budget
  const allocations = (brief.budget.allocations ?? []).filter((a) => has(a.category));
  if (allocations.length > 0 || brief.budget.totalBudget !== undefined || has(brief.budget.notes)) {
    s.push("<h2>Budget</h2>");
    s.push(
      `<p><strong>Total planned budget:</strong> ${esc(formatMoney(brief.budget.totalBudget ?? null, currency))} (${esc(currency)})</p>`,
    );
    if (allocations.length > 0) {
      s.push(
        htmlTable(
          ["Category", "Planned", "Actual", "Notes"],
          allocations.map((a) => [
            a.category,
            formatMoney(a.plannedAmount, currency),
            a.actualAmount === null || a.actualAmount === undefined
              ? "—"
              : formatMoney(a.actualAmount, currency),
            a.notes ?? "",
          ]),
        ),
      );
      s.push(
        `<p class="note">Allocated across categories: ${esc(formatMoney(sumPlanned(brief), currency))}. Actuals are populated by the Budget Builder &amp; Tracker.</p>`,
      );
    }
    if (has(brief.budget.notes)) s.push(paragraphs(brief.budget.notes as string));
  }

  // Stakeholders
  const stakeholders = brief.stakeholders.filter((st) => has(st.name) || has(st.role));
  if (stakeholders.length > 0) {
    s.push("<h2>Stakeholders &amp; RACI</h2>");
    s.push(
      htmlTable(
        ["Name", "Role", "RACI", "Department", "Email"],
        stakeholders.map((st) => [
          st.name,
          st.role,
          `${st.raci} — ${RACI_LABELS[st.raci]}`,
          st.department ?? "",
          st.email ?? "",
        ]),
      ),
    );
  }

  // Metrics
  const metrics = brief.successMetrics.filter((m) => has(m.metric));
  if (metrics.length > 0) {
    s.push("<h2>Success metrics</h2>");
    s.push(
      htmlTable(
        ["Metric", "Target", "Actual", "Notes"],
        metrics.map((m) => [
          m.metric,
          formatMetricValue(m.target, m.unit),
          m.actual === null || m.actual === undefined ? "—" : formatMetricValue(m.actual, m.unit),
          m.notes ?? "",
        ]),
      ),
    );
    s.push('<p class="note">Actuals are populated post-event by the ROI &amp; Attribution report.</p>');
  }

  // Risks
  const risks = brief.riskRegister.filter((r) => has(r.risk));
  if (risks.length > 0) {
    s.push("<h2>Risk register</h2>");
    s.push(
      htmlTable(
        ["Risk", "Likelihood", "Impact", "Status", "Owner", "Mitigation"],
        risks.map((r) => [
          r.risk,
          r.likelihood,
          r.impact,
          RISK_STATUS_LABELS[r.status],
          r.owner ?? "",
          r.mitigation ?? "",
        ]),
      ),
    );
  }

  // Timeline
  const phases = milestonesByPhase(brief);
  if (phases.length > 0) {
    s.push("<h2>Timeline</h2>");
    for (const group of phases) {
      s.push(`<h3>${esc(group.phase)}</h3>`);
      s.push(
        htmlTable(
          ["Milestone", "Target date", "Owner", "Status", "Notes"],
          group.rows.map((m) => [
            m.label,
            formatIsoDate(m.targetDate),
            m.owner ?? "",
            MILESTONE_STATUS_LABELS[m.status],
            m.notes ?? "",
          ]),
        ),
      );
    }
  }

  // Constraints
  const constraints = (brief.constraints.items ?? []).filter(has);
  if (constraints.length > 0 || has(brief.constraints.notes)) {
    s.push("<h2>Constraints</h2>");
    if (constraints.length > 0) {
      s.push(`<ul>${constraints.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`);
    }
    if (has(brief.constraints.notes)) s.push(paragraphs(brief.constraints.notes as string));
  }

  // Lessons
  const lessons = (brief.carryForwardLessons ?? []).filter((l) => has(l.lesson));
  if (lessons.length > 0) {
    s.push("<h2>Lessons carried forward</h2>");
    s.push(
      `<ul>${lessons
        .map((l) => `<li>${esc(l.lesson)}${has(l.category) ? ` <em>(${esc(l.category)})</em>` : ""}</li>`)
        .join("")}</ul>`,
    );
  }

  s.push(
    `<footer>Generated by the Event Brief Generator on ${esc(
      formatIsoDateTime(new Date().toISOString()),
    )} · schema v${esc(brief.schemaVersion)} · brief revision ${esc(brief.version)} · id ${esc(brief.id)}</footer>`,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escOrDash(brief.name || "Event brief")} — Event Brief</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<div class="doc">
${s.join("\n")}
</div>
</body>
</html>`;
}

/** Plain JSON export (PRD §8 portability path — distinct from the human-readable exports). */
export function briefToJson(brief: EventBrief): string {
  return JSON.stringify(brief, null, 2);
}
