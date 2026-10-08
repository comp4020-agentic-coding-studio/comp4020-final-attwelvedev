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
  const head = JSON.stringify({ id: "t", name: "T", version: 1, beats: [], objects, ...extra });
  return parseRoom(`${head}\n---\n${grid.join("\n")}\n`);
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
