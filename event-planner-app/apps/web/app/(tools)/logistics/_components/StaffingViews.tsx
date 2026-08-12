"use client";

/**
 * FR-4/FR-5 — staffing, "By session" and "By person".
 *
 * Both toggles render the same `staffAssignments` array through the selectors; neither stores
 * its own grouping, and no row holds a copy of a session's time.
 */

import { useState } from "react";
import {
  assignmentsByPerson,
  assignmentsBySession,
  findDoubleBookings,
  newStaffAssignment,
  resolveSessionTime,
  sessionsByStart,
  type LogisticsPack,
  type StaffAssignment,
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
import { formatSessionRange } from "@/lib/format";

export function StaffingViews({
  pack,
  suggestedNames,
  onUpdate,
}: {
  pack: LogisticsPack;
  /** Stakeholder names from the brief, offered as autocomplete. */
  suggestedNames: string[];
  onUpdate: (updater: (prev: LogisticsPack) => LogisticsPack) => void;
}) {
  const [mode, setMode] = useState<"session" | "person">("session");
  const doubles = findDoubleBookings(pack);
  const sessions = sessionsByStart(pack);

  const patch = (id: string, changes: Partial<StaffAssignment>) =>
    onUpdate((prev) => ({
      ...prev,
      staffAssignments: prev.staffAssignments.map((a) =>
        a.id === id ? { ...a, ...changes } : a,
      ),
    }));

  const remove = (id: string) =>
    onUpdate((prev) => ({
      ...prev,
      staffAssignments: prev.staffAssignments.filter((a) => a.id !== id),
    }));

  const add = (sessionId?: string) =>
    onUpdate((prev) => ({
      ...prev,
      staffAssignments: [...prev.staffAssignments, newStaffAssignment({ sessionId })],
    }));

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md ring-1 ring-inset ring-line-strong" role="group" aria-label="Staffing view">
          <button
            type="button"
            onClick={() => setMode("session")}
            aria-pressed={mode === "session"}
            className={`rounded-l-md px-3 py-1.5 text-sm font-medium ${mode === "session" ? "bg-accent text-accent-fg" : "bg-surface text-content-muted hover:bg-surface-sunken"}`}
          >
            By session
          </button>
          <button
            type="button"
            onClick={() => setMode("person")}
            aria-pressed={mode === "person"}
            className={`rounded-r-md px-3 py-1.5 text-sm font-medium ${mode === "person" ? "bg-accent text-accent-fg" : "bg-surface text-content-muted hover:bg-surface-sunken"}`}
          >
            By person
          </button>
        </div>
        <Button onClick={() => add(sessions[0]?.id)}>Add assignment</Button>
        {doubles.size > 0 ? (
          <Badge tone="warning">{doubles.size / 2 || 1} double booking(s)</Badge>
        ) : null}
      </div>

      <datalist id="staff-name-suggestions">
        {suggestedNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {mode === "session" ? (
        <div className="space-y-5">
          {assignmentsBySession(pack).map((group) => (
            <section key={group.session?.id ?? "unscheduled"} className="break-inside-avoid">
              <h3 className="text-sm font-semibold text-content">
                {group.session ? group.session.label || "Untitled session" : "Not tied to a session"}
                <span className="ml-2 font-normal text-content-muted">
                  {group.session
                    ? formatSessionRange(group.session.startTime, group.session.endTime)
                    : "custom time blocks"}
                </span>
              </h3>
              <AssignmentTable
                pack={pack}
                assignments={group.assignments}
                doubles={doubles}
                showSessionColumn={!group.session}
                onPatch={patch}
                onRemove={remove}
              />
              {group.session ? (
                <div className="no-print mt-2">
                  <Button size="sm" variant="ghost" onClick={() => add(group.session!.id)}>
                    + Staff this session
                  </Button>
                </div>
              ) : null}
            </section>
          ))}
          {pack.sessions.length === 0 && pack.staffAssignments.length === 0 ? (
            <p className="text-sm text-content-muted">
              Add sessions in the run of show first, then staff them here.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          {assignmentsByPerson(pack).length === 0 ? (
            <p className="text-sm text-content-muted">Nobody is staffed yet.</p>
          ) : (
            assignmentsByPerson(pack).map((group) => (
              <section key={group.personName} className="break-inside-avoid">
                <h3 className="text-sm font-semibold text-content">
                  {group.personName}
                  <span className="ml-2 font-normal text-content-muted">
                    {group.assignments.length} assignment{group.assignments.length === 1 ? "" : "s"}
                  </span>
                </h3>
                <AssignmentTable
                  pack={pack}
                  assignments={group.assignments}
                  doubles={doubles}
                  showSessionColumn
                  onPatch={patch}
                  onRemove={remove}
                />
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AssignmentTable({
  pack,
  assignments,
  doubles,
  showSessionColumn,
  onPatch,
  onRemove,
}: {
  pack: LogisticsPack;
  assignments: StaffAssignment[];
  doubles: Set<string>;
  showSessionColumn: boolean;
  onPatch: (id: string, changes: Partial<StaffAssignment>) => void;
  onRemove: (id: string) => void;
}) {
  const sessions = sessionsByStart(pack);

  return (
    <Table stack className="mt-1">
      <thead>
        <tr>
          <Th className="w-48">Person</Th>
          <Th className="w-40">Role</Th>
          {showSessionColumn ? <Th className="w-64">Session or custom time</Th> : null}
          <Th className="w-48">When</Th>
          <Th>Notes</Th>
          <Th className="no-print w-10" aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {assignments.length === 0 ? (
          <EmptyRow colSpan={showSessionColumn ? 6 : 5}>Nobody assigned.</EmptyRow>
        ) : (
          assignments.map((assignment) => {
            // Derived at render — never read from a stored copy.
            const resolved = resolveSessionTime(pack, assignment.sessionId);
            const clash = doubles.has(assignment.id);
            return (
              <tr key={assignment.id} className={clash ? "bg-warning-subtle/60" : undefined}>
                <Td label="Person">
                  <TextInput
                    list="staff-name-suggestions"
                    value={assignment.personName}
                    aria-label="Person"
                    onChange={(e) => onPatch(assignment.id, { personName: e.target.value })}
                  />
                  {clash ? (
                    <p className="mt-1">
                      <Badge tone="warning">Double booked</Badge>
                    </p>
                  ) : null}
                </Td>
                <Td label="Role">
                  <TextInput
                    value={assignment.assignmentRole}
                    aria-label="Role"
                    placeholder="Booth lead"
                    onChange={(e) => onPatch(assignment.id, { assignmentRole: e.target.value })}
                  />
                </Td>
                {showSessionColumn ? (
                  <Td label="Session or custom time">
                    <Select
                      value={assignment.sessionId ?? ""}
                      aria-label="Session"
                      onChange={(e) =>
                        onPatch(assignment.id, {
                          sessionId: e.target.value || undefined,
                          // Clearing the session hands control back to the custom block.
                          ...(e.target.value ? { customStartTime: undefined, customEndTime: undefined } : {}),
                        })
                      }
                    >
                      <option value="">Custom time block</option>
                      {sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label || "Untitled"}
                        </option>
                      ))}
                    </Select>
                  </Td>
                ) : null}
                <Td label="When">
                  {resolved ? (
                    <span className="text-sm text-content-muted">
                      {formatSessionRange(resolved.startTime, resolved.endTime)}
                      <span className="block text-xs text-content-subtle">from session</span>
                    </span>
                  ) : (
                    <span className="flex flex-col gap-1">
                      <DateTimeInput
                        value={assignment.customStartTime ?? ""}
                        aria-label="Custom start"
                        onChange={(e) => onPatch(assignment.id, { customStartTime: e.target.value })}
                      />
                      <DateTimeInput
                        value={assignment.customEndTime ?? ""}
                        aria-label="Custom end"
                        onChange={(e) => onPatch(assignment.id, { customEndTime: e.target.value })}
                      />
                    </span>
                  )}
                </Td>
                <Td label="Notes">
                  <TextInput
                    value={assignment.notes ?? ""}
                    aria-label="Notes"
                    onChange={(e) => onPatch(assignment.id, { notes: e.target.value })}
                  />
                </Td>
                <Td className="no-print text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Remove assignment"
                    onClick={() => onRemove(assignment.id)}
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
  );
}
