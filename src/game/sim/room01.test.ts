import { describe, expect, it } from "vitest";
import { loadRooms } from "../rooms/load.ts";
import type { PlayerInput, Seat, Vec } from "../types.ts";
import { step } from "./step.ts";
import { createWorld, SPEED_TPS, TICK_MS, type World } from "./world.ts";

// Walks `route` (orthogonal legs, tile-centre coordinates) one leg at a time;
// returns the next input, or null once the last waypoint is reached.
function walker(world: World, seat: Seat, route: Vec[]) {
  let leg = 0;
  let seq = 0;
  const stepLen = (SPEED_TPS * TICK_MS) / 1000;
  return (): PlayerInput | null => {
    for (;;) {
      const target = route[leg];
      if (!target) return null;
      const p = world.players[seat].pos;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
        leg++;
        continue;
      }
      const move =
        Math.abs(dx) >= 1e-6
          ? { x: Math.sign(dx) * Math.min(1, Math.abs(dx) / stepLen), y: 0 }
          : { x: 0, y: Math.sign(dy) * Math.min(1, Math.abs(dy) / stepLen) };
      return { seq: ++seq, move, act: false };
    }
  };
}

const at = (x: number, y: number): Vec => ({ x, y });
const COMMON = [at(10.5, 4.5), at(10.5, 6.5), at(27.5, 6.5)];

describe("room 01, Loading Dock", () => {
  it("can be cleared by three players: push the crate, hold the plates, go through together", () => {
    const room = loadRooms()[0];
    if (!room) throw new Error("rooms/01-loading-dock.room is missing");
    const w = createWorld(room);
    const routes: Record<Seat, Vec[]> = {
      0: [at(2.5, 4.5), ...COMMON, at(27.5, 3.5), at(30.5, 3.5)],
      1: [...COMMON, at(27.5, 4.5), at(30.5, 4.5)],
      2: [at(2.5, 4.5), ...COMMON, at(27.5, 5.5), at(30.5, 5.5)],
    };
    const walkers = ([0, 1, 2] as const).map((s) => walker(w, s, routes[s]));

    // The tunnel crate has to be pushed on, past the junction at x = 10.
    let ticks = 0;
    while (ticks++ < 1200 && !(w.pressed.p1 && w.pressed.p2 && w.pressed.p3)) {
      step(
        w,
        {
          0: walkers[0]?.() ?? undefined,
          1: walkers[1]?.() ?? undefined,
          2: walkers[2]?.() ?? undefined,
        },
        TICK_MS,
      );
    }
    expect(w.crates[0]?.tile.x).toBeGreaterThan(10);
    expect(w.pressed).toEqual({ p1: true, p2: true, p3: true });
    expect(w.doorOpen.D1).toBe(true);

    // All three step east together: the doorway keeps the door open.
    const east = (y: number) => walker(w, y === 3.5 ? 0 : y === 4.5 ? 1 : 2, [at(45.5, y)]);
    const out = [east(3.5), east(4.5), east(5.5)];
    ticks = 0;
    while (ticks++ < 400 && w.status !== "cleared") {
      step(
        w,
        { 0: out[0]?.() ?? undefined, 1: out[1]?.() ?? undefined, 2: out[2]?.() ?? undefined },
        TICK_MS,
      );
    }
    expect(w.status).toBe("cleared");
  });

  it("needs all three players: two on plates leave the door shut", () => {
    const room = loadRooms()[0];
    if (!room) throw new Error("rooms/01-loading-dock.room is missing");
    const w = createWorld(room);
    w.players[0].pos = at(30.5, 3.5);
    w.players[1].pos = at(30.5, 4.5);
    w.players[2].pos = at(26.5, 4.5);
    for (let i = 0; i < 10; i++) step(w, {}, TICK_MS);
    expect(w.doorOpen.D1).toBe(false);
  });
});
