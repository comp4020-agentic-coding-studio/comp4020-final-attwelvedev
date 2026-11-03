import { describe, expect, it } from "vitest";
import { addClear, emptyHeist, totalsOf } from "./heistTotals.ts";

const clear = (room: string, ms: number, loot: number, found?: boolean) => ({
  room,
  version: "1",
  ms,
  loot,
  lootTotal: 2,
  ...(found === undefined ? {} : { cache: { name: "The Safe", found, item: "watch" as const } }),
});

// The heist record counts a room once. A cleared room the team restarts and clears again is the
// same room: its latest clear replaces the earlier one, so the shelf, the time and the loot are not
// doubled (the user saw room 4's gold watch twice on the heist-complete screen).
describe("the heist's running record", () => {
  it("adds each room's clear in order", () => {
    let h = emptyHeist();
    h = addClear(h, clear("01", 1000, 1));
    h = addClear(h, clear("02", 2000, 2));
    expect(totalsOf(h)).toMatchObject({ ms: 3000, loot: 3, lootTotal: 4, versions: ["1", "1"] });
  });

  it("a room cleared again replaces its earlier clear, in its place, in every total", () => {
    let h = emptyHeist();
    h = addClear(h, clear("04", 5000, 1, true));
    h = addClear(h, clear("05", 6000, 1, false));
    h = addClear(h, clear("04", 4000, 2, false)); // room 4 replayed
    const t = totalsOf(h);
    expect(t.caches.map((c) => c.room)).toEqual(["04", "05"]);
    expect(t.caches[0]).toMatchObject({ room: "04", found: false });
    expect(t).toMatchObject({ ms: 10_000, loot: 3, lootTotal: 4, versions: ["1", "1"] });
  });

  it("a room whose replay has no cache result drops the earlier one", () => {
    let h = addClear(emptyHeist(), clear("04", 5000, 1, true));
    h = addClear(h, clear("04", 4000, 1));
    expect(totalsOf(h).caches).toEqual([]);
  });
});
