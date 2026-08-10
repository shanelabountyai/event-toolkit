"use client";

/** Collapsible wrapper for one kit section (Landing / Email / Social / Sales). */

import { useEffect, useState } from "react";
import type { PromoAsset } from "@event-toolkit/schema";
import { Badge } from "@event-toolkit/ui";
import { AssetCard } from "./AssetCard";

export function AssetSection({
  label,
  assets,
  highlightAssetId,
  onChange,
  onRevert,
}: {
  label: string;
  assets: PromoAsset[];
  highlightAssetId: string | null;
  onChange: (assetId: string, body: string) => void;
  onRevert: (assetId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const editedCount = assets.filter((a) => a.isEdited).length;
  const holdsHighlight = highlightAssetId !== null && assets.some((a) => a.id === highlightAssetId);

  // A deep link from the pacing tab must never land on a collapsed section.
  useEffect(() => {
    if (holdsHighlight) setOpen(true);
  }, [holdsHighlight]);

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{label}</span>
          <Badge>{assets.length}</Badge>
          {editedCount > 0 ? <Badge tone="info">{editedCount} edited</Badge> : null}
        </span>
        <span aria-hidden className="text-slate-400">{open ? "▾" : "▸"}</span>
      </button>

      {open ? (
        <div className="space-y-3 px-4 pb-4">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              highlighted={asset.id === highlightAssetId}
              onChange={onChange}
              onRevert={onRevert}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
