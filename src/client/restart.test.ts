import { describe, expect, it } from "vitest";
import { afterRestart, type Remembered } from "./restart.ts";

// A restart that passed puts everyone back at spawn. The page keeps a room's summary and, after the
// last room, the heist's result: both must be dropped, or the heist-complete screen (which the page
// shows in place of the room) stays over the restarted room and it can never be played (the user
// could not restart the final room).
describe("what the page forgets when a restart passes", () => {
  const finished: Remembered = {
    summary: { ms: 1000, loot: 1 },
    heist: { ms: 9000, rank: 3 },
  };

  it("drops the room's summary and the heist's result", () => {
    expect(afterRestart(finished)).toEqual({ summary: null, heist: null });
  });

  it("drops the heist's result after the final room, whichever restart passed", () => {
    for (const kind of ["room", "heist"] as const) {
      expect(afterRestart(finished, kind).heist, kind).toBeNull();
    }
  });
});
