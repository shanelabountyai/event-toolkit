/**
 * Brief completeness (FR-10).
 *
 * Definition per PRD §12 Q2 (documented default decision):
 *   completeness = (all FR-3 required fields populated)
 *                  AND (>= 1 entry each in stakeholders, successMetrics, riskRegister,
 *                       timeline.milestones)
 *                  AND (>= 1 entry in audience.targetPersonas)
 * All checks are weighted evenly for the displayed percentage.
 */

import type { EventBrief } from "./event-brief";
import { REQUIRED_FIELDS, type IntakeSection } from "./validation";

export interface CompletenessCheck {
  key: string;
  label: string;
  ok: boolean;
  /** "required" = an FR-3 blocking field; "recommended" = a section that should have >=1 entry. */
  kind: "required" | "recommended";
  section: IntakeSection | "brief";
}

export interface CompletenessResult {
  /** 0-100, rounded. */
  percent: number;
  checks: CompletenessCheck[];
  /** Number of passing checks / total checks. */
  passed: number;
  total: number;
  /** True when every FR-3 required field is populated (i.e. generation is unblocked). */
  requiredComplete: boolean;
  /** Recommended sections that still have no entries. */
  missingRecommended: string[];
}

interface RecommendedSpec {
  key: string;
  label: string;
  section: IntakeSection | "brief";
  count: (b: EventBrief) => number;
}

const RECOMMENDED: RecommendedSpec[] = [
  {
    key: "stakeholders",
    label: "At least one stakeholder",
    section: "stakeholders",
    count: (b) => b.stakeholders?.length ?? 0,
  },
  {
    key: "successMetrics",
    label: "At least one success metric",
    section: "brief",
    count: (b) => b.successMetrics?.length ?? 0,
  },
  {
    key: "riskRegister",
    label: "At least one risk",
    section: "brief",
    count: (b) => b.riskRegister?.length ?? 0,
  },
  {
    key: "milestones",
    label: "At least one timeline milestone",
    section: "brief",
    count: (b) => b.timeline?.milestones?.length ?? 0,
  },
  {
    key: "personas",
    label: "At least one target persona",
    section: "audience",
    count: (b) => b.audience?.targetPersonas?.length ?? 0,
  },
];

export function computeCompleteness(brief: EventBrief): CompletenessResult {
  const requiredChecks: CompletenessCheck[] = REQUIRED_FIELDS.map((f) => ({
    key: f.path,
    label: f.label,
    ok: safe(() => f.isFilled(brief)),
    kind: "required" as const,
    section: f.section,
  }));

  const recommendedChecks: CompletenessCheck[] = RECOMMENDED.map((r) => ({
    key: r.key,
    label: r.label,
    ok: safe(() => r.count(brief) > 0),
    kind: "recommended" as const,
    section: r.section,
  }));

  const checks = [...requiredChecks, ...recommendedChecks];
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;

  return {
    percent: total === 0 ? 0 : Math.round((passed / total) * 100),
    checks,
    passed,
    total,
    requiredComplete: requiredChecks.every((c) => c.ok),
    missingRecommended: recommendedChecks.filter((c) => !c.ok).map((c) => c.label),
  };
}

function safe(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}
