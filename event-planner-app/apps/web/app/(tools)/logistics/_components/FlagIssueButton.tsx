"use client";

/**
 * FR-10 — the "Flag an issue" affordance that lives in EVERY artifact header, not just the
 * Issue Log. On site, the moment you notice something is the moment you have to be able to
 * record it; only description and severity are required.
 */

import { useState } from "react";
import {
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABELS,
  newIssue,
  type IssueSeverity,
  type LogisticsPack,
  type RelatedArtifact,
} from "@event-toolkit/logistics";
import { Button, Field, Select, TextArea, TextInput } from "@event-toolkit/ui";

export function FlagIssueButton({
  artifact,
  onLog,
}: {
  artifact: RelatedArtifact;
  onLog: (updater: (prev: LogisticsPack) => LogisticsPack) => void;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<IssueSeverity>("medium");
  const [loggedBy, setLoggedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState(false);

  const submit = () => {
    if (!description.trim()) {
      setError("Describe what happened.");
      return;
    }
    onLog((prev) => ({
      ...prev,
      issueLog: [
        ...prev.issueLog,
        newIssue({
          description: description.trim(),
          severity,
          loggedBy: loggedBy.trim() || undefined,
          relatedArtifact: artifact,
        }),
      ],
    }));
    setDescription("");
    setLoggedBy("");
    setSeverity("medium");
    setError(null);
    setOpen(false);
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 2500);
  };

  return (
    <>
      <Button size="sm" variant="danger" className="no-print" onClick={() => setOpen(true)}>
        {justLogged ? "Issue logged" : "Flag an issue"}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="flag-issue-title"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="flag-issue-title" className="text-base font-semibold text-slate-900">
                Flag an issue
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Only a description and severity are needed — fill in the rest later.
              </p>
            </div>

            <div className="space-y-3 px-5 py-4">
              <Field label="What happened" htmlFor="issue-description" required error={error}>
                <TextArea
                  id="issue-description"
                  autoFocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  invalid={Boolean(error)}
                  placeholder="Registration scanner keeps disconnecting"
                />
              </Field>
              <Field label="Severity" htmlFor="issue-severity" required>
                <Select
                  id="issue-severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
                >
                  {ISSUE_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {ISSUE_SEVERITY_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Logged by" htmlFor="issue-by" hint="Optional.">
                <TextInput
                  id="issue-by"
                  value={loggedBy}
                  onChange={(e) => setLoggedBy(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit}>
                Log issue
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
