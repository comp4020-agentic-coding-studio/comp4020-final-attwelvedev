import { describe, expect, it } from "vitest";
import { solveRoom } from "../src/game/bots/solve.ts";
import { rolesFor } from "../src/game/crew.ts";
import { loadRooms } from "../src/game/rooms/load.ts";
import type { Role } from "../src/game/types.ts";

// FR27: the bots are the room solver. Three bots, each seeing only what its role
// sees and talking only through its role's channels (the router is in the loop),
// must clear every room, in every assignment of roles, within the room's budget
// (`meta.budgetS`, 600 s of game time by default). A room that these bots cannot
// clear is not finished, however a person might manage it.
const rooms = loadRooms();

// FR14: every role is needed. In a beat that names a `lead`, the team cannot get through
// when that role's sending is switched off, because nobody else perceives what the lead does.
// Skipped, with this message, while no room declares one: the rooms that do arrive in phase 06.
const led = rooms.flatMap((room) =>
  room.beats.flatMap((beat, i) => (beat.lead ? [{ room, beat, index: i }] : [])),
);

describe("each lead role is needed", () => {
  if (led.length === 0) {
    it.skip("no room declares a beat `lead` yet (rooms with leads arrive in phase 06)", () => {});
    return;
  }
  for (const { room, beat, index } of led) {
    const budgetS = typeof room.meta.budgetS === "number" ? room.meta.budgetS : 600;
    it(`${room.id} beat ${index + 1} fails without ${beat.lead}'s sends`, () => {
      const lead = beat.lead as Role;
      const roles = rolesFor(0);
      const result = solveRoom(room, roles, budgetS, new Set(), { mute: lead });
      // the room is not cleared, or the team never got past this beat's far edge
      const past = result.world.players.every((p) => p.pos.x > beat.x[1]);
      expect(result.cleared && past, `cleared without ${lead}`).toBe(false);
    });
  }
});

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
        // the team sets every checkpoint on the way, so being caught costs little
        const flags = room.objects.filter((o) => o.kind === "checkpoint").length;
        expect(result.world.checkpoint).toBe(flags);
        // a bot keeps its own cooldowns: the router never has to turn one away
        expect(result.refused).toBe(0);
      });
    }
  }
});
