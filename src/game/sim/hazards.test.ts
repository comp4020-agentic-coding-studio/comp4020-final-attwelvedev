import { describe, expect, it } from "vitest";
import { cameraWatching, caughtBy, laserOn } from "./hazards.ts";
import { step } from "./step.ts";
import { hold, input, place, tap, worldWith } from "./testing.ts";
import { TICK_MS, type World } from "./world.ts";

const T = (seconds: number) => Math.round((seconds * 1000) / TICK_MS);
const tile = (x: number, y: number) => ({ x, y });

describe("cameraWatching", () => {
  const p = { periodS: 6, watchingS: 3, offsetS: 0 };
  it("watches for watchingS at the start of each period", () => {
    expect(cameraWatching(p, 0)).toBe(true);
    expect(cameraWatching(p, T(3) - 1)).toBe(true);
    expect(cameraWatching(p, T(3))).toBe(false);
    expect(cameraWatching(p, T(6) - 1)).toBe(false);
    expect(cameraWatching(p, T(6))).toBe(true);
  });
  it("shifts by offsetS", () => {
    expect(cameraWatching({ ...p, offsetS: 3 }, 0)).toBe(false);
    expect(cameraWatching({ ...p, offsetS: 3 }, T(3))).toBe(true);
  });
});

describe("laserOn", () => {
  const p = { onS: 2, offS: 2, offsetS: 0 };
  it("is on for onS then off for offS, repeating", () => {
    expect(laserOn(p, 0)).toBe(true);
    expect(laserOn(p, T(2) - 1)).toBe(true);
    expect(laserOn(p, T(2))).toBe(false);
    expect(laserOn(p, T(4) - 1)).toBe(false);
    expect(laserOn(p, T(4))).toBe(true);
  });
});

const ROOM = [
  "######################",
  "#1.....C.......h.....#",
  "#2.................$.#",
  "#3...K...L.....B.....#",
  "######################",
];
const CAMERA = { C1: { zone: [10, 1, 14, 3], periodS: 6, watchingS: 3, offsetS: 0 } };
const LASER = { L1: { dir: "right", onS: 2, offS: 2, offsetS: 0 } };

describe("caughtBy: cameras", () => {
  it("catches a player in a watched zone, not in an unwatched one or outside it", () => {
    const world = worldWith(ROOM, CAMERA);
    place(world, 0, tile(12, 2));
    expect(caughtBy(world)).toBe("C1");
    world.tick = T(4);
    expect(caughtBy(world)).toBeNull();
    world.tick = 0;
    place(world, 0, tile(5, 2));
    expect(caughtBy(world)).toBeNull();
  });

  it("does not see a player on a hide spot", () => {
    // the hide spot is at x=15, outside the usual zone: widen the zone over it
    const wide = worldWith(ROOM, { C1: { ...CAMERA.C1, zone: [10, 1, 18, 3] } });
    place(wide, 0, tile(15, 1));
    expect(caughtBy(wide)).toBeNull();
    place(wide, 0, tile(16, 1));
    expect(caughtBy(wide)).toBe("C1");
  });
});

describe("caughtBy: lasers", () => {
  it("catches a player on the beam while it is on, runs to the first wall", () => {
    const world = worldWith(ROOM, LASER);
    place(world, 0, tile(19, 3));
    expect(caughtBy(world)).toBe("L1");
    world.tick = T(2);
    expect(caughtBy(world)).toBeNull();
    world.tick = 0;
    place(world, 0, tile(7, 3)); // behind the emitter
    expect(caughtBy(world)).toBeNull();
  });
});

describe("caughtBy: guards", () => {
  const GUARD = { G1: { sightTiles: 6, fovDeg: 70, speedTps: 1.5 } };
  const GRID = [
    "######################",
    "#1.......G...........#",
    "#2...................#",
    "#3...................#",
    "######################",
  ];
  it("catches a player in the cone, not behind the guard or out of range", () => {
    const world = worldWith(GRID, GUARD);
    place(world, 0, tile(13, 1));
    expect(caughtBy(world)).toBe("G1");
    place(world, 0, tile(5, 1));
    expect(caughtBy(world)).toBeNull();
    place(world, 0, tile(17, 1));
    expect(caughtBy(world)).toBeNull();
  });

  it("does not see a player on a hide spot, or through a wall", () => {
    const hidden = worldWith(
      [
        "######################",
        "#1.......G...h.......#",
        "#2...................#",
        "#3...................#",
        "######################",
      ],
      GUARD,
    );
    place(hidden, 0, tile(13, 1));
    expect(caughtBy(hidden)).toBeNull();
    const walled = worldWith(
      [
        "######################",
        "#1.......G.#.........#",
        "#2...................#",
        "#3...................#",
        "######################",
      ],
      GUARD,
    );
    place(walled, 0, tile(13, 1));
    expect(caughtBy(walled)).toBeNull();
  });

  it("patrols between its points at speedTps, facing where it walks", () => {
    const world = worldWith(GRID, {
      G1: {
        ...GUARD.G1,
        patrol: [
          [9, 1],
          [15, 1],
        ],
      },
    });
    hold(world, {}, 20); // one second
    const guard = world.guards[0];
    expect(guard?.pos.x).toBeCloseTo(9.5 + 1.5, 1);
    expect(guard?.facing).toEqual({ x: 1, y: 0 });
    hold(world, {}, 20 * 5); // past the far point, turning back
    expect(world.guards[0]?.facing.x).toBe(-1);
  });
});

