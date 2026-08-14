"use client";

/**
 * FR-13 — load a triage session and everything hanging off it, and persist every change.
 *
 * Writes go straight through rather than on a debounce: a merge or an assignment is a
 * discrete decision, not typing, and the one thing this tool cannot do is lose a planner's
 * dedupe work because they closed the tab a second early.
 */

import { useCallback, useEffect, useState } from "react";
import type { EventBrief } from "@event-toolkit/schema";
import {
  allLeadsRouted,
  dedupeLeads,
  defaultRubric,
  defaultTemplates,
  personaTitlesFromBrief,
  rescoreLeads,
  variantForBrief,
  type DuplicateCandidate,
  type FollowUpTemplate,
  type ImportBatch,
  type LeadRecord,
  type ScoringRubric,
  type TriageSession,
} from "@event-toolkit/lead-triage-core";
import {
  getBrief,
  getRubric,
  getSession,
  listDuplicateCandidates,
  listImportBatches,
  listLeads,
  listTemplates,
  logUsageEvent,
  replaceLeads,
  saveDuplicateCandidates,
  saveRubric,
  saveSession,
  saveTemplates,
} from "@event-toolkit/local-store";

export interface TriageState {
  session: TriageSession | null;
  /** Read-only. This tool never writes a brief. */
  brief: EventBrief | null;
  leads: LeadRecord[];
  rubric: ScoringRubric | null;
  templates: FollowUpTemplate[];
  candidates: DuplicateCandidate[];
  batches: ImportBatch[];
  personaTitles: string[];
  loading: boolean;
  notFound: boolean;
  busy: boolean;
  updateSession: (next: TriageSession) => Promise<void>;
  /** Persist a new lead pool, re-scoring it against the current rubric first. */
  updateLeads: (next: LeadRecord[]) => Promise<LeadRecord[]>;
  updateRubric: (next: ScoringRubric) => Promise<void>;
  updateTemplates: (next: FollowUpTemplate[]) => Promise<void>;
  updateCandidates: (next: DuplicateCandidate[]) => Promise<void>;
  /** Re-run dedupe over the pool — called after every import. */
  runDedupe: (pool: LeadRecord[]) => Promise<{ merged: number; queued: number }>;
  reloadBatches: () => Promise<void>;
}

export function useTriageSession(sessionId: string): TriageState {
  const [session, setSession] = useState<TriageSession | null>(null);
  const [brief, setBrief] = useState<EventBrief | null>(null);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [rubric, setRubric] = useState<ScoringRubric | null>(null);
  const [templates, setTemplates] = useState<FollowUpTemplate[]>([]);
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const personaTitles = personaTitlesFromBrief(brief);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const loaded = await getSession(sessionId);
      if (cancelled) return;
      if (!loaded) {
        setNotFound(true);
        return;
      }
      setSession(loaded);

      const linkedBrief = loaded.eventBriefId ? await getBrief(loaded.eventBriefId) : null;
      if (cancelled) return;
      setBrief(linkedBrief);

      const [loadedLeads, loadedCandidates, loadedBatches] = await Promise.all([
        listLeads(sessionId),
        listDuplicateCandidates(sessionId),
        listImportBatches(sessionId),
      ]);
      if (cancelled) return;
      setLeads(loadedLeads);
      setCandidates(loadedCandidates);
      setBatches(loadedBatches);

      // A session always has a rubric and templates — seed them on first open rather than
      // making the planner press a button before anything can be scored.
      let loadedRubric = await getRubric(sessionId);
      if (!loadedRubric) {
        loadedRubric = await saveRubric(
          defaultRubric(
            sessionId,
            personaTitlesFromBrief(linkedBrief),
            linkedBrief?.format?.deliveryMode,
          ),
        );
      }
      let loadedTemplates = await listTemplates(sessionId);
      if (loadedTemplates.length === 0) {
        loadedTemplates = await saveTemplates(
          defaultTemplates(sessionId, variantForBrief(linkedBrief)),
        );
      }
      if (cancelled) return;
      setRubric(loadedRubric);
      setTemplates(loadedTemplates);
    })()
      .catch(() => setNotFound(true))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const updateSession = useCallback(async (next: TriageSession) => {
    setSession(await saveSession(next));
  }, []);

  /**
   * Every pool write re-scores first, so the table can never show a stale score after a
   * rubric change, and flips the session to `routed` once nothing is unassigned (FR-9).
   */
  const updateLeads = useCallback(
    async (next: LeadRecord[]) => {
      setBusy(true);
      try {
        const scored = rubric ? rescoreLeads(next, rubric, personaTitles) : next;
        await replaceLeads(sessionId, scored);
        setLeads(scored);

        if (session) {
          const shouldBeRouted = allLeadsRouted(scored);
          const nextStatus = shouldBeRouted
            ? "routed"
            : session.status === "routed"
              ? "triaging"
              : session.status === "importing" && scored.length > 0
                ? "triaging"
                : session.status;
          if (nextStatus !== session.status) {
            const saved = await saveSession({ ...session, status: nextStatus });
            setSession(saved);
            if (nextStatus === "routed") {
              await logUsageEvent({
                type: "session_routed",
                details: { sessionId, leads: scored.length, eventName: session.eventName },
              });
            }
          }
        }
        return scored;
      } finally {
        setBusy(false);
      }
    },
    [rubric, personaTitles, sessionId, session],
  );

  const updateRubric = useCallback(
    async (next: ScoringRubric) => {
      const saved = await saveRubric(next);
      setRubric(saved);
      // FR-5: a rubric edit re-scores the pool immediately, no re-import.
      const scored = rescoreLeads(leads, saved, personaTitles);
      await replaceLeads(sessionId, scored);
      setLeads(scored);
      await logUsageEvent({ type: "rubric_edited", details: { sessionId } });
    },
    [leads, personaTitles, sessionId],
  );

  const updateTemplates = useCallback(async (next: FollowUpTemplate[]) => {
    setTemplates(await saveTemplates(next));
  }, []);

  const updateCandidates = useCallback(
    async (next: DuplicateCandidate[]) => {
      setCandidates(await saveDuplicateCandidates(sessionId, next));
    },
    [sessionId],
  );

  const runDedupe = useCallback(
    async (pool: LeadRecord[]) => {
      const result = dedupeLeads(pool, candidates);
      const scored = await updateLeads(result.leads);
      const keptDecisions = candidates.filter((c) => c.status !== "pending");
      await saveDuplicateCandidates(sessionId, [...keptDecisions, ...result.candidates]);
      setCandidates([...keptDecisions, ...result.candidates]);
      return { merged: result.autoMergedCount, queued: result.candidates.length, scored } as {
        merged: number;
        queued: number;
      };
    },
    [candidates, sessionId, updateLeads],
  );

  const reloadBatches = useCallback(async () => {
    setBatches(await listImportBatches(sessionId));
  }, [sessionId]);

  return {
    session,
    brief,
    leads,
    rubric,
    templates,
    candidates,
    batches,
    personaTitles,
    loading,
    notFound,
    busy,
    updateSession,
    updateLeads,
    updateRubric,
    updateTemplates,
    updateCandidates,
    runDedupe,
    reloadBatches,
  };
}
