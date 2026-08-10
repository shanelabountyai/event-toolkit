"use client";

/**
 * FR-12 — load a logistics pack and autosave it, debounced. Same shape as PRD 1's
 * `useBriefDocument`, so persistence behaves identically across the suite.
 *
 * Views mutate the pack through `updatePack` and never hold their own copy of a session's
 * time; everything time-shaped is derived at render through the selectors.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LogisticsPack } from "@event-toolkit/logistics";
import type { EventBrief } from "@event-toolkit/schema";
import { getBrief, getPack, savePack } from "@event-toolkit/local-store";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 600;

export interface PackDocument {
  pack: LogisticsPack | null;
  /** The brief this pack hangs off — read-only context (name, dates, timezone, risks). */
  brief: EventBrief | null;
  updatePack: (updater: (prev: LogisticsPack) => LogisticsPack) => void;
  flush: () => Promise<LogisticsPack | null>;
  /** Re-read the brief after a write-back so risk/milestone status stays in sync. */
  reloadBrief: () => void;
  loading: boolean;
  notFound: boolean;
  saveState: SaveState;
  error: string | null;
}

export function useLogisticsPack(packId: string): PackDocument {
  const [pack, setPack] = useState<LogisticsPack | null>(null);
  const [brief, setBrief] = useState<EventBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [briefNonce, setBriefNonce] = useState(0);

  const savedRef = useRef<string>("");
  const packRef = useRef<LogisticsPack | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    getPack(packId)
      .then(async (loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setNotFound(true);
          setPack(null);
          packRef.current = null;
          return;
        }
        savedRef.current = JSON.stringify(loaded);
        packRef.current = loaded;
        setPack(loaded);
        const linked = await getBrief(loaded.eventBriefId);
        if (!cancelled) setBrief(linked);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [packId]);

  // Brief reload after a risk/milestone write-back (FR-14).
  useEffect(() => {
    if (briefNonce === 0 || !packRef.current) return;
    let cancelled = false;
    getBrief(packRef.current.eventBriefId).then((linked) => {
      if (!cancelled) setBrief(linked);
    });
    return () => {
      cancelled = true;
    };
  }, [briefNonce]);

  const persist = useCallback(async (doc: LogisticsPack): Promise<LogisticsPack | null> => {
    setSaveState("saving");
    try {
      const stored = await savePack(doc);
      savedRef.current = JSON.stringify(stored);
      packRef.current = stored;
      if (mountedRef.current) {
        setPack(stored);
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

  useEffect(() => {
    if (!pack) return;
    const payload = JSON.stringify(pack);
    if (payload === savedRef.current) return;
    setSaveState("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist(pack);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pack, persist]);

  const updatePack = useCallback((updater: (prev: LogisticsPack) => LogisticsPack) => {
    const current = packRef.current;
    if (!current) return;
    const next = updater(current);
    packRef.current = next;
    setPack(next);
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const current = packRef.current;
    if (!current) return null;
    if (JSON.stringify(current) === savedRef.current) return current;
    return persist(current);
  }, [persist]);

  // Best-effort save when the tab is hidden or closed mid-edit.
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

  return {
    pack,
    brief,
    updatePack,
    flush,
    reloadBrief: () => setBriefNonce((n) => n + 1),
    loading,
    notFound,
    saveState,
    error,
  };
}
