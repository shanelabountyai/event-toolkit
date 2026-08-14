"use client";

/**
 * FR-2 / FR-3 / FR-4 / FR-6 — the guided intake wizard.
 *
 * All six steps edit one shared working copy of the brief, so moving forward and back never
 * loses data. That working copy is autosaved to IndexedDB (debounced) and flushed on every
 * step change, and the current step index is persisted separately, so closing the tab
 * mid-intake and reopening the app resumes exactly where the planner left off.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  datesAreConsistent,
  ensurePresetMilestones,
  missingRequiredFields,
  nowIso,
  pruneEmptyRows,
  validateBrief,
  type IntakeSection,
  type ValidationIssue,
} from "@event-toolkit/schema";
import {
  getIntakeProgress,
  queryLessons,
  saveIntakeProgress,
  type LessonSuggestion,
} from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { useBriefDocument } from "../_hooks/useBriefDocument";
import { EventBasicsStep } from "./steps/EventBasicsStep";
import { GoalsStep } from "./steps/GoalsStep";
import { AudienceStep } from "./steps/AudienceStep";
import { BudgetStep } from "./steps/BudgetStep";
import { StakeholdersStep } from "./steps/StakeholdersStep";
import { ConstraintsStep } from "./steps/ConstraintsStep";
import { ReviewStep } from "./steps/ReviewStep";
import { SaveIndicator } from "./SaveIndicator";

interface StepDef {
  key: IntakeSection | "review";
  title: string;
  blurb: string;
}

const STEPS: StepDef[] = [
  { key: "basics", title: "Event basics", blurb: "Name, type, dates, timezone and delivery mode." },
  { key: "goals", title: "Goals & objectives", blurb: "Why this event exists and what it must achieve." },
  { key: "audience", title: "Audience", blurb: "Who it is for, how many, and which personas." },
  { key: "budget", title: "Budget", blurb: "High-level total and category placeholders." },
  { key: "stakeholders", title: "Stakeholders & RACI", blurb: "Who is Responsible, Accountable, Consulted, Informed." },
  { key: "constraints", title: "Constraints", blurb: "Limits the plan has to respect." },
  { key: "review", title: "Review & generate", blurb: "Check for gaps, then assemble the brief." },
];

const REVIEW_INDEX = STEPS.length - 1;

export function IntakeWizard({ briefId }: { briefId: string }) {
  const router = useRouter();
  const { brief, updateBrief, replaceBrief, flush, loading, notFound, saveState } =
    useBriefDocument(briefId);

  const [stepIndex, setStepIndex] = useState(0);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [dismissedLessonIds, setDismissedLessonIds] = useState<string[]>([]);
  const [generated, setGenerated] = useState(false);
  const [lessons, setLessons] = useState<LessonSuggestion[]>([]);
  const [highlightMissing, setHighlightMissing] = useState<string[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [generating, setGenerating] = useState(false);
  const topRef = useRef<HTMLDivElement | null>(null);

  // Restore the saved step / dismissals (FR-6).
  useEffect(() => {
    let cancelled = false;
    getIntakeProgress(briefId)
      .then((progress) => {
        if (cancelled) return;
        if (progress) {
          setStepIndex(Math.min(Math.max(progress.stepIndex, 0), REVIEW_INDEX));
          setDismissedLessonIds(progress.dismissedLessonIds ?? []);
          setGenerated(progress.generated);
        }
      })
      .finally(() => {
        if (!cancelled) setProgressLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [briefId]);

  // Persist step/dismissals whenever they change (cheap, so no debounce).
  useEffect(() => {
    if (!progressLoaded) return;
    void saveIntakeProgress({
      briefId,
      stepIndex,
      dismissedLessonIds,
      generated,
      updatedAt: nowIso(),
    });
  }, [briefId, stepIndex, dismissedLessonIds, generated, progressLoaded]);

  // FR-11 — load carry-forward lessons for this brief's event type.
  const briefType = brief?.type;
  useEffect(() => {
    if (!briefType) return;
    let cancelled = false;
    queryLessons(briefType, briefId)
      .then((rows) => {
        if (!cancelled) setLessons(rows);
      })
      .catch(() => {
        if (!cancelled) setLessons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [briefType, briefId]);

  const missing = useMemo(() => (brief ? missingRequiredFields(brief) : []), [brief]);

  /**
   * A field is shown in its error state only while it is BOTH flagged (the planner hit a
   * blocked generate or followed a jump-back link) and still actually empty — so the
   * highlight clears itself the moment the field is filled in.
   */
  const activeHighlights = useMemo(
    () => highlightMissing.filter((path) => missing.some((m) => m.path === path)),
    [highlightMissing, missing],
  );

  const goToStep = useCallback(
    async (next: number) => {
      const target = Math.min(Math.max(next, 0), REVIEW_INDEX);
      // Materialise preset milestones as soon as real dates exist (FR-1/FR-4).
      updateBrief((prev) => ensurePresetMilestones(prev));
      await flush();
      setStepIndex(target);
      setIssues([]);
      if (topRef.current) topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [flush, updateBrief],
  );

  const jumpToSection = useCallback(
    (section: IntakeSection) => {
      // Flag every currently-missing field so the target step highlights the gap on arrival.
      setHighlightMissing(missing.map((m) => m.path));
      const index = STEPS.findIndex((s) => s.key === section);
      if (index >= 0) void goToStep(index);
    },
    [goToStep, missing],
  );

  const acceptLesson = useCallback(
    (lesson: LessonSuggestion) => {
      updateBrief((prev) => {
        const items = prev.constraints.items ?? [];
        if (items.includes(lesson.lesson)) return prev;
        return { ...prev, constraints: { ...prev.constraints, items: [...items, lesson.lesson] } };
      });
    },
    [updateBrief],
  );

  const dismissLesson = useCallback((lessonId: string) => {
    setDismissedLessonIds((prev) => (prev.includes(lessonId) ? prev : [...prev, lessonId]));
  }, []);

  const generate = useCallback(async () => {
    if (!brief) return;
    setGenerating(true);
    setIssues([]);
    try {
      const assembled = pruneEmptyRows(ensurePresetMilestones(brief));
      const stillMissing = missingRequiredFields(assembled);
      if (stillMissing.length > 0) {
        setHighlightMissing(stillMissing.map((m) => m.path));
        setGenerating(false);
        return;
      }
      if (!datesAreConsistent(assembled)) {
        setIssues([
          {
            path: "dates.eventEndDate",
            message: "The end date cannot be before the start date.",
          },
        ]);
        setGenerating(false);
        return;
      }
      const result = validateBrief(assembled);
      if (!result.ok) {
        setIssues(result.issues);
        setGenerating(false);
        return;
      }
      replaceBrief(result.brief);
      await flush();
      setGenerated(true);
      await saveIntakeProgress({
        briefId,
        stepIndex: REVIEW_INDEX,
        dismissedLessonIds,
        generated: true,
        updatedAt: nowIso(),
      });
      router.push(`/brief/${briefId}`);
    } catch {
      setGenerating(false);
    }
  }, [brief, briefId, dismissedLessonIds, flush, replaceBrief, router]);

  if (loading || !progressLoaded) {
    return <p className="text-sm text-content-muted">Loading brief…</p>;
  }

  if (notFound || !brief) {
    return (
      <Card>
        <CardBody className="space-y-3 py-10 text-center">
          <h1 className="text-lg font-semibold text-content">Brief not found</h1>
          <p className="text-sm text-content-muted">
            This brief isn&apos;t in this browser&apos;s local storage. It may have been deleted,
            or created in a different browser or profile.
          </p>
          <div>
            <Link href="/brief">
              <Button variant="primary">Back to briefs</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }

  const step = STEPS[stepIndex];
  const stepProps = { brief, onChange: updateBrief, highlightMissing: activeHighlights };
  const lessonProps = {
    ...stepProps,
    lessons,
    dismissedLessonIds,
    onAcceptLesson: acceptLesson,
    onDismissLesson: dismissLesson,
  };

  return (
    <div className="space-y-6" ref={topRef}>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/brief" className="text-sm text-content-muted hover:underline">
            ← All briefs
          </Link>
          <span className="text-sm text-content-subtle">/</span>
          <span className="text-sm font-medium text-content-muted">
            {brief.name || "Untitled brief"}
          </span>
          {generated ? (
            <Link href={`/brief/${briefId}`} className="text-sm text-content-muted hover:underline">
              View generated brief →
            </Link>
          ) : null}
          <SaveIndicator state={saveState} className="ml-auto" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-content">
          {step.title}
          <span className="ml-2 align-middle text-sm font-normal text-content-muted">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
        </h1>
        <p className="text-sm text-content-muted">{step.blurb}</p>
      </header>

      <ol className="no-print flex flex-wrap gap-2">
        {STEPS.map((s, index) => {
          const active = index === stepIndex;
          const sectionMissing =
            s.key !== "review" && missing.some((m) => m.section === s.key);
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => void goToStep(index)}
                aria-current={active ? "step" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-line-strong bg-surface text-content-muted hover:bg-surface-hover"
                }`}
              >
                <span className="tabular-nums">{index + 1}.</span> {s.title}
                {sectionMissing && !active ? (
                  <span className="ml-1 text-warning" aria-label="required fields missing">
                    •
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-content">{step.title}</h2>
          {stepIndex < REVIEW_INDEX ? (
            <Badge tone="neutral">Autosaved as you type</Badge>
          ) : null}
        </CardHeader>
        <CardBody>
          {step.key === "basics" ? <EventBasicsStep {...stepProps} /> : null}
          {step.key === "goals" ? <GoalsStep {...lessonProps} /> : null}
          {step.key === "audience" ? <AudienceStep {...stepProps} /> : null}
          {step.key === "budget" ? <BudgetStep {...stepProps} /> : null}
          {step.key === "stakeholders" ? <StakeholdersStep {...stepProps} /> : null}
          {step.key === "constraints" ? <ConstraintsStep {...lessonProps} /> : null}
          {step.key === "review" ? (
            <ReviewStep
              brief={brief}
              missing={missing}
              issues={issues}
              generating={generating}
              onJump={jumpToSection}
              onGenerate={() => void generate()}
            />
          ) : null}
        </CardBody>
      </Card>

      <nav className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button onClick={() => void goToStep(stepIndex - 1)} disabled={stepIndex === 0}>
          ← Back
        </Button>
        <p className="text-xs text-content-muted">
          Everything is saved locally as you go — you can close this tab and resume later.
        </p>
        {stepIndex < REVIEW_INDEX ? (
          <Button variant="primary" onClick={() => void goToStep(stepIndex + 1)}>
            Next: {STEPS[stepIndex + 1].title} →
          </Button>
        ) : (
          <Button variant="primary" disabled={missing.length > 0 || generating} onClick={() => void generate()}>
            {generating ? "Generating…" : "Generate brief"}
          </Button>
        )}
      </nav>
    </div>
  );
}
