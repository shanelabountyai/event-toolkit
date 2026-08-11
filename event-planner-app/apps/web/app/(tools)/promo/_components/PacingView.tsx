"use client";

/**
 * The Pacing tab: reported registrations against the target curve derived from the brief's
 * registration goal, plus the tactics to run when it's behind.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CURVE_STYLE_LABELS,
  assessPacing,
  buildPacingSeries,
  buildPacingWindow,
  findRegistrationMetric,
  recommendedInterventions,
  todayIsoDate,
  type PacingConfig,
  type PacingCurveStyle,
  type PacingEntry,
  type PromoAssetSet,
} from "@event-toolkit/schema";
import {
  addEntry,
  deleteEntry,
  getAssetSet,
  getConfig,
  importCsv,
  listEntries,
  saveConfig,
} from "@event-toolkit/local-store";
import { Card, CardBody, CardHeader, Field, Select } from "@event-toolkit/ui";
import { usePromoBrief } from "../_hooks/usePromoBrief";
import { PacingCurveChart } from "./PacingCurveChart";
import { PacingEntryForm } from "./PacingEntryForm";
import { PacingSummary } from "./PacingStatusBadge";
import { PromoBriefMissing, PromoTabs } from "./PromoTabs";
import { RecommendedInterventions } from "./RecommendedInterventions";

export function PacingView() {
  const { briefId, brief, loading, notFound } = usePromoBrief();
  const [entries, setEntries] = useState<PacingEntry[]>([]);
  const [config, setConfig] = useState<PacingConfig | null>(null);
  const [set, setSet] = useState<PromoAssetSet | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!briefId) {
      setLoadingData(false);
      return;
    }
    let cancelled = false;
    setLoadingData(true);
    Promise.all([listEntries(briefId), getConfig(briefId), getAssetSet(briefId)])
      .then(([rows, cfg, assetSet]) => {
        if (cancelled) return;
        setEntries(rows);
        setConfig(cfg);
        setSet(assetSet);
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [briefId]);

  const onAdd = useCallback(
    async (date: string, count: number) => {
      if (!briefId) return;
      await addEntry({ eventBriefId: briefId, date, cumulativeRegistrations: count });
      setEntries(await listEntries(briefId));
    },
    [briefId],
  );

  const onImport = useCallback(
    async (csvText: string) => {
      if (!briefId) return { importedCount: 0, errors: [] };
      const result = await importCsv(briefId, csvText);
      setEntries(await listEntries(briefId));
      return { importedCount: result.imported.length, errors: result.errors };
    },
    [briefId],
  );

  const onDelete = useCallback(
    async (id: string) => {
      if (!briefId) return;
      await deleteEntry(id);
      setEntries(await listEntries(briefId));
    },
    [briefId],
  );

  const onCurveStyle = useCallback(
    async (curveStyle: PacingCurveStyle) => {
      if (!briefId || !config) return;
      const next = { ...config, curveStyle };
      setConfig(next);
      await saveConfig(next);
    },
    [briefId, config],
  );

  const metric = brief ? findRegistrationMetric(brief) : null;

  /**
   * Campaign start: the planner's override wins, then the date the kit was generated, then
   * the first reported data point, then today. Never later than the event itself.
   */
  const campaignStartDate = useMemo(() => {
    if (!brief) return todayIsoDate();
    const candidate =
      config?.campaignStartDateOverride ??
      set?.campaignStartDate ??
      entries[0]?.date ??
      todayIsoDate();
    const eventStart = brief.dates.eventStartDate;
    return eventStart && candidate > eventStart ? eventStart : candidate;
  }, [brief, config, set, entries]);

  if (loading || loadingData) {
    return <p className="py-16 text-center text-sm text-content-muted">Loading…</p>;
  }
  if (!briefId || notFound || !brief) {
    return <PromoBriefMissing notFound={notFound} />;
  }

  // Blocked state — the target curve is meaningless without a registration goal to scale it.
  if (!metric) {
    return (
      <div className="space-y-6">
        <PromoTabs brief={brief} active="pacing" />
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-content">
              This brief has no registration goal yet
            </h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-content-muted">
              Pacing compares real registrations against a target curve, so it needs a success
              metric whose name mentions “registration” with a target above zero — for example
              <em> Registrations, target 500</em>.
            </p>
            <Link
              href={`/brief/${brief.id}`}
              className="mt-3 inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
            >
              Add a registration metric to the brief
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  const style = config?.curveStyle ?? "backloaded_standard";
  const window = buildPacingWindow(campaignStartDate, brief.dates.eventStartDate);
  const assessment = assessPacing(entries, window, style, metric.target, todayIsoDate());
  const points = buildPacingSeries(entries, window, style, metric.target);
  const interventions = recommendedInterventions(assessment);

  return (
    <div className="space-y-6">
      <PromoTabs brief={brief} active="pacing" />

      <PacingSummary assessment={assessment} registrationTarget={metric.target} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Target curve" htmlFor="curve-style" className="w-64" hint="How registrations are expected to arrive across the campaign.">
          <Select
            id="curve-style"
            value={style}
            onChange={(e) => void onCurveStyle(e.target.value as PacingCurveStyle)}
          >
            {(Object.keys(CURVE_STYLE_LABELS) as PacingCurveStyle[]).map((key) => (
              <option key={key} value={key}>
                {CURVE_STYLE_LABELS[key]}
              </option>
            ))}
          </Select>
        </Field>
        <p className="mb-1 text-xs text-content-muted">
          Campaign window: {window.totalDays} day{window.totalDays === 1 ? "" : "s"} · goal{" "}
          {metric.target.toLocaleString()} {metric.unit && metric.unit !== "count" ? metric.unit : "registrations"}
        </p>
      </div>

      <PacingCurveChart
        points={points}
        entries={entries}
        window={window}
        style={style}
        registrationTarget={metric.target}
        onDeleteEntry={(id) => void onDelete(id)}
      />

      <RecommendedInterventions
        interventions={interventions}
        assets={set?.assets ?? []}
        briefId={brief.id}
      />

      <PacingEntryForm onAdd={onAdd} onImport={onImport} />
    </div>
  );
}
