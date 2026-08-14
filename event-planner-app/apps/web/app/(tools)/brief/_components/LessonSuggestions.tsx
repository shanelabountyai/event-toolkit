"use client";

/**
 * FR-11 — carry-forward lessons surfaced during intake.
 *
 * Lessons are written by PRD 7 (Post-Mortem Generator) onto past briefs; here they are
 * read-only suggestions the planner can accept into `constraints.items` or dismiss.
 * Matching is exact-`type` only, with a "most recent 3 of any type" fallback (PRD §12 Q3).
 */

import { useState } from "react";
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
  /**
   * Three at a time, but an *accepted* lesson frees its slot.
   *
   * Previously only dismissal advanced the window, so a planner who accepted the three on show
   * never saw the rest — a retro that produced ten lessons surfaced three of them, permanently,
   * with nothing indicating the others existed. A loop that closes and then shows you 30% of what
   * it learned is 30% of a loop.
   */
  const outstanding = lessons.filter(
    (l) => !dismissedIds.includes(l.id) && !acceptedItems.includes(l.lesson),
  );
  const accepted = lessons.filter(
    (l) => !dismissedIds.includes(l.id) && acceptedItems.includes(l.lesson),
  );

  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? [...outstanding, ...accepted] : outstanding.slice(0, 3);
  const remaining = outstanding.length - visible.filter((l) => !acceptedItems.includes(l.lesson)).length;

  if (visible.length === 0 && accepted.length === 0) return null;

  return (
    <Card className="bg-warning-subtle/40">
      <CardHeader className="border-warning-border">
        <div>
          <h3 className="text-sm font-semibold text-content">Lessons from past events</h3>
          <p className="text-xs text-content-muted">
            Carried forward from your previous briefs. Add one as a constraint so you don&apos;t
            repeat it.
            {outstanding.length > 0 ? (
              <>
                {" "}
                <span className="font-medium text-content">
                  {outstanding.length} still to decide
                  {accepted.length > 0 ? `, ${accepted.length} added` : ""}.
                </span>
              </>
            ) : null}
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {visible.map((lesson) => {
          const alreadyAccepted = acceptedItems.includes(lesson.lesson);
          return (
            <div
              key={lesson.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-warning-border bg-surface px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-content">{lesson.lesson}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-content-muted">
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
        {remaining > 0 && !showAll ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-sm font-medium text-accent-text underline underline-offset-2"
          >
            Show {remaining} more {remaining === 1 ? "lesson" : "lessons"}
          </button>
        ) : null}
        {showAll && lessons.length > 3 ? (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="text-sm font-medium text-content-muted underline underline-offset-2"
          >
            Show fewer
          </button>
        ) : null}
      </CardBody>
    </Card>
  );
}
