// packages/budget-calc/src/presets.ts
//
// FR-1 — the standardized line-item template, seeded per event type.
//
// The category set is identical for every event type; only the seeded *names* differ. Every
// seeded name is fully editable and removable — these are starting points, not requirements.

import {
  BUDGET_CATEGORIES,
  newId,
  nowIso,
  type BudgetLineItem,
  type BudgetLineItemCategory,
  type EventType,
} from "@event-toolkit/schema";

type SeedTable = Partial<Record<BudgetLineItemCategory, string[]>>;

const CONFERENCE: SeedTable = {
  venue: ["Venue rental"],
  av: ["General session AV package"],
  f_and_b: ["Breakfast/lunch/breaks", "Reception catering"],
  travel: ["Staff travel", "Speaker travel"],
  promo: ["Digital promotion", "Print signage"],
  staffing: ["Temp/contract staff", "Registration desk staff"],
  swag: ["Attendee swag bags"],
  contingency: ["Contingency reserve"],
};

const WEBINAR: SeedTable = {
  av: ["Webinar platform & production"],
  promo: ["Email / paid promotion"],
  staffing: ["Speaker honoraria"],
  swag: ["Digital swag / incentive"],
  contingency: ["Contingency reserve"],
};

const TRADE_SHOW: SeedTable = {
  venue: ["Booth space rental"],
  av: ["Booth AV / monitors"],
  travel: ["Staff travel & booth shipping"],
  promo: ["Pre-show promotion"],
  staffing: ["Booth staff"],
  swag: ["Booth giveaways"],
  contingency: ["Contingency reserve"],
};

/** Custom briefs get all 8 category headers with nothing seeded under them. */
const CUSTOM: SeedTable = {};

const SEEDS: Record<EventType, SeedTable> = {
  conference: CONFERENCE,
  webinar: WEBINAR,
  trade_show: TRADE_SHOW,
  custom: CUSTOM,
};

export function newLineItem(
  eventBriefId: string,
  partial: Partial<BudgetLineItem> = {},
): BudgetLineItem {
  const timestamp = nowIso();
  return {
    id: newId(),
    eventBriefId,
    category: "other",
    lineItemName: "",
    budgetedAmount: 0,
    committedAmount: 0,
    actualAmount: 0,
    varianceThresholdPct: null,
    status: "planned",
    source: "manual",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...partial,
  };
}

/**
 * The seeded line items for an event type, in category display order. Categories with no
 * seeded names contribute nothing — the UI still renders their (empty) section header, so
 * "all 8 categories appear" without inventing placeholder rows.
 */
export function seedLineItemsForEventType(
  eventBriefId: string,
  eventType: EventType,
): BudgetLineItem[] {
  const table = SEEDS[eventType] ?? CUSTOM;
  const items: BudgetLineItem[] = [];
  for (const category of BUDGET_CATEGORIES) {
    for (const lineItemName of table[category] ?? []) {
      items.push(newLineItem(eventBriefId, { category, lineItemName }));
    }
  }
  return items;
}
