"use client";

import { useActionState, useState } from "react";
import { Button, Card, CardBody, CardHeader, Field, Select } from "@event-toolkit/ui";
import { createShareLinkAction, revokeShareLinkAction, type ShareState } from "./actions";

interface Pack {
  id: string;
  links: { id: string; token: string; expiresAt: string; revoked: boolean }[];
}

export function ShareLinkManager({
  workspaceId,
  packs,
  canManage,
}: {
  workspaceId: string;
  packs: Pack[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {packs.map((pack) => (
        <Card key={pack.id}>
          <CardHeader>
            <h2 className="text-sm font-semibold text-content">Event {pack.id.slice(0, 8)}</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            {pack.links.length > 0 ? (
              <ul className="space-y-2">
                {pack.links.map((link) => (
                  <LinkRow key={link.id} workspaceId={workspaceId} link={link} canManage={canManage} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-content-muted">No links yet.</p>
            )}
            {canManage ? <CreateForm workspaceId={workspaceId} packId={pack.id} /> : null}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function CreateForm({ workspaceId, packId }: { workspaceId: string; packId: string }) {
  const [state, formAction, pending] = useActionState<ShareState, FormData>(createShareLinkAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="packId" value={packId} />
      <Field label="Works for" htmlFor={`days-${packId}`}>
        {/* Defaults to 3 days: the event plus the two days FR-8 names, which covers teardown
            without leaving a working link in an inbox for a month. */}
        <Select id={`days-${packId}`} name="days" defaultValue="3">
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create link"}
      </Button>
      {state.error ? <p className="text-sm text-danger-text">{state.error}</p> : null}
    </form>
  );
}

function LinkRow({
  workspaceId,
  link,
  canManage,
}: {
  workspaceId: string;
  link: { id: string; token: string; expiresAt: string; revoked: boolean };
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<ShareState, FormData>(revokeShareLinkAction, {});
  const [copied, setCopied] = useState(false);
  const expires = new Date(link.expiresAt);
  const dead = link.revoked || expires <= new Date();
  const url = typeof window !== "undefined" ? `${window.location.origin}/share/${link.token}` : "";

  return (
    <li className="space-y-1.5 rounded-lg bg-surface-sunken px-3 py-2.5 ring-1 ring-inset ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs ${dead ? "text-content-muted" : "text-content-muted"}`}>
          {link.revoked
            ? "Turned off"
            : expires <= new Date()
              ? "Expired"
              : `Works until ${expires.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`}
        </span>
        <div className="flex gap-2">
          {!dead ? (
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          ) : null}
          {canManage && !dead ? (
            <form action={formAction}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="linkId" value={link.id} />
              <Button type="submit" size="sm" variant="danger" disabled={pending}>
                {pending ? "…" : "Turn off"}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
      {/* The URL is shown, not hidden behind a copy button alone: somebody sending this by text
          message needs to be able to see what they are about to send. */}
      {!dead ? <p className="break-all font-mono text-[11px] text-content-muted">{url}</p> : null}
      {state.error ? <p className="text-sm text-danger-text">{state.error}</p> : null}
    </li>
  );
}