describe("caught: the team returns to the checkpoint", () => {
  const caughtWorld = (): World => {
    const world = worldWith(ROOM, CAMERA);
    place(world, 2, tile(1, 3));
    return world;
  };

  it("restores players, crates and loot to the checkpoint snapshot", () => {
    const world = caughtWorld();
    place(world, 0, tile(5, 3)); // K1
    step(world, {}, TICK_MS);
    expect(world.checkpoint).toBe(1);
    expect(world.events).toContainEqual({ kind: "checkpoint", index: 1 });
    // after the checkpoint: take loot and move the crate
    place(world, 0, tile(19, 2));
    step(world, {}, TICK_MS);
    expect(world.loot).toBe(1);
    world.crates[0] = { id: "B1", tile: tile(16, 3) };
    // a second player walks into the watched zone
    place(world, 1, tile(12, 2));
    step(world, {}, TICK_MS);
    expect(world.events).toContainEqual({ kind: "caught", by: "C1" });
    expect(world.loot).toBe(0);
    expect(world.lootTaken).toEqual([]);
    expect(world.crates[0]?.tile).toEqual(tile(15, 3));
    const spots = world.players.map((p) => `${Math.floor(p.pos.x)},${Math.floor(p.pos.y)}`);
    expect(spots).toContain("5,3");
    expect(new Set(spots).size).toBe(3);
    for (const p of world.players) {
      expect(Math.hypot(p.pos.x - 5.5, p.pos.y - 3.5)).toBeLessThan(2.5);
    }
  });

  it("goes back to the spawns when no checkpoint has been reached", () => {
    const world = worldWith(ROOM, CAMERA);
    place(world, 1, tile(12, 2));
    step(world, {}, TICK_MS);
    expect(world.events).toContainEqual({ kind: "caught", by: "C1" });
    expect(world.players[0]?.pos).toEqual({ x: 1.5, y: 1.5 });
    expect(world.players[1]?.pos).toEqual({ x: 1.5, y: 2.5 });
  });

  it("does not clear a room on the tick the team is caught", () => {
    const world = worldWith(ROOM, CAMERA);
    place(world, 1, tile(12, 2));
    step(world, {}, TICK_MS);
    expect(world.status).toBe("playing");
  });
});

describe("checkpoints and loot", () => {
  const GRID = [
    "########################",
    "#1.....K....K.....$....#",
    "#2...................$.#",
    "#3.....................#",
    "########################",
  ];
  it("numbers checkpoints in reading order, never moves back to an earlier one", () => {
    const world = worldWith(GRID);
    place(world, 0, tile(12, 1));
    step(world, {}, TICK_MS);
    expect(world.checkpoint).toBe(2);
    place(world, 0, tile(7, 1));
    step(world, {}, TICK_MS);
    expect(world.checkpoint).toBe(2);
  });

  it("counts loot once, by value, however long a player stands on it", () => {
    const world = worldWith(GRID, { $2: { value: 5 } });
    expect(world.lootTotal).toBe(6);
    place(world, 0, tile(18, 1));
    hold(world, {}, 10);
    expect(world.loot).toBe(1);
    expect(world.events.filter((e) => e.kind === "loot")).toEqual([]);
    place(world, 1, tile(21, 2));
    step(world, {}, TICK_MS);
    expect(world.loot).toBe(6);
  });
});

describe("sequence doors", () => {
  const GRID = [
    "####################",
    "#1..p.p.p..#.......#",
    "#2.........D.....E.#",
    "#3.........#.......#",
    "####################",
  ];
  const door = { D1: { mode: "sequence", opensWhen: ["p2", "p1", "p3"] } };
  const park = tile(2, 1);
  const press = (world: World, id: "p1" | "p2" | "p3") =>
    tap(world, 0, tile({ p1: 4, p2: 6, p3: 8 }[id], 1), park);

  it("opens only when the plates are pressed in sign order", () => {
    const world = worldWith(GRID, door);
    press(world, "p2");
    press(world, "p1");
    expect(world.doorOpen.D1).toBe(false);
    press(world, "p3");
    expect(world.doorOpen.D1).toBe(true);
  });

  it("stays shut in the wrong order", () => {
    const world = worldWith(GRID, door);
    press(world, "p1");
    press(world, "p2");
    press(world, "p3");
    expect(world.doorOpen.D1).toBe(false);
  });

  it("resets after a gap of more than 5 s", () => {
    const world = worldWith(GRID, door);
    press(world, "p2");
    hold(world, {}, T(5) + 2);
    press(world, "p1");
    press(world, "p3");
    expect(world.doorOpen.D1).toBe(false);
    // and the whole sequence still works afterwards
    press(world, "p2");
    press(world, "p1");
    press(world, "p3");
    expect(world.doorOpen.D1).toBe(true);
  });

  it("accepts each press within 5 s of the last", () => {
    const world = worldWith(GRID, door);
    press(world, "p2");
    hold(world, {}, T(4));
    press(world, "p1");
    hold(world, {}, T(4));
    press(world, "p3");
    expect(world.doorOpen.D1).toBe(true);
  });
});

describe("no abilities", () => {
  it("hazards treat every seat alike", () => {
    for (const seat of [0, 1, 2] as const) {
      const world = worldWith(ROOM, CAMERA);
      place(world, seat, tile(12, 2));
      expect(caughtBy(world)).toBe("C1");
      expect(input(0, 0).move).toEqual({ x: 0, y: 0 });
    }
  });
});
