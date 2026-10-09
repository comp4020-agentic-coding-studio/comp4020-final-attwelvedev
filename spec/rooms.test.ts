import { describe, expect, it } from "vitest";
import { solveRoom } from "../src/game/bots/solve.ts";
import { loadRooms } from "../src/game/rooms/load.ts";
import { rolesFor } from "../src/net/game.ts";

// FR27: the bots are the room solver. Three bots, each seeing only what its role
// sees and talking only through its role's channels (the router is in the loop),
// must clear every room, in every assignment of roles, within the room's budget
// (`meta.budgetS`, 600 s of game time by default). A room that these bots cannot
// clear is not finished, however a person might manage it.
const rooms = loadRooms();

describe("three bots clear every room", () => {
  it("has rooms to check", () => {
    expect(rooms.length).toBeGreaterThanOrEqual(3);
  });

  for (const room of rooms) {
    const budgetS = typeof room.meta.budgetS === "number" ? room.meta.budgetS : 600;
    for (const rotation of [0, 1, 2]) {
      const roles = rolesFor(rotation);
      it(`${room.id} with ${roles.join("/")} (seats 1-3)`, () => {
        const result = solveRoom(room, roles, budgetS);
        expect(result.cleared, `not cleared after ${result.ticks / 20} s`).toBe(true);
        expect(result.ticks / 20).toBeLessThanOrEqual(budgetS);
        // a room the bots only clear by being caught and sent back is unfair play
        expect(result.caught).toBe(0);
        // a bot keeps its own cooldowns: the router never has to turn one away
        expect(result.refused).toBe(0);
      });
    }
  }
});
