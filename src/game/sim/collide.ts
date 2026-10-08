import type { Room } from "../rooms/format.ts";
import type { Vec } from "../types.ts";
import { RADIUS, type World } from "./world.ts";

const EPS = 1e-6;

interface RoomIndex {
  doorAt: Map<string, string>; // "x,y" -> door id
  plateAt: Map<string, string>; // "x,y" -> plate id
  exitAt: Set<string>;
}

// Rooms never change after parsing, so the lookups are built once per Room.
const indexes = new WeakMap<Room, RoomIndex>();

export const tileKey = (x: number, y: number): string => `${x},${y}`;

export function indexOf(room: Room): RoomIndex {
  let index = indexes.get(room);
  if (index) return index;
  index = { doorAt: new Map(), plateAt: new Map(), exitAt: new Set() };
  for (const o of room.objects) {
    for (const t of o.tiles) {
      if (o.kind === "door") index.doorAt.set(tileKey(t.x, t.y), o.id);
      else if (o.kind === "plate") index.plateAt.set(tileKey(t.x, t.y), o.id);
      else if (o.kind === "exit") index.exitAt.add(tileKey(t.x, t.y));
    }
  }
  indexes.set(room, index);
  return index;
}

// Does a circle of RADIUS at `pos` overlap the unit tile at (tx, ty)?
export function circleHitsTile(pos: Vec, tx: number, ty: number, radius = RADIUS): boolean {
  const cx = Math.max(tx, Math.min(pos.x, tx + 1));
  const cy = Math.max(ty, Math.min(pos.y, ty + 1));
  const r = radius - EPS;
  return (pos.x - cx) ** 2 + (pos.y - cy) ** 2 < r * r;
}

export function crateAt(world: World, tx: number, ty: number): boolean {
  return world.crates.some((c) => c.tile.x === tx && c.tile.y === ty);
}

// A tile that stops a player: wall (or off the map), closed door, crate.
export function solidTile(world: World, tx: number, ty: number): boolean {
  const ch = world.room.grid[ty]?.[tx];
  if (ch === undefined || ch === "#") return true;
  if (ch === "D") {
    const id = indexOf(world.room).doorAt.get(tileKey(tx, ty));
    if (!id || !world.doorOpen[id]) return true;
  }
  return crateAt(world, tx, ty);
}

export function blockedAt(world: World, pos: Vec): boolean {
  const x0 = Math.floor(pos.x - RADIUS);
  const x1 = Math.floor(pos.x + RADIUS);
  const y0 = Math.floor(pos.y - RADIUS);
  const y1 = Math.floor(pos.y + RADIUS);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (solidTile(world, tx, ty) && circleHitsTile(pos, tx, ty)) return true;
    }
  }
  return false;
}

// The crate tile a player at `pos` is touching on the +/-x or +/-y side, if any.
export function crateTouching(world: World, pos: Vec, dir: Vec): Vec | null {
  const probe = { x: pos.x + dir.x * 2 * EPS * 10, y: pos.y + dir.y * 2 * EPS * 10 };
  for (const c of world.crates) {
    if (circleHitsTile(probe, c.tile.x, c.tile.y)) return c.tile;
  }
  return null;
}
