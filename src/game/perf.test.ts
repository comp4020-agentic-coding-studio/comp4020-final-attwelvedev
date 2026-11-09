import { describe, expect, it } from "vitest";
import { viewFor } from "./perception.ts";
import { loadRooms } from "./rooms/load.ts";
import { step } from "./sim/step.ts";
import { createWorld } from "./sim/world.ts";
import type { PlayerInput, Seat } from "./types.ts";

// The server ticks at 20 Hz for about 10 lobbies on one 256 MB machine: 200 ticks a second, so
// 5 ms a tick is the whole budget. 2 ms leaves room for the socket writes, the bots and GC.
// spec/fixtures/perf/00-hub-size.room is the biggest shape a room will take: a 60x30 hub with six
// chambers, glass, a vent, a hatch, a dark zone and a UV torch, so line of sight and the UV pool are
// both paid for. Measured on the dev machine (2026-10-28): see the Corrections log of
// plans/2026-10-28-escape-room-heist-02-client.md for the numbers.
const BUDGET_MS = 2;
const TICKS = 400;

describe("the cost of a tick on a hub room", () => {
  it(`steps and builds all three views in under ${BUDGET_MS} ms a tick, with a UV torch lit`, () => {
    const [room] = loadRooms("./spec/fixtures/perf");
    if (!room) throw new Error("no perf room");
    const world = createWorld(room, 7);
    // Can't hear holds the torch, so the pool is cast every tick and seen by the sighted
    Object.assign(world.gear[0] as object, { heldBy: 1, at: null });
    // everyone wanders the hub and out into the chambers, so the sight changes every tick
    const ways = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ];
    let seq = 0;
    const inputs = (t: number): Partial<Record<Seat, PlayerInput>> => {
      seq++;
      const at = (s: number) => ways[(Math.floor(t / 40) + s) % 4] as { x: number; y: number };
      return {
        0: { seq, move: at(0), act: false },
        1: { seq, move: at(1), act: false },
        2: { seq, move: at(2), act: false },
      };
    };
    for (let t = 0; t < 40; t++) step(world, inputs(t)); // warm the JIT before timing
    const started = performance.now();
    for (let t = 0; t < TICKS; t++) {
      step(world, inputs(t));
      viewFor(world, 0, "blind", t % 20 === 0);
      viewFor(world, 1, "deaf", t % 20 === 0);
      viewFor(world, 2, "mute", t % 20 === 0);
    }
    const perTick = (performance.now() - started) / TICKS;
    console.log(`hub room: ${perTick.toFixed(3)} ms a tick (budget ${BUDGET_MS} ms)`);
    expect(perTick).toBeLessThan(BUDGET_MS);
  });
});
