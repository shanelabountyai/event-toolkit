/**
 * The suite's tool registry.
 *
 * All seven PRDs are built. Every entry is live; the `available` flag drives both the global
 * nav and the brief view's "Launch a tool" links.
 * Names/roles follow the normative PRD table in `packages/schema/event-brief-schema.md`.
 */

export interface SuiteTool {
  key: string;
  prd: number;
  name: string;
  /** Route the "launch from brief" link points at; `?briefId=` is appended. */
  href: string;
  description: string;
  available: boolean;
}

export const SUITE_TOOLS: SuiteTool[] = [
  {
    key: "brief",
    prd: 1,
    name: "Event Brief Generator",
    href: "/brief",
    description: "Guided intake that turns a blank page into a structured, shareable event brief.",
    available: true,
  },
  {
    key: "promo",
    prd: 2,
    name: "Promo Campaign Kit",
    // /promo, not /promo/kit. Every other tool's nav entry is its list page; this one pointed at
    // a detail page, so clicking it with no brief chosen was a dead end that bounced you to the
    // brief list with no way back into promo. /promo picks an event and forwards to the kit.
    href: "/promo",
    description: "Landing page, email sequence, social and sales snippets generated from the brief.",
    available: true,
  },
  {
    key: "run-of-show",
    prd: 3,
    name: "Run-of-Show & Logistics Pack",
    href: "/logistics",
    description: "Run of show, staffing, shipping manifest and on-site contact sheet.",
    available: true,
  },
  {
    key: "budget",
    prd: 4,
    name: "Budget Builder & Tracker",
    href: "/budget",
    description: "Line-item budget detail, committed/actual tracking and variance flags.",
    available: true,
  },
  {
    key: "leads",
    prd: 5,
    name: "Lead Triage & Follow-Up",
    href: "/leads",
    description: "Import badge scans and registrant lists, dedupe, score and route to sales.",
    available: true,
  },
  {
    key: "roi",
    prd: 6,
    name: "Event ROI & Attribution",
    href: "/roi",
    description: "Budget actuals, lead outcomes and survey data combined into an ROI report.",
    available: true,
  },
  {
    key: "retro",
    prd: 7,
    name: "Post-Mortem Generator",
    href: "/retro",
    description: "Structured retro that writes lessons learned back onto the next brief.",
    available: true,
  },
];

export const DOWNSTREAM_TOOLS = SUITE_TOOLS.filter((t) => t.key !== "brief");
