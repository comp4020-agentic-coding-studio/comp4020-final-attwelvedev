import type { Vec } from "../types.ts";
import { indexOf, tileKey } from "./collide.ts";
import type { World } from "./world.ts";

const SAMPLE = 0.1; // tiles between line-of-sight samples

// Walls, vents and closed doors stop sight; glass, crates and players do not. A hide spot
// (low cover) stops a hazard's sight only: you can see a teammate crouched behind one.
export function blocksSight(world: World, tx: number, ty: number, forHazard = false): boolean {
  const ch = world.room.grid[ty]?.[tx];
  if (ch === undefined || ch === "#" || ch === "%") return true;
  if (forHazard && indexOf(world.room).hideAt.has(tileKey(tx, ty))) return true;
  if (ch !== "D") return false;
  const id = indexOf(world.room).doorAt.get(tileKey(tx, ty));
  return !id || !world.doorOpen[id];
}

// Walls, glass and closed doors stop sound; a vent and an open door let it through.
export function blocksSound(world: World, tx: number, ty: number): boolean {
  const ch = world.room.grid[ty]?.[tx];
  if (ch === undefined || ch === "#" || ch === "=") return true;
  if (ch !== "D") return false;
  const id = indexOf(world.room).doorAt.get(tileKey(tx, ty));
  return !id || !world.doorOpen[id];
}

// True when nothing that stops sight lies between the two points. Samples the
// segment, skipping the tiles the ends stand on. Reads as a hazard's sight by
// default (hide spots are cover); a player's passes `forHazard = false`.
export function lineOfSight(world: World, a: Vec, b: Vec, forHazard = true): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(dist / SAMPLE);
  const from = { x: Math.floor(a.x), y: Math.floor(a.y) };
  const to = { x: Math.floor(b.x), y: Math.floor(b.y) };
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor(a.x + (b.x - a.x) * t);
    const ty = Math.floor(a.y + (b.y - a.y) * t);
    if ((tx === from.x && ty === from.y) || (tx === to.x && ty === to.y)) continue;
    if (blocksSight(world, tx, ty, forHazard)) return false;
  }
  return true;
}

// Is `target` within `range` tiles of `from` and within half of `fovDeg` either
// side of `facing`?
export function inCone(
  from: Vec,
  facing: Vec,
  target: Vec,
  range: number,
  fovDeg: number,
): boolean {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  if (dist < 0.01) return true;
  const len = Math.hypot(facing.x, facing.y) || 1;
  const cos = (dx * facing.x + dy * facing.y) / (dist * len);
  return Math.acos(Math.max(-1, Math.min(1, cos))) <= (fovDeg / 2) * (Math.PI / 180);
}
