import { describe, expect, it } from "vitest";
import type { Seat } from "../types.ts";
import { step } from "./step.ts";
import { hold, input, place, worldFrom } from "./testing.ts";
import { createWorld, RADIUS, TICK_MS, type World } from "./world.ts";

const OPEN = [
  "##############",
  "#1...........#",
  "#2...........#",
  "#3...........#",
  "##############",
];

describe("createWorld", () => {
  it("puts seats 0..2 on spawns 1..3, centred on their tiles", () => {
    const w = worldFrom(OPEN);
    expect(w.players.map((p) => p.pos)).toEqual([
      { x: 1.5, y: 1.5 },
      { x: 1.5, y: 2.5 },
      { x: 1.5, y: 3.5 },
    ]);
    expect(w.status).toBe("playing");
    expect(w.tick).toBe(0);
  });
});

describe("movement", () => {
  it("moves 4 tiles in 20 ticks at 4 tiles/s", () => {
    const w = worldFrom(OPEN);
    hold(w, { 0: input(1, 0) }, 20);
    expect(w.players[0].pos.x).toBeCloseTo(1.5 + 4, 6);
    expect(w.players[0].pos.y).toBeCloseTo(1.5, 6);
  });

  it("normalises diagonal input to the same speed", () => {
    const w = worldFrom([
      "##########",
      "#1.......#",
      "#2.......#",
      "#3.......#",
      "#........#",
      "#........#",
      "#........#",
      "##########",
    ]);
    hold(w, { 0: input(1, 1) }, 10);
    const dx = w.players[0].pos.x - 1.5;
    const dy = w.players[0].pos.y - 1.5;
    expect(dx).toBeCloseTo(dy, 6);
    expect(Math.hypot(dx, dy)).toBeCloseTo(2, 5);
  });

  it("does not move a seat that sent no input", () => {
    const w = worldFrom(OPEN);
    hold(w, { 0: input(1, 0) }, 5);
    expect(w.players[1].pos).toEqual({ x: 1.5, y: 2.5 });
  });

  it("is blocked by walls", () => {
    const w = worldFrom(OPEN);
    hold(w, { 0: input(0, -1) }, 20);
    expect(w.players[0].pos.y).toBeGreaterThanOrEqual(1 + RADIUS - 1e-3);
    expect(w.players[0].pos.y).toBeLessThan(1 + RADIUS + 0.05);
    hold(w, { 0: input(1, 0) }, 100);
    expect(w.players[0].pos.x).toBeLessThanOrEqual(13 - RADIUS + 1e-9);
  });

  it("slides along a wall on the free axis", () => {
    const w = worldFrom(OPEN);
    hold(w, { 0: input(1, -1) }, 10);
    expect(w.players[0].pos.x).toBeGreaterThan(1.5 + 1);
    expect(w.players[0].pos.y).toBeLessThanOrEqual(1 + RADIUS + 0.05);
  });

  it("is blocked by a closed door and passes an open one", () => {
    const grid = ["##########", "#1..D...E#", "#2..D....#", "#3..D....#", "##########"];
    const w = worldFrom(grid);
    hold(w, { 0: input(1, 0) }, 40);
    expect(w.players[0].pos.x).toBeLessThanOrEqual(4 - RADIUS + 1e-9);
    w.doorOpen.D1 = true;
    hold(w, { 0: input(1, 0) }, 40);
    expect(w.players[0].pos.x).toBeGreaterThan(5);
  });

  it("records the seq of the input it applied", () => {
    const w = worldFrom(OPEN);
    step(w, { 0: { seq: 7, move: { x: 0, y: 0 }, act: false } });
    expect(w.players[0].lastSeq).toBe(7);
  });
});

