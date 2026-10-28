import { describe, expect, it } from "vitest";
import { solveRoom } from "../src/game/bots/solve.ts";
import { rolesFor } from "../src/game/crew.ts";
import { loadRooms } from "../src/game/rooms/load.ts";

// FR27: the bots are the room solver. Three bots, each seeing only what its role
// sees and talking only through its role's channels (the router is in the loop),
// must clear every room, in every assignment of roles, within the room's budget
// (`meta.budgetS`, 600 s of game time by default). A room that these bots cannot
// clear is not finished, however a person might manage it.
const rooms = loadRooms();

// The same check for any set of rooms: the shipped ones, and the fixtures a room is drafted in
// before it ships (Task 28), so a draft is proved under the same rules.
// Rooms the perception-only bots (overhaul Task 28) cannot clear yet, each with why and what ends
// the skip. Ruled by the user on 2026-10-28; a room on this list does not ship as finished.
const NOT_YET: Record<string, string> = {
  "06-vault":
    "caught in the dark corridor by perception-only bots (overhaul phase 04 finding); renumbered after rooms 1 to 3 in escape-room phase 04; phase 10 replaces it with room 9",
  // a deliberate, dated scope change (escape-room phase 03 Task 13, 2026-10-29), not a weakened
  // test: bots now solve only from what they perceive, and no station type has a decoder until
  // phases 05 to 10 add one each; phase 10, Task 27 restores this room to the sweep
  "00-stations-draft":
    "perception-only bots have no station decoders until phases 05 to 10; phase 10 Task 27 restores it",
};

function clearEveryRotation(title: string, set: typeof rooms, minimum: number) {
  describe(title, () => {
    it("has rooms to check", () => {
      expect(set.length).toBeGreaterThanOrEqual(minimum);
    });

    for (const room of set) {
      const budgetS = typeof room.meta.budgetS === "number" ? room.meta.budgetS : 600;
      for (const rotation of [0, 1, 2]) {
        const roles = rolesFor(rotation);
        const why = NOT_YET[room.id];
        if (why) {
          it.skip(`${room.id} with ${roles.join("/")} (seats 1-3): ${why}`, () => {});
          continue;
        }
        it(`${room.id} with ${roles.join("/")} (seats 1-3)`, () => {
          const result = solveRoom(room, roles, budgetS);
          expect(result.cleared, `not cleared after ${result.ticks / 20} s`).toBe(true);
          expect(result.ticks / 20).toBeLessThanOrEqual(budgetS);
          // a room the bots only clear by being caught and sent back is unfair play
          expect(result.caught).toBe(0);
          // the team sets every checkpoint on the way, so being caught costs little
          const flags = room.objects.filter((o) => o.kind === "checkpoint").length;
          expect(result.world.checkpoint).toBe(flags);
          // a bot keeps its own cooldowns: the router never has to turn one away
          expect(result.refused).toBe(0);
        });
      }
    }
  });
}

clearEveryRotation("three bots clear every room", rooms, 3);
clearEveryRotation("three bots clear every fixture room", loadRooms("./spec/fixtures/rooms"), 1);
// room 1 until escape-room phase 04, kept as a fixture by the tests that used it
clearEveryRotation("three bots clear First Job", loadRooms("./spec/fixtures/first-job"), 1);
clearEveryRotation("three bots clear every draft room", loadRooms("./spec/fixtures/drafts"), 1);
// one small room per station type, as each type's decoder lands (escape-room Tasks 16 to 26)
clearEveryRotation(
  "three bots clear every station fixture",
  loadRooms("./spec/fixtures/rooms-bots"),
  2,
);
