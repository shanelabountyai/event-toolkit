"use client";

/**
 * One promo asset: editable body, live edit-distance badge, copy and revert.
 *
 * Edits autosave on a debounce, same feel as the Brief View. The edit-distance badge is
 * driven by the stored asset, so it reflects what has actually been persisted.
 */

import { useEffect, useRef, useState } from "react";
import { SOCIAL_CHANNEL_LABELS, editDistancePct, type PromoAsset } from "@event-toolkit/schema";
import { Badge, Button } from "@event-toolkit/ui";
import { formatIsoDate } from "@/lib/format";
import { copyText } from "@/lib/promo-export";

const DEBOUNCE_MS = 600;

export function AssetCard({
  asset,
  highlighted,
  onChange,
  onRevert,
}: {
  asset: PromoAsset;
  highlighted: boolean;
  onChange: (assetId: string, body: string) => void;
  onRevert: (assetId: string) => void;
}) {
  const [draft, setDraft] = useState(asset.currentBody);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The last body this card pushed up, so an echo of our own save doesn't clobber typing. */
  const lastSentRef = useRef(asset.currentBody);

  // Adopt external changes (regenerate, revert) without interrupting in-flight typing.
  useEffect(() => {
    if (asset.currentBody !== lastSentRef.current) {
      lastSentRef.current = asset.currentBody;
      setDraft(asset.currentBody);
    }
  }, [asset.currentBody]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onEdit = (value: string) => {
    setDraft(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastSentRef.current = value;
      onChange(asset.id, value);
    }, DEBOUNCE_MS);
  };

  const onCopy = async () => {
    const ok = await copyText(draft);
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };

  // Live percentage while typing, so the badge doesn't lag a debounce behind the textarea.
  const livePct = draft === asset.currentBody ? asset.editDistancePct : editDistancePct(asset.generatedBody, draft);
  const isEdited = draft !== asset.generatedBody;

  return (
    <article
      id={`asset-${asset.id}`}
      className={
        highlighted
          ? "scroll-mt-24 rounded-lg border-2 border-accent bg-accent-subtle/40 p-4 shadow-sm"
          : "scroll-mt-24 rounded-lg border border-line bg-surface p-4 shadow-sm"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-content">{asset.label}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-content-muted">
            {asset.channel ? <span>{SOCIAL_CHANNEL_LABELS[asset.channel]}</span> : null}
            {asset.suggestedSendDate ? (
              <span>Suggested send: {formatIsoDate(asset.suggestedSendDate)}</span>
            ) : null}
            <span>{draft.length.toLocaleString()} characters</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isEdited ? (
            <Badge tone="info" title="How far this copy has drifted from the generated original">
              {livePct}% edited
            </Badge>
          ) : (
            <Badge tone="neutral">Unedited</Badge>
          )}
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(e) => onEdit(e.target.value)}
        rows={Math.min(20, Math.max(5, draft.split("\n").length + 1))}
        aria-label={`${asset.label} copy`}
        className="mt-3 block w-full resize-y rounded-md border-0 bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-content shadow-sm ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-inset focus:ring-focus"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void onCopy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
        {isEdited ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              lastSentRef.current = asset.generatedBody;
              setDraft(asset.generatedBody);
              onRevert(asset.id);
            }}
          >
            Revert to generated
          </Button>
        ) : null}
      </div>
    </article>
  );
}
