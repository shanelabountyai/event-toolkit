// packages/lead-triage-core/src/templates.ts
//
// FR-8 — follow-up drafts. Deterministic merge-token rendering, no LLM, same convention the
// rest of the suite uses.
//
// The rule that matters: regenerating never silently overwrites a draft the planner edited.

import { newId, nowIso, type EventBrief } from "@event-toolkit/schema";
import type {
  FollowUpDraft,
  FollowUpTemplate,
  LeadRecord,
  LeadTier,
  TemplateVariant,
  TriageSession,
} from "./types";
import { contactName } from "./dedupe";

/** Anything a template may reference. Unknown tokens are left visible rather than blanked. */
export const MERGE_TOKENS = [
  "first_name",
  "last_name",
  "full_name",
  "company",
  "job_title",
  "event_name",
  "sessions_attended",
  "booth_interactions",
  "owner_name",
  "tier",
] as const;

const TIER_COPY: Record<LeadTier, { subject: string; opener: string; ask: string }> = {
  hot: {
    subject: "Following up on your demo request at {{event_name}}",
    opener:
      "Thanks for stopping by at {{event_name}} and asking for a demo — I wanted to get you something concrete while it's fresh.",
    ask: "Are you free for 30 minutes this week or next? I'll tailor it to what {{company}} is working on.",
  },
  warm: {
    subject: "Great to meet you at {{event_name}}",
    opener:
      "Thanks for spending time with us at {{event_name}} — it was good to talk about what {{company}} is working on.",
    ask: "Would a short call be useful? Happy to go deeper on anything that caught your interest.",
  },
  cold: {
    subject: "Thanks for visiting us at {{event_name}}",
    opener: "Thanks for stopping by our booth at {{event_name}}.",
    ask: "If it's ever useful, I'm around — just reply to this email.",
  },
};

const VARIANT_LINE: Record<TemplateVariant, string> = {
  in_person: "It was good to meet you in person.",
  virtual: "Sorry we couldn't meet in person — glad you could join us online.",
  hybrid: "Whether you joined us on site or online, thanks for being part of it.",
  generic: "",
};

/**
 * A starter template per tier, for a given delivery-mode variant. The planner edits these;
 * they exist so nobody starts from a blank box at 6pm on the day the event ends.
 */
export function defaultTemplates(
  triageSessionId: string,
  variant: TemplateVariant = "generic",
): FollowUpTemplate[] {
  const timestamp = nowIso();
  return (["hot", "warm", "cold"] as LeadTier[]).map((tier) => {
    const copy = TIER_COPY[tier];
    const variantLine = VARIANT_LINE[variant];
    const body = [
      "Hi {{first_name}},",
      "",
      copy.opener,
      ...(variantLine ? ["", variantLine] : []),
      ...(tier === "hot" || tier === "warm"
        ? ["", "From what you saw at the event ({{sessions_attended}}), I think the most useful next step is a walkthrough of how this would work for {{company}}."]
        : []),
      "",
      copy.ask,
      "",
      "Best,",
      "{{owner_name}}",
    ].join("\n");

    return {
      id: newId(),
      triageSessionId,
      tier,
      deliveryModeVariant: variant,
      subjectTemplate: copy.subject,
      bodyTemplate: body,
      updatedAt: timestamp,
    };
  });
}

/** The delivery-mode variant to use for a session, from its linked brief. */
export function variantForBrief(brief: EventBrief | null): TemplateVariant {
  const mode = brief?.format?.deliveryMode;
  if (mode === "virtual") return "virtual";
  if (mode === "hybrid") return "hybrid";
  if (mode === "in_person") return "in_person";
  return "generic";
}

/** Values for every merge token, given a lead and its session. */
export function tokenValues(lead: LeadRecord, session: TriageSession): Record<string, string> {
  const name = contactName(lead.contact);
  const [derivedFirst, ...derivedRest] = name.split(" ");
  return {
    first_name: lead.contact.firstName?.trim() || derivedFirst || "there",
    last_name: lead.contact.lastName?.trim() || derivedRest.join(" ") || "",
    full_name: name || "there",
    company: lead.contact.company?.trim() || "your team",
    job_title: lead.contact.jobTitle?.trim() || "",
    event_name: session.eventName || "the event",
    sessions_attended:
      lead.signals.sessionsAttended.length > 0
        ? lead.signals.sessionsAttended.join(", ")
        : "the sessions you joined",
    booth_interactions: String(lead.signals.boothInteractions ?? 0),
    owner_name: lead.ownerName?.trim() || "the team",
    tier: lead.tier,
  };
}

/**
 * Replace `{{token}}` occurrences. An unknown token is left as-is rather than blanked —
 * a visible `{{whatever}}` in a preview is a typo the planner can fix; a silent empty string
 * is a broken email nobody notices until it's sent.
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, token: string) => {
    const key = token.toLowerCase();
    return key in values ? values[key] : match;
  });
}

/** Pick the template for a lead: exact tier first, then an "all"-tier fallback. */
export function templateForLead(
  lead: LeadRecord,
  templates: FollowUpTemplate[],
): FollowUpTemplate | null {
  return (
    templates.find((t) => t.tier === lead.tier) ?? templates.find((t) => t.tier === "all") ?? null
  );
}

export function generateDraft(
  lead: LeadRecord,
  session: TriageSession,
  templates: FollowUpTemplate[],
): FollowUpDraft | null {
  const template = templateForLead(lead, templates);
  if (!template) return null;
  const values = tokenValues(lead, session);
  return {
    templateId: template.id,
    subject: renderTemplate(template.subjectTemplate, values),
    body: renderTemplate(template.bodyTemplate, values),
    generatedAt: nowIso(),
    edited: false,
  };
}

export interface GenerateDraftsResult {
  leads: LeadRecord[];
  generated: number;
  /** Drafts left alone because the planner had edited them. */
  preserved: number;
}

/**
 * FR-8 — bulk generation. An edited draft is preserved unless `overwriteEdited` is explicitly
 * set, which is the "yes, I really mean it" path behind a confirmation in the UI.
 */
export function generateDraftsForLeads(
  leads: LeadRecord[],
  session: TriageSession,
  templates: FollowUpTemplate[],
  options: { overwriteEdited?: boolean; onlyLeadIds?: string[] } = {},
): GenerateDraftsResult {
  let generated = 0;
  let preserved = 0;

  const next = leads.map((lead) => {
    if (options.onlyLeadIds && !options.onlyLeadIds.includes(lead.id)) return lead;

    if (lead.followUpDraft?.edited && !options.overwriteEdited) {
      preserved += 1;
      return lead;
    }

    const draft = generateDraft(lead, session, templates);
    if (!draft) return lead;
    generated += 1;
    return {
      ...lead,
      followUpDraft: draft,
      // FR-9: drafting advances a routed lead, but never regresses one already worked.
      status: (lead.status === "contacted" || lead.status === "closed"
        ? lead.status
        : "draft_ready") as LeadRecord["status"],
      updatedAt: nowIso(),
    };
  });

  return { leads: next, generated, preserved };
}

/** Record a planner's manual edit, marking the draft protected from regeneration. */
export function applyDraftEdit(lead: LeadRecord, subject: string, body: string): LeadRecord {
  const existing = lead.followUpDraft;
  if (!existing) return lead;
  return {
    ...lead,
    followUpDraft: {
      ...existing,
      subject,
      body,
      edited: true,
      editedAt: nowIso(),
    },
    updatedAt: nowIso(),
  };
}
