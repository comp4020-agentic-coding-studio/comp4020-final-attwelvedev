import { describe, expect, it } from "vitest";
import { advance, fresh, ownOf } from "./Feeds.tsx";

// The landing feed's Can't see figure looks the way its bot walks (the user, Task 70 review): its eyes
// follow the movement, as they do on every other feed and in the game, and not always down.
describe("Can't see's feed figure faces its bot's movement", () => {
  it("faces the way the bot's world says, and turns right when it walks right", () => {
    const run = fresh(0);
    const seen = new Set<string>();
    for (let i = 0; i < 160; i++) {
      advance(run, i * 50);
      const want = run.attract.world.players[0].facing;
      const got = ownOf(run, 0).facing;
      expect(got).toEqual(want);
      seen.add(`${want.x},${want.y}`);
    }
    expect([...seen].some((f) => f === "1,0")).toBe(true);
  });
});
