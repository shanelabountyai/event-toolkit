"use client";

/** FR-7 — the owner list, the distribution view, and the auto-assign action. */

import { useState } from "react";
import {
  applyMappedOwner,
  newOwner,
  ownerDistribution,
  roundRobinAssign,
  type LeadRecord,
  type TriageSession,
} from "@event-toolkit/lead-triage-core";
import { Badge, Button, Card, CardBody, CardHeader, Table, Td, Th, TextInput } from "@event-toolkit/ui";

export function OwnerAssignmentPanel({
  session,
  leads,
  onSessionChange,
  onLeadsChange,
  onAssignmentRun,
}: {
  session: TriageSession;
  leads: LeadRecord[];
  onSessionChange: (next: TriageSession) => void | Promise<void>;
  onLeadsChange: (next: LeadRecord[]) => void | Promise<unknown>;
  onAssignmentRun: (method: string, count: number) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const distribution = ownerDistribution(leads, session.owners);
  const unassigned = leads.filter((lead) => !lead.ownerId).length;
  const unmatchedNames = [
    ...new Set(leads.filter((l) => !l.ownerId && l.ownerName).map((l) => l.ownerName!)),
  ];

  const addOwner = () => {
    if (!name.trim()) return;
    void onSessionChange({ ...session, owners: [...session.owners, newOwner(name, email)] });
    setName("");
    setEmail("");
  };

  const runMapped = async () => {
    const next = applyMappedOwner(leads, session.owners);
    const changed = next.filter((lead, i) => lead.ownerId !== leads[i].ownerId).length;
    await onLeadsChange(next);
    await onAssignmentRun("column_mapped", changed);
  };

  const runRoundRobin = async () => {
    const result = roundRobinAssign(leads, session.owners);
    await onLeadsChange(result.leads);
    await onAssignmentRun("round_robin", result.assigned);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-base font-semibold text-content">Sales owners</h2>
            <p className="text-xs text-content-muted">
              Owners named in an imported file are matched against this list.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-content-muted">
              Name
              <TextInput
                className="mt-1 w-52"
                value={name}
                placeholder="Alex Rivera"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addOwner();
                }}
              />
            </label>
            <label className="text-xs text-content-muted">
              Email (optional)
              <TextInput
                className="mt-1 w-64"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <Button onClick={addOwner}>Add owner</Button>
          </div>

          {session.owners.length === 0 ? (
            <p className="text-sm text-content-muted">No owners yet. Add at least one to route leads.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {session.owners.map((owner) => (
                <li key={owner.id}>
                  <span className="inline-flex items-center gap-2 rounded-full bg-surface-hover py-1 pl-3 pr-1 text-sm">
                    {owner.name}
                    <button
                      type="button"
                      aria-label={`Remove ${owner.name}`}
                      className="rounded-full px-1.5 text-content-muted hover:bg-surface-hover hover:text-content"
                      onClick={() => {
                        // Removing an owner un-assigns their leads rather than orphaning an id.
                        void onLeadsChange(
                          leads.map((lead) =>
                            lead.ownerId === owner.id
                              ? { ...lead, ownerId: null, ownerName: null, assignmentMethod: null }
                              : lead,
                          ),
                        );
                        void onSessionChange({
                          ...session,
                          owners: session.owners.filter((o) => o.id !== owner.id),
                        });
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {unmatchedNames.length > 0 ? (
            <p className="rounded-lg border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-text">
              These owner names came in from a file but don&rsquo;t match anyone above:{" "}
              {unmatchedNames.join(", ")}. Add them as owners and run &ldquo;Apply owners from
              file&rdquo; to link them.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <h2 className="text-base font-semibold text-content">Assignment</h2>
            <p className="text-xs text-content-muted">
              {unassigned} of {leads.length} leads are unassigned.
            </p>
          </div>
          <span className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={session.owners.length === 0 || unmatchedNames.length === 0}
              onClick={() => void runMapped()}
            >
              Apply owners from file
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={session.owners.length === 0 || unassigned === 0}
              onClick={() => void runRoundRobin()}
            >
              Auto-assign unassigned
            </Button>
          </span>
        </CardHeader>
        <CardBody>
          <Table>
            <thead>
              <tr>
                <Th>Owner</Th>
                <Th className="w-20 text-right">Leads</Th>
                <Th className="w-20 text-right">Hot</Th>
                <Th className="w-20 text-right">Warm</Th>
                <Th className="w-20 text-right">Cold</Th>
              </tr>
            </thead>
            <tbody>
              {distribution.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-content-muted">
                    Nothing to distribute yet.
                  </td>
                </tr>
              ) : (
                distribution.map((row) => (
                  <tr key={row.owner?.id ?? "unassigned"}>
                    <Td>
                      {row.owner ? (
                        row.owner.name
                      ) : (
                        <Badge tone="warning">Unassigned</Badge>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{row.leadCount}</Td>
                    <Td className="text-right tabular-nums">{row.hot}</Td>
                    <Td className="text-right tabular-nums">{row.warm}</Td>
                    <Td className="text-right tabular-nums">{row.cold}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
