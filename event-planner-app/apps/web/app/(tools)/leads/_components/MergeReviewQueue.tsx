"use client";

/**
 * FR-4 — the fuzzy-match review queue. Nothing here has been merged; every pair is a question.
 * Side-by-side, with the planner picking a winning value per conflicting field.
 */

import { useState } from "react";
import {
  applyMerge,
  contactName,
  type DuplicateCandidate,
  type LeadContact,
  type LeadRecord,
} from "@event-toolkit/lead-triage-core";
import { Badge, Button, Card, CardBody, CardHeader } from "@event-toolkit/ui";

const FIELDS: Array<{ key: keyof LeadContact; label: string }> = [
  { key: "fullName", label: "Name" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "jobTitle", label: "Job title" },
  { key: "phone", label: "Phone" },
];

export function MergeReviewQueue({
  candidates,
  leads,
  onResolve,
}: {
  candidates: DuplicateCandidate[];
  leads: LeadRecord[];
  onResolve: (
    candidate: DuplicateCandidate,
    decision: "merged" | "rejected",
    nextLeads: LeadRecord[],
  ) => Promise<void>;
}) {
  const pending = candidates.filter((c) => c.status === "pending");

  if (pending.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-content-muted">
            Nothing to review. Exact-email matches merge automatically; only uncertain
            name-and-company matches land here, and there are none right now.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-content-muted">
        {pending.length} possible duplicate{pending.length === 1 ? "" : "s"}. These were never
        merged automatically — one of each pair is missing an email, so the match is a guess.
      </p>
      {pending.map((candidate) => (
        <CandidateCard
          key={candidate.id}
          candidate={candidate}
          leads={leads}
          onResolve={onResolve}
        />
      ))}
    </div>
  );
}

function CandidateCard({
  candidate,
  leads,
  onResolve,
}: {
  candidate: DuplicateCandidate;
  leads: LeadRecord[];
  onResolve: (
    candidate: DuplicateCandidate,
    decision: "merged" | "rejected",
    nextLeads: LeadRecord[],
  ) => Promise<void>;
}) {
  const a = leads.find((l) => l.id === candidate.leadAId);
  const b = leads.find((l) => l.id === candidate.leadBId);
  /** Which side wins each conflicting field. Defaults to A. */
  const [picks, setPicks] = useState<Partial<Record<keyof LeadContact, "a" | "b">>>({});
  const [busy, setBusy] = useState(false);

  if (!a || !b) return null;

  const merge = async () => {
    setBusy(true);
    try {
      // Apply the planner's per-field choices to A first, then merge B into it.
      const resolvedA: LeadRecord = {
        ...a,
        contact: FIELDS.reduce<LeadContact>((contact, field) => {
          const choice = picks[field.key];
          const value = choice === "b" ? b.contact[field.key] : a.contact[field.key];
          return value ? { ...contact, [field.key]: value } : contact;
        }, { ...a.contact }),
      };
      const withChoice = leads.map((lead) => (lead.id === a.id ? resolvedA : lead));
      await onResolve(candidate, "merged", applyMerge(withChoice, a.id, b.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <h3 className="text-sm font-semibold text-content">
            {contactName(a.contact)} &nbsp;·&nbsp; {contactName(b.contact)}
          </h3>
          <p className="text-xs text-content-muted">{candidate.reason}</p>
        </div>
        <Badge tone={candidate.similarity >= 0.95 ? "warning" : "neutral"}>
          {Math.round(candidate.similarity * 100)}% match
        </Badge>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="w-32 pb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">
                  Field
                </th>
                <th className="pb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">
                  Record A
                </th>
                <th className="pb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">
                  Record B
                </th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((field) => {
                const valueA = a.contact[field.key];
                const valueB = b.contact[field.key];
                if (!valueA && !valueB) return null;
                const conflicting = Boolean(valueA && valueB && valueA !== valueB);
                const chosen = picks[field.key] ?? "a";
                return (
                  <tr key={field.key} className={conflicting ? "bg-warning-subtle/60" : undefined}>
                    <td className="py-1 text-xs text-content-muted">{field.label}</td>
                    <td className="py-1">
                      <label className="flex items-center gap-2">
                        {conflicting ? (
                          <input
                            type="radio"
                            name={`${candidate.id}-${field.key}`}
                            checked={chosen === "a"}
                            onChange={() => setPicks((p) => ({ ...p, [field.key]: "a" }))}
                          />
                        ) : null}
                        <span>{valueA || <span className="text-content-subtle">—</span>}</span>
                      </label>
                    </td>
                    <td className="py-1">
                      <label className="flex items-center gap-2">
                        {conflicting ? (
                          <input
                            type="radio"
                            name={`${candidate.id}-${field.key}`}
                            checked={chosen === "b"}
                            onChange={() => setPicks((p) => ({ ...p, [field.key]: "b" }))}
                          />
                        ) : null}
                        <span>{valueB || <span className="text-content-subtle">—</span>}</span>
                      </label>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-1 text-xs text-content-muted">Signals</td>
                <td className="py-1 text-xs text-content-muted">
                  {a.signals.boothInteractions} booth · {a.signals.sessionsAttended.length} sessions
                  {a.signals.demoRequested ? " · demo" : ""}
                </td>
                <td className="py-1 text-xs text-content-muted">
                  {b.signals.boothInteractions} booth · {b.signals.sessionsAttended.length} sessions
                  {b.signals.demoRequested ? " · demo" : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-content-muted">
          Merging combines signals from both records — booth scans add up, sessions combine, and a
          demo request on either side carries over.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() => void onResolve(candidate, "rejected", leads)}
          >
            Not a duplicate
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void merge()}>
            Merge into one lead
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