describe("crates", () => {
  const CRATES = ["##########", "#1..B....#", "#2.......#", "#3.......#", "##########"];

  const pushScenario = (w: World, seat: Seat, ticks: number) => {
    place(w, seat, { x: 2, y: 1 });
    w.players[seat].pos.x = 4 - RADIUS; // flush against the crate on tile 4
    hold(w, { [seat]: input(1, 0) }, ticks);
  };

  it("moves one tile after a 200 ms continuous push, and not before", () => {
    const w = worldFrom(CRATES);
    pushScenario(w, 0, 3);
    expect(w.crates[0]?.tile).toEqual({ x: 4, y: 1 });
    hold(w, { 0: input(1, 0) }, 1);
    expect(w.crates[0]?.tile).toEqual({ x: 5, y: 1 });
    expect(w.events.some((e) => e.kind === "crate")).toBe(true);
  });

  it("restarts the push timer when the player lets go", () => {
    const w = worldFrom(CRATES);
    pushScenario(w, 0, 3);
    hold(w, { 0: input(0, 0) }, 1);
    hold(w, { 0: input(1, 0) }, 3);
    expect(w.crates[0]?.tile).toEqual({ x: 4, y: 1 });
  });

  it("does not push a crate into a wall", () => {
    const w = worldFrom(["#######", "#1.B.##", "#2....#", "#3....#", "#######"]);
    place(w, 0, { x: 2, y: 1 });
    w.players[0].pos.x = 3 - RADIUS;
    hold(w, { 0: input(1, 0) }, 4); // crate moves 3 -> 4
    expect(w.crates[0]?.tile).toEqual({ x: 4, y: 1 });
    hold(w, { 0: input(1, 0) }, 20); // 5 is a wall
    expect(w.crates[0]?.tile).toEqual({ x: 4, y: 1 });
  });

  it("does not push a crate into another crate", () => {
    const w = worldFrom(["########", "#1.BB..#", "#2.....#", "#3.....#", "########"]);
    place(w, 0, { x: 2, y: 1 });
    w.players[0].pos.x = 3 - RADIUS;
    hold(w, { 0: input(1, 0) }, 20);
    expect(w.crates.map((c) => c.tile)).toEqual([
      { x: 3, y: 1 },
      { x: 4, y: 1 },
    ]);
  });

  it("does not push a crate into a closed door", () => {
    const w = worldFrom(["########", "#1.BD..#", "#2..D..#", "#3..D..#", "########"]);
    place(w, 0, { x: 2, y: 1 });
    w.players[0].pos.x = 3 - RADIUS;
    hold(w, { 0: input(1, 0) }, 20);
    expect(w.crates[0]?.tile).toEqual({ x: 3, y: 1 });
  });

  // Regression: pushing was hit and miss. The push check only counted a crate as
  // touched within ~2e-5 tiles, but a player stops up to ~1e-3 short of it, so
  // whether a push worked depended on where the walk happened to start.
  const YARD = [
    "################",
    "#1.............#",
    "#2.............#",
    "#3.............#",
    "#.......B......#",
    "#..............#",
    "#..............#",
    "#..............#",
    "################",
  ];
  const crateStart = { x: 8, y: 4 };
  // three tiles from the crate, with room behind the player for the offset
  const directions = [
    { name: "east", dir: { x: 1, y: 0 }, from: { x: 4.5, y: 4.5 } },
    { name: "west", dir: { x: -1, y: 0 }, from: { x: 12.5, y: 4.5 } },
    { name: "south", dir: { x: 0, y: 1 }, from: { x: 8.5, y: 2.5 } },
    { name: "north", dir: { x: 0, y: -1 }, from: { x: 8.5, y: 6.5 } },
  ];
  // start a little nearer or further along the walking axis each time
  const offsets = Array.from({ length: 20 }, (_, i) => i * 0.0497);

  it.each(directions)("pushes a crate $name from any starting offset", ({ dir, from }) => {
    for (const offset of offsets) {
      const w = worldFrom(YARD);
      w.players[0].pos = { x: from.x - dir.x * offset, y: from.y - dir.y * offset };
      hold(w, { 0: input(dir.x, dir.y) }, 40);
      const tile = w.crates[0]?.tile ?? crateStart;
      const moved = (tile.x - crateStart.x) * dir.x + (tile.y - crateStart.y) * dir.y;
      expect(moved, `offset ${offset}`).toBeGreaterThan(0);
    }
  });

  it.each([0, 1, 2] as const)("seat %i can push a crate (FR9)", (seat) => {
    const w = worldFrom(CRATES);
    pushScenario(w, seat, 4);
    expect(w.crates[0]?.tile).toEqual({ x: 5, y: 1 });
  });
});

