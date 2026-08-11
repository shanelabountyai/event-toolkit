"use client";

/**
 * §5's sharp edge: deleting a session that other records still point at.
 *
 * Silent orphaning is not an option, so the planner picks explicitly — repoint the references
 * at another session (they stay live), or snapshot the session's final time into each
 * referrer's freeform note (a deliberate, one-time copy, labelled as no longer updating).
 */

import { useState } from "react";
import {
  findSessionReferences,
  sessionsByStart,
  type LogisticsPack,
  type Session,
  type SessionDeleteStrategy,
} from "@event-toolkit/logistics";
import { Button, Field, Select } from "@event-toolkit/ui";
import { formatSessionRange } from "@/lib/format";

export function SessionDeleteConfirmDialog({
  pack,
  session,
  onConfirm,
  onCancel,
}: {
  pack: LogisticsPack;
  session: Session;
  onConfirm: (strategy: SessionDeleteStrategy) => void;
  onCancel: () => void;
}) {
  const refs = findSessionReferences(pack, session.id);
  const alternatives = sessionsByStart(pack).filter((s) => s.id !== session.id);
  const [mode, setMode] = useState<"reassign" | "snapshot">(
    alternatives.length > 0 ? "reassign" : "snapshot",
  );
  const [targetSessionId, setTargetSessionId] = useState(alternatives[0]?.id ?? "");

  const confirm = () => {
    if (mode === "reassign" && targetSessionId) {
      onConfirm({ kind: "reassign", targetSessionId });
    } else {
      onConfirm({ kind: "snapshot" });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-session-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-accent/40 p-4 sm:p-8"
    >
      <div className="w-full max-w-lg rounded-xl bg-surface shadow-xl">
        <div className="border-b border-line px-5 py-4">
          <h2 id="delete-session-title" className="text-base font-semibold text-content">
            Delete “{session.label || "Untitled session"}”?
          </h2>
          <p className="mt-1 text-xs text-content-muted">
            {refs.total} other record{refs.total === 1 ? "" : "s"} still point at this session:{" "}
            {[
              refs.staffAssignments.length ? `${refs.staffAssignments.length} staffing` : null,
              refs.checklistItems.length ? `${refs.checklistItems.length} checklist` : null,
              refs.contacts.length ? `${refs.contacts.length} contact` : null,
            ]
              .filter(Boolean)
              .join(", ")}
            . Choose what happens to them.
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="flex gap-3 rounded-lg border border-line p-3">
            <input
              type="radio"
              name="delete-mode"
              className="mt-1"
              checked={mode === "reassign"}
              disabled={alternatives.length === 0}
              onChange={() => setMode("reassign")}
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-content">
                Move them to another session
              </span>
              <span className="block text-xs text-content-muted">
                They keep updating automatically when that session&rsquo;s time changes.
              </span>
              {alternatives.length > 0 ? (
                <Field label="" htmlFor="reassign-target" className="mt-2">
                  <Select
                    id="reassign-target"
                    value={targetSessionId}
                    disabled={mode !== "reassign"}
                    onChange={(e) => setTargetSessionId(e.target.value)}
                  >
                    {alternatives.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label || "Untitled"} · {formatSessionRange(s.startTime, s.endTime)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <span className="mt-1 block text-xs text-warning-text">
                  No other session to move them to.
                </span>
              )}
            </span>
          </label>

          <label className="flex gap-3 rounded-lg border border-line p-3">
            <input
              type="radio"
              name="delete-mode"
              className="mt-1"
              checked={mode === "snapshot"}
              onChange={() => setMode("snapshot")}
            />
            <span>
              <span className="block text-sm font-medium text-content">
                Keep the time as a written note
              </span>
              <span className="block text-xs text-content-muted">
                Copies “{session.label || "Untitled"} ·{" "}
                {formatSessionRange(session.startTime, session.endTime)}” into each record as
                plain text, marked as no longer updating.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={confirm}>
            Delete session
          </Button>
        </div>
      </div>
    </div>
  );
}
