// packages/budget-calc/src/reconcile.ts
//
// FR-2 — fold the brief's free-text `budget.allocations[]` into the fixed taxonomy.
//
// Anything the synonym map doesn't recognise becomes an `other` line item that keeps the
// planner's original wording. Never silently drop a category the planner typed.

import type {
  BudgetAllocation,
  BudgetLineItem,
  BudgetLineItemCategory,
  EventBrief,
} from "@event-toolkit/schema";
import { newLineItem } from "./presets";

/**
 * Synonyms are matched against a normalised (lower-cased, punctuation-stripped) form of the
 * allocation's category text, longest pattern first so "speaker travel" beats "travel".
 */
interface Synonym {
  pattern: string;
  category: BudgetLineItemCategory;
}

const SYNONYMS: Synonym[] = ([
  { pattern: "speaker fee", category: "staffing" },
  { pattern: "speaker honorarium", category: "staffing" },
  { pattern: "speaker travel", category: "travel" },
  { pattern: "registration staff", category: "staffing" },
  { pattern: "temp staff", category: "staffing" },
  { pattern: "contract staff", category: "staffing" },
  { pattern: "booth space", category: "venue" },
  { pattern: "venue", category: "venue" },
  { pattern: "space rental", category: "venue" },
  { pattern: "room hire", category: "venue" },
  { pattern: "audio visual", category: "av" },
  { pattern: "audiovisual", category: "av" },
  { pattern: "av", category: "av" },
  { pattern: "production", category: "av" },
  { pattern: "livestream", category: "av" },
  { pattern: "platform", category: "av" },
  { pattern: "catering", category: "f_and_b" },
  { pattern: "food", category: "f_and_b" },
  { pattern: "beverage", category: "f_and_b" },
  { pattern: "f and b", category: "f_and_b" },
  { pattern: "fnb", category: "f_and_b" },
  { pattern: "meals", category: "f_and_b" },
  { pattern: "reception", category: "f_and_b" },
  { pattern: "travel", category: "travel" },
  { pattern: "flights", category: "travel" },
  { pattern: "hotel", category: "travel" },
  { pattern: "accommodation", category: "travel" },
  { pattern: "shipping", category: "travel" },
  { pattern: "freight", category: "travel" },
  { pattern: "promotion", category: "promo" },
  { pattern: "promo", category: "promo" },
  { pattern: "marketing", category: "promo" },
  { pattern: "advertising", category: "promo" },
  { pattern: "signage", category: "promo" },
  { pattern: "print", category: "promo" },
  { pattern: "staffing", category: "staffing" },
  { pattern: "labour", category: "staffing" },
  { pattern: "labor", category: "staffing" },
  { pattern: "swag", category: "swag" },
  { pattern: "giveaway", category: "swag" },
  { pattern: "merch", category: "swag" },
  { pattern: "gift", category: "swag" },
  { pattern: "contingency", category: "contingency" },
  { pattern: "reserve", category: "contingency" },
  { pattern: "buffer", category: "contingency" },
] satisfies Synonym[]).sort((a, b) => b.pattern.length - a.pattern.length);

function normalise(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Crude singular form, enough to make "fees" match "fee" without a stemming library. */
function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

function tokens(text: string): string[] {
  return normalise(text).split(" ").filter(Boolean).map(stem);
}

/** True when `needle`'s tokens appear as a contiguous run inside `haystack`'s. */
function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    if (needle.every((token, j) => haystack[i + j] === token)) return true;
  }
  return false;
}

/**
 * The taxonomy category for a free-text allocation label, or `other` when unrecognised.
 *
 * Matching is token-based with light stemming, so "Speaker fees" finds "speaker fee". It also
 * compares a space-stripped form, because planners write "A/V" and "F&B" and normalising the
 * punctuation away leaves "a v" and "f b" — which no word-boundary match would ever catch.
 */
export function categoryForAllocationName(name: string): BudgetLineItemCategory {
  const normalised = normalise(name);
  if (!normalised) return "other";

  const nameTokens = tokens(name);
  const compact = normalised.replace(/\s+/g, "");

  const hit = SYNONYMS.find((entry) => {
    const patternTokens = entry.pattern.split(" ").filter(Boolean).map(stem);
    if (containsRun(nameTokens, patternTokens)) return true;
    const patternCompact = entry.pattern.replace(/\s+/g, "");
    return compact === patternCompact;
  });

  return hit?.category ?? "other";
}

export interface ReconcileResult {
  lineItems: BudgetLineItem[];
  /** Allocation labels that fell through to `other`, for the "we couldn't place these" note. */
  unmatched: string[];
}

/**
 * Turn the brief's allocations into line items, carrying `plannedAmount` across as the
 * budgeted figure. `actualAmount` on the allocation is ignored here — this tool is the thing
 * that writes that field, so reading it back in would be circular.
 */
export function reconcileAllocations(
  eventBriefId: string,
  allocations: BudgetAllocation[] | undefined,
): ReconcileResult {
  const lineItems: BudgetLineItem[] = [];
  const unmatched: string[] = [];

  for (const allocation of allocations ?? []) {
    const label = allocation.category?.trim();
    if (!label) continue;
    const category = categoryForAllocationName(label);
    if (category === "other") unmatched.push(label);
    lineItems.push(
      newLineItem(eventBriefId, {
        category,
        // Keep the planner's own wording as the line item name in every case.
        lineItemName: label,
        budgetedAmount: Number.isFinite(allocation.plannedAmount) ? allocation.plannedAmount : 0,
        notes: allocation.notes,
      }),
    );
  }

  return { lineItems, unmatched };
}

/**
 * FR-1 + FR-2 together: the initial set of line items for a brief — the event-type template
 * plus the brief's own allocations, with a seeded row dropped when an allocation already
 * covers the same category and name (so "Venue rental" doesn't appear twice).
 */
export function buildInitialLineItems(
  brief: EventBrief,
  seeded: BudgetLineItem[],
): { lineItems: BudgetLineItem[]; unmatched: string[] } {
  const { lineItems: fromAllocations, unmatched } = reconcileAllocations(
    brief.id,
    brief.budget?.allocations,
  );

  const allocationKeys = new Set(
    fromAllocations.map((item) => `${item.category}|${normalise(item.lineItemName)}`),
  );
  const keptSeeds = seeded.filter(
    (item) => !allocationKeys.has(`${item.category}|${normalise(item.lineItemName)}`),
  );

  return { lineItems: [...keptSeeds, ...fromAllocations], unmatched };
}
