import type { Item } from "./items.ts";

// A complete Item for tests: a plain, guessed, Have item. Override what the
// test cares about.
export function testItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "i",
    householdId: "h",
    name: "milk",
    createdBy: "m",
    createdAt: 1,
    category: "other",
    iconKey: null,
    measure: "have",
    fillStop: 4,
    count: 1,
    exactAmount: null,
    exactUnit: null,
    estimatedExpiry: null,
    exactExpiry: null,
    valueSetBy: null,
    valueSetAt: null,
    expirySetBy: null,
    expirySetAt: null,
    ...overrides,
  };
}
