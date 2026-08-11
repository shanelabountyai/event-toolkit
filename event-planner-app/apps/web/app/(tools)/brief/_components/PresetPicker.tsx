"use client";

/**
 * FR-1 — preset chooser (flow step 1).
 * Selecting a card creates the brief with that preset's defaults, logs `brief_created`
 * (FR-13) and routes into the guided intake wizard.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PRESET_LIST,
  createEmptyBrief,
  nowIso,
  type EventPreset,
  type EventType,
} from "@event-toolkit/schema";
import { logUsageEvent, saveBriefRaw, saveIntakeProgress } from "@event-toolkit/local-store";
import { Button, Card, CardBody } from "@event-toolkit/ui";

export function PresetPicker() {
  const router = useRouter();
  const [creating, setCreating] = useState<EventType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (preset: EventPreset) => {
    if (creating) return;
    setCreating(preset.type);
    try {
      const brief = createEmptyBrief(preset.type, {
        withoutPresetContent: preset.type === "custom",
      });
      // saveBriefRaw: keep the freshly-minted version at 1 rather than bumping to 2.
      await saveBriefRaw(brief);
      await saveIntakeProgress({
        briefId: brief.id,
        stepIndex: 0,
        dismissedLessonIds: [],
        generated: false,
        updatedAt: nowIso(),
      });
      await logUsageEvent({
        type: "brief_created",
        briefId: brief.id,
        briefName: brief.name || "Untitled brief",
        details: { eventType: brief.type },
      });
      router.push(`/brief/${brief.id}/intake`);
    } catch (err: unknown) {
      setCreating(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/brief" className="text-sm text-content-muted hover:underline">
          ← All briefs
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-content">
          Start a new event brief
        </h1>
        <p className="max-w-2xl text-sm text-content-muted">
          Pick the event type. Presets pre-fill success metrics, a risk register, a milestone
          timeline, budget categories and a suggested RACI roster — all of it editable or
          removable later.
        </p>
      </header>

      {error ? (
        <div className="rounded-md border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {PRESET_LIST.map((preset) => (
          <Card key={preset.type} className="flex flex-col">
            <CardBody className="flex flex-1 flex-col gap-3">
              <div>
                <h2 className="text-base font-semibold text-content">{preset.label}</h2>
                <p className="mt-1 text-sm text-content-muted">{preset.tagline}</p>
              </div>
              <ul className="flex-1 space-y-1 text-xs text-content-muted">
                <li>
                  {preset.successMetrics.length > 0
                    ? `${preset.successMetrics.length} default success metrics`
                    : "No default success metrics"}
                </li>
                <li>
                  {preset.risks.length > 0
                    ? `${preset.risks.length} default risk register entries`
                    : "No default risks"}
                </li>
                <li>
                  {preset.milestones.length > 0
                    ? `${preset.milestones.length} timeline milestones, dated from your event dates`
                    : "No default milestones"}
                </li>
                <li>
                  {preset.budgetCategories.length > 0
                    ? `Budget categories: ${preset.budgetCategories.slice(0, 3).join(", ")}${
                        preset.budgetCategories.length > 3 ? "…" : ""
                      }`
                    : "No default budget categories"}
                </li>
              </ul>
              <div>
                <Button
                  variant="primary"
                  onClick={() => void choose(preset)}
                  disabled={creating !== null}
                >
                  {creating === preset.type ? "Creating…" : `Start ${preset.label} brief`}
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
