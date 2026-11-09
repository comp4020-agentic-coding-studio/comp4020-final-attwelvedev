import { describe, expect, it } from "vitest";
import type { Seat } from "../game/types.ts";
import { followersOf } from "./follow.ts";

// Replaces the "receives the msgs the followed seat receives" half of spec/spectator.test.ts. That spec sent a
// callout through three live sockets and raced the server handling the watcher's `spectate`: a callout sent a
// moment too early reached nobody and was lost (CI run 42605097983), and no view says the follow has taken
// effect, so the spec resent it every 200 ms. The rule it checked is this function.
describe("followersOf: who watching gets what a seat received", () => {
  const following = new Map<string, Seat | null>([
    ["ana", 0],
    ["bo", 1],
    ["cy", 1],
    ["room", null],
  ]);
  const watchers = ["ana", "bo", "cy", "room", "new"];

  it("is every watcher following a seat that received it", () => {
    expect(followersOf(watchers, following, [1, 2])).toEqual(["bo", "cy"]);
    expect(followersOf(watchers, following, [0, 1])).toEqual(["ana", "bo", "cy"]);
  });

  it("is no one who watches the whole room, or has not chosen yet", () => {
    expect(followersOf(["room", "new"], following, [0, 1, 2])).toEqual([]);
  });

  it("is no one when no seat received it", () => {
    expect(followersOf(watchers, following, [])).toEqual([]);
  });

  it("does not give a follower of a seat that did not receive it", () => {
    expect(followersOf(watchers, following, [2])).toEqual([]);
  });

  it("ignores a followed seat 0 being falsy: seat 0 is a seat", () => {
    expect(followersOf(["ana"], following, [0])).toEqual(["ana"]);
  });
});
