import type { EventBrief } from "@event-toolkit/schema";
import type { LessonSuggestion } from "@event-toolkit/local-store";

/** Shared props for every intake step. */
export interface StepProps {
  brief: EventBrief;
  onChange: (updater: (prev: EventBrief) => EventBrief) => void;
  /** Paths of required fields the planner tried to skip, highlighted after a blocked generate. */
  highlightMissing: string[];
}

export interface LessonStepProps extends StepProps {
  lessons: LessonSuggestion[];
  dismissedLessonIds: string[];
  onAcceptLesson: (lesson: LessonSuggestion) => void;
  onDismissLesson: (lessonId: string) => void;
}