describe("plates and doors", () => {
  // three plates in a column against a three-tile door, as in room 01
  const COURT = [
    "############",
    "#1.....#...#",
    "#2....pD..E#",
    "#3....pD..E#",
    "#.....pD..E#",
    "############",
  ];

  const onPlates = (w: World, seats: Seat[]) => {
    for (const [i, s] of seats.entries()) place(w, s, { x: 6, y: 2 + i });
  };

  it.each([[[0, 1, 2]], [[2, 0, 1]], [[1, 2, 0]]] as const)(
    "any seat can press any plate (FR9): %j",
    (seats) => {
      const w = worldFrom(COURT);
      onPlates(w, [...seats]);
      hold(w, {}, 1);
      expect(w.pressed).toEqual({ p1: true, p2: true, p3: true });
      expect(w.doorOpen.D1).toBe(true);
    },
  );

  it("opens the door only when all three plates are pressed, with one door event", () => {
    const w = worldFrom(COURT);
    onPlates(w, [0, 1]);
    place(w, 2, { x: 2, y: 2 });
    hold(w, {}, 3);
    expect(w.doorOpen.D1).toBe(false);
    place(w, 2, { x: 6, y: 4 });
    const events = [];
    for (let i = 0; i < 4; i++) {
      step(w, {}, TICK_MS);
      events.push(...w.events.filter((e) => e.kind === "door"));
    }
    expect(w.doorOpen.D1).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "door", id: "D1", open: true });
  });

  it("keeps the door open once opened, even after every plate is released", () => {
    const w = worldFrom(COURT);
    onPlates(w, [0, 1, 2]);
    hold(w, {}, 1);
    place(w, 2, { x: 2, y: 2 });
    hold(w, {}, 1);
    expect(w.doorOpen.D1).toBe(true);
    for (const s of [0, 1, 2] as const) place(w, s, { x: 2, y: 2 });
    hold(w, {}, 20);
    expect(w.doorOpen.D1).toBe(true);
    expect(w.events.filter((e) => e.kind === "door")).toEqual([]);
  });

  it("a crate on a plate presses it", () => {
    // the door here only needs plates p1 (4,1) and p2 (3,2)
    const w = worldFrom(
      ["##########", "#1..pD..E#", "#2.p.D..E#", "#3.....B.#", "##########"],
      ["p1", "p2"],
    );
    place(w, 0, { x: 4, y: 1 });
    const crate = w.crates[0];
    if (!crate) throw new Error("fixture has a crate");
    crate.tile = { x: 3, y: 2 };
    hold(w, {}, 1);
    expect(w.pressed).toEqual({ p1: true, p2: true });
    expect(w.doorOpen.D1).toBe(true);
  });

  it("lets one player through alone after it has opened, and back again", () => {
    const w = worldFrom(COURT);
    onPlates(w, [0, 1, 2]);
    hold(w, {}, 1);
    for (const s of [1, 2] as const) place(w, s, { x: 2, y: 2 });
    hold(w, { 0: input(1, 0) }, 20);
    expect(w.players[0].pos.x).toBeGreaterThan(8.4);
    hold(w, { 0: input(-1, 0) }, 30);
    expect(w.players[0].pos.x).toBeLessThan(6);
  });
});

describe("exit", () => {
  const EXIT = ["########", "#1....E#", "#2....E#", "#3....E#", "########"];

  it("clears the room when all three centres are on E, with one cleared event", () => {
    const w = worldFrom(EXIT);
    for (const s of [0, 1, 2] as const) place(w, s, { x: 6, y: 1 + s });
    let cleared = 0;
    for (let i = 0; i < 5; i++) {
      step(w, {}, TICK_MS);
      cleared += w.events.filter((e) => e.kind === "cleared").length;
    }
    expect(w.status).toBe("cleared");
    expect(cleared).toBe(1);
  });

  it("does not clear with two on E", () => {
    const w = worldFrom(EXIT);
    place(w, 0, { x: 6, y: 1 });
    place(w, 1, { x: 6, y: 2 });
    hold(w, {}, 5);
    expect(w.status).toBe("playing");
  });
});

describe("determinism", () => {
  it("replaying the same inputs yields identical worlds", () => {
    const grid = ["##########", "#1..B....#", "#2.......#", "#3.....E.#", "##########"];
    const script = (w: World) => {
      for (let i = 0; i < 60; i++) {
        step(
          w,
          {
            0: { seq: i, move: { x: i % 7 < 5 ? 1 : 0, y: i % 3 === 0 ? -1 : 0 }, act: false },
            1: { seq: i, move: { x: 0.3, y: i % 2 ? 1 : -1 }, act: true },
          },
          TICK_MS,
        );
      }
      return w;
    };
    const a = script(createWorld(worldFrom(grid).room));
    const b = script(createWorld(worldFrom(grid).room));
    expect(a).toEqual(b);
  });
});

describe("blocked: pushing at something and not getting anywhere", () => {
  const GRID = ["#######", "#1..B.#", "#2....#", "#3....#", "#######"];
  const east = { 0: input(1, 0) };
  const at = (x: number, y: number) => ({ x, y });

  it("is false while walking freely, and with no input", () => {
    const w = worldFrom(GRID);
    hold(w, east, 3);
    expect(w.players[0].moving).toBe(true);
    expect(w.players[0].blocked).toBe(false);
    hold(w, {}, 1);
    expect(w.players[0].blocked).toBe(false);
  });

  it("is true when pushing straight into a wall, and clears when you turn away", () => {
    const w = worldFrom(GRID);
    place(w, 1, at(5, 2));
    hold(w, { 1: input(1, 0) }, 6);
    expect(w.players[1].moving).toBe(true);
    expect(w.players[1].blocked).toBe(true);
    hold(w, { 1: input(-1, 0) }, 2);
    expect(w.players[1].blocked).toBe(false);
  });

  it("is false while sliding along a wall: you are still getting somewhere", () => {
    const w = worldFrom(GRID);
    place(w, 1, at(5, 2));
    hold(w, { 1: input(1, 1) }, 4);
    expect(w.players[1].blocked).toBe(false);
  });

  it("is true against a crate that has not moved yet", () => {
    const w = worldFrom(GRID);
    place(w, 0, at(3, 1)); // the crate is at (4, 1)
    hold(w, { 0: input(1, 0) }, 2);
    expect(w.players[0].blocked).toBe(true);
  });
});
