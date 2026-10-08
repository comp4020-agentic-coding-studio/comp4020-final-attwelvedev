import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { step } from "../sim/step.ts";
import { createWorld, TICK_MS } from "../sim/world.ts";
import { loadRooms } from "./load.ts";
import { buildScript, replay, type Script, withLinger } from "./solveBuilder.ts";
import { planFor } from "./solvePlans.ts";

const BUDGET_TICKS = 20 * 180; // a scripted team has three minutes; first-timers take longer
const rooms = loadRooms().filter((r) => r.id !== "01-loading-dock"); // room 01: sim/room01.test.ts

describe("rooms 02 and 03 can be cleared", () => {
  it("has a room to check", () => {
    expect(rooms.map((r) => r.id)).toEqual(["02-cameras-lasers", "03-vault"]);
  });

  for (const room of rooms) {
    const stored = JSON.parse(
      readFileSync(`src/game/rooms/solutions/${room.id}.json`, "utf8"),
    ) as Script;

    it(`${room.id}: the stored script clears it within budget, never caught`, () => {
      const { world, caught } = replay(room, stored);
      expect(caught).toBe(false);
      expect(world.status).toBe("cleared");
      expect(world.tick).toBeLessThanOrEqual(BUDGET_TICKS);
    });

    it(`${room.id}: the team sets every checkpoint on the way, all together`, () => {
      const flags = room.objects.filter((o) => o.kind === "checkpoint").length;
      expect(flags).toBeGreaterThan(0);
      expect(replay(room, stored).world.checkpoint).toBe(flags);
    });

    it(`${room.id}: the stored script is what the plan produces (run pnpm solve:rooms)`, () => {
      expect(buildScript(room, planFor(room))).toEqual(stored);
    });

    it(`${room.id}: without waiting for the guard the team is caught`, () => {
      expect(() => buildScript(room, planFor(room, true))).toThrow(/caught by G1/);
    });

    it(`${room.id}: just running east is caught, so the hazards matter`, () => {
      const world = createWorld(room);
      let caught = false;
      for (let i = 0; i < 160 && !caught; i++) {
        step(
          world,
          Object.fromEntries(
            [0, 1, 2].map((s) => [s, { seq: i + 1, move: { x: 1, y: 0 }, act: false }]),
          ),
          TICK_MS,
        );
        caught = world.events.some((e) => e.kind === "caught");
      }
      expect(caught).toBe(true);
    });
  }

  // Places a team has to wait, by the x it waits at: for a flag, a camera to look away,
  // a laser to go off, a guard to pass, or the others to get onto the plates.
  const WAITING_SPOTS: Record<string, number[]> = {
    "02-cameras-lasers": [7.5, 21.5, 25.5, 29.5, 32.5, 39.5],
    "03-vault": [5.5, 8.5, 12.5, 15.5, 20.5, 41.5],
  };
  for (const room of rooms) {
    for (const x of WAITING_SPOTS[room.id] ?? []) {
      it(`${room.id}: it is safe to wait 16 s at x = ${x}, a full turn of every guard and camera`, () => {
        expect(() => buildScript(room, withLinger(planFor(room), x, 320))).not.toThrow();
      });
    }
  }
});
