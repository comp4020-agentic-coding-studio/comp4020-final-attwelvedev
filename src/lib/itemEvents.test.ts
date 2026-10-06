import { describe, expect, it } from "vitest";
import { updatedEvents } from "./itemEvents.ts";
import { householdChannel } from "./live.ts";
import { testItem } from "./testItem.ts";

describe("updatedEvents", () => {
  it("is one item.updated on the household's channel", () => {
    const item = testItem({ householdId: "h1", fillStop: 2 });
    const by = { id: "m1", name: "Alex" };
    expect(updatedEvents(item, by)).toEqual([
      { channel: householdChannel("h1"), event: { type: "item.updated", item, by } },
    ]);
  });
});
