"use client";

import { useActionState, useState } from "react";
import { Badge, Button, Select } from "@event-toolkit/ui";
import { ROLES, ROLE_LABELS, canRemoveMember, type Role } from "@event-toolkit/access";
import { changeRoleAction, removeMemberAction, type ActionState } from "./actions";

interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
}

export function MemberRow({
  workspaceId,
  member,
  canManage,
  isSelf,
  isLastOwner,
  actorRole,
}: {
  workspaceId: string;
  member: Member;
  canManage: boolean;
  isSelf: boolean;
  isLastOwner: boolean;
  actorRole: Role;
}) {
  const [roleState, roleAction, rolePending] = useActionState<ActionState, FormData>(changeRoleAction, {});
  const [removeState, removeFormAction, removePending] = useActionState<ActionState, FormData>(
    removeMemberAction,
    {},
  );
  const [confirming, setConfirming] = useState(false);

  // The server decides all of this too — these are the same rules, applied early so the UI does
  // not offer an action that is going to be refused.
  const mayRemove = canManage && !isLastOwner && canRemoveMember(actorRole, member.role);
  const mayChangeRole = canManage && !isLastOwner && (member.role !== "owner" || actorRole === "owner");

  return (
    <li className="space-y-2 px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-content">
            {member.name ?? member.email}
            {isSelf ? <span className="ml-2 text-xs font-normal text-content-muted">you</span> : null}
          </p>
          {member.name ? <p className="text-xs text-content-muted">{member.email}</p> : null}
        </div>

        <div className="flex items-center gap-2">
          {mayChangeRole ? (
            <form action={roleAction} className="flex items-center gap-2">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="userId" value={member.userId} />
              <Select
                name="role"
                defaultValue={member.role}
                aria-label={`Role for ${member.email}`}
                disabled={rolePending}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </form>
          ) : (
            <Badge>{ROLE_LABELS[member.role]}</Badge>
          )}

          {mayRemove ? (
            <Button size="sm" variant="danger" onClick={() => setConfirming((v) => !v)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      {isLastOwner ? (
        <p className="text-xs text-content-muted">
          The last owner can&rsquo;t be removed or demoted. Make somebody else an owner first.
        </p>
      ) : null}

      {confirming ? (
        <form
          action={removeFormAction}
          className="space-y-2 rounded-lg bg-danger-subtle px-3 py-3 ring-1 ring-inset ring-danger-border"
        >
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="userId" value={member.userId} />
          <p className="text-sm text-danger-text">
            Remove <span className="font-medium">{member.email}</span>? They lose access to every
            event in this workspace immediately, and any sign-in they have open will stop working.
          </p>
          {/* FR-7 requires this said plainly rather than implied. The product cannot wipe someone
              else's laptop, and pretending otherwise is the kind of reassurance that gets repeated
              to a legal team as fact. */}
          <p className="text-xs text-danger-text">
            Anything already downloaded to their own devices is cleared the next time they open the
            app there. It can&rsquo;t be erased remotely before that.
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="danger" disabled={removePending}>
              {removePending ? "Removing…" : "Yes, remove them"}
            </Button>
            <Button type="button" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {roleState.error ? <p className="text-sm text-danger-text">{roleState.error}</p> : null}
      {removeState.error ? <p className="text-sm text-danger-text">{removeState.error}</p> : null}
      {roleState.ok ? <p className="text-xs text-success-text">{roleState.ok}</p> : null}
      {removeState.ok ? <p className="text-xs text-success-text">{removeState.ok}</p> : null}
    </li>
  );
}
