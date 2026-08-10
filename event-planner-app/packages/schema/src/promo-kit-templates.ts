// packages/schema/src/promo-kit-templates.ts
//
// Template-based copy generation for PRD 2. Pure functions: an `EventBrief` goes in, a
// `PromoAsset[]` comes out. No LLM call, no network request, no React, no DOM.
//
// Two rules this file lives by:
//   1. Branch, don't just interpolate. Delivery mode and event type change the wording, not
//      just the nouns dropped into it — copy that reads as if it were written for a virtual
//      webinar is the whole point of generating it from the brief.
//   2. Never emit a raw token. Every optional field degrades to a documented placeholder, so
//      the worst case is copy with an obvious "[to be confirmed]" to fill in, not "{{venue}}".
//
// Dates are formatted with fixed English month names rather than `toLocaleDateString` so the
// output is byte-identical regardless of the machine's locale.

import { newId, todayIsoDate } from "./ids";
import type { EventBrief, EventType, FormatMode } from "./event-brief";
import {
  EMAIL_STEPS,
  PLACEHOLDER,
  computeEmailSendDates,
  parseIsoDate,
  type PromoAsset,
  type SocialChannel,
} from "./promo-kit";

/** Stand-in for the registration URL, which the Event Brief schema deliberately doesn't hold. */
export const REGISTRATION_LINK_PLACEHOLDER = "[registration link]";

