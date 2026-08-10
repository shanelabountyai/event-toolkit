"use client";

/** Shown when the brief has moved on from the version this kit was generated against. */

import { Button } from "@event-toolkit/ui";
import type { PromoAssetSet } from "@event-toolkit/schema";
import { formatIsoDateTime } from "@/lib/format";

export function StaleBriefBanner({
  set,
  briefVersion,
  onRegenerate,
}: {
  set: PromoAssetSet;
  briefVersion: number;
  onRegenerate: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <div>
        <p className="text-sm font-medium text-amber-900">
          The brief has changed since this kit was generated.
        </p>
        <p className="text-xs text-amber-800">
          Generated from version {set.sourceBriefVersion}
          {set.regeneratedAt ? ` (last regenerated ${formatIsoDateTime(set.regeneratedAt)})` : ""} —
          the brief is now on version {briefVersion}. Your edited copy will be kept unless you say
          otherwise.
        </p>
      </div>
      <Button variant="primary" size="sm" onClick={onRegenerate}>
        Review and regenerate
      </Button>
    </div>
  );
}
