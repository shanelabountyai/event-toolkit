"use client";

/**
 * Intake screen 7 — review & generate (flow step 8).
 * Per-section completeness with jump-back links; "Generate brief" stays disabled until
 * every FR-3 required field is filled.
 */

import {
  computeCompleteness,
  type EventBrief,
  type IntakeSection,
  type MissingRequiredField,
  type ValidationIssue,
} from "@event-toolkit/schema";
import { Badge, Button, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { formatDateRange, formatMoney, sumPlanned } from "@/lib/format";
import { CompletenessMeter } from "../CompletenessBadge";

export interface ReviewSection {
  section: IntakeSection;
  title: string;
  summary: (brief: EventBrief) => string;
}

export const REVIEW_SECTIONS: ReviewSection[] = [
  {
    section: "basics",
    title: "Event basics",
    summary: (b) =>
      `${b.name || "Unnamed"} · ${formatDateRange(b)} · ${b.dates.timezone || "no timezone"}`,
  },
  {
    section: "goals",
    title: "Goals & objectives",
    summary: (b) =>
      b.goals.primaryObjective
        ? `${b.goals.primaryObjective.slice(0, 90)}${b.goals.primaryObjective.length > 90 ? "…" : ""}`
        : "No primary objective yet",
  },
  {
    section: "audience",
    title: "Audience",
    summary: (b) =>
      `${b.audience.description ? "Described" : "Not described"} · ${
        (b.audience.targetPersonas ?? []).length
      } persona(s) · ${(b.audience.segments ?? []).length} segment(s)`,
  },
  {
    section: "budget",
    title: "Budget",
    summary: (b) =>
      `${formatMoney(b.budget.totalBudget ?? null, b.budget.currency)} total · ${
        (b.budget.allocations ?? []).length
      } categories · ${formatMoney(sumPlanned(b), b.budget.currency)} allocated`,
  },
  {
    section: "stakeholders",
    title: "Stakeholders & RACI",
    summary: (b) => `${b.stakeholders.length} stakeholder(s)`,
  },
  {
    section: "constraints",
    title: "Constraints",
    summary: (b) =>
      `${(b.constraints.items ?? []).length} constraint(s)${
        b.constraints.notes ? " · notes added" : ""
      }`,
  },
];

/** Map a zod issue path back to the intake step that can fix it, when there is one. */
function sectionForPath(path: string): IntakeSection | null {
  const root = path.split(".")[0];
  switch (root) {
    case "name":
    case "type":
    case "dates":
    case "format":
    case "createdBy":
      return "basics";
    case "goals":
      return "goals";
    case "audience":
      return "audience";
    case "budget":
      return "budget";
    case "stakeholders":
      return "stakeholders";
    case "constraints":
      return "constraints";
    default:
      // successMetrics / riskRegister / timeline come from presets and are edited on the
      // brief view rather than during intake, so there is no step to jump to.
      return null;
  }
}

export function ReviewStep({
  brief,
  missing,
  issues,
  generating,
  onJump,
  onGenerate,
}: {
  brief: EventBrief;
  missing: MissingRequiredField[];
  issues: ValidationIssue[];
  generating: boolean;
  onJump: (section: IntakeSection) => void;
  onGenerate: () => void;
}) {
  const completeness = computeCompleteness(brief);
  const blocked = missing.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <CompletenessMeter brief={brief} showChecklist />
        </CardBody>
      </Card>

      {blocked ? (
        <div className="rounded-md border border-warning-border bg-warning-subtle px-4 py-3">
          <p className="text-sm font-medium text-warning-text">
            {missing.length} required field{missing.length === 1 ? "" : "s"} still missing —
            generation is blocked until they&apos;re filled.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {missing.map((m) => (
              <li key={m.path}>
                <button
                  type="button"
                  className="rounded-full border border-warning-border bg-surface px-3 py-1 text-xs font-medium text-warning-text hover:bg-warning-subtle"
                  onClick={() => onJump(m.section)}
                >
                  {m.label} →
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div className="rounded-md border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          <p className="font-medium">The brief did not validate against the schema:</p>
          <ul className="mt-1 space-y-1">
            {issues.slice(0, 8).map((issue, i) => {
              const section = sectionForPath(issue.path);
              return (
                <li key={`${issue.path}-${i}`} className="flex flex-wrap items-center gap-2">
                  <span>
                    <code>{issue.path || "(root)"}</code>: {issue.message}
                  </span>
                  {section ? (
                    <button
                      type="button"
                      className="rounded-full border border-danger-border bg-surface px-2 py-0.5 text-xs font-medium text-danger-text hover:bg-danger-subtle"
                      onClick={() => onJump(section)}
                    >
                      Fix →
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {REVIEW_SECTIONS.map((section) => {
          const sectionMissing = missing.filter((m) => m.section === section.section);
          return (
            <Card key={section.section}>
              <CardHeader className="border-b-0 py-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-content">{section.title}</h3>
                  <p className="truncate text-xs text-content-muted">{section.summary(brief)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {sectionMissing.length > 0 ? (
                    <Badge tone="warning">
                      {sectionMissing.length} required field
                      {sectionMissing.length === 1 ? "" : "s"} missing
                    </Badge>
                  ) : (
                    <Badge tone="success">Ready</Badge>
                  )}
                  <Button size="sm" onClick={() => onJump(section.section)}>
                    Edit
                  </Button>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-content-muted">
            Generating assembles the full brief — your answers plus the{" "}
            {brief.successMetrics.length} preset success metric
            {brief.successMetrics.length === 1 ? "" : "s"}, {brief.riskRegister.length} risk
            {brief.riskRegister.length === 1 ? "" : "s"} and{" "}
            {brief.timeline.milestones.length} milestone
            {brief.timeline.milestones.length === 1 ? "" : "s"} — validates it against the
            schema and opens the editable brief.
          </div>
          <Button variant="primary" disabled={blocked || generating} onClick={onGenerate}>
            {generating ? "Generating…" : "Generate brief"}
          </Button>
        </CardBody>
      </Card>

      <p className="text-xs text-content-muted">
        Completeness is {completeness.percent}% — you can generate at any point once required
        fields are filled and keep editing afterwards.
      </p>
    </div>
  );
}
