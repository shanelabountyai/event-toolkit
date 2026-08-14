/**
 * Factory helpers for building Event Brief documents and their list rows.
 *
 * Every list entity (stakeholder, metric, risk, milestone, budget allocation, lesson,
 * export record) gets a UUID `id` here via `newId()` (`crypto.randomUUID()` under the
 * hood) — UI code should never hand-roll ids.
 */

import { CURRENT_SCHEMA_VERSION } from "./event-brief";
import type {
  BudgetAllocation,
  EventBrief,
  EventPhase,
  EventType,
  ExportFormat,
  ExportRecord,
  LessonLearned,
  Milestone,
  Persona,
  RiskItem,
  Stakeholder,
  SuccessMetric,
} from "./event-brief";
import { newId, nowIso, todayIsoDate } from "./ids";
import {
  getPreset,
  presetBudgetAllocations,
  presetMilestones,
  presetPersonas,
  presetRiskRegister,
  presetStakeholders,
  presetSuccessMetrics,
} from "./presets";

/** Best-effort IANA timezone from the runtime, falling back to UTC. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function newStakeholder(partial: Partial<Stakeholder> = {}): Stakeholder {
  return { id: newId(), name: "", role: "", raci: "R", ...partial };
}

export function newSuccessMetric(partial: Partial<SuccessMetric> = {}): SuccessMetric {
  return { id: newId(), metric: "", target: 0, unit: "count", actual: null, ...partial };
}

export function newRiskItem(partial: Partial<RiskItem> = {}): RiskItem {
  return {
    id: newId(),
    risk: "",
    likelihood: "medium",
    impact: "medium",
    status: "open",
    ...partial,
  };
}

export function newMilestone(partial: Partial<Milestone> = {}): Milestone {
  const phase: EventPhase = partial.phase ?? "pre_event";
  return {
    id: newId(),
    label: "",
    phase,
    targetDate: todayIsoDate(),
    status: "not_started",
    ...partial,
  };
}

export function newBudgetAllocation(partial: Partial<BudgetAllocation> = {}): BudgetAllocation {
  return { id: newId(), category: "", plannedAmount: 0, actualAmount: null, ...partial };
}

export function newPersona(partial: Partial<Persona> = {}): Persona {
  return { name: "", painPoints: [], ...partial };
}

export function newLessonLearned(partial: Partial<LessonLearned> = {}): LessonLearned {
  return { id: newId(), lesson: "", addedAt: nowIso(), ...partial };
}

export function newExportRecord(format: ExportFormat, filename?: string): ExportRecord {
  return { id: newId(), format, generatedAt: nowIso(), ...(filename ? { filename } : {}) };
}

export interface CreateBriefOptions {
  /** Optional starting name; the planner sets the real one on the Event Basics step. */
  name?: string;
  createdBy?: string;
  /** Override the detected IANA timezone. */
  timezone?: string;
  /** Skip preset content entirely (equivalent to choosing the Custom preset). */
  withoutPresetContent?: boolean;
}

/**
 * Create a new, empty-but-structurally-complete brief for an event type, pre-populated
 * with that preset's success metrics, risks, budget categories, suggested RACI rows and
 * starter personas (FR-1).
 *
 * Timeline milestones are materialised later by `ensurePresetMilestones()` — they are
 * dated relative to the event start date, which the planner has not entered yet.
 */
export function createEmptyBrief(type: EventType, options: CreateBriefOptions = {}): EventBrief {
  const now = nowIso();
  const preset = getPreset(type);
  const usePreset = !options.withoutPresetContent;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(),
    name: options.name ?? "",
    type,
    status: "draft",
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(options.createdBy ? { createdBy: options.createdBy } : {}),
    goals: { primaryObjective: "", objectives: [], businessJustification: "" },
    audience: {
      description: "",
      targetPersonas: usePreset ? presetPersonas(type) : [],
      segments: [],
    },
    budget: {
      currency: "USD",
      allocations: usePreset ? presetBudgetAllocations(type) : [],
      notes: "",
    },
    dates: {
      timezone: options.timezone ?? detectTimezone(),
      eventStartDate: "",
      eventEndDate: "",
    },
    format: {
      deliveryMode: preset.defaultDeliveryMode,
      // A booth brief is somebody else's conference. Getting this wrong makes every piece of
      // generated promo copy claim you run an event you are merely attending.
      participationRole: type === "trade_show" ? "exhibitor" : "host",
      venueOrPlatform: {} },
    stakeholders: usePreset ? presetStakeholders(type) : [],
    successMetrics: usePreset ? presetSuccessMetrics(type) : [],
    riskRegister: usePreset ? presetRiskRegister(type) : [],
    timeline: { milestones: [] },
    constraints: { items: [], notes: "" },
    carryForwardLessons: [],
    exportHistory: [],
  };
}

/**
 * Fill in the preset's timeline milestones once real event dates exist. No-op if the brief
 * already has milestones (never clobbers planner edits) or if no start date is set yet.
 */
export function ensurePresetMilestones(brief: EventBrief): EventBrief {
  if (brief.timeline.milestones.length > 0) return brief;
  if (!brief.dates.eventStartDate) return brief;
  const milestones = presetMilestones(
    brief.type,
    brief.dates.eventStartDate,
    brief.dates.eventEndDate,
  );
  if (milestones.length === 0) return brief;
  return { ...brief, timeline: { milestones } };
}

/**
 * Drop placeholder rows the planner never filled in so a brief validates cleanly at
 * generation time. Non-destructive to anything with real content.
 *
 * Stakeholders are pruned on `name` alone: preset rows arrive with a suggested `role` and an
 * empty `name`, so "has a role but nobody assigned" means the suggestion was never taken up.
 * A row *with* a name but no role is kept deliberately — that is real planner input with a
 * genuine gap, and surfacing it as a validation error beats silently deleting it.
 */
export function pruneEmptyRows(brief: EventBrief): EventBrief {
  return {
    ...brief,
    stakeholders: brief.stakeholders.filter((s) => s.name.trim() !== ""),
    successMetrics: brief.successMetrics.filter((m) => m.metric.trim() !== ""),
    riskRegister: brief.riskRegister.filter((r) => r.risk.trim() !== ""),
    timeline: {
      milestones: brief.timeline.milestones.filter((m) => m.label.trim() !== ""),
    },
    budget: {
      ...brief.budget,
      allocations: (brief.budget.allocations ?? []).filter((a) => a.category.trim() !== ""),
    },
    audience: {
      ...brief.audience,
      targetPersonas: (brief.audience.targetPersonas ?? []).filter((p) => p.name.trim() !== ""),
      segments: (brief.audience.segments ?? []).filter((s) => s.trim() !== ""),
    },
    goals: {
      ...brief.goals,
      objectives: (brief.goals.objectives ?? []).filter((o) => o.trim() !== ""),
    },
    constraints: {
      ...brief.constraints,
      items: (brief.constraints.items ?? []).filter((c) => c.trim() !== ""),
    },
  };
}

/** Stamp `updatedAt` and bump the brief revision counter. Called by the store on every save. */
export function touchBrief(brief: EventBrief): EventBrief {
  return {
    ...brief,
    version: (typeof brief.version === "number" ? brief.version : 0) + 1,
    updatedAt: nowIso(),
  };
}

/** Append an export record to the brief's audit trail (FR-8). */
export function withExportRecord(
  brief: EventBrief,
  format: ExportFormat,
  filename?: string,
): EventBrief {
  return {
    ...brief,
    exportHistory: [...(brief.exportHistory ?? []), newExportRecord(format, filename)],
  };
}
