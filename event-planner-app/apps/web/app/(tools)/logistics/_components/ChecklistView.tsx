"use client";

/** FR-7 — venue checklist grouped by its free-text category, with per-category progress. */

import {
  CHECKLIST_STATUSES,
  CHECKLIST_STATUS_LABELS,
  SUGGESTED_CHECKLIST_CATEGORIES,
  checklistByCategory,
  newChecklistItem,
  resolveSessionTime,
  sessionsByStart,
  type ChecklistItem,
  type ChecklistStatus,
  type LogisticsPack,
} from "@event-toolkit/logistics";
import {
  Badge,
  Button,
  EmptyRow,
  ProgressBar,
  Select,
  Table,
  Td,
  Th,
  TextInput,
} from "@event-toolkit/ui";
import { formatSessionRange } from "@/lib/format";

const STATUS_TONES: Record<ChecklistStatus, "neutral" | "info" | "success" | "danger"> = {
  todo: "neutral",
  in_progress: "info",
  done: "success",
  blocked: "danger",
};

export function ChecklistView({
  pack,
  onUpdate,
}: {
  pack: LogisticsPack;
  onUpdate: (updater: (prev: LogisticsPack) => LogisticsPack) => void;
}) {
  const groups = checklistByCategory(pack);
  const sessions = sessionsByStart(pack);

  const patch = (id: string, changes: Partial<ChecklistItem>) =>
    onUpdate((prev) => ({
      ...prev,
      venueChecklist: prev.venueChecklist.map((i) => (i.id === id ? { ...i, ...changes } : i)),
    }));

  const add = (category: string) =>
    onUpdate((prev) => ({
      ...prev,
      venueChecklist: [...prev.venueChecklist, newChecklistItem({ category })],
    }));

  return (
    <div className="space-y-6">
      <datalist id="checklist-category-suggestions">
        {SUGGESTED_CHECKLIST_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="no-print flex flex-wrap gap-2">
        {SUGGESTED_CHECKLIST_CATEGORIES.map((category) => (
          <Button key={category} size="sm" onClick={() => add(category)}>
            + {category}
          </Button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-content-muted">
          No checklist items yet — add one from a category above.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.category} className="break-inside-avoid space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-content">
                {group.category}
                <span className="ml-2 font-normal text-content-muted">
                  {group.done}/{group.total} done
                </span>
              </h3>
              <div className="w-40">
                <ProgressBar value={group.total === 0 ? 0 : (group.done / group.total) * 100} />
              </div>
            </div>

            <Table stack>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th className="w-40">Status</Th>
                  <Th className="w-32">Owner</Th>
                  <Th className="w-56">Due</Th>
                  <Th className="no-print w-10" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {group.items.length === 0 ? (
                  <EmptyRow colSpan={5}>Nothing here yet.</EmptyRow>
                ) : (
                  group.items.map((item) => {
                    // Derived at render, so a session time change shows up here immediately.
                    const due = resolveSessionTime(pack, item.dueSessionId);
                    return (
                      <tr key={item.id} className="break-inside-avoid">
                        <Td label="Item">
                          <TextInput
                            value={item.item}
                            aria-label="Checklist item"
                            placeholder="Badge printers online"
                            onChange={(e) => patch(item.id, { item: e.target.value })}
                          />
                        </Td>
                        <Td label="Status">
                          <Select
                            value={item.status}
                            aria-label="Status"
                            onChange={(e) => patch(item.id, { status: e.target.value as ChecklistStatus })}
                          >
                            {CHECKLIST_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {CHECKLIST_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </Select>
                          <span className="print-only hidden">
                            <Badge tone={STATUS_TONES[item.status]}>
                              {CHECKLIST_STATUS_LABELS[item.status]}
                            </Badge>
                          </span>
                        </Td>
                        <Td label="Owner">
                          <TextInput
                            value={item.owner ?? ""}
                            aria-label="Owner"
                            onChange={(e) => patch(item.id, { owner: e.target.value })}
                          />
                        </Td>
                        <Td label="Due">
                          <Select
                            value={item.dueSessionId ?? ""}
                            aria-label="Due by session"
                            onChange={(e) =>
                              patch(item.id, { dueSessionId: e.target.value || undefined })
                            }
                          >
                            <option value="">No session</option>
                            {sessions.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label || "Untitled"}
                              </option>
                            ))}
                          </Select>
                          {due ? (
                            <span className="mt-1 block text-xs text-content-muted">
                              {formatSessionRange(due.startTime, due.endTime)}
                            </span>
                          ) : item.dueNote ? (
                            <span className="mt-1 block text-xs text-content-muted">{item.dueNote}</span>
                          ) : null}
                        </Td>
                        <Td className="no-print text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Remove item"
                            onClick={() =>
                              onUpdate((prev) => ({
                                ...prev,
                                venueChecklist: prev.venueChecklist.filter((i) => i.id !== item.id),
                              }))
                            }
                          >
                            ✕
                          </Button>
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </section>
        ))
      )}
    </div>
  );
}
