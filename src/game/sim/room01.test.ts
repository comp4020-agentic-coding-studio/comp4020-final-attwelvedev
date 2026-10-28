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
const PUSH = [at(2.5, 4.5), at(8.5, 4.5)]; // leaning east on the crate carries it onto the plate
const CAMERA_IDLE_S = 3; // the camera watches the first 2.5 s of every 8 s: cross after that

describe("room 01, First Job", () => {
  it("can be cleared by three players: push the crate, wait out the camera, hold the plates, go through together", () => {
    const room = loadRooms()[0];
    if (!room) throw new Error("rooms/01-first-job.room is missing");
    const w = createWorld(room);
    const run = (routes: Record<Seat, Vec[]>, until: () => boolean, max: number) => {
      const walkers = ([0, 1, 2] as const).map((s) => walker(w, s, routes[s]));
      let ticks = 0;
      while (ticks++ < max && !until()) {
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
    };
    const idle = (ticks: number) => run({ 0: [], 1: [], 2: [] }, () => false, ticks);

    // The crate has to be pushed onto the first plate, which opens the first door.
    run(
      {
        0: [...PUSH, at(8.5, 5.5), at(13.5, 5.5)],
        1: [at(2.5, 5.5), at(13.5, 6.5)],
        2: [at(2.5, 6.5), at(13.5, 6.5)],
      },
      () => w.doorOpen.D1 === true && w.players.every((p) => p.pos.x > 13),
      1200,
    );
    expect(w.crates[0]?.tile).toEqual({ x: 9, y: 4 });
    expect(w.doorOpen.D1).toBe(true);

    // The camera looks down the corridor through the glass: cross while it is idle.
    while (((w.tick * TICK_MS) / 1000) % 8 < CAMERA_IDLE_S) idle(1);
    run(
      { 0: [at(30.5, 4.5)], 1: [at(30.5, 5.5)], 2: [at(30.5, 6.5)] },
      () => w.pressed.p2 === true && w.pressed.p3 === true && w.pressed.p4 === true,
      1200,
    );
    expect(w.pressed).toMatchObject({ p2: true, p3: true, p4: true });
    expect(w.doorOpen.D2).toBe(true);

    // All three step east together: the doorway keeps the door open.
    run(
      { 0: [at(36.5, 4.5)], 1: [at(36.5, 5.5)], 2: [at(36.5, 6.5)] },
      () => w.status === "cleared",
      400,
    );
    expect(w.status).toBe("cleared");
  });

  it("needs all three players: two on plates leave the door shut", () => {
    const room = loadRooms()[0];
    if (!room) throw new Error("rooms/01-first-job.room is missing");
    const w = createWorld(room);
    w.players[0].pos = at(30.5, 4.5);
    w.players[1].pos = at(30.5, 5.5);
    w.players[2].pos = at(26.5, 5.5);
    for (let i = 0; i < 10; i++) step(w, {}, TICK_MS);
    expect(w.doorOpen.D2).toBe(false);
  });
});
