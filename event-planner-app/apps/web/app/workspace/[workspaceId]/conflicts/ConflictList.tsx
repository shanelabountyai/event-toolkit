"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import {
  dismissConflict,
  keepMine,
  keepTheirs,
  listConflicts,
  type StoredConflict,
} from "@event-toolkit/local-store";

const KIND_LABELS: Record<string, string> = {
  briefs: "Event brief",
  budgetLineItems: "Budget line item",
  leadRecords: "Attendee lead",
  roiReports: "ROI report",
  retros: "Post-mortem",
  promoAssetSets: "Promo kit",
  "logisticsPack.session": "Run-of-show session",
  "logisticsPack.checklist": "Checklist item",
  "logisticsPack.staff": "Staff assignment",
  "logisticsPack.contact": "On-site contact",
  "logisticsPack.shipping": "Shipping item",
};

export function ConflictList() {
  const [conflicts, setConflicts] = useState<StoredConflict[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listConflicts()
      .then(setConflicts)
      .catch(() => setConflicts([]));
  }, []);

  useEffect(load, [load]);

  async function act(id: string, action: (id: string) => Promise<void>) {
    setBusy(id);
    await action(id);
    load();
    setBusy(null);
  }

  if (conflicts === null) return <p className="text-sm text-slate-500">Checking…</p>;

  if (conflicts.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-slate-600">Nothing outstanding. Everything on this device has saved.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {conflicts.map((conflict) => (
        <Card key={conflict.id}>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">
              {KIND_LABELS[conflict.kind] ?? conflict.kind}
            </h2>
            <span className="text-xs text-slate-500">
              Theirs saved{" "}
              {new Date(conflict.theirUpdatedAt).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </CardHeader>
          <CardBody className="space-y-3">
            {conflict.resolution === "server_wins" ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700 ring-1 ring-inset ring-slate-200">
                This was deleted by somebody else while you were editing it. Keeping your version
                would bring it back — which may be wrong if it was deleted on purpose, including at
                an attendee&rsquo;s request.
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Side title="Yours" body={conflict.mine} tone="border-slate-300" />
              <Side title="Theirs (currently saved)" body={conflict.theirs} tone="border-emerald-300" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={busy === conflict.id}
                onClick={() => void act(conflict.id, keepMine)}
              >
                Keep mine
              </Button>
              <Button size="sm" disabled={busy === conflict.id} onClick={() => void act(conflict.id, keepTheirs)}>
                Keep theirs
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === conflict.id}
                onClick={() => void act(conflict.id, dismissConflict)}
              >
                Decide later
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Keeping yours replaces their version for everybody. Keeping theirs discards your
              change on this device.
            </p>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

/**
 * The raw document, formatted.
 *
 * Deliberately not a field-by-field diff: the documents here are seven different shapes, and a
 * generic diff that gets one of them subtly wrong is worse than showing the truth plainly.
 */
function Side({ title, body, tone }: { title: string; body: unknown; tone: string }) {
  return (
    <div className={`space-y-1 rounded-lg border ${tone} bg-white p-2.5`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-slate-700">
        {body === null ? "(deleted)" : JSON.stringify(body, null, 1)}
      </pre>
    </div>
  );
}
