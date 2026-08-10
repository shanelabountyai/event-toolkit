"use client";

/**
 * FR-11 — the print routes. One artifact, or the whole pack concatenated in the fixed order
 * run-of-show → staffing → shipping → checklist → contacts → issue log.
 *
 * These render read-only markup rather than the editable tables: a printed sheet should not
 * contain form controls, and this keeps the print output independent of edit-mode styling.
 */

import {
  ARTIFACT_LABELS,
  CHECKLIST_STATUS_LABELS,
  CONTACT_ORG_TYPE_LABELS,
  ISSUE_SEVERITY_LABELS,
  PRINT_ARTIFACT_LABELS,
  SESSION_TYPE_LABELS,
  SHIPPING_STATUS_LABELS,
  assignmentsBySession,
  checklistByCategory,
  contactsByOrgType,
  resolveSessionTime,
  sessionsByStart,
  type LogisticsPack,
  type PrintArtifact,
} from "@event-toolkit/logistics";
import { Table, Td, Th, EmptyRow } from "@event-toolkit/ui";
import { formatIsoDate, formatIsoDateTime, formatSessionRange } from "@/lib/format";
import { PrintSection } from "./PrintLayout";

export function PrintArtifactSection({
  pack,
  artifact,
}: {
  pack: LogisticsPack;
  artifact: PrintArtifact;
}) {
  return (
    <PrintSection title={PRINT_ARTIFACT_LABELS[artifact]}>
      {artifact === "run-of-show" ? <RunOfShowPrint pack={pack} /> : null}
      {artifact === "staffing" ? <StaffingPrint pack={pack} /> : null}
      {artifact === "shipping" ? <ShippingPrint pack={pack} /> : null}
      {artifact === "checklist" ? <ChecklistPrint pack={pack} /> : null}
      {artifact === "contacts" ? <ContactsPrint pack={pack} /> : null}
      {artifact === "issues" ? <IssuesPrint pack={pack} /> : null}
    </PrintSection>
  );
}

