import { describe, expect, it } from "vitest";
import { solveRoom } from "../src/game/bots/solve.ts";
import { rolesFor } from "../src/game/crew.ts";
import { cacheOf } from "../src/game/rooms/format.ts";
import { loadRooms } from "../src/game/rooms/load.ts";

// ADR 0024: bots help work a cache once a person has uncovered it. Three bots plus the harness, which
// makes the same world change a person's Act on the motif tile makes on the first tick any seat reaches
// a column per room (where a person would find the motif tile: decisions caches/85 and caches/86), must
// solve the cache and have its owner take the keepsake, and
// still clear the room within budget with no catches. Bots never uncover one (src/game/bots/brain.test.ts,
// spec/caches.test.ts).
const ROOMS = loadRooms("./rooms");
// `from` is the column where a person would find the motif tile (room 4: the chamber's own columns)
const CASES: [room: string, cache: string, from: true | number][] = [
  ["04-the-safe", "Q3", true], // its moon tile is at x 10, before the beat's gear has changed hands
  ["05-the-gallery", "Q4", 13],
  ["06-lights-out", "Q5", 17],
  ["07-night-shift", "Q7", 8],
  ["08-music-room", "Q4", 3],
  ["09-the-vault", "Q8", 14],
];

for (const [id, cache, from] of CASES) {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`no room ${id}`);
  const budgetS = typeof room.meta.budgetS === "number" ? room.meta.budgetS : 600;
  const owner = (cacheOf(room.objects.find((o) => o.id === cache) as never)?.owner ?? 1) - 1;
  for (const rotation of [0, 1, 2]) {
    const roles = rolesFor(rotation);
    describe(`${id} with ${roles.join("/")} (seats 1-3)`, () => {
      it("bots solve the uncovered cache and the owner takes the keepsake", () => {
        const result = solveRoom(room, roles, budgetS, { uncoverWhenReached: from });
        const world = result.world;
        expect(world.cacheUncovered, "the harness uncovers it").toContain(cache);
        expect(world.cacheBy[cache], "the cache was solved").toBeDefined();
        expect(world.cacheTaken[cache], "the owner took the keepsake").toBe(owner);
        expect(result.cleared, `not cleared after ${result.ticks / 20} s`).toBe(true);
        expect(result.ticks / 20).toBeLessThanOrEqual(budgetS);
        expect(result.caught).toBe(0);
      });
    });
  }
}

// FR1: uncovering stays human. Three bots with no help from the harness open no cache in any room, in
// any rotation, however they stand beside each other to hand gear on or take a hand.
for (const [id] of CASES) {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`no room ${id}`);
  for (const rotation of [0, 1, 2]) {
    it(`${id} with ${rolesFor(rotation).join("/")}: three bots alone uncover nothing`, () => {
      const result = solveRoom(room, rolesFor(rotation), 240);
      expect(result.world.cacheUncovered).toEqual([]);
    });
  }
}
