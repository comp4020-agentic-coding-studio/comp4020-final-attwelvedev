import { describe, expect, it } from "vitest";
import { solveRoom } from "../src/game/bots/solve.ts";
import { rolesFor } from "../src/game/crew.ts";
import { cacheOf } from "../src/game/rooms/format.ts";
import { loadRooms } from "../src/game/rooms/load.ts";

// ADR 0024: bots help work a cache once a person has uncovered it. Three bots plus the harness, which
// makes the same world change a person's Act on the motif tile makes on the first tick any seat stands
// in the beat the chamber hangs off, must solve the cache and have its owner take the keepsake, and
// still clear the room within budget with no catches. Bots never uncover one (src/game/bots/brain.test.ts,
// spec/caches.test.ts).
const ROOMS = loadRooms("./rooms");
const CASES: [room: string, cache: string][] = [["04-the-safe", "Q3"]];

for (const [id, cache] of CASES) {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`no room ${id}`);
  const budgetS = typeof room.meta.budgetS === "number" ? room.meta.budgetS : 600;
  const owner = (cacheOf(room.objects.find((o) => o.id === cache) as never)?.owner ?? 1) - 1;
  for (const rotation of [0, 1, 2]) {
    const roles = rolesFor(rotation);
    describe(`${id} with ${roles.join("/")} (seats 1-3)`, () => {
      it("bots solve the uncovered cache and the owner takes the keepsake", () => {
        const result = solveRoom(room, roles, budgetS, { uncoverWhenReached: true });
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
