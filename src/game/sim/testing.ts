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

export function place(world: World, seat: Seat, tile: Vec): void {
  const p = world.players[seat];
  p.pos = { x: tile.x + 0.5, y: tile.y + 0.5 };
}
