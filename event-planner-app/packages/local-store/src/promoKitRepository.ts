/**
 * Promo asset set repository (PRD 2).
 *
 * One `PromoAssetSet` per brief, keyed by `eventBriefId`. Generation itself is pure and
 * lives in `@event-toolkit/schema`; this module is the persistence seam plus the regenerate
 * merge logic, which is the one genuinely fiddly piece of the tool.
 */

import {
  generatePromoAssets,
  newId,
  nowIso,
  todayIsoDate,
  withRecomputedEdit,
  type EventBrief,
  type PromoAsset,
  type PromoAssetSet,
} from "@event-toolkit/schema";
import { getDb, STORE_PROMO_ASSET_SETS } from "./db";

/**
 * Identity of an asset across regenerations.
 *
 * Asset `id`s are freshly minted on every generation, so the merge matches on what the asset
 * *is* (type + subtype + channel) rather than on id — that's what lets an edited "Reminder 1"
 * survive a regenerate and keep its stable id for deep links from the pacing tab.
 */
function assetKey(asset: PromoAsset): string {
  return `${asset.type}|${asset.subtype ?? ""}|${asset.channel ?? ""}`;
}

/**
 * Build a fresh asset set for a brief. Pure: no IO, no clock beyond the injectable `today`.
 * Call `saveAssetSet` to persist the result.
 */
export function generateAssetSet(
  brief: EventBrief,
  today: string = todayIsoDate(),
): PromoAssetSet {
  return {
    id: newId(),
    eventBriefId: brief.id,
    sourceBriefVersion: brief.version,
    generatedAt: nowIso(),
    // Stored once, at first generation — the pacing curve is anchored to when the planner
    // actually started promoting, not to when the brief happened to be created.
    campaignStartDate: today,
    assets: generatePromoAssets(brief, "neutral_professional", today),
  };
}

export async function getAssetSet(briefId: string): Promise<PromoAssetSet | null> {
  const db = await getDb();
  const set = await db.get(STORE_PROMO_ASSET_SETS, briefId);
  if (!set) return null;
  // Recompute edit state on read: `isEdited` is always a live body comparison, never a flag
  // that could have been left stale by an older write.
  return { ...set, assets: set.assets.map((a) => withRecomputedEdit(a)) };
}

export async function saveAssetSet(set: PromoAssetSet): Promise<PromoAssetSet> {
  const next: PromoAssetSet = {
    ...set,
    assets: set.assets.map((a) => withRecomputedEdit(a)),
  };
  const db = await getDb();
  await db.put(STORE_PROMO_ASSET_SETS, next);
  return next;
}

export async function deleteAssetSet(briefId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_PROMO_ASSET_SETS, briefId);
}

/** Edit one asset's body and persist, recomputing its edit distance. */
export async function updateAssetBody(
  briefId: string,
  assetId: string,
  body: string,
): Promise<PromoAssetSet | null> {
  const set = await getAssetSet(briefId);
  if (!set) return null;
  const assets = set.assets.map((a) =>
    a.id === assetId ? withRecomputedEdit({ ...a, currentBody: body }, nowIso()) : a,
  );
  return saveAssetSet({ ...set, assets });
}

/** Restore one asset to its generated text, discarding the planner's edits. */
export async function revertAsset(
  briefId: string,
  assetId: string,
): Promise<PromoAssetSet | null> {
  const set = await getAssetSet(briefId);
  if (!set) return null;
  const assets = set.assets.map((a) =>
    a.id === assetId ? withRecomputedEdit({ ...a, currentBody: a.generatedBody }) : a,
  );
  return saveAssetSet({ ...set, assets });
}

export type RegenerateOutcome = "update" | "skip_edited" | "add" | "override";

export interface RegeneratePlanRow {
  /** Existing asset id where there is one, otherwise the incoming asset's id. */
  assetId: string;
  label: string;
  outcome: RegenerateOutcome;
  /** True when the newly generated copy differs from what is currently stored. */
  bodyChanged: boolean;
  editDistancePct: number;
}

/**
 * What a regenerate would do, asset by asset — the diff the confirm dialog shows.
 *
 * `overrides` holds ids of edited assets the planner has explicitly chosen to regenerate
 * anyway (discarding their edits).
 */
export function planRegeneration(
  brief: EventBrief,
  existing: PromoAssetSet,
  overrides: string[] = [],
  today: string = todayIsoDate(),
): RegeneratePlanRow[] {
  const overrideSet = new Set(overrides);
  const fresh = generatePromoAssets(brief, "neutral_professional", today);
  const byKey = new Map(existing.assets.map((a) => [assetKey(a), a]));

  return fresh.map((next) => {
    const prev = byKey.get(assetKey(next));
    if (!prev) {
      return {
        assetId: next.id,
        label: next.label,
        outcome: "add" as const,
        bodyChanged: true,
        editDistancePct: 0,
      };
    }
    const live = withRecomputedEdit(prev);
    const bodyChanged = next.generatedBody !== live.generatedBody;
    const outcome: RegenerateOutcome = !live.isEdited
      ? "update"
      : overrideSet.has(live.id)
        ? "override"
        : "skip_edited";
    return {
      assetId: live.id,
      label: live.label,
      outcome,
      bodyChanged,
      editDistancePct: live.editDistancePct,
    };
  });
}

/**
 * Regenerate against the current brief.
 *
 * Unedited assets take the new copy. Edited assets are left completely untouched unless the
 * planner listed them in `overrides`, in which case their edits are discarded and they take
 * the new copy too. Ids of surviving assets are preserved either way so deep links hold.
 */
export function regenerateAssetSet(
  brief: EventBrief,
  existing: PromoAssetSet,
  overrides: string[] = [],
  today: string = todayIsoDate(),
): PromoAssetSet {
  const overrideSet = new Set(overrides);
  const fresh = generatePromoAssets(brief, "neutral_professional", today);
  const byKey = new Map(existing.assets.map((a) => [assetKey(a), a]));

  const assets = fresh.map((next) => {
    const prev = byKey.get(assetKey(next));
    if (!prev) return next; // genuinely new asset — nothing to preserve

    const live = withRecomputedEdit(prev);
    if (live.isEdited && !overrideSet.has(live.id)) {
      return live; // skipped: the planner's copy wins
    }
    // Take the new copy, keeping the stable id so links into this card still resolve.
    return withRecomputedEdit({
      ...next,
      id: live.id,
      generatedBody: next.generatedBody,
      currentBody: next.generatedBody,
      lastEditedAt: undefined,
    });
  });

  return {
    ...existing,
    sourceBriefVersion: brief.version,
    regeneratedAt: nowIso(),
    assets,
  };
}
