/** Bulk export + clipboard helpers for the Promo Campaign Kit (PRD 2). */

import {
  PROMO_ASSET_TYPE_LABELS,
  PROMO_ASSET_TYPE_ORDER,
  SOCIAL_CHANNEL_LABELS,
  type EventBrief,
  type PromoAsset,
  type PromoAssetSet,
} from "@event-toolkit/schema";
import { formatIsoDate, slugify } from "./format";

/** Assets grouped into the four kit sections, in render order. */
export function groupAssets(assets: PromoAsset[]): Array<{
  type: PromoAsset["type"];
  label: string;
  assets: PromoAsset[];
}> {
  return PROMO_ASSET_TYPE_ORDER.map((type) => ({
    type,
    label: PROMO_ASSET_TYPE_LABELS[type],
    assets: assets.filter((a) => a.type === type),
  })).filter((section) => section.assets.length > 0);
}

/** One Markdown document containing every asset, grouped and labelled by section. */
export function buildKitMarkdown(brief: EventBrief, set: PromoAssetSet): string {
  const lines: string[] = [
    `# Promo campaign kit — ${brief.name || "Untitled event"}`,
    "",
    `Generated ${formatIsoDate(set.generatedAt.slice(0, 10))} from brief version ${set.sourceBriefVersion}.`,
    "",
  ];

  for (const section of groupAssets(set.assets)) {
    lines.push(`---`, "", `## ${section.label}`, "");
    for (const asset of section.assets) {
      const meta: string[] = [];
      if (asset.suggestedSendDate) meta.push(`Suggested send: ${formatIsoDate(asset.suggestedSendDate)}`);
      if (asset.channel) meta.push(SOCIAL_CHANNEL_LABELS[asset.channel]);
      if (asset.isEdited) meta.push(`edited (${asset.editDistancePct}% changed)`);

      lines.push(`### ${asset.label}`, "");
      if (meta.length > 0) lines.push(`_${meta.join(" · ")}_`, "");
      lines.push(asset.currentBody, "");
    }
  }

  return lines.join("\n");
}

export function kitFilename(brief: EventBrief): string {
  return `${slugify(brief.name || "event")}-promo-kit.md`;
}

/**
 * Copy text to the clipboard, falling back to a hidden textarea where the async Clipboard
 * API is unavailable (older Firefox, and any non-secure context).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
