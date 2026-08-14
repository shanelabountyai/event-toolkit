"use client";

/**
 * FR-2/FR-3 — the run of show. This is the only view that edits a session's time, label or
 * location; everywhere else derives them.
 */

import { useEffect, useState } from "react";
import {
  SESSION_TYPES,
  SESSION_TYPE_LABELS,
  deleteSessionWithStrategy,
  findOverlaps,
  findSessionReferences,
  newSession,
  sessionsByStart,
  type LogisticsPack,
  type Session,
  type SessionType,
} from "@event-toolkit/logistics";
import {
  Badge,
  Button,
  DateTimeInput,
  EmptyRow,
  Select,
  Table,
  Td,
  Th,
  TextInput,
} from "@event-toolkit/ui";
import { SessionDeleteConfirmDialog } from "./SessionDeleteConfirmDialog";

export function RunOfShowTable({
  pack,
  eventStartDate,
  onUpdate,
}: {
  pack: LogisticsPack;
  eventStartDate?: string;
  onUpdate: (updater: (prev: LogisticsPack) => LogisticsPack) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);
  const overlaps = findOverlaps(pack);

  /**
   * Display order is held still while you type.
   *
   * This table re-sorted by start time on every render, so editing a session's time moved its row
   * mid-keystroke and the following characters landed on whichever row had taken its place. Two
   * separate end-to-end runs corrupted their own run of show that way — blank session names, end
   * times bled across rows, one session ending on the wrong day.
   *
   * The order tracks which sessions exist, not what their times say. Re-sorting is an explicit
   * action, below.
   */
  const [order, setOrder] = useState<string[]>(() => sessionsByStart(pack).map((s) => s.id));

  const sessionIds = pack.sessions.map((s) => s.id).join(",");
  useEffect(() => {
    setOrder((previous) => {
      const live = new Set(pack.sessions.map((s) => s.id));
      const kept = previous.filter((id) => live.has(id));
      // New sessions go to the end, where the "Add session" button put them.
      const added = pack.sessions.map((s) => s.id).filter((id) => !previous.includes(id));
      return [...kept, ...added];
    });
    // Keyed on the *set* of sessions, so a time edit does not reorder anything.
  }, [sessionIds, pack.sessions]);

  const byId = new Map(pack.sessions.map((s) => [s.id, s]));
  const ordered = order.map((id) => byId.get(id)).filter((s): s is Session => Boolean(s));
  const isSorted = ordered.every(
    (s, i) => i === 0 || (ordered[i - 1].startTime ?? "") <= (s.startTime ?? ""),
  );

  const patch = (id: string, changes: Partial<Session>) =>
    onUpdate((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === id ? { ...s, ...changes } : s)),
    }));

  const addSession = () => {
    const day = eventStartDate || new Date().toISOString().slice(0, 10);
    const last = ordered[ordered.length - 1];
    const start = last?.endTime || `${day}T09:00`;
    const startHour = Number(/T(\d{2})/.exec(start)?.[1] ?? "9");
    onUpdate((prev) => ({
      ...prev,
      sessions: [
        ...prev.sessions,
        newSession({
          label: "",
          startTime: start,
          endTime: `${start.slice(0, 11)}${`${Math.min(startHour + 1, 23)}`.padStart(2, "0")}:00`,
          location: last?.location,
        }),
      ],
    }));
  };

  const requestDelete = (session: Session) => {
    // Nothing references it — no need to interrupt the planner with a dialog.
    if (findSessionReferences(pack, session.id).total === 0) {
      onUpdate((prev) => ({ ...prev, sessions: prev.sessions.filter((s) => s.id !== session.id) }));
      return;
    }
    setPendingDelete(session);
  };

  return (
    <>
      <Table stack>
        <thead>
          <tr>
            <Th className="w-56">Session</Th>
            <Th className="w-44">Start</Th>
            <Th className="w-44">End</Th>
            <Th className="w-40">Location</Th>
            <Th className="w-32">Owner</Th>
            <Th className="w-32">Type</Th>
            <Th>Notes</Th>
            <Th className="no-print w-10" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {ordered.length === 0 ? (
            <EmptyRow colSpan={8}>
              No sessions yet. Add the first one, or seed them from the brief&rsquo;s during-event
              milestones.
            </EmptyRow>
          ) : (
            ordered.map((session) => {
              const clashing = overlaps.has(session.id);
              return (
                <tr key={session.id} className={clashing ? "bg-warning-subtle/60" : undefined}>
                  <Td label="Session">
                    <TextInput
                      value={session.label}
                      aria-label="Session label"
                      placeholder="Registration desk opens"
                      onChange={(e) => patch(session.id, { label: e.target.value })}
                    />
                    {clashing ? (
                      <p className="mt-1 flex items-center gap-1.5">
                        <Badge tone="warning">Room clash</Badge>
                        <span className="text-xs text-warning-text">
                          Overlaps another session in {session.location}
                        </span>
                      </p>
                    ) : null}
                  </Td>
                  <Td label="Start">
                    <DateTimeInput
                      value={session.startTime}
                      aria-label="Start time"
                      onChange={(e) => patch(session.id, { startTime: e.target.value })}
                    />
                  </Td>
                  <Td label="End">
                    <DateTimeInput
                      value={session.endTime}
                      aria-label="End time"
                      onChange={(e) => patch(session.id, { endTime: e.target.value })}
                    />
                  </Td>
                  <Td label="Location">
                    <TextInput
                      value={session.location ?? ""}
                      aria-label="Location"
                      onChange={(e) => patch(session.id, { location: e.target.value })}
                    />
                  </Td>
                  <Td label="Owner">
                    <TextInput
                      value={session.owner ?? ""}
                      aria-label="Owner"
                      onChange={(e) => patch(session.id, { owner: e.target.value })}
                    />
                  </Td>
                  <Td label="Type">
                    <Select
                      value={session.type}
                      aria-label="Session type"
                      onChange={(e) => patch(session.id, { type: e.target.value as SessionType })}
                    >
                      {SESSION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {SESSION_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td label="Notes">
                    <TextInput
                      value={session.notes ?? ""}
                      aria-label="Notes"
                      onChange={(e) => patch(session.id, { notes: e.target.value })}
                    />
                  </Td>
                  <Td className="no-print text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${session.label || "session"}`}
                      onClick={() => requestDelete(session)}
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

      <div className="no-print mt-3">
        <Button onClick={addSession}>Add session</Button>
        {/*
          Sorting is an action, not a side effect of typing. Offered only when the order has
          actually drifted, so it is not a permanently-lit button that does nothing.
        */}
        {!isSorted ? (
          <Button
            variant="ghost"
            onClick={() => setOrder(sessionsByStart(pack).map((session) => session.id))}
          >
            Sort by start time
          </Button>
        ) : null}
      </div>

      {pendingDelete ? (
        <SessionDeleteConfirmDialog
          pack={pack}
          session={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={(strategy) => {
            onUpdate((prev) => deleteSessionWithStrategy(prev, pendingDelete.id, strategy));
            setPendingDelete(null);
          }}
        />
      ) : null}
    </>
  );
}
