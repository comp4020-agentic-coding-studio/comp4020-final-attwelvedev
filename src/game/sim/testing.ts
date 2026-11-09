// Helpers for the simulation's tests only.
import { parseRoom } from "../rooms/format.ts";
import type { PlayerInput, Seat, Vec } from "../types.ts";
import { step } from "./step.ts";
import { createWorld, type Inputs, TICK_MS, type World } from "./world.ts";

export function roomFrom(grid: string[], opensWhen: string[] = ["p1", "p2", "p3"]) {
  const head = JSON.stringify({
    id: "t",
    name: "T",
    version: 1,
    beats: [],
    objects: { D1: { opensWhen } },
  });
  return parseRoom(`${head}\n---\n${grid.join("\n")}\n`);
}

export const worldFrom = (grid: string[], opensWhen?: string[]): World =>
  createWorld(roomFrom(grid, opensWhen));

let seqCounter = 0;
export const input = (x: number, y: number, act = false): PlayerInput => ({
  seq: ++seqCounter,
  move: { x, y },
  act,
});

// Runs `ticks` steps with the same input held by each listed seat.
export function hold(world: World, inputs: Inputs, ticks: number): World {
  for (let i = 0; i < ticks; i++) step(world, inputs, TICK_MS);
  return world;
}

// The whole team on one tile (players may overlap).
export function gather(world: World, tile: Vec): void {
  for (const seat of [0, 1, 2] as const) place(world, seat, tile);
}

export function place(world: World, seat: Seat, tile: Vec): void {
  const p = world.players[seat];
  p.pos = { x: tile.x + 0.5, y: tile.y + 0.5 };
}

// A room with object metadata of any kind (guards, cameras, sequence doors...).
export function roomWith(
  grid: string[],
  objects: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) {
  const given = giveChambers(grid, objects);
  const head = JSON.stringify({
    id: "t",
    name: "T",
    version: 1,
    beats: [],
    objects: given.objects,
    ...extra,
  });
  return parseRoom(`${head}\n---\n${given.grid.join("\n")}\n`);
}

export const worldWith = (
  grid: string[],
  objects: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): World => createWorld(roomWith(grid, objects, extra));

// Puts a seat on a tile for one tick, then parks it on `park` for another, so a
// plate is pressed and released.
export function tap(world: World, seat: Seat, tile: Vec, park: Vec): void {
  place(world, seat, tile);
  step(world, {}, TICK_MS);
  place(world, seat, park);
  step(world, {}, TICK_MS);
}

// A room for station tests: spawns at x = 1, Q1's anchor at (7, 4), more station anchors (Q2,
// Q3...) after it in reading order on the bottom row from x = 14, a sign S1 at (16, 1), and open
// floor between. `objects` is the metadata (Q1's type and parts, a door's opensWhen...).
export function stationWorld(objects: Record<string, unknown>, seed = 1): World {
  const extra = Object.keys(objects).filter((id) => /^Q[2-9]$/.test(id)).length;
  const row = (y: number) => {
    const cells = "#................#".split("");
    if (y <= 3) cells[1] = String(y);
    if (y === 4) cells[7] = "Q";
    if (y === 5) for (let i = 0; i < extra; i++) cells[14 + i] = "Q";
    if (y === 1) cells[16] = "S";
    return cells.join("");
  };
  let grid = ["#".repeat(18), ...[1, 2, 3, 4, 5].map(row), "#".repeat(18)];
  if (objects.D1) grid[2] = `${(grid[2] as string).slice(0, 16)}D#`;
  // a cache needs a chamber to parse: give each one that has none the minimal one below the room
  const given = giveChambers(grid, objects, 1);
  grid = given.grid;
  const withCaches = given.objects;
  return createWorld(roomWith(grid, withCaches), seed);
}

// For tests that are not about the chamber: if any object is a cache without a `chamber`, bolts the
// minimal one under the grid (see `withChamber`) and adds it to each such cache.
export function giveChambers(grid: string[], objects: Record<string, unknown>, x?: number) {
  const bare = (o: unknown) =>
    isCache(o) && !Object.hasOwn((o as { cache: object }).cache, "chamber");
  if (!Object.values(objects).some(bare)) return { grid, objects };
  const built = withChamber(grid, x);
  return {
    grid: built.grid,
    objects: Object.fromEntries(
      Object.entries(objects).map(([id, o]) => [
        id,
        bare(o)
          ? {
              ...(o as object),
              cache: { ...(o as { cache: object }).cache, chamber: built.chamber },
            }
          : o,
      ]),
    ),
  };
}

const isCache = (o: unknown): boolean =>
  typeof o === "object" && o !== null && typeof (o as { cache?: unknown }).cache === "object";

// Bolts a minimal chamber under a grid whose last row is a wall: the wall row gets a secret door `D`
// at `x` (default: the first floor tile of the last interior row), below it one row of chamber floor
// with a vault door and a one-tile vault behind it. Returns the new grid and the cache's `chamber`
// metadata, for tests that need a cache to parse and are not about the chamber itself.
export function withChamber(grid: string[], x?: number) {
  const h = grid.length;
  const cx = x ?? (grid[h - 2] as string).indexOf(".");
  const w = Math.max(...grid.map((r) => r.length), cx + 4);
  const pad = (r: string) => r.padEnd(w, "#");
  const put = (r: string, from: number, cells: string) =>
    r.slice(0, from) + cells + r.slice(from + cells.length);
  const rows = [
    ...grid.slice(0, h - 1).map(pad),
    put("#".repeat(w), cx, "D"),
    put("#".repeat(w), cx, "..D."),
    "#".repeat(w),
  ];
  return {
    grid: rows,
    chamber: {
      rect: [cx, h, cx + 3, h],
      door: [cx, h - 1],
      vault: { rect: [cx + 3, h, cx + 3, h], door: [cx + 2, h], item: [cx + 3, h] },
    },
  };
}