/** Practical hard ceiling for an X post. */
export const X_MAX_CHARS = 280;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "12 March 2026" — locale-independent so generated copy is deterministic. */
function formatHumanDate(iso: string | undefined | null): string {
  const d = iso ? parseIsoDate(iso) : null;
  if (!d) return PLACEHOLDER;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "12 Mar" — the compact form used inside length-constrained social copy. */
function formatShortDate(iso: string | undefined | null): string {
  const d = iso ? parseIsoDate(iso) : null;
  if (!d) return PLACEHOLDER;
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** First non-empty string, else the placeholder. Keeps every template one-liner safe. */
function pick(...candidates: Array<string | undefined | null>): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return PLACEHOLDER;
}

/** Wording that changes with the kind of event being promoted. */
interface TypeVoice {
  /** "conference", "webinar", "booth" — the noun used in running copy. */
  noun: string;
  /** "Join us at", "Join us for", "Meet us at". */
  joinVerb: string;
  /** Primary call to action. */
  cta: string;
  /** Headline verb phrase for the landing page. */
  headlineLead: string;
}

const TYPE_VOICE: Record<EventType, TypeVoice> = {
  conference: {
    noun: "conference",
    joinVerb: "Join us at",
    cta: "Register now",
    headlineLead: "Join us at",
  },
  webinar: {
    noun: "webinar",
    joinVerb: "Join us for",
    cta: "Save your seat",
    headlineLead: "A live webinar:",
  },
  trade_show: {
    noun: "booth",
    joinVerb: "Meet us at",
    cta: "Book a time with us",
    headlineLead: "Meet us at",
  },
  custom: {
    noun: "event",
    joinVerb: "Join us for",
    cta: "Register now",
    headlineLead: "Join us for",
  },
};

/** The brief facts every template draws on, resolved once with placeholders already applied. */
interface BriefFacts {
  name: string;
  voice: TypeVoice;
  mode: FormatMode;
  /** Full sentence describing where it happens, branched on delivery mode. */
  locationLine: string;
  /** Compact location for social/subject lines. */
  locationShort: string;
  dateLong: string;
  dateShort: string;
  dateRange: string;
  objective: string;
  audience: string;
  /** Up to three supporting objectives, used as "what you'll get" bullets. */
  benefits: string[];
  /** Persona labels, used to address the reader. */
  personas: string[];
  timezone: string;
}

function resolveFacts(brief: EventBrief): BriefFacts {
  const voice = TYPE_VOICE[brief.type] ?? TYPE_VOICE.custom;
  const mode: FormatMode = brief.format?.deliveryMode ?? "in_person";
  const venue = brief.format?.venueOrPlatform;
  const venueName = venue?.name?.trim();
  const venueWhere = venue?.locationOrUrl?.trim();

  // Branch the logistics line on delivery mode — the single most visible signal that this
  // copy was generated from this brief and not a generic template.
  let locationLine: string;
  let locationShort: string;
  switch (mode) {
    case "virtual":
      locationLine = venueName
        ? `Online via ${venueName} — your join link is included in your confirmation email.`
        : "Online — your join link is included in your confirmation email.";
      locationShort = "online";
      break;
    case "hybrid":
      locationLine = venueName
        ? `In person at ${venueName}${venueWhere ? `, ${venueWhere}` : ""} — and streamed online, with the join link included in your confirmation email.`
        : `In person at ${PLACEHOLDER} — and streamed online, with the join link included in your confirmation email.`;
      locationShort = venueName ? `${venueName} + online` : "in person + online";
      break;
    case "in_person":
    default:
      locationLine = venueName
        ? `In person at ${venueName}${venueWhere ? `, ${venueWhere}` : ""}.`
        : `In person — venue ${PLACEHOLDER}.`;
      locationShort = venueName ?? PLACEHOLDER;
      break;
  }

  const start = brief.dates?.eventStartDate;
  const end = brief.dates?.eventEndDate;
  const dateRange =
    end && start && end !== start
      ? `${formatHumanDate(start)} – ${formatHumanDate(end)}`
      : formatHumanDate(start);

  return {
    name: pick(brief.name),
    voice,
    mode,
    locationLine,
    locationShort,
    dateLong: formatHumanDate(start),
    dateShort: formatShortDate(start),
    dateRange,
    objective: pick(brief.goals?.primaryObjective),
    audience: pick(brief.audience?.description),
    benefits: (brief.goals?.objectives ?? [])
      .map((o) => o?.trim())
      .filter((o): o is string => Boolean(o))
      .slice(0, 3),
    personas: (brief.audience?.targetPersonas ?? [])
      .map((p) => p?.name?.trim())
      .filter((n): n is string => Boolean(n))
      .slice(0, 3),
    timezone: pick(brief.dates?.timezone),
  };
}

/** Bullet list from the brief's supporting objectives, with a sane fallback when empty. */
function benefitBullets(facts: BriefFacts): string {
  if (facts.benefits.length === 0) {
    return `- ${facts.objective}`;
  }
  return facts.benefits.map((b) => `- ${b}`).join("\n");
}

/** "marketing and RevOps leaders" style address, falling back to the audience description. */
function addressee(facts: BriefFacts): string {
  if (facts.personas.length === 0) return facts.audience;
  if (facts.personas.length === 1) return facts.personas[0];
  return `${facts.personas.slice(0, -1).join(", ")} and ${facts.personas[facts.personas.length - 1]}`;
}

/**
 * Trim to X's ceiling on a word boundary.
 *
 * The templates are written short enough to fit; this is the guard that keeps a long event
 * name from silently shipping an over-length post.
 */
function clampForX(text: string): string {
  if (text.length <= X_MAX_CHARS) return text;
  const cut = text.slice(0, X_MAX_CHARS - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/* -------------------------------------------------------------------------- */
/* Landing page                                                               */
/* -------------------------------------------------------------------------- */

function landingPageBody(facts: BriefFacts, _toneKey: string): string {
  return [
    `# ${facts.voice.headlineLead} ${facts.name}`,
    "",
    `**${facts.dateRange}** · ${facts.locationShort}`,
    "",
    `## Why attend`,
    "",
    facts.objective,
    "",
    `## What you'll take away`,
    "",
    benefitBullets(facts),
    "",
    `## Who it's for`,
    "",
    `Built for ${addressee(facts)}.`,
    "",
    `## When and where`,
    "",
    `- **Date:** ${facts.dateRange}`,
    `- **Time zone:** ${facts.timezone}`,
    `- **Location:** ${facts.locationLine}`,
    "",
    `## ${facts.voice.cta}`,
    "",
    `Places are limited. ${facts.voice.cta} at ${REGISTRATION_LINK_PLACEHOLDER}.`,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Email sequence                                                             */
/* -------------------------------------------------------------------------- */

function emailBody(subtype: string, facts: BriefFacts, _toneKey: string): string {
  const signOff = `\n\n${facts.voice.cta}: ${REGISTRATION_LINK_PLACEHOLDER}`;
  const whenWhere = `**When:** ${facts.dateRange} (${facts.timezone})\n**Where:** ${facts.locationLine}`;

  switch (subtype) {
    case "invite":
      return [
        `Subject: ${facts.voice.joinVerb} ${facts.name} — ${facts.dateLong}`,
        "",
        `Hi {first_name},`,
        "",
        `${facts.objective}`,
        "",
        `That's why we're running ${facts.name}, a ${facts.voice.noun} built for ${addressee(facts)}.`,
        "",
        `What you'll take away:`,
        benefitBullets(facts),
        "",
        whenWhere,
        signOff.trim(),
      ].join("\n");

    case "reminder_1":
      return [
        `Subject: Still holding your place at ${facts.name}?`,
        "",
        `Hi {first_name},`,
        "",
        `${facts.name} is coming up on ${facts.dateLong}, and registrations are filling in.`,
        "",
        `A reminder of what's on the agenda:`,
        benefitBullets(facts),
        "",
        whenWhere,
        signOff.trim(),
      ].join("\n");

    case "reminder_2":
      return [
        `Subject: One week to ${facts.name}`,
        "",
        `Hi {first_name},`,
        "",
        `${facts.name} is one week out. If you've been meaning to register, now is the moment — we're close to capacity.`,
        "",
        whenWhere,
        "",
        `If a colleague on your team would get more from it, forward them this email.`,
        signOff.trim(),
      ].join("\n");

    case "last_chance":
      return [
        `Subject: Last chance to join ${facts.name}`,
        "",
        `Hi {first_name},`,
        "",
        `Registration for ${facts.name} closes shortly. This is the last email we'll send about it.`,
        "",
        whenWhere,
        signOff.trim(),
      ].join("\n");

    case "day_of":
    default:
      return [
        `Subject: Today: ${facts.name}`,
        "",
        `Hi {first_name},`,
        "",
        `${facts.name} starts today.`,
        "",
        whenWhere,
        "",
        `See you there — reply to this email if you have any trouble joining.`,
      ].join("\n");
  }
}

/* -------------------------------------------------------------------------- */
/* Social posts — one template per channel, not one post truncated three ways  */
/* -------------------------------------------------------------------------- */

type SocialSubtype = "announcement" | "mid_campaign" | "last_chance";

const SOCIAL_SUBTYPE_LABELS: Record<SocialSubtype, string> = {
  announcement: "Announcement",
  mid_campaign: "Mid-campaign",
  last_chance: "Last chance",
};

function socialBody(
  channel: SocialChannel,
  subtype: SocialSubtype,
  facts: BriefFacts,
  _toneKey: string,
): string {
  const where = facts.mode === "virtual" ? "Online" : facts.locationShort;

  if (channel === "x") {
    // Short by construction: X gets one line of hook, one of logistics, one CTA.
    const text =
      subtype === "announcement"
        ? `${facts.voice.joinVerb} ${facts.name} — ${facts.dateShort}, ${where}.\n\n${facts.objective}\n\n${facts.voice.cta}: ${REGISTRATION_LINK_PLACEHOLDER}`
        : subtype === "mid_campaign"
          ? `${facts.name} is coming up on ${facts.dateShort} (${where}).\n\nBuilt for ${addressee(facts)}.\n\n${facts.voice.cta}: ${REGISTRATION_LINK_PLACEHOLDER}`
          : `Last chance to join ${facts.name} — ${facts.dateShort}, ${where}. Registration closes soon.\n\n${REGISTRATION_LINK_PLACEHOLDER}`;
    return clampForX(text);
  }

  // LinkedIn and Facebook get room for context; LinkedIn skews professional, Facebook warmer.
  const opener =
    channel === "linkedin"
      ? subtype === "announcement"
        ? `We're running ${facts.name} on ${facts.dateLong}.`
        : subtype === "mid_campaign"
          ? `${facts.name} is a few weeks out, and the guest list is shaping up.`
          : `Final call: registration for ${facts.name} closes this week.`
      : subtype === "announcement"
        ? `Save the date — ${facts.name} is happening on ${facts.dateLong}!`
        : subtype === "mid_campaign"
          ? `Not long now until ${facts.name}.`
          : `Last chance to grab a place at ${facts.name}.`;

  return [
    opener,
    "",
    facts.objective,
    "",
    channel === "linkedin" ? `What attendees will take away:` : `Here's what we'll cover:`,
    benefitBullets(facts),
    "",
    `📅 ${facts.dateRange}`,
    `📍 ${facts.locationLine}`,
    `👥 Built for ${addressee(facts)}`,
    "",
    `${facts.voice.cta}: ${REGISTRATION_LINK_PLACEHOLDER}`,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Sales outreach                                                             */
/* -------------------------------------------------------------------------- */

const SALES_SNIPPETS: Array<{ subtype: string; label: string }> = [
  { subtype: "email_snippet", label: "Personal email snippet" },
  { subtype: "linkedin_dm", label: "LinkedIn DM" },
  { subtype: "call_script", label: "Call / voicemail script" },
];

function salesBody(subtype: string, facts: BriefFacts, _toneKey: string): string {
  switch (subtype) {
    case "email_snippet":
      return [
        `Subject: Worth 30 seconds — ${facts.name}`,
        "",
        `Hi {first_name},`,
        "",
        `We're hosting ${facts.name} on ${facts.dateLong}. ${facts.locationLine}`,
        "",
        `I thought of you because ${facts.objective.charAt(0).toLowerCase()}${facts.objective.slice(1)}`,
        "",
        `Want me to hold you a place? Details here: ${REGISTRATION_LINK_PLACEHOLDER}`,
      ].join("\n");

    case "linkedin_dm":
      return [
        `Hi {first_name} — we're running ${facts.name} on ${facts.dateShort}. ${facts.locationLine}`,
        "",
        `It's built for ${addressee(facts)}, so it felt relevant to you. Happy to save you a spot — here's the detail: ${REGISTRATION_LINK_PLACEHOLDER}`,
      ].join("\n");

    case "call_script":
    default:
      return [
        `**Opening**`,
        `"Hi {first_name}, it's {your_name} from {company}. Quick one — we're running ${facts.name} on ${facts.dateLong}."`,
        "",
        `**The hook**`,
        `"${facts.objective}"`,
        "",
        `**The logistics**`,
        `"${facts.locationLine}"`,
        "",
        `**The ask**`,
        `"Can I put your name down? I'll send the details straight over."`,
        "",
        `**If they're not the right person**`,
        `"No problem — who on your team owns this? Happy to reach out to them instead."`,
        "",
        `**Voicemail version**`,
        `"Hi {first_name}, {your_name} from {company}. We're running ${facts.name} on ${facts.dateShort} — I'll email you the detail. ${REGISTRATION_LINK_PLACEHOLDER}"`,
      ].join("\n");
  }
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

/** Every asset starts unedited, with `currentBody` mirroring the generated snapshot. */
function makeAsset(partial: Omit<PromoAsset, "currentBody" | "editDistancePct" | "isEdited">): PromoAsset {
  return {
    ...partial,
    currentBody: partial.generatedBody,
    editDistancePct: 0,
    isEdited: false,
  };
}

/**
 * The 18 promo assets for a brief: 1 landing page + 5 emails + 9 social (3 channels ×
 * 3 subtypes) + 3 sales snippets.
 *
 * @param toneKey Reserved for future brand-voice variants. Only "neutral_professional" ships
 *   in v1, but every template takes the parameter so adding tones later is a template change
 *   rather than a restructure.
 * @param today   Injectable "today" so send-date compression is testable without mocking the clock.
 */
export function generatePromoAssets(
  brief: EventBrief,
  toneKey: string = "neutral_professional",
  today: string = todayIsoDate(),
): PromoAsset[] {
  const facts = resolveFacts(brief);
  const assets: PromoAsset[] = [];

  // 1 — Landing page
  assets.push(
    makeAsset({
      id: newId(),
      type: "landing_page",
      label: "Event landing page",
      generatedBody: landingPageBody(facts, toneKey),
    }),
  );

  // 5 — Email sequence, with send dates compressed into whatever runway is left
  const sendDates = computeEmailSendDates(brief.dates?.eventStartDate ?? "", today);
  EMAIL_STEPS.forEach((step, i) => {
    assets.push(
      makeAsset({
        id: newId(),
        type: "email",
        subtype: step.subtype,
        label: `Email ${i + 1} — ${step.label}`,
        suggestedSendDate: sendDates[i],
        generatedBody: emailBody(step.subtype, facts, toneKey),
      }),
    );
  });

  // 9 — Social, per channel per campaign stage
  const channels: SocialChannel[] = ["linkedin", "x", "facebook"];
  const socialSubtypes: SocialSubtype[] = ["announcement", "mid_campaign", "last_chance"];
  for (const channel of channels) {
    for (const subtype of socialSubtypes) {
      assets.push(
        makeAsset({
          id: newId(),
          type: "social",
          subtype,
          channel,
          label: `${channel === "x" ? "X" : channel === "linkedin" ? "LinkedIn" : "Facebook"} — ${SOCIAL_SUBTYPE_LABELS[subtype]}`,
          generatedBody: socialBody(channel, subtype, facts, toneKey),
        }),
      );
    }
  }

  // 3 — Sales outreach
  for (const snippet of SALES_SNIPPETS) {
    assets.push(
      makeAsset({
        id: newId(),
        type: "sales_outreach",
        subtype: snippet.subtype,
        label: snippet.label,
        generatedBody: salesBody(snippet.subtype, facts, toneKey),
      }),
    );
  }

  return assets;
}

/** Total number of assets a full generation produces. Asserted by the smoke check. */
export const EXPECTED_ASSET_COUNT = 18;
