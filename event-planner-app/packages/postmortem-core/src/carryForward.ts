// packages/postmortem-core/src/carryForward.ts
//
// §7 — the whole point of PRD 7. Everything else in the tool is in service of this function.
//
// Lessons flow into `EventBrief.carryForwardLessons`, which PRD 1's intake already reads and
// surfaces on the next brief of the same type. PRD 1 needs no changes for this to work — it
// was built to read `LessonLearned` entries generically, and this writes exactly that shape.
//
// Idempotency is the requirement that matters. A planner will re-open a completed retro,
// reword a lesson and re-complete it. Without tracking which brief entry each retro lesson
// produced, that silently duplicates the lesson every time — a bug that only surfaces months
// later as "why does my brief have the same lesson five times".

import { newId, type EventBrief, type LessonLearned } from "@event-toolkit/schema";
import type { RetroDocument, RetroLesson } from "./retro";

/**
 * Strip the retro-local fields. `sourceRef` and `carryForward` are this tool's bookkeeping and
 * are deliberately not part of the canonical shape stored on the brief.
 */
export function toCanonicalLesson(lesson: RetroLesson): LessonLearned {
  return {
    id: lesson.writtenLessonId ?? newId(),
    sourceEventId: lesson.sourceEventId,
    category: lesson.category,
    lesson: lesson.lesson,
    addedAt: lesson.addedAt,
    disposition: lesson.disposition,
    sourceType: lesson.sourceType,
  };
}

export interface CarryForwardResult {
  /** The brief with `carryForwardLessons` updated. Caller persists it via `saveBrief`. */
  brief: EventBrief;
  /** Retro lessons with `writtenLessonId` stamped, for the next completion to match on. */
  lessons: RetroLesson[];
  added: number;
  updated: number;
  removed: number;
}

/**
 * Apply a retro's carry-forward flags to a brief.
 *
 * - `carryForward: true`, never written → append.
 * - `carryForward: true`, written before → replace that entry in place.
 * - `carryForward: false`, written before → remove it. Un-ticking the box has to actually
 *   undo the write, or the flag is decorative.
 *
 * Lessons on the brief that this retro never wrote are left completely alone — a brief can
 * carry lessons from several sources, and this function owns only its own.
 */
export function applyCarryForward(brief: EventBrief, lessons: RetroLesson[]): CarryForwardResult {
  const existing = [...(brief.carryForwardLessons ?? [])];
  const byId = new Map(existing.map((entry, index) => [entry.id, index]));

  let added = 0;
  let updated = 0;
  let removed = 0;
  const removeIds = new Set<string>();

  const nextLessons = lessons.map((lesson) => {
    if (!lesson.carryForward) {
      if (lesson.writtenLessonId && byId.has(lesson.writtenLessonId)) {
        removeIds.add(lesson.writtenLessonId);
        removed += 1;
      }
      // Forget the link, so re-ticking the box writes a fresh entry rather than trying to
      // update one that is no longer there.
      return { ...lesson, writtenLessonId: undefined };
    }

    const canonical = toCanonicalLesson(lesson);
    const index = lesson.writtenLessonId ? byId.get(lesson.writtenLessonId) : undefined;

    if (index !== undefined) {
      existing[index] = canonical;
      updated += 1;
    } else {
      existing.push(canonical);
      byId.set(canonical.id, existing.length - 1);
      added += 1;
    }

    return { ...lesson, writtenLessonId: canonical.id };
  });

  return {
    brief: {
      ...brief,
      carryForwardLessons: existing.filter((entry) => !removeIds.has(entry.id)),
    },
    lessons: nextLessons,
    added,
    updated,
    removed,
  };
}

/** FR-11 — completion is blocked only by a lesson with no disposition or no text. */
export function lessonsBlockingCompletion(retro: RetroDocument): RetroLesson[] {
  return retro.lessons.filter((lesson) => !lesson.disposition || !lesson.lesson.trim());
}

export function canComplete(retro: RetroDocument): boolean {
  // Zero lessons is a legitimate retro: "nothing worth recording" is a finding too.
  return lessonsBlockingCompletion(retro).length === 0;
}

export interface CarryForwardPreview {
  total: number;
  repeat: number;
  fix: number;
  drop: number;
}

/** The confirmation summary shown before committing the write-back. */
export function previewCarryForward(retro: RetroDocument): CarryForwardPreview {
  const carried = retro.lessons.filter((lesson) => lesson.carryForward);
  return {
    total: carried.length,
    repeat: carried.filter((l) => l.disposition === "repeat").length,
    fix: carried.filter((l) => l.disposition === "fix").length,
    drop: carried.filter((l) => l.disposition === "drop").length,
  };
}

/* -------------------------------------------------------------------------- */
/* Success metric adjustment (FR-10)                                           */
/* -------------------------------------------------------------------------- */

/**
 * A final retro correction to a metric PRD 6 already wrote. The reason is required and the
 * previous value is preserved on the retro, so a correction is always visible as a correction
 * rather than looking like the number was always that.
 */
export function applyMetricAdjustment(
  brief: EventBrief,
  metricId: string,
  adjustedActual: number,
): EventBrief {
  return {
    ...brief,
    successMetrics: brief.successMetrics.map((metric) =>
      metric.id === metricId ? { ...metric, actual: adjustedActual } : metric,
    ),
  };
}
