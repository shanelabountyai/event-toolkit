"use client";

import { useActionState, useState } from "react";
import { Button, Card, CardBody, CardHeader, Field, TextInput } from "@event-toolkit/ui";
import { deleteAction, exportAction, searchAction, type PrivacyState } from "./actions";

export function SubjectTool({ workspaceId, canDelete }: { workspaceId: string; canDelete: boolean }) {
  const [state, formAction, pending] = useActionState<PrivacyState, FormData>(searchAction, {});
  const [exportState, exportFormAction, exporting] = useActionState<PrivacyState, FormData>(exportAction, {});
  const [deleteState, deleteFormAction, deleting] = useActionState<PrivacyState, FormData>(deleteAction, {});
  const [confirming, setConfirming] = useState(false);

  const email = state.email ?? "";
  const hits = state.hits ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-content">Find someone</h2>
        </CardHeader>
        <CardBody>
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <Field label="Their email address" htmlFor="subject-email" className="min-w-64 flex-1">
              <TextInput id="subject-email" name="email" type="email" required placeholder="attendee@company.com" />
            </Field>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Searching…" : "Search"}
            </Button>
          </form>
          {state.error ? <p role="alert" className="mt-2 text-sm text-danger-text">{state.error}</p> : null}
          {/* Stated once here: searching is itself a read of personal data and is recorded. */}
          <p className="mt-2 text-xs text-content-muted">
            Every search is recorded in the workspace&rsquo;s access log, including who ran it.
          </p>
        </CardBody>
      </Card>

      {state.email ? (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-content">
              {hits.length === 0 ? "Nothing found" : `${hits.length} record${hits.length === 1 ? "" : "s"}`}
            </h2>
            <span className="text-xs text-content-muted">{email}</span>
          </CardHeader>

          {hits.length === 0 ? (
            <CardBody>
              <p className="text-sm text-content-muted">
                This workspace holds nothing about that address. If they were told otherwise, it may
                be in a different workspace, or already deleted.
              </p>
            </CardBody>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {hits.map((hit) => (
                  <li key={`${hit.kind}:${hit.documentId}`} className="space-y-1.5 px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-content">{hit.label}</p>
                      {hit.sensitivity === "third_party_personal" ? (
                        <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[11px] font-medium text-warning-text">
                          Third-party personal data
                        </span>
                      ) : null}
                    </div>
                    <dl className="grid gap-x-3 text-xs sm:grid-cols-[minmax(0,10rem)_1fr]">
                      {Object.entries(hit.fields).map(([path, values]) => (
                        <div key={path} className="contents">
                          <dt className="text-content-muted">{path}</dt>
                          <dd className="break-words text-content">
                            {values.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>

              <CardBody className="flex flex-wrap gap-2 border-t border-line">
                <form action={exportFormAction}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="email" value={email} />
                  <Button type="submit" disabled={exporting}>
                    {exporting ? "Preparing…" : "Export as JSON"}
                  </Button>
                </form>

                {canDelete ? (
                  <Button variant="danger" onClick={() => setConfirming((v) => !v)}>
                    Delete everything about them
                  </Button>
                ) : null}
              </CardBody>
            </>
          )}
        </Card>
      ) : null}

      {exportState.exported ? (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-content">Export</h2>
            <a
              href={`data:application/json;charset=utf-8,${encodeURIComponent(exportState.exported)}`}
              download={`subject-access-${exportState.email}.json`}
              className="text-sm font-medium text-content underline underline-offset-2"
            >
              Download
            </a>
          </CardHeader>
          <CardBody>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-sunken p-3 text-[11px] text-content-muted">
              {exportState.exported}
            </pre>
          </CardBody>
        </Card>
      ) : null}

      {confirming && canDelete ? (
        <Card>
          <CardBody>
            <form action={deleteFormAction} className="space-y-3 rounded-lg bg-danger-subtle p-3 ring-1 ring-inset ring-danger-border">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="email" value={email} />
              <p className="text-sm text-danger-text">
                This removes every record above, permanently, across every tool. Records that are
                about something else and merely name them — a pipeline deal, an event brief — keep
                the record and lose the person.
              </p>
              {/* Typing the address is the confirmation. A checkbox is clicked by muscle memory. */}
              <Field label={`Type ${email} to confirm`} htmlFor="confirm-email">
                <TextInput id="confirm-email" name="confirmEmail" required autoComplete="off" />
              </Field>
              {deleteState.error ? <p role="alert" className="text-sm text-danger-text">{deleteState.error}</p> : null}
              <Button type="submit" variant="danger" disabled={deleting}>
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {deleteState.deleted ? (
        <Card>
          <CardBody className="space-y-2">
            <p className="text-sm font-medium text-content">
              Deleted {deleteState.deleted.deletedRecords} record
              {deleteState.deleted.deletedRecords === 1 ? "" : "s"}
              {deleteState.deleted.erasedFields > 0
                ? `, and removed their details from ${deleteState.deleted.erasedFields} more.`
                : "."}
            </p>
            <p className="text-sm text-content-muted">{deleteState.deleted.note}</p>
            <p className="text-xs text-content-muted">
              Devices that already synced will drop their copies on their next sync.
            </p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
