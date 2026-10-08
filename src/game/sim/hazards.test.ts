import { describe, expect, it } from "vitest";
import { cameraWatching, caughtBy, laserOn } from "./hazards.ts";
import { hold, place, worldWith } from "./testing.ts";
import { TICK_MS } from "./world.ts";

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
// C1 is at (7, 1), looking east, 60 degrees wide, 10 tiles deep
const CAMERA = {
  C1: { facingDeg: 0, fovDeg: 60, range: 10, periodS: 6, watchingS: 3, offsetS: 0 },
};
const LASER = { L1: { dir: "right", onS: 2, offS: 2, offsetS: 0 } };

describe("caughtBy: cameras", () => {
  it("catches a player in its cone while it is watching, and not while it looks away", () => {
    const world = worldWith(ROOM, CAMERA);
    place(world, 0, tile(12, 1));
    expect(caughtBy(world)).toBe("C1");
    world.tick = T(4);
    expect(caughtBy(world)).toBeNull();
  });

  it("only sees a cone: not behind it, not off to the side, not beyond its range", () => {
    const world = worldWith(ROOM, CAMERA);
    place(world, 0, tile(4, 1)); // behind
    expect(caughtBy(world)).toBeNull();
    place(world, 0, tile(9, 3)); // 45 degrees off the line: outside the 30 either side
    expect(caughtBy(world)).toBeNull();
    place(world, 0, tile(19, 1)); // 12 tiles: past its range
    expect(caughtBy(world)).toBeNull();
    place(world, 0, tile(12, 2)); // slightly off the line, inside
    expect(caughtBy(world)).toBe("C1");
  });

  it("does not see a player on a hide spot", () => {
    const world = worldWith(ROOM, CAMERA);
    place(world, 0, tile(15, 1)); // the hide spot
    expect(caughtBy(world)).toBeNull();
    place(world, 0, tile(16, 2)); // beside the line of the cover, in the open: seen
    expect(caughtBy(world)).toBe("C1");
  });

  it("is blocked by a wall and by a hide spot standing in the way", () => {
    const walled = worldWith(
      [
        "######################",
        "#1.....C...#.........#",
        "#2...................#",
        "#3...................#",
        "######################",
      ],
      CAMERA,
    );
    place(walled, 0, tile(14, 1));
    expect(caughtBy(walled)).toBeNull();
    const covered = worldWith(
      [
        "######################",
        "#1.....C...h.........#",
        "#2...................#",
        "#3...................#",
        "######################",
      ],
      CAMERA,
    );
    place(covered, 0, tile(14, 1)); // behind the cover
    expect(caughtBy(covered)).toBeNull();
    place(covered, 0, tile(14, 3)); // clear of it
    expect(caughtBy(covered)).toBe("C1");
  });

  it("looks where facingDeg says: south from the top wall", () => {
    const south = worldWith(ROOM, { C1: { ...CAMERA.C1, facingDeg: 90 } });
    place(south, 0, tile(7, 3));
    expect(caughtBy(south)).toBe("C1");
    place(south, 0, tile(12, 1));
    expect(caughtBy(south)).toBeNull();
  });
});

describe("caughtBy: lasers", () => {
  it("catches a player on the beam while it is on, runs to the first wall", () => {
    const world = worldWith(ROOM, { ...LASER, ...CAMERA }); // (the camera looks east, away from the emitter)
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

  it("a hide spot is cover: a player standing behind one is not seen", () => {
    const grid = [
      "######################",
      "#1.......G..h........#",
      "#2...................#",
      "#3...................#",
      "######################",
    ];
    const world = worldWith(grid, GUARD);
    place(world, 0, tile(14, 1)); // straight behind the hide spot at x=12
    expect(caughtBy(world)).toBeNull();
    place(world, 0, tile(14, 2)); // off to the side of its shadow: seen
    expect(caughtBy(world)).toBe("G1");
  });

  const PATROL = {
    G1: {
      ...GUARD.G1,
      patrol: [
        [9, 1],
        [15, 1],
      ],
      turnDegPerS: 180,
    },
  };
  const deg = (v: { x: number; y: number }) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

  it("starts out facing the way it is going to walk", () => {
    const world = worldWith(
      [
        "######################",
        "#1.......G...........#",
        "#2...................#",
        "#3...................#",
        "######################",
      ],
      {
        G1: {
          ...PATROL.G1,
          patrol: [
            [9, 3],
            [9, 1],
          ],
        },
      },
    );
    expect(world.guards[0]?.facing).toEqual({ x: 0, y: -1 }); // toward the second point
  });

  it("patrols between its points at speedTps, facing where it walks", () => {
    const world = worldWith(GRID, PATROL);
    hold(world, {}, 20); // one second
    const guard = world.guards[0];
    expect(guard?.pos.x).toBeCloseTo(9.5 + 1.5, 1);
    expect(deg(guard?.facing ?? { x: 0, y: 0 })).toBeCloseTo(0, 3);
    expect(guard?.moving).toBe(true);
  });

  it("turns round gradually at the end of its patrol, standing still while it does", () => {
    const world = worldWith(GRID, PATROL);
    // 6 tiles at 1.5 tiles/s: walk until it has arrived at the far end
    for (let i = 0; i < 200 && world.guards[0]?.target === 1; i++) hold(world, {}, 1);
    const end = world.guards[0]?.pos.x;
    expect(end).toBeCloseTo(15.5, 6);
    hold(world, {}, 5); // a quarter of a second into the turn: about 45 degrees
    const mid = world.guards[0];
    expect(Math.abs(deg(mid?.facing ?? { x: 0, y: 0 }))).toBeGreaterThan(20);
    expect(Math.abs(deg(mid?.facing ?? { x: 0, y: 0 }))).toBeLessThan(80);
    expect(mid?.pos.x).toBe(end);
    expect(mid?.moving).toBe(false);
    hold(world, {}, 20); // the turn is done and it is walking back
    const back = world.guards[0];
    expect(Math.abs(deg(back?.facing ?? { x: 0, y: 0 }))).toBeCloseTo(180, 0);
    expect(back?.pos.x ?? 99).toBeLessThan(15.5);
  });

  it("turns no faster than turnDegPerS, a step at a time", () => {
    const world = worldWith(GRID, PATROL);
    hold(world, {}, 80);
    let last = deg(world.guards[0]?.facing ?? { x: 0, y: 0 });
    for (let i = 0; i < 10; i++) {
      hold(world, {}, 1);
      const now = deg(world.guards[0]?.facing ?? { x: 0, y: 0 });
      expect(Math.abs(now - last)).toBeLessThanOrEqual(9.0001); // 180 deg/s = 9 deg a tick
      last = now;
    }
  });

  it("sweeps its cone round as it turns: someone beside the end of the lane is seen", () => {
    const world = worldWith(GRID, PATROL);
    place(world, 0, tile(15, 3)); // south of the far end, inside its 6-tile reach
    let caught = false;
    for (let i = 0; i < 120 && !caught; i++) {
      hold(world, {}, 1);
      place(world, 0, tile(15, 3)); // stay put
      caught = caughtBy(world) === "G1";
    }
    expect(caught).toBe(true);
  });
});
