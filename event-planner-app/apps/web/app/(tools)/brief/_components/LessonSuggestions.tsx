"use client";

/**
 * FR-11 — carry-forward lessons surfaced during intake.
 *
 * Lessons are written by PRD 7 (Post-Mortem Generator) onto past briefs; here they are
 * read-only suggestions the planner can accept into `constraints.items` or dismiss.
 * Matching is exact-`type` only, with a "most recent 3 of any type" fallback (PRD §12 Q3).
 */

import { EVENT_TYPE_LABELS } from "@event-toolkit/schema";
import type { LessonSuggestion } from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader } from "@event-toolkit/ui";

export function LessonSuggestions({
  lessons,
  dismissedIds,
  acceptedItems,
  onAccept,
  onDismiss,
}: {
  lessons: LessonSuggestion[];
  dismissedIds: string[];
  acceptedItems: string[];
  onAccept: (lesson: LessonSuggestion) => void;
  onDismiss: (lessonId: string) => void;
}) {
  const visible = lessons.filter((l) => !dismissedIds.includes(l.id)).slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <Card className="bg-amber-50/40">
      <CardHeader className="border-amber-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Lessons from past events</h3>
          <p className="text-xs text-slate-600">
            Carried forward from your previous briefs. Add one as a constraint so you don&apos;t
            repeat it.
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {visible.map((lesson) => {
          const alreadyAccepted = acceptedItems.includes(lesson.lesson);
          return (
            <div
              key={lesson.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-100 bg-white px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">{lesson.lesson}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span>from {lesson.sourceBriefName}</span>
                  <Badge tone={lesson.exactTypeMatch ? "info" : "neutral"}>
                    {EVENT_TYPE_LABELS[lesson.sourceBriefType]}
                  </Badge>
                  {lesson.category ? <Badge tone="neutral">{lesson.category}</Badge> : null}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={alreadyAccepted}
                  onClick={() => onAccept(lesson)}
                >
                  {alreadyAccepted ? "Added" : "Add as constraint"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDismiss(lesson.id)}>
                  Dismiss
                </Button>
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