function RunOfShowPrint({ pack }: { pack: LogisticsPack }) {
  const sessions = sessionsByStart(pack);
  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-40">Time</Th>
          <Th>Session</Th>
          <Th className="w-36">Location</Th>
          <Th className="w-32">Owner</Th>
          <Th className="w-24">Type</Th>
          <Th>Notes</Th>
        </tr>
      </thead>
      <tbody>
        {sessions.length === 0 ? (
          <EmptyRow colSpan={6}>No sessions.</EmptyRow>
        ) : (
          sessions.map((s) => (
            <tr key={s.id} className="break-inside-avoid">
              <Td className="whitespace-nowrap">{formatSessionRange(s.startTime, s.endTime)}</Td>
              <Td className="font-medium">{s.label || "Untitled"}</Td>
              <Td>{s.location ?? "—"}</Td>
              <Td>{s.owner ?? "—"}</Td>
              <Td>{SESSION_TYPE_LABELS[s.type]}</Td>
              <Td>{s.notes ?? ""}</Td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
}

function StaffingPrint({ pack }: { pack: LogisticsPack }) {
  const groups = assignmentsBySession(pack).filter((g) => g.assignments.length > 0);
  if (groups.length === 0) return <p className="text-sm">Nobody staffed.</p>;
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.session?.id ?? "unscheduled"} className="break-inside-avoid">
          <h3 className="text-sm font-semibold">
            {group.session ? group.session.label || "Untitled session" : "Custom time blocks"}
            <span className="ml-2 font-normal">
              {group.session
                ? formatSessionRange(group.session.startTime, group.session.endTime)
                : ""}
            </span>
          </h3>
          <Table>
            <thead>
              <tr>
                <Th className="w-48">Person</Th>
                <Th className="w-40">Role</Th>
                <Th className="w-44">When</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {group.assignments.map((a) => {
                const resolved = resolveSessionTime(pack, a.sessionId);
                return (
                  <tr key={a.id} className="break-inside-avoid">
                    <Td className="font-medium">{a.personName || "—"}</Td>
                    <Td>{a.assignmentRole || "—"}</Td>
                    <Td className="whitespace-nowrap">
                      {resolved
                        ? formatSessionRange(resolved.startTime, resolved.endTime)
                        : formatSessionRange(a.customStartTime, a.customEndTime)}
                    </Td>
                    <Td>{a.notes ?? ""}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      ))}
    </div>
  );
}

function ShippingPrint({ pack }: { pack: LogisticsPack }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Item</Th>
          <Th className="w-16 text-right">Qty</Th>
          <Th className="w-40">Ship to</Th>
          <Th className="w-28">Carrier</Th>
          <Th className="w-36">Tracking</Th>
          <Th className="w-28">Ship by</Th>
          <Th className="w-32">Status</Th>
          <Th className="w-28">Owner</Th>
        </tr>
      </thead>
      <tbody>
        {pack.shippingItems.length === 0 ? (
          <EmptyRow colSpan={8}>Nothing on the manifest.</EmptyRow>
        ) : (
          pack.shippingItems.map((i) => (
            <tr key={i.id} className="break-inside-avoid">
              <Td className="font-medium">{i.item}</Td>
              <Td className="text-right tabular-nums">{i.quantity}</Td>
              <Td>{i.shipTo}</Td>
              <Td>{i.carrier ?? "—"}</Td>
              <Td>{i.trackingNumber ?? "—"}</Td>
              <Td>{i.shipByDate ? formatIsoDate(i.shipByDate) : "—"}</Td>
              <Td>{SHIPPING_STATUS_LABELS[i.status]}</Td>
              <Td>{i.owner ?? "—"}</Td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
}

function ChecklistPrint({ pack }: { pack: LogisticsPack }) {
  const groups = checklistByCategory(pack);
  if (groups.length === 0) return <p className="text-sm">No checklist items.</p>;
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.category} className="break-inside-avoid">
          <h3 className="text-sm font-semibold">
            {group.category} — {group.done}/{group.total} done
          </h3>
          <ul className="mt-1 space-y-1">
            {group.items.map((item) => {
              const due = resolveSessionTime(pack, item.dueSessionId);
              return (
                <li key={item.id} className="break-inside-avoid text-sm">
                  <span aria-hidden className="mr-2 font-mono">
                    {item.status === "done" ? "[x]" : "[ ]"}
                  </span>
                  {item.item || "Untitled"}
                  <span className="ml-2 text-slate-600">
                    ({CHECKLIST_STATUS_LABELS[item.status]}
                    {item.owner ? `, ${item.owner}` : ""}
                    {due ? `, by ${due.label}` : item.dueNote ? `, ${item.dueNote}` : ""})
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ContactsPrint({ pack }: { pack: LogisticsPack }) {
  const groups = contactsByOrgType(pack);
  if (groups.length === 0) return <p className="text-sm">No contacts.</p>;
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.orgType} className="break-inside-avoid">
          <h3 className="text-sm font-semibold">{CONTACT_ORG_TYPE_LABELS[group.orgType]}</h3>
          <Table>
            <thead>
              <tr>
                <Th className="w-44">Name</Th>
                <Th className="w-40">Role</Th>
                <Th className="w-36">Phone</Th>
                <Th className="w-52">Email</Th>
                <Th>On site during</Th>
              </tr>
            </thead>
            <tbody>
              {group.contacts.map((c) => {
                const availability = resolveSessionTime(pack, c.availabilitySessionId);
                return (
                  <tr key={c.id} className="break-inside-avoid">
                    <Td className="font-medium">{c.name || "—"}</Td>
                    <Td>{c.role || "—"}</Td>
                    <Td className="whitespace-nowrap">{c.phone ?? "—"}</Td>
                    <Td>{c.email ?? "—"}</Td>
                    <Td>
                      {availability
                        ? `${availability.label} · ${formatSessionRange(availability.startTime, availability.endTime)}`
                        : (c.availabilityNote ?? "—")}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      ))}
    </div>
  );
}

function IssuesPrint({ pack }: { pack: LogisticsPack }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-40">Logged</Th>
          <Th>What happened</Th>
          <Th className="w-24">Severity</Th>
          <Th className="w-32">Where</Th>
          <Th className="w-24">Status</Th>
          <Th>Resolution</Th>
        </tr>
      </thead>
      <tbody>
        {pack.issueLog.length === 0 ? (
          <EmptyRow colSpan={6}>No issues logged.</EmptyRow>
        ) : (
          pack.issueLog.map((issue) => (
            <tr key={issue.id} className="break-inside-avoid">
              <Td className="whitespace-nowrap">{formatIsoDateTime(issue.timestamp)}</Td>
              <Td>{issue.description}</Td>
              <Td>{ISSUE_SEVERITY_LABELS[issue.severity]}</Td>
              <Td>{issue.relatedArtifact ? ARTIFACT_LABELS[issue.relatedArtifact] : "—"}</Td>
              <Td>{issue.status === "open" ? "Open" : "Resolved"}</Td>
              <Td>{issue.resolutionNotes ?? ""}</Td>
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
}
