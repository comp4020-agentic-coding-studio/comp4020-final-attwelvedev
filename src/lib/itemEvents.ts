import type { Item } from "./items.ts";
import { type Actor, householdChannel, type Routed } from "./live.ts";

// The events an item write sends. Only the household hears them: attribution
// (who set a value) stays inside it.
export function updatedEvents(item: Item, by: Actor): Routed[] {
  return [
    { channel: householdChannel(item.householdId), event: { type: "item.updated", item, by } },
  ];
}
