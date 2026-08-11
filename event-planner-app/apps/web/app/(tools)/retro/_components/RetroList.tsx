"use client";

/** `/retro` — every event that has a retro, and every one that is overdue for one (FR-2). */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { EventBrief } from "@event-toolkit/schema";
import {
  previewCarryForward,
  retroPromptLevel,
  retroPromptMessage,
  type RetroDocument,
  type RetroPromptLevel,
} from "@event-toolkit/postmortem-core";
import { findOrCreateRetro, getBrief, listBriefs, listRetros, logUsageEvent } from "@event-toolkit/local-store";
import { Badge, Button, Card, CardBody, CardHeader, EmptyRow, Table, Td, Th } from "@event-toolkit/ui";
import { formatDateRange, formatIsoDateTime } from "@/lib/format";

interface Row {
  brief: EventBrief;
  retro: RetroDocument | null;
  prompt: RetroPromptLevel;
}

export function RetroList() {
  const router = useRouter();
  const briefIdParam = useSearchParams().get("briefId");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Entry from the brief view: find-or-create, then hand off to the retro itself.
    if (briefIdParam) {
      void (async () => {
        const brief = await getBrief(briefIdParam);
        if (!brief || cancelled) return;
        const retro = await findOrCreateRetro(brief);
        await logUsageEvent({
          type: "retro_created",
          briefId: brief.id,
          briefName: brief.name,
          details: { retroId: retro.id, seededLessons: retro.lessons.length },
        });
        if (!cancelled) router.replace(`/retro/${retro.id}`);
      })();
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const [briefs, retros] = await Promise.all([listBriefs(), listRetros()]);
      const built = briefs.map((brief) => {
        const retro = retros.find((r) => r.eventBriefId === brief.id) ?? null;
        return {
          brief,
          retro,
          prompt: retroPromptLevel(brief.dates?.eventEndDate, retro?.status === "completed"),
        };
      });
      if (!cancelled) setRows(built);
      for (const row of built.filter((r) => r.prompt !== "none")) {
        void logUsageEvent({
          type: "retro_prompt_shown",
          briefId: row.brief.id,
          details: { level: row.prompt },
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [briefIdParam, router]);

  const start = async (brief: EventBrief) => {
    setBusy(true);
    try {
      const retro = await findOrCreateRetro(brief);
      await logUsageEvent({
        type: "retro_created",
        briefId: brief.id,
        briefName: brief.name,
        details: { retroId: retro.id, seededLessons: retro.lessons.length },
      });
      router.push(`/retro/${retro.id}`);
    } finally {
      setBusy(false);
    }
  };

  if (briefIdParam || rows === null) {
    return <p className="py-16 text-center text-sm text-slate-500">Loading…</p>;
  }

  const overdue = rows.filter((r) => r.prompt !== "none");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Post-Mortem</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pulls what actually happened out of the issue log, the budget and the ROI report, and
          writes the lessons forward so the next event&rsquo;s intake starts with them.
        </p>
      </header>

      {overdue.map((row) => (
        <p
          key={row.brief.id}
          role="status"
          className={
            row.prompt === "escalated"
              ? "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
              : "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          }
        >
          <span>{retroPromptMessage(row.brief.name || "That event", row.prompt)}</span>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void start(row.brief)}>
            {row.retro ? "Open the retro" : "Start the retro"}
          </Button>
        </p>
      ))}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900">Events</h2>
        </CardHeader>
        <CardBody>
          <Table>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th className="w-28">Retro</Th>
                <Th className="w-32">Lessons</Th>
                <Th className="w-40">Completed</Th>
                <Th className="w-28" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={5}>No briefs in this browser yet.</EmptyRow>
              ) : (
                rows.map(({ brief, retro }) => {
                  const preview = retro ? previewCarryForward(retro) : null;
                  return (
                    <tr key={brief.id}>
                      <Td>
                        <span className="font-medium text-slate-900">{brief.name || "Untitled brief"}</span>
                        <span className="block text-xs text-slate-500">{formatDateRange(brief)}</span>
                      </Td>
                      <Td>
                        {retro ? (
                          <Badge tone={retro.status === "completed" ? "success" : "neutral"}>
                            {retro.status === "completed" ? "Completed" : "Draft"}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Not started</span>
                        )}
                      </Td>
                      <Td className="text-xs text-slate-600">
                        {preview
                          ? `${preview.total} carried · ${preview.repeat}R / ${preview.fix}F / ${preview.drop}D`
                          : "—"}
                      </Td>
                      <Td className="text-xs text-slate-600">
                        {retro?.completedAt ? formatIsoDateTime(retro.completedAt) : "—"}
                      </Td>
                      <Td className="text-right">
                        {retro ? (
                          <Link href={`/retro/${retro.id}`}>
                            <Button size="sm">Open</Button>
                          </Link>
                        ) : (
                          <Button size="sm" disabled={busy} onClick={() => void start(brief)}>
                            Start
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
