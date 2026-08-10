/**
 * Runtime validation of Event Brief documents (FR-3, FR-4).
 *
 * The zod schema below is the runtime twin of `event-brief.ts` and `event-brief.schema.json`
 * — all three must be changed together (see the versioning policy in event-brief-schema.md).
 * Objects are `.passthrough()`ed to honour the "readers must tolerate unknown fields" rule.
 */

import { z } from "zod";
import type { EventBrief } from "./event-brief";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date (YYYY-MM-DD)");

const isoDateTime = z.string().min(1, "Must be an ISO datetime");

export const personaSchema = z
  .object({
    name: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    painPoints: z.array(z.string()).optional(),
  })
  .passthrough();

export const goalsSchema = z
  .object({
    primaryObjective: z.string().min(1, "Primary objective is required"),
    objectives: z.array(z.string()).optional(),
    businessJustification: z.string().optional(),
  })
  .passthrough();

export const audienceSchema = z
  .object({
    description: z.string().min(1, "Audience description is required"),
    targetPersonas: z.array(personaSchema).optional(),
    estimatedSize: z.number().int().min(0).optional(),
    segments: z.array(z.string()).optional(),
  })
  .passthrough();

export const budgetAllocationSchema = z
  .object({
    id: z.string().min(1),
    category: z.string().min(1),
    plannedAmount: z.number(),
    actualAmount: z.number().nullable().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const budgetSchema = z
  .object({
    totalBudget: z.number().optional(),
    currency: z.string().min(1, "Currency is required"),
    allocations: z.array(budgetAllocationSchema).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const datesSchema = z
  .object({
    timezone: z.string().min(1, "Timezone is required"),
    eventStartDate: isoDate,
    eventEndDate: isoDate,
  })
  .passthrough();

export const venueOrPlatformSchema = z
  .object({
    name: z.string().optional(),
    locationOrUrl: z.string().optional(),
    capacity: z.number().int().min(0).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const formatSchema = z
  .object({
    deliveryMode: z.enum(["in_person", "virtual", "hybrid"]),
    venueOrPlatform: venueOrPlatformSchema.optional(),
  })
  .passthrough();

export const stakeholderSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1, "Stakeholder name is required"),
    role: z.string().min(1, "Stakeholder role is required"),
    raci: z.enum(["R", "A", "C", "I"]),
    email: z.string().optional(),
    department: z.string().optional(),
  })
  .passthrough();

export const successMetricSchema = z
  .object({
    id: z.string().min(1),
    metric: z.string().min(1, "Metric name is required"),
    target: z.number(),
    unit: z.string().optional(),
    actual: z.number().nullable().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const riskItemSchema = z
  .object({
    id: z.string().min(1),
    risk: z.string().min(1, "Risk description is required"),
    likelihood: z.enum(["low", "medium", "high"]),
    impact: z.enum(["low", "medium", "high"]),
    mitigation: z.string().optional(),
    owner: z.string().optional(),
    status: z.enum(["open", "mitigated", "occurred", "closed"]),
  })
  .passthrough();

export const milestoneSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1, "Milestone label is required"),
    phase: z.enum(["pre_event", "during_event", "post_event"]),
    targetDate: isoDate,
    owner: z.string().optional(),
    status: z.enum(["not_started", "in_progress", "done", "at_risk"]),
    notes: z.string().optional(),
  })
  .passthrough();

export const timelineSchema = z
  .object({ milestones: z.array(milestoneSchema) })
  .passthrough();

export const constraintsSchema = z
  .object({
    items: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const lessonLearnedSchema = z
  .object({
    id: z.string().min(1),
    sourceEventId: z.string().optional(),
    category: z.string().optional(),
    lesson: z.string().min(1),
    addedAt: isoDateTime,
  })
  .passthrough();

export const exportRecordSchema = z
  .object({
    id: z.string().min(1),
    format: z.enum(["markdown", "pdf", "docx", "html"]),
    generatedAt: isoDateTime,
    filename: z.string().optional(),
  })
  .passthrough();

export const eventBriefSchema = z
  .object({
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be a semver string"),
    id: z.string().min(1),
    name: z.string().min(1, "Event name is required"),
    type: z.enum(["conference", "webinar", "trade_show", "custom"]),
    status: z.enum(["draft", "complete"]),
    version: z.number().int().min(1),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    createdBy: z.string().optional(),
    goals: goalsSchema,
    audience: audienceSchema,
    budget: budgetSchema,
    dates: datesSchema,
    format: formatSchema,
    stakeholders: z.array(stakeholderSchema),
    successMetrics: z.array(successMetricSchema),
    riskRegister: z.array(riskItemSchema),
    timeline: timelineSchema,
    constraints: constraintsSchema,
    carryForwardLessons: z.array(lessonLearnedSchema),
    exportHistory: z.array(exportRecordSchema).optional(),
  })
  .passthrough();

export interface ValidationIssue {
  /** Dotted path to the offending field, e.g. `audience.description`. */
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; brief: EventBrief }
  | { ok: false; issues: ValidationIssue[] };

/** Validate an unknown value as a complete `EventBrief` (FR-4). */
export function validateBrief(value: unknown): ValidationResult {
  const parsed = eventBriefSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, brief: parsed.data as unknown as EventBrief };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

/** Which intake step a required field belongs to, for FR-3's jump-back links. */
export type IntakeSection = "basics" | "goals" | "audience" | "budget" | "stakeholders" | "constraints";

export interface RequiredFieldSpec {
  path: string;
  label: string;
  section: IntakeSection;
  isFilled: (brief: EventBrief) => boolean;
}

/** The FR-3 required-field set, in intake order. */
export const REQUIRED_FIELDS: RequiredFieldSpec[] = [
  {
    path: "name",
    label: "Event name",
    section: "basics",
    isFilled: (b) => b.name.trim().length > 0,
  },
  {
    path: "type",
    label: "Event type",
    section: "basics",
    isFilled: (b) => Boolean(b.type),
  },
  {
    path: "dates.eventStartDate",
    label: "Event start date",
    section: "basics",
    isFilled: (b) => /^\d{4}-\d{2}-\d{2}$/.test(b.dates.eventStartDate ?? ""),
  },
  {
    path: "dates.eventEndDate",
    label: "Event end date",
    section: "basics",
    isFilled: (b) => /^\d{4}-\d{2}-\d{2}$/.test(b.dates.eventEndDate ?? ""),
  },
  {
    path: "dates.timezone",
    label: "Timezone",
    section: "basics",
    isFilled: (b) => (b.dates.timezone ?? "").trim().length > 0,
  },
  {
    path: "format.deliveryMode",
    label: "Delivery mode",
    section: "basics",
    isFilled: (b) => Boolean(b.format?.deliveryMode),
  },
  {
    path: "goals.primaryObjective",
    label: "Primary objective",
    section: "goals",
    isFilled: (b) => (b.goals?.primaryObjective ?? "").trim().length > 0,
  },
  {
    path: "audience.description",
    label: "Audience description",
    section: "audience",
    isFilled: (b) => (b.audience?.description ?? "").trim().length > 0,
  },
  {
    path: "budget.currency",
    label: "Budget currency",
    section: "budget",
    isFilled: (b) => (b.budget?.currency ?? "").trim().length > 0,
  },
];

export interface MissingRequiredField {
  path: string;
  label: string;
  section: IntakeSection;
}

/** Required fields still missing — drives FR-3's blocking + jump-back links. */
export function missingRequiredFields(brief: EventBrief): MissingRequiredField[] {
  return REQUIRED_FIELDS.filter((f) => !f.isFilled(brief)).map(({ path, label, section }) => ({
    path,
    label,
    section,
  }));
}

/** True when the end date is not before the start date (both present). */
export function datesAreConsistent(brief: EventBrief): boolean {
  const { eventStartDate, eventEndDate } = brief.dates ?? {};
  if (!eventStartDate || !eventEndDate) return true;
  return eventEndDate >= eventStartDate;
}
