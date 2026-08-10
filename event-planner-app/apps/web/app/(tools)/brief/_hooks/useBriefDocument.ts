"use client";

/**
 * FR-6 — load a brief from IndexedDB and autosave it, debounced.
 *
 * Used by both the intake wizard and the brief view/edit page so persistence behaves
 * identically in both. All storage access goes through `@event-toolkit/local-store`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventBrief } from "@event-toolkit/schema";
import { getBrief, saveBrief } from "@event-toolkit/local-store";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 600;

export interface BriefDocument {
  brief: EventBrief | null;
  /** Update the working copy; autosave picks the change up. */
  updateBrief: (updater: (prev: EventBrief) => EventBrief) => void;
  /** Replace the working copy wholesale (e.g. after generation). */
  replaceBrief: (next: EventBrief) => void;
  /** Persist immediately, bypassing the debounce. Safe to await before navigating. */
  flush: () => Promise<EventBrief | null>;
  loading: boolean;
  notFound: boolean;
  saveState: SaveState;
  error: string | null;
}

export function useBriefDocument(briefId: string): BriefDocument {
  const [brief, setBrief] = useState<EventBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  /** Serialized form of the most recent persisted document — the autosave diff baseline. */
  const savedRef = useRef<string>("");
  /** Always-current working copy, so `flush()` never captures a stale closure. */
  const briefRef = useRef<EventBrief | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initial load ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    getBrief(briefId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setNotFound(true);
          setBrief(null);
          briefRef.current = null;
        } else {
          savedRef.current = JSON.stringify(loaded);
          briefRef.current = loaded;
          setBrief(loaded);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [briefId]);

  const persist = useCallback(async (doc: EventBrief): Promise<EventBrief | null> => {
    setSaveState("saving");
    try {
      const stored = await saveBrief(doc);
      savedRef.current = JSON.stringify(stored);
      briefRef.current = stored;
      if (mountedRef.current) {
        setBrief(stored);
        setSaveState("saved");
        setError(null);
      }
      return stored;
    } catch (err: unknown) {
      if (mountedRef.current) {
        setSaveState("error");
        setError(err instanceof Error ? err.message : String(err));
      }
      return null;
    }
  }, []);

  // Debounced autosave ------------------------------------------------------
  useEffect(() => {
    if (!brief) return;
    const payload = JSON.stringify(brief);
    if (payload === savedRef.current) return; // nothing changed since the last write
    setSaveState("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist(brief);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [brief, persist]);

  /**
   * Apply an update against the ref-held working copy (not React's queued state) so that a
   * `flush()` immediately afterwards always persists the change the caller just made.
   */
  const updateBrief = useCallback((updater: (prev: EventBrief) => EventBrief) => {
    const current = briefRef.current;
    if (!current) return;
    const next = updater(current);
    briefRef.current = next;
    setBrief(next);
  }, []);

  const replaceBrief = useCallback((next: EventBrief) => {
    briefRef.current = next;
    setBrief(next);
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const current = briefRef.current;
    if (!current) return null;
    if (JSON.stringify(current) === savedRef.current) return current;
    return persist(current);
  }, [persist]);

  // Best-effort flush when the tab is hidden or closed mid-edit.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onHide = () => {
      void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush]);

  return { brief, updateBrief, replaceBrief, flush, loading, notFound, saveState, error };
}
