"use server";

import { deleteSubject, exportSubject, getDb, searchSubject } from "@event-toolkit/server-db";
import { PermissionError } from "@event-toolkit/access";
import { accessContextFor } from "@/lib/session";

export interface SubjectHitView {
  kind: string;
  label: string;
  documentId: string;
  sensitivity: string;
  fields: Record<string, unknown[]>;
}

export interface PrivacyState {
  email?: string;
  hits?: SubjectHitView[];
  exported?: string;
  deleted?: { deletedRecords: number; erasedFields: number; note: string };
  error?: string;
}

async function contextFor(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const ctx = workspaceId ? await accessContextFor(workspaceId) : null;
  if (!ctx?.role) throw new PermissionError("leads:view");
  return ctx;
}

function emailFrom(formData: FormData): string {
  return String(formData.get("email") ?? "").trim().toLowerCase();
}

export async function searchAction(_prev: PrivacyState, formData: FormData): Promise<PrivacyState> {
  const email = emailFrom(formData);
  if (!email) return { error: "Enter the person's email address." };

  try {
    const ctx = await contextFor(formData);
    const hits = await searchSubject(getDb(), ctx, email);
    return { email, hits: hits.map((h) => ({ ...h, fields: h.extract.fields })) };
  } catch (error) {
    if (error instanceof PermissionError) {
      // Gated on leads:view, not members:manage. An admin who cannot read attendee data must not
      // reach it through this screen.
      return { error: "Your role doesn't include access to attendee data." };
    }
    console.error("subject search failed", error);
    return { error: "The search failed." };
  }
}

export async function exportAction(_prev: PrivacyState, formData: FormData): Promise<PrivacyState> {
  const email = emailFrom(formData);
  try {
    const ctx = await contextFor(formData);
    const data = await exportSubject(getDb(), ctx, email);
    return { email, exported: JSON.stringify(data, null, 2) };
  } catch (error) {
    if (error instanceof PermissionError) return { error: "Your role doesn't include access to attendee data." };
    console.error("subject export failed", error);
    return { error: "The export failed." };
  }
}

export async function deleteAction(_prev: PrivacyState, formData: FormData): Promise<PrivacyState> {
  const email = emailFrom(formData);
  // Typing the address is the confirmation. A checkbox is clicked by muscle memory; this is a
  // hard, irreversible deletion across every tool.
  if (emailFrom(formData) !== String(formData.get("confirmEmail") ?? "").trim().toLowerCase()) {
    return { email, error: "Type the address again to confirm." };
  }

  try {
    const ctx = await contextFor(formData);
    const result = await deleteSubject(getDb(), ctx, email);
    return { email, deleted: result };
  } catch (error) {
    if (error instanceof PermissionError) return { error: "Your role doesn't include deleting attendee data." };
    console.error("subject deletion failed", error);
    return { error: "The deletion failed." };
  }
}
