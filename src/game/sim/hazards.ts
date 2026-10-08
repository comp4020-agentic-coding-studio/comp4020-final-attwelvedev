import type { Room, RoomObject } from "../rooms/format.ts";
import type { Vec } from "../types.ts";
import { inCone, lineOfSight } from "./sight.ts";
import { TICK_MS, type World } from "./world.ts";

export const num = (
  params: Record<string, unknown> | undefined,
  key: string,
  or: number,
): number => (typeof params?.[key] === "number" ? (params[key] as number) : or);

const seconds = (tick: number): number => (tick * TICK_MS) / 1000;

// A camera watches for `watchingS` at the start of each `periodS`, shifted by `offsetS`.
export function cameraWatching(
  params: { periodS: number; watchingS: number; offsetS: number },
  tick: number,
): boolean {
  return (seconds(tick) + params.offsetS) % params.periodS < params.watchingS - 1e-9;
}

// A laser is on for `onS`, then off for `offS`, repeating, shifted by `offsetS`.
export function laserOn(
  params: { onS: number; offS: number; offsetS: number },
  tick: number,
): boolean {
  return (seconds(tick) + params.offsetS) % (params.onS + params.offS) < params.onS - 1e-9;
}

export const cameraParams = (o: RoomObject) => ({
  periodS: num(o.params, "periodS", 6),
  watchingS: num(o.params, "watchingS", 3),
  offsetS: num(o.params, "offsetS", 0),
});

export const laserParams = (o: RoomObject) => ({
  onS: num(o.params, "onS", 2),
  offS: num(o.params, "offS", 2),
  offsetS: num(o.params, "offsetS", 0),
});

export const guardParams = (o: RoomObject) => ({
  speedTps: num(o.params, "speedTps", 1.5),
  sightTiles: num(o.params, "sightTiles", 6),
  fovDeg: num(o.params, "fovDeg", 70),
});

export function cameraZone(o: RoomObject): [number, number, number, number] {
  const z = o.params?.zone;
  if (Array.isArray(z) && z.length === 4 && z.every((n) => typeof n === "number")) {
    return z as [number, number, number, number];
  }
  const t = o.tiles[0] as Vec;
  return [t.x, t.y, t.x, t.y];
}

const DIRS: Record<string, Vec> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

// The tiles a laser covers, from the one next to its emitter to the first wall
// (or closed-door tile) in its direction.
export function laserBeam(room: Room, o: RoomObject): Vec[] {
  const dir = DIRS[String(o.params?.dir)] ?? (DIRS.right as Vec);
  const start = o.tiles[0] as Vec;
  const out: Vec[] = [];
  let x = start.x + dir.x;
  let y = start.y + dir.y;
  for (;;) {
    const ch = room.grid[y]?.[x];
    if (ch === undefined || ch === "#" || ch === "D") break;
    out.push({ x, y });
    x += dir.x;
    y += dir.y;
  }
  return out;
}

export const tileOf = (pos: Vec): Vec => ({ x: Math.floor(pos.x), y: Math.floor(pos.y) });

// First hazard that has a player, else null. Guards and cameras cannot see a
// player standing on a hide spot; a laser still catches one.
export function caughtBy(world: World): string | null {
  const objects = world.room.objects;
  const hides = objects.filter((o) => o.kind === "hide").flatMap((o) => o.tiles);
  const hidden = (pos: Vec) => {
    const t = tileOf(pos);
    return hides.some((h) => h.x === t.x && h.y === t.y);
  };
  for (const o of objects) {
    if (o.kind === "guard") {
      const guard = world.guards.find((g) => g.id === o.id);
      if (!guard) continue;
      const { sightTiles, fovDeg } = guardParams(o);
      for (const p of world.players) {
        if (hidden(p.pos)) continue;
        if (
          inCone(guard.pos, guard.facing, p.pos, sightTiles, fovDeg) &&
          lineOfSight(world, guard.pos, p.pos)
        ) {
          return o.id;
        }
      }
    } else if (o.kind === "camera") {
      if (!cameraWatching(cameraParams(o), world.tick)) continue;
      const [x0, y0, x1, y1] = cameraZone(o);
      for (const p of world.players) {
        const t = tileOf(p.pos);
        if (!hidden(p.pos) && t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1) return o.id;
      }
    } else if (o.kind === "laser") {
      if (!laserOn(laserParams(o), world.tick)) continue;
      const beam = laserBeam(world.room, o);
      for (const p of world.players) {
        const t = tileOf(p.pos);
        if (beam.some((b) => b.x === t.x && b.y === t.y)) return o.id;
      }
    }
  }
  return null;
}
