"use client";

/**
 * Load the brief named by `?briefId=` for the promo tool.
 *
 * The Promo Campaign Kit is a pure reader of the brief — nothing here ever writes one back,
 * so this is a plain load rather than the autosaving `useBriefDocument` the Brief View uses.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EventBrief } from "@event-toolkit/schema";
import { getBrief } from "@event-toolkit/local-store";

export interface PromoBriefState {
  briefId: string | null;
  brief: EventBrief | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
  /** Re-read the brief — used after returning from an edit in another tab. */
  reload: () => void;
}

export function usePromoBrief(): PromoBriefState {
  const params = useSearchParams();
  const briefId = params.get("briefId");
  const [brief, setBrief] = useState<EventBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!briefId) {
      setLoading(false);
      setBrief(null);
      setNotFound(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    getBrief(briefId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) setNotFound(true);
        setBrief(loaded);
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
  }, [briefId, nonce]);

  return { briefId, brief, loading, notFound, error, reload };
}
