"use client";

/** FR-8 — per-tier templates, a live preview on a real lead, and bulk draft generation. */

import { useState } from "react";
import {
  LEAD_TIER_LABELS,
  MERGE_TOKENS,
  generateDraftsForLeads,
  renderTemplate,
  tokenValues,
  type FollowUpTemplate,
  type LeadRecord,
  type TriageSession,
} from "@event-toolkit/lead-triage-core";
import { Badge, Button, Card, CardBody, CardHeader, Select, TextArea, TextInput } from "@event-toolkit/ui";

export function TemplateEditor({
  session,
  templates,
  leads,
  onTemplatesChange,
  onLeadsChange,
  onDraftsGenerated,
}: {
  session: TriageSession;
  templates: FollowUpTemplate[];
  leads: LeadRecord[];
  onTemplatesChange: (next: FollowUpTemplate[]) => void | Promise<void>;
  onLeadsChange: (next: LeadRecord[]) => void | Promise<unknown>;
  onDraftsGenerated: (generated: number, preserved: number) => void | Promise<void>;
}) {
  const [activeId, setActiveId] = useState(templates[0]?.id ?? "");
  const [previewLeadId, setPreviewLeadId] = useState(leads[0]?.id ?? "");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const active = templates.find((t) => t.id === activeId) ?? templates[0];
  const previewLead = leads.find((l) => l.id === previewLeadId) ?? leads[0];
  const editedCount = leads.filter((l) => l.followUpDraft?.edited).length;

  if (!active) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-slate-600">No templates yet.</p>
        </CardBody>
      </Card>
    );
  }

  const patch = (changes: Partial<FollowUpTemplate>) =>
    void onTemplatesChange(
      templates.map((t) => (t.id === active.id ? { ...t, ...changes } : t)),
    );

  const generate = async (overwriteEdited: boolean) => {
    const result = generateDraftsForLeads(leads, session, templates, { overwriteEdited });
    await onLeadsChange(result.leads);
    await onDraftsGenerated(result.generated, result.preserved);
    setConfirmOverwrite(false);
  };

  const values = previewLead ? tokenValues(previewLead, session) : {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Follow-up templates</h2>
            <p className="text-xs text-slate-500">
              One per tier. Drafts are rendered from these — no AI, so what you write is exactly
              what goes out.
            </p>
          </div>
          <span className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={leads.length === 0} onClick={() => void generate(false)}>
              Generate all drafts
            </Button>
            {editedCount > 0 ? (
              <Button
                variant="danger"
                disabled={leads.length === 0}
                onClick={() => setConfirmOverwrite(true)}
              >
                Regenerate including {editedCount} edited
              </Button>
            ) : null}
          </span>
        </CardHeader>
        <CardBody className="space-y-4">
          {editedCount > 0 ? (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              {editedCount} draft{editedCount === 1 ? " has" : "s have"} been edited by hand.
              &ldquo;Generate all drafts&rdquo; leaves those alone.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setActiveId(template.id)}
                className={
                  template.id === active.id
                    ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
                }
              >
                {template.tier === "all" ? "All tiers" : LEAD_TIER_LABELS[template.tier]}
              </button>
            ))}
            <Badge>{active.deliveryModeVariant.replace("_", " ")}</Badge>
          </div>

          <label className="block text-xs text-slate-600">
            Subject
            <TextInput
              className="mt-1"
              value={active.subjectTemplate}
              onChange={(e) => patch({ subjectTemplate: e.target.value })}
            />
          </label>

          <label className="block text-xs text-slate-600">
            Body
            <TextArea
              className="mt-1 font-mono text-xs"
              rows={14}
              value={active.bodyTemplate}
              onChange={(e) => patch({ bodyTemplate: e.target.value })}
            />
          </label>

          <p className="text-xs text-slate-500">
            Merge tokens:{" "}
            {MERGE_TOKENS.map((token) => (
              <code key={token} className="mr-1 rounded bg-slate-100 px-1">{`{{${token}}}`}</code>
            ))}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900">Preview</h2>
          {leads.length > 0 ? (
            <Select
              className="w-64"
              aria-label="Preview lead"
              value={previewLeadId}
              onChange={(e) => setPreviewLeadId(e.target.value)}
            >
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.contact.fullName ?? lead.contact.email ?? lead.id.slice(0, 8)} ({lead.tier})
                </option>
              ))}
            </Select>
          ) : null}
        </CardHeader>
        <CardBody>
          {previewLead ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">
                {renderTemplate(active.subjectTemplate, values)}
              </p>
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800">
                {renderTemplate(active.bodyTemplate, values)}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Import some leads to preview a draft.</p>
          )}
        </CardBody>
      </Card>

      {confirmOverwrite ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">Overwrite edited drafts?</h2>
            <p className="mt-1 text-sm text-slate-600">
              {editedCount} draft{editedCount === 1 ? "" : "s"} you edited by hand will be replaced
              with freshly generated copy. This can&rsquo;t be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setConfirmOverwrite(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => void generate(true)}>
                Overwrite them
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
