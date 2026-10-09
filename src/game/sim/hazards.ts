import type { Room, RoomObject } from "../rooms/format.ts";
import type { Seat, Vec } from "../types.ts";
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

// While the alarm is on every camera watches, whatever its cycle says.
export const alarmOn = (world: World): boolean => world.tick < world.alarmUntil;
export const isWatching = (world: World, camera: RoomObject): boolean =>
  alarmOn(world) || cameraWatching(cameraParams(camera), world.tick);

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
  turnDegPerS: num(o.params, "turnDegPerS", 180), // how fast it swings round at the end of a patrol
});

// Where a camera sees from: the wall behind it, half a tile back from the middle of
// its tile. Seeing from the middle left a sliver of the tile (the strip along the
// wall) "behind" the camera, so a player hugging the wall walked past it unseen.
export function cameraApex(o: RoomObject): Vec {
  const { facing } = cameraCone(o);
  const t = o.tiles[0] as Vec;
  return { x: t.x + 0.5 - facing.x * 0.5, y: t.y + 0.5 - facing.y * 0.5 };
}

// A camera looks the way `facingDeg` says (0 east, 90 south, as the map is drawn),
// across `fovDeg` and out to `range` tiles, like a guard. Walls and cover block it.
export function cameraCone(o: RoomObject): { facing: Vec; fovDeg: number; range: number } {
  const rad = (num(o.params, "facingDeg", 90) * Math.PI) / 180;
  return {
    facing: { x: Math.cos(rad), y: Math.sin(rad) },
    fovDeg: num(o.params, "fovDeg", 90),
    range: num(o.params, "range", 8),
  };
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

export type HazardKind = "guard" | "camera" | "laser";

// First hazard that has a player, and which player: what the team is told. Guards and
// cameras cannot see a player standing on a hide spot; a laser still catches one.
export function findCatch(world: World): { by: string; hazard: HazardKind; seat: Seat } | null {
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
          return { by: o.id, hazard: "guard", seat: p.seat };
        }
      }
    } else if (o.kind === "camera") {
      if (!isWatching(world, o)) continue;
      const at = cameraApex(o);
      const { facing, fovDeg, range } = cameraCone(o);
      for (const p of world.players) {
        if (hidden(p.pos)) continue;
        if (inCone(at, facing, p.pos, range, fovDeg) && lineOfSight(world, at, p.pos)) {
          return { by: o.id, hazard: "camera", seat: p.seat };
        }
      }
    } else if (o.kind === "laser") {
      if (!laserOn(laserParams(o), world.tick)) continue;
      const beam = laserBeam(world.room, o);
      for (const p of world.players) {
        const t = tileOf(p.pos);
        if (beam.some((b) => b.x === t.x && b.y === t.y)) {
          return { by: o.id, hazard: "laser", seat: p.seat };
        }
      }
    }
  }
  return null;
}

export const caughtBy = (world: World): string | null => findCatch(world)?.by ?? null;
