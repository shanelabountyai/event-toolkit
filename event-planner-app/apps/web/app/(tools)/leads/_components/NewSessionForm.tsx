"use client";

/** FR-1 — new session, linked to an existing brief or standalone. */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EVENT_TYPE_LABELS, type EventBrief } from "@event-toolkit/schema";
import { sessionFromBrief, standaloneSession } from "@event-toolkit/lead-triage-core";
import { listBriefs, logUsageEvent, saveSession } from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader, DateTimeInput, Field, Select, TextInput } from "@event-toolkit/ui";
import { formatDateRange } from "@/lib/format";

export function NewSessionForm() {
  const router = useRouter();
  const presetBriefId = useSearchParams().get("briefId");
  const [briefs, setBriefs] = useState<EventBrief[] | null>(null);
  const [mode, setMode] = useState<"brief" | "standalone">("brief");
  const [briefId, setBriefId] = useState(presetBriefId ?? "");
  const [eventName, setEventName] = useState("");
  const [closedAt, setClosedAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listBriefs().then((rows) => {
      setBriefs(rows);
      if (rows.length === 0) setMode("standalone");
      else if (!presetBriefId) setBriefId(rows[0].id);
    });
  }, [presetBriefId]);

  const selected = briefs?.find((b) => b.id === briefId) ?? null;

  const create = async () => {
    setError(null);
    setBusy(true);
    try {
      let session;
      if (mode === "brief") {
        if (!selected) {
          setError("Choose a brief, or switch to a standalone session.");
          return;
        }
        session = sessionFromBrief(selected);
      } else {
        if (!eventName.trim()) {
          setError("Give the event a name.");
          return;
        }
        if (!closedAt) {
          setError("Set when the event closed — it anchors the follow-up clock.");
          return;
        }
        session = standaloneSession(eventName, closedAt);
      }
      const saved = await saveSession(session);
      await logUsageEvent({
        type: "triage_session_created",
        briefId: saved.eventBriefId ?? undefined,
        briefName: saved.eventName,
        details: { sessionId: saved.id, linked: saved.eventBriefId ? "yes" : "no" },
      });
      router.replace(`/leads/${saved.id}/import`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">New triage session</h1>
        <p className="mt-1 text-sm text-slate-600">
          One session per event. Every file you import lands in its shared lead pool.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("brief")}
              aria-pressed={mode === "brief"}
              disabled={(briefs?.length ?? 0) === 0}
              className={
                mode === "brief"
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 disabled:text-slate-400"
              }
            >
              From an event brief
            </button>
            <button
              type="button"
              onClick={() => setMode("standalone")}
              aria-pressed={mode === "standalone"}
              className={
                mode === "standalone"
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300"
              }
            >
              Standalone
            </button>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {mode === "brief" ? (
            briefs === null ? (
              <p className="text-sm text-slate-500">Loading briefs…</p>
            ) : briefs.length === 0 ? (
              <p className="text-sm text-slate-600">
                No briefs in this browser — create a standalone session instead.
              </p>
            ) : (
              <>
                <Field label="Event brief" htmlFor="brief-select" required>
                  <Select id="brief-select" value={briefId} onChange={(e) => setBriefId(e.target.value)}>
                    {briefs.map((brief) => (
                      <option key={brief.id} value={brief.id}>
                        {brief.name || "Untitled brief"}
                      </option>
                    ))}
                  </Select>
                </Field>

                {selected ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge>{EVENT_TYPE_LABELS[selected.type]}</Badge>
                      <span>{formatDateRange(selected)}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Objective: {selected.goals?.primaryObjective || "—"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Target personas:{" "}
                      {(selected.audience?.targetPersonas ?? []).map((p) => p.name).join(", ") ||
                        "none recorded"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Read-only. This tool never writes back to a brief.
                    </p>
                  </div>
                ) : null}
              </>
            )
          ) : (
            <>
              <Field label="Event name" htmlFor="event-name" required>
                <TextInput
                  id="event-name"
                  value={eventName}
                  placeholder="Q4 Customer Summit"
                  onChange={(e) => setEventName(e.target.value)}
                />
              </Field>
              <Field
                label="Event closed at"
                htmlFor="closed-at"
                required
                hint="Starts the clock the 24-48 hour follow-up target is measured against."
              >
                <DateTimeInput id="closed-at" value={closedAt} onChange={(e) => setClosedAt(e.target.value)} />
              </Field>
            </>
          )}

          <Button variant="primary" disabled={busy} onClick={() => void create()}>
            Create session
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
