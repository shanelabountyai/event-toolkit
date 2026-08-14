"use client";

/** FR-6/FR-9 — the triage workspace: sortable, filterable, with a detail drawer per lead. */

import { useMemo, useState } from "react";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_TIERS,
  LEAD_TIER_LABELS,
  applyDraftEdit,
  assignOwnerManually,
  contactName,
  sortForExport,
  type LeadRecord,
  type LeadStatus,
  type LeadTier,
  type SessionOwner,
} from "@event-toolkit/lead-triage-core";
import {
  Badge,
  Button,
  EmptyRow,
  Select,
  Table,
  Td,
  Th,
  TextArea,
  TextInput,
  type BadgeTone,
} from "@event-toolkit/ui";

const TIER_TONES: Record<LeadTier, BadgeTone> = { hot: "danger", warm: "warning", cold: "neutral" };

export function LeadTable({
  leads,
  owners,
  onChange,
}: {
  leads: LeadRecord[];
  owners: SessionOwner[];
  onChange: (next: LeadRecord[]) => void | Promise<unknown>;
}) {
  const [tierFilter, setTierFilter] = useState<"all" | LeadTier>("all");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "unassigned" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortForExport(
      leads.filter((lead) => {
        if (tierFilter !== "all" && lead.tier !== tierFilter) return false;
        if (ownerFilter === "unassigned" && lead.ownerId) return false;
        if (ownerFilter !== "all" && ownerFilter !== "unassigned" && lead.ownerId !== ownerFilter) return false;
        if (statusFilter !== "all" && lead.status !== statusFilter) return false;
        if (!q) return true;
        return [contactName(lead.contact), lead.contact.email, lead.contact.company]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q));
      }),
    );
  }, [leads, tierFilter, ownerFilter, statusFilter, query]);

  const openLead = leads.find((l) => l.id === openLeadId) ?? null;
  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  const bulkAssign = (ownerId: string) => {
    const owner = owners.find((o) => o.id === ownerId) ?? null;
    void onChange(assignOwnerManually(leads, [...selected], owner));
    setSelected(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-content-muted">
          Tier
          <Select className="mt-1 w-32" value={tierFilter} onChange={(e) => setTierFilter(e.target.value as typeof tierFilter)}>
            <option value="all">All</option>
            {LEAD_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {LEAD_TIER_LABELS[tier]}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-content-muted">
          Owner
          <Select className="mt-1 w-44" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="unassigned">Unassigned</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-content-muted">
          Status
          <Select className="mt-1 w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">All</option>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex-1 text-xs text-content-muted">
          Search
          <TextInput
            className="mt-1"
            value={query}
            placeholder="Name, email or company"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/20 bg-accent-subtle px-4 py-2">
          <span className="text-sm text-accent-text">{selected.size} selected</span>
          <Select
            className="w-48"
            aria-label="Bulk assign owner"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkAssign(e.target.value);
            }}
          >
            <option value="">Reassign to…</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <Table>
        <thead>
          <tr>
            <Th className="w-10">
              <input
                type="checkbox"
                aria-label="Select all filtered leads"
                checked={allFilteredSelected}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(filtered.map((l) => l.id)) : new Set())
                }
                className="h-4 w-4 rounded border-line-strong"
              />
            </Th>
            <Th className="w-20">Tier</Th>
            <Th className="w-16 text-right">Score</Th>
            <Th>Name</Th>
            <Th>Company</Th>
            <Th className="w-36">Owner</Th>
            <Th className="w-28">Status</Th>
            <Th className="w-20">Draft</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <EmptyRow colSpan={8}>
              {leads.length === 0 ? "No leads imported yet." : "No leads match these filters."}
            </EmptyRow>
          ) : (
            filtered.map((lead) => (
              <tr
                key={lead.id}
                className="cursor-pointer hover:bg-surface-sunken"
                onClick={() => setOpenLeadId(lead.id)}
              >
                <Td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${contactName(lead.contact)}`}
                    checked={selected.has(lead.id)}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(lead.id);
                        else next.delete(lead.id);
                        return next;
                      })
                    }
                    className="h-4 w-4 rounded border-line-strong"
                  />
                </Td>
                <Td>
                  <Badge tone={TIER_TONES[lead.tier]}>{LEAD_TIER_LABELS[lead.tier]}</Badge>
                </Td>
                <Td className="text-right tabular-nums font-medium">{lead.score}</Td>
                <Td>
                  <span className="font-medium text-content">{contactName(lead.contact) || "—"}</span>
                  <span className="block text-xs text-content-muted">{lead.contact.email ?? "no email"}</span>
                </Td>
                <Td>
                  {lead.contact.company ?? "—"}
                  <span className="block text-xs text-content-muted">{lead.contact.jobTitle ?? ""}</span>
                </Td>
                <Td className="text-sm">{lead.ownerName ?? <span className="text-content-subtle">Unassigned</span>}</Td>
                <Td className="text-xs">{LEAD_STATUS_LABELS[lead.status]}</Td>
                <Td>
                  {lead.followUpDraft ? (
                    <Badge tone={lead.followUpDraft.edited ? "info" : "success"}>
                      {lead.followUpDraft.edited ? "Edited" : "Ready"}
                    </Badge>
                  ) : (
                    <span className="text-xs text-content-subtle">—</span>
                  )}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      {openLead ? (
        <LeadDetailDrawer
          lead={openLead}
          owners={owners}
          onClose={() => setOpenLeadId(null)}
          onChange={(next) => onChange(leads.map((l) => (l.id === next.id ? next : l)))}
        />
      ) : null}
    </div>
  );
}

function LeadDetailDrawer({
  lead,
  owners,
  onClose,
  onChange,
}: {
  lead: LeadRecord;
  owners: SessionOwner[];
  onClose: () => void;
  onChange: (next: LeadRecord) => void | Promise<unknown>;
}) {
  const [subject, setSubject] = useState(lead.followUpDraft?.subject ?? "");
  const [body, setBody] = useState(lead.followUpDraft?.body ?? "");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Lead detail for ${contactName(lead.contact)}`}
      className="fixed inset-0 z-50 flex justify-end bg-accent/40"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-xl overflow-y-auto bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-content">
              {contactName(lead.contact) || "Unnamed lead"}
            </h2>
            <p className="text-xs text-content-muted">
              {[lead.contact.jobTitle, lead.contact.company].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <section>
            <h3 className="text-sm font-semibold text-content">Contact</h3>
            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <Detail label="Email" value={lead.contact.email} />
              <Detail label="Phone" value={lead.contact.phone} />
              <Detail label="Company" value={lead.contact.company} />
              <Detail label="Job title" value={lead.contact.jobTitle} />
            </dl>
            {lead.conflicts && lead.conflicts.length > 0 ? (
              <div className="mt-2 rounded-lg border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-text">
                <p className="font-medium">Conflicting values found when merging:</p>
                <ul className="list-inside list-disc">
                  {lead.conflicts.map((conflict) => (
                    <li key={`${conflict.field}-${conflict.discarded}`}>
                      {conflict.field}: kept “{conflict.kept}”, also saw “{conflict.discarded}”
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-content">
              Score {lead.score} · {LEAD_TIER_LABELS[lead.tier]}
            </h3>
            {lead.scoreBreakdown.length === 0 ? (
              <p className="mt-1 text-sm text-content-muted">No scoring signals matched this lead.</p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-sm">
                {lead.scoreBreakdown.map((entry) => (
                  <li key={entry.ruleId} className="flex justify-between">
                    <span className="text-content-muted">{entry.label}</span>
                    <span className="tabular-nums text-content">+{entry.points}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-content-muted">
              {lead.signals.boothInteractions} booth interactions ·{" "}
              {lead.signals.sessionsAttended.length > 0
                ? lead.signals.sessionsAttended.join(", ")
                : "no sessions recorded"}
              {lead.signals.demoRequested ? " · demo requested" : ""}
              {lead.mergedFrom?.length ? ` · merged from ${lead.mergedFrom.length} record(s)` : ""}
            </p>
          </section>

          <section className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-content-muted">
              Owner
              <Select
                className="mt-1 w-48"
                value={lead.ownerId ?? ""}
                onChange={(e) => {
                  const owner = owners.find((o) => o.id === e.target.value) ?? null;
                  void onChange(assignOwnerManually([lead], [lead.id], owner)[0]);
                }}
              >
                <option value="">Unassigned</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-content-muted">
              Status
              <Select
                className="mt-1 w-44"
                value={lead.status}
                onChange={(e) => void onChange({ ...lead, status: e.target.value as LeadStatus })}
              >
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LEAD_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </label>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-content">Follow-up draft</h3>
            {lead.followUpDraft ? (
              <div className="mt-1 space-y-2">
                <TextInput
                  value={subject}
                  aria-label="Draft subject"
                  onChange={(e) => setSubject(e.target.value)}
                />
                <TextArea
                  rows={12}
                  value={body}
                  aria-label="Draft body"
                  className="font-mono text-xs"
                  onChange={(e) => setBody(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void onChange(applyDraftEdit(lead, subject, body))}
                  >
                    Save edit
                  </Button>
                  {lead.followUpDraft.edited ? (
                    <span className="text-xs text-content-muted">
                      Edited — bulk regeneration will leave this alone.
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-content-muted">
                No draft yet — generate drafts from the Templates tab.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <dt className="text-xs text-content-muted">{label}</dt>
      <dd className="text-content">{value || "—"}</dd>
    </>
  );
}
