"use client";

/**
 * The Budget Builder's main screen: template auto-generation on first open, the line-item
 * table, the reforecast banner/flow, import, export, settings and the reconciled toggle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BUDGET_CATEGORY_LABELS,
  nowIso,
  type BudgetLineItem,
  type BudgetLineItemCategory,
  type BudgetSettings,
  type EventBrief,
  type LineItemSource,
} from "@event-toolkit/schema";
import {
  applyImportPlan,
  buildExportWorkbook,
  computeBudgetActualsSummary,
  computeVariance,
  detectReforecastTriggers,
  newLineItem,
  newReforecastEvent,
  roundMoney,
  snapshotScope,
  totalBudgeted,
  type ImportCandidate,
  type ReforecastTrigger,
} from "@event-toolkit/budget-calc";
import {
  deleteLineItem,
  findOrCreateBudget,
  getBrief,
  logUsageEvent,
  saveBudgetSettings,
  saveLineItems,
  syncActualsToBrief,
} from "@event-toolkit/local-store";
import { Badge, Button } from "@event-toolkit/ui";
import { formatMoney, slugify } from "@/lib/format";
import { downloadCsv, downloadWorkbook } from "@/lib/budget-file";
import { BudgetTable } from "./BudgetTable";
import { ImportWizard } from "./ImportWizard";
import { ReforecastBanner, ReforecastFlow } from "./ReforecastFlow";
import { BudgetSettingsPanel } from "./BudgetSettingsPanel";

const DEBOUNCE_MS = 600;

export function BudgetView({ briefId }: { briefId: string }) {
  const [brief, setBrief] = useState<EventBrief | null>(null);
  const [lineItems, setLineItems] = useState<BudgetLineItem[]>([]);
  const [settings, setSettings] = useState<BudgetSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [generatedNote, setGeneratedNote] = useState<string | null>(null);
  const [triggers, setTriggers] = useState<ReforecastTrigger[]>([]);
  const [showReforecast, setShowReforecast] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const itemsRef = useRef<BudgetLineItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Line items that have already fired their first variance flag (FR-12, logged once each). */
  const flaggedRef = useRef<Set<string>>(new Set());

  /* ---- load + first-open generation ---------------------------------- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const loadedBrief = await getBrief(briefId);
      if (cancelled) return;
      if (!loadedBrief) {
        setNotFound(true);
        return;
      }
      setBrief(loadedBrief);

      const boot = await findOrCreateBudget(loadedBrief);
      if (cancelled) return;
      setLineItems(boot.lineItems);
      itemsRef.current = boot.lineItems;
      setSettings(boot.settings);

      // Seed the "already flagged" set so existing over-budget rows don't all log on load.
      flaggedRef.current = new Set(
        boot.lineItems
          .filter((item) => computeVariance(item, boot.settings).flag !== "none")
          .map((item) => item.id),
      );

      if (boot.generated) {
        setGeneratedNote(
          boot.unmatched.length > 0
            ? `Budget template created. ${boot.unmatched.length} budget line${boot.unmatched.length === 1 ? "" : "s"} from the brief (${boot.unmatched.join(", ")}) didn't match a standard category and were filed under Other.`
            : "Budget template created from this event's type and the brief's own budget lines.",
        );
        await logUsageEvent({
          type: "budget_generated",
          briefId: loadedBrief.id,
          briefName: loadedBrief.name || "Untitled brief",
          details: { lineItems: boot.lineItems.length, eventType: loadedBrief.type },
        });
      }

      // FR-7 — always diff the scope, never trust the version number alone.
      const found = detectReforecastTriggers(loadedBrief, boot.settings.lastSeenScopeSnapshot);
      if (found.length > 0) {
        setTriggers(found);
        await logUsageEvent({
          type: "reforecast_triggered",
          briefId: loadedBrief.id,
          briefName: loadedBrief.name || "Untitled brief",
          details: { reasons: found.map((t) => t.label).join(", ") },
        });
      }
    })()
      .catch(() => setNotFound(true))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [briefId]);

  /* ---- debounced persistence ------------------------------------------ */
  const persist = useCallback(
    async (next: BudgetLineItem[]) => {
      if (!brief || !settings) return;
      setSaveState("saving");
      const saved = await saveLineItems(next);
      itemsRef.current = saved;
      setLineItems(saved);

      // FR-9 — roll category actuals back onto the brief and keep our copy in step.
      const updatedBrief = await syncActualsToBrief(brief, saved);
      setBrief(updatedBrief);

      // FR-12 — log the first time each line item crosses its threshold.
      for (const item of saved) {
        const variance = computeVariance(item, settings);
        if (variance.flag !== "none" && !flaggedRef.current.has(item.id)) {
          flaggedRef.current.add(item.id);
          void logUsageEvent({
            type: "variance_flag_first_triggered",
            briefId: brief.id,
            briefName: brief.name || "Untitled brief",
            details: {
              lineItem: item.lineItemName,
              category: item.category,
              flag: variance.flag,
              basis: variance.effectiveBasis ?? "",
            },
          });
        } else if (variance.flag === "none") {
          flaggedRef.current.delete(item.id);
        }
      }

      setSaveState("saved");
    },
    [brief, settings],
  );

  const queueSave = useCallback(
    (next: BudgetLineItem[]) => {
      itemsRef.current = next;
      setLineItems(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void persist(next), DEBOUNCE_MS);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /* ---- line-item actions ---------------------------------------------- */
  const onPatch = (id: string, changes: Partial<BudgetLineItem>) =>
    queueSave(itemsRef.current.map((item) => (item.id === id ? { ...item, ...changes } : item)));

  const onAdd = (category: BudgetLineItemCategory) =>
    queueSave([...itemsRef.current, newLineItem(briefId, { category })]);

  const onDelete = async (id: string) => {
    await deleteLineItem(id);
    const next = itemsRef.current.filter((item) => item.id !== id);
    itemsRef.current = next;
    setLineItems(next);
  };

  /* ---- reforecast ------------------------------------------------------ */
  const closeReforecast = async (action: "reforecasted" | "dismissed", updated?: Array<{ id: string; budgetedAmount: number }>) => {
    if (!brief || !settings) return;
    const before = totalBudgeted(itemsRef.current);

    let nextItems = itemsRef.current;
    if (updated && updated.length > 0) {
      nextItems = itemsRef.current.map((item) => {
        const change = updated.find((u) => u.id === item.id);
        return change ? { ...item, budgetedAmount: change.budgetedAmount } : item;
      });
      await persist(nextItems);
    }

    const event = newReforecastEvent(brief, triggers, action, {
      before,
      after: totalBudgeted(nextItems),
    });
    // Re-snapshot either way, so the same scope change never re-triggers.
    const nextSettings: BudgetSettings = {
      ...settings,
      lastSeenBriefVersion: brief.version,
      lastSeenScopeSnapshot: snapshotScope(brief),
      reforecastHistory: [...settings.reforecastHistory, event],
    };
    setSettings(await saveBudgetSettings(nextSettings));
    setTriggers([]);
    setShowReforecast(false);

    await logUsageEvent({
      type: action === "reforecasted" ? "reforecast_completed" : "reforecast_dismissed",
      briefId: brief.id,
      briefName: brief.name || "Untitled brief",
      details: { reason: event.triggerReason, before: event.totalBudgetedBefore ?? 0, after: event.totalBudgetedAfter ?? 0 },
    });
  };

  /* ---- import ---------------------------------------------------------- */
  const onCommitImport = async (candidates: ImportCandidate[], source: LineItemSource) => {
    const next = applyImportPlan(itemsRef.current, candidates, briefId, source, nowIso());
    await persist(next);
    await logUsageEvent({
      type: "import_performed",
      briefId,
      briefName: brief?.name || "Untitled brief",
      details: { source, rows: candidates.length },
    });
    return candidates.length;
  };

  /* ---- export + reconcile ---------------------------------------------- */
  const onExport = async (format: "xlsx" | "csv") => {
    if (!brief || !settings) return;
    const workbook = buildExportWorkbook(lineItems, settings, brief);
    const base = `${slugify(brief.name || "event")}-budget`;
    if (format === "xlsx") await downloadWorkbook(workbook, `${base}.xlsx`);
    else downloadCsv(workbook, `${base}.csv`);
    await logUsageEvent({
      type: "export_triggered",
      briefId: brief.id,
      briefName: brief.name || "Untitled brief",
      details: { tool: "budget", format },
    });
  };

  const onToggleReconciled = async () => {
    if (!brief || !settings) return;
    const reconciledAt = settings.reconciledAt ? null : nowIso();
    setSettings(await saveBudgetSettings({ ...settings, reconciledAt }));
    if (reconciledAt) {
      await logUsageEvent({
        type: "budget_reconciled",
        briefId: brief.id,
        briefName: brief.name || "Untitled brief",
        details: { totalActual: summary?.totalActual ?? 0 },
      });
    }
  };

  const summary = useMemo(
    () => (settings && brief ? computeBudgetActualsSummary(lineItems, settings, brief) : null),
    [lineItems, settings, brief],
  );

  if (loading) return <p className="py-16 text-center text-sm text-content-muted">Loading…</p>;
  if (notFound || !brief || !settings) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-content">That brief no longer exists</h1>
        <Link
          href="/budget"
          className="mt-5 inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        >
          Back to budgets
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
            Budget Builder &amp; Tracker
          </p>
          <h1 className="text-xl font-semibold text-content">{brief.name || "Untitled event"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-content-muted">
            <Badge>{settings.currency}</Badge>
            {settings.reconciledAt ? <Badge tone="success">Reconciled</Badge> : null}
            {summary ? (
              <span>
                {formatMoney(summary.totalActual, settings.currency)} actual of{" "}
                {formatMoney(summary.totalBudgeted, settings.currency)} budgeted
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-content-muted">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : ""}
          </span>
          <Button onClick={() => setShowImport(true)}>Import</Button>
          <Button onClick={() => void onExport("xlsx")}>Export XLSX</Button>
          <Button onClick={() => void onExport("csv")}>Export CSV</Button>
          <Button onClick={() => setShowSettings((v) => !v)}>Settings</Button>
          <Button variant={settings.reconciledAt ? "secondary" : "primary"} onClick={() => void onToggleReconciled()}>
            {settings.reconciledAt ? "Reopen budget" : "Mark reconciled"}
          </Button>
          <Link
            href={`/brief/${brief.id}`}
            className="rounded-md px-2.5 py-1.5 text-sm font-medium text-content-muted underline-offset-4 hover:text-content hover:underline"
          >
            ← Back to brief
          </Link>
        </div>
      </header>

      {generatedNote ? (
        <p role="status" className="rounded-lg border border-accent/20 bg-accent-subtle px-4 py-2 text-sm text-accent-text">
          {generatedNote}{" "}
          <button type="button" className="font-medium underline" onClick={() => setGeneratedNote(null)}>
            Dismiss
          </button>
        </p>
      ) : null}

      <ReforecastBanner
        triggers={triggers}
        onOpen={() => setShowReforecast(true)}
        onDismiss={() => void closeReforecast("dismissed")}
      />

      {showSettings ? (
        <BudgetSettingsPanel
          settings={settings}
          reforecastHistory={settings.reforecastHistory}
          onChange={async (next) => setSettings(await saveBudgetSettings(next))}
          onClose={() => setShowSettings(false)}
        />
      ) : null}

      <BudgetTable
        lineItems={lineItems}
        settings={settings}
        onPatch={onPatch}
        onDelete={(id) => void onDelete(id)}
        onAdd={onAdd}
      />

      {summary ? (
        <p className="text-xs text-content-muted">
          {summary.lineItemCount} line items · {summary.reconciledLineItemPct}% have actuals ·
          variance {formatMoney(summary.varianceAmount, settings.currency)}
          {summary.variancePct === null ? "" : ` (${Math.round(summary.variancePct)}%)`}
          {" · "}
          {BUDGET_CATEGORY_LABELS[
            [...summary.spendByCategory].sort((a, b) => b.actual - a.actual)[0]?.category ?? "other"
          ]}{" "}
          is the largest spend
        </p>
      ) : null}

      {showReforecast ? (
        <ReforecastFlow
          triggers={triggers}
          lineItems={lineItems}
          currency={settings.currency}
          onCancel={() => setShowReforecast(false)}
          onSave={(updated) => void closeReforecast("reforecasted", updated)}
        />
      ) : null}

      {showImport ? (
        <ImportWizard
          lineItems={lineItems}
          currency={settings.currency}
          onCommit={onCommitImport}
          onClose={() => setShowImport(false)}
        />
      ) : null}
    </div>
  );
}

export { roundMoney };
