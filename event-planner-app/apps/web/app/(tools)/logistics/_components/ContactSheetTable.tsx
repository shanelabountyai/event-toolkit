"use client";

/** FR-8 — on-site contact sheet, seeded from stakeholders, grouped by organisation type. */

import {
  CONTACT_ORG_TYPES,
  CONTACT_ORG_TYPE_LABELS,
  contactsByOrgType,
  newContact,
  resolveSessionTime,
  sessionsByStart,
  type ContactOrgType,
  type LogisticsPack,
  type OnSiteContact,
} from "@event-toolkit/logistics";
import { Button, EmptyRow, Select, Table, Td, Th, TextInput } from "@event-toolkit/ui";
import { formatSessionRange } from "@/lib/format";

export function ContactSheetTable({
  pack,
  onUpdate,
}: {
  pack: LogisticsPack;
  onUpdate: (updater: (prev: LogisticsPack) => LogisticsPack) => void;
}) {
  const groups = contactsByOrgType(pack);
  const sessions = sessionsByStart(pack);

  const patch = (id: string, changes: Partial<OnSiteContact>) =>
    onUpdate((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c) => (c.id === id ? { ...c, ...changes } : c)),
    }));

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap gap-2">
        {CONTACT_ORG_TYPES.map((orgType) => (
          <Button
            key={orgType}
            size="sm"
            onClick={() =>
              onUpdate((prev) => ({ ...prev, contacts: [...prev.contacts, newContact({ orgType })] }))
            }
          >
            + {CONTACT_ORG_TYPE_LABELS[orgType]}
          </Button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">No contacts yet.</p>
      ) : (
        groups.map((group) => (
          <section key={group.orgType} className="break-inside-avoid space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {CONTACT_ORG_TYPE_LABELS[group.orgType]}
              <span className="ml-2 font-normal text-slate-500">{group.contacts.length}</span>
            </h3>

            <Table>
              <thead>
                <tr>
                  <Th className="w-44">Name</Th>
                  <Th className="w-40">Role</Th>
                  <Th className="w-36">Phone</Th>
                  <Th className="w-52">Email</Th>
                  <Th className="w-56">On site during</Th>
                  <Th className="w-32">Org</Th>
                  <Th className="no-print w-10" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {group.contacts.length === 0 ? (
                  <EmptyRow colSpan={7}>Nobody here.</EmptyRow>
                ) : (
                  group.contacts.map((contact) => {
                    const availability = resolveSessionTime(pack, contact.availabilitySessionId);
                    return (
                      <tr key={contact.id} className="break-inside-avoid">
                        <Td>
                          <TextInput
                            value={contact.name}
                            aria-label="Name"
                            onChange={(e) => patch(contact.id, { name: e.target.value })}
                          />
                        </Td>
                        <Td>
                          <TextInput
                            value={contact.role}
                            aria-label="Role"
                            onChange={(e) => patch(contact.id, { role: e.target.value })}
                          />
                        </Td>
                        <Td>
                          <TextInput
                            type="tel"
                            value={contact.phone ?? ""}
                            aria-label="Phone"
                            onChange={(e) => patch(contact.id, { phone: e.target.value })}
                          />
                        </Td>
                        <Td>
                          <TextInput
                            type="email"
                            value={contact.email ?? ""}
                            aria-label="Email"
                            onChange={(e) => patch(contact.id, { email: e.target.value })}
                          />
                        </Td>
                        <Td>
                          <Select
                            value={contact.availabilitySessionId ?? ""}
                            aria-label="Available during"
                            onChange={(e) =>
                              patch(contact.id, { availabilitySessionId: e.target.value || undefined })
                            }
                          >
                            <option value="">Not tied to a session</option>
                            {sessions.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label || "Untitled"}
                              </option>
                            ))}
                          </Select>
                          {availability ? (
                            <span className="mt-1 block text-xs text-slate-500">
                              {formatSessionRange(availability.startTime, availability.endTime)}
                            </span>
                          ) : contact.availabilityNote ? (
                            <span className="mt-1 block text-xs text-slate-500">
                              {contact.availabilityNote}
                            </span>
                          ) : null}
                        </Td>
                        <Td>
                          <Select
                            value={contact.orgType}
                            aria-label="Organisation type"
                            onChange={(e) =>
                              patch(contact.id, { orgType: e.target.value as ContactOrgType })
                            }
                          >
                            {CONTACT_ORG_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {CONTACT_ORG_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </Select>
                        </Td>
                        <Td className="no-print text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove ${contact.name || "contact"}`}
                            onClick={() =>
                              onUpdate((prev) => ({
                                ...prev,
                                contacts: prev.contacts.filter((c) => c.id !== contact.id),
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
