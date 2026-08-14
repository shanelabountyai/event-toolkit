"use client";

import { useRouter } from "next/navigation";

/**
 * The Kit tab: generate, read, edit and regenerate the promo assets for one brief.
 *
 * All persistence goes through `@event-toolkit/local-store`; this component owns only the
 * in-memory copy of the current asset set and the transient UI state around it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  aggregateEditPct,
  isAssetSetStale,
  type PromoAssetSet,
} from "@event-toolkit/schema";
import {
  generateAssetSet,
  getAssetSet,
  logUsageEvent,
  planRegeneration,
  regenerateAssetSet,
  revertAsset,
  saveAssetSet,
  updateAssetBody,
  type RegeneratePlanRow,
} from "@event-toolkit/local-store";
import { Badge, Button } from "@event-toolkit/ui";
import { triggerDownload } from "@/lib/download";
import { buildKitMarkdown, copyText, groupAssets, kitFilename } from "@/lib/promo-export";
import { usePromoBrief } from "../_hooks/usePromoBrief";
import { AssetSection } from "./AssetSection";
import { PromoBriefMissing, PromoTabs } from "./PromoTabs";
import { PromoKitHome } from "./PromoKitHome";
import { RegenerateDialog } from "./RegenerateDialog";
import { StaleBriefBanner } from "./StaleBriefBanner";

export function PromoKitView() {
  const router = useRouter();
  const { briefId, brief, loading, notFound } = usePromoBrief();

  /**
   * Arriving with no brief chosen sends the planner to the picker rather than a dead end.
   *
   * In an effect, not in render: `router.replace()` during render updates the Router while this
   * component is rendering, which React refuses. A brief that no longer *exists* is left alone
   * here — that still shows the message, because silently redirecting would hide the deletion.
   */
  useEffect(() => {
    if (!loading && !briefId) router.replace("/promo");
  }, [loading, briefId, router]);
  const [set, setSet] = useState<PromoAssetSet | null>(null);
  const [loadingSet, setLoadingSet] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState<RegeneratePlanRow[] | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [highlightAssetId, setHighlightAssetId] = useState<string | null>(null);

  // Load any existing kit for this brief.
  useEffect(() => {
    if (!briefId) {
      setLoadingSet(false);
      return;
    }
    let cancelled = false;
    setLoadingSet(true);
    getAssetSet(briefId)
      .then((existing) => {
        if (!cancelled) setSet(existing);
      })
      .finally(() => {
        if (!cancelled) setLoadingSet(false);
      });
    return () => {
      cancelled = true;
    };
  }, [briefId]);

  // Deep links from the pacing tab arrive as #asset-<id>.
  useEffect(() => {
    if (!set || typeof window === "undefined") return;
    const fromHash = window.location.hash.replace(/^#asset-/, "");
    if (!fromHash || !set.assets.some((a) => a.id === fromHash)) return;
    setHighlightAssetId(fromHash);
    // Let the section expand before scrolling to the card.
    const timer = setTimeout(() => {
      document.getElementById(`asset-${fromHash}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(timer);
  }, [set]);

  const onGenerate = useCallback(async () => {
    if (!brief) return;
    setGenerating(true);
    try {
      const created = await saveAssetSet(generateAssetSet(brief));
      setSet(created);
      await logUsageEvent({
        type: "tool_opened_direct",
        briefId: brief.id,
        briefName: brief.name || "Untitled brief",
        details: { tool: "promo", action: "kit_generated", assetCount: created.assets.length },
      });
    } finally {
      setGenerating(false);
    }
  }, [brief]);

  const onChangeAsset = useCallback(
    async (assetId: string, body: string) => {
      if (!briefId) return;
      const next = await updateAssetBody(briefId, assetId, body);
      if (next) setSet(next);
    },
    [briefId],
  );

  const onRevertAsset = useCallback(
    async (assetId: string) => {
      if (!briefId) return;
      const next = await revertAsset(briefId, assetId);
      if (next) setSet(next);
    },
    [briefId],
  );

  const onConfirmRegenerate = useCallback(
    async (overrides: string[]) => {
      if (!brief || !set) return;
      const next = await saveAssetSet(regenerateAssetSet(brief, set, overrides));
      setSet(next);
      setPlan(null);
    },
    [brief, set],
  );

  const onCopyAll = useCallback(async () => {
    if (!brief || !set) return;
    const ok = await copyText(buildKitMarkdown(brief, set));
    setCopiedAll(ok);
    setTimeout(() => setCopiedAll(false), 2000);
  }, [brief, set]);

  const onDownloadAll = useCallback(async () => {
    if (!brief || !set) return;
    triggerDownload(kitFilename(brief), buildKitMarkdown(brief, set), "text/markdown");
    await logUsageEvent({
      type: "export_triggered",
      briefId: brief.id,
      briefName: brief.name || "Untitled brief",
      details: { tool: "promo", format: "markdown", assetCount: set.assets.length },
    });
  }, [brief, set]);

  const sections = useMemo(() => (set ? groupAssets(set.assets) : []), [set]);

  if (loading || loadingSet) {
    return <p className="py-16 text-center text-sm text-content-muted">Loading…</p>;
  }
  if (!briefId || notFound || !brief) {
    return <PromoBriefMissing notFound={notFound} />;
  }

  const stale = set ? isAssetSetStale(set, brief) : false;
  const editedCount = set ? set.assets.filter((a) => a.isEdited).length : 0;

  return (
    <div className="space-y-6">
      <PromoTabs brief={brief} active="kit" />

      {!set ? (
        <PromoKitHome brief={brief} generating={generating} onGenerate={() => void onGenerate()} />
      ) : (
        <>
          {stale ? (
            <StaleBriefBanner
              set={set}
              briefVersion={brief.version}
              onRegenerate={() => setPlan(planRegeneration(brief, set))}
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-sm">
            <p className="flex flex-wrap items-center gap-2 text-sm text-content-muted">
              <Badge>{set.assets.length} assets</Badge>
              {editedCount > 0 ? (
                <Badge tone="info">
                  {editedCount} edited · {aggregateEditPct(set.assets)}% average change
                </Badge>
              ) : (
                <Badge tone="neutral">No edits yet</Badge>
              )}
            </p>
            <span className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void onCopyAll()}>
                {copiedAll ? "Copied" : "Copy all"}
              </Button>
              <Button size="sm" onClick={() => void onDownloadAll()}>
                Download Markdown
              </Button>
              {!stale ? (
                <Button size="sm" onClick={() => setPlan(planRegeneration(brief, set))}>
                  Regenerate
                </Button>
              ) : null}
            </span>
          </div>

          <div className="space-y-4">
            {sections.map((section) => (
              <AssetSection
                key={section.type}
                label={section.label}
                assets={section.assets}
                highlightAssetId={highlightAssetId}
                onChange={(id, body) => void onChangeAsset(id, body)}
                onRevert={(id) => void onRevertAsset(id)}
              />
            ))}
          </div>
        </>
      )}

      {plan ? (
        <RegenerateDialog
          plan={plan}
          onCancel={() => setPlan(null)}
          onConfirm={(overrides) => void onConfirmRegenerate(overrides)}
        />
      ) : null}
    </div>
  );
}
