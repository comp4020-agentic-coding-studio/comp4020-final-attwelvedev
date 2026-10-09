import type { Room } from "../rooms/format.ts";
import {
  cameraApex,
  cameraCone,
  cameraParams,
  cameraWatching,
  guardParams,
  laserBeam,
  laserOn,
  laserParams,
} from "../sim/hazards.ts";
import { inCone, lineOfSight } from "../sim/sight.ts";
import { step } from "../sim/step.ts";
import { createWorld, type GuardState, TICK_MS, type World } from "../sim/world.ts";
import type { Vec } from "../types.ts";

// A bot's knowledge of hazard timing (FR24): the room's static params and the
// tick. Lasers and cameras are pure functions of the tick; a guard's patrol is
// found by stepping a shadow copy of the room with nobody in it. A window is
// the ticks [from, to) the alarm was seen on: it speeds guards up and holds
// cameras on, so the shadow is replayed with it.
export interface AlarmWindow {
  from: number;
  to: number;
}

export interface Forecast {
  readonly room: Room;
  // 1 at index y * width + x when a player passing through that tile at `tick`
  // could be caught: any of its centre or edge midpoints is seen or in a beam.
  danger(tick: number): Uint8Array;
  // The same for a player standing still on the middle of the tile.
  rest(tick: number): Uint8Array;
}

const CENTRE: readonly Vec[] = [{ x: 0.5, y: 0.5 }];
const SAMPLES: readonly Vec[] = [
  ...CENTRE,
  { x: 0, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 0 },
  { x: 0.5, y: 1 },
];

const cache = new WeakMap<Room, Map<string, Forecast>>();

export function forecastFor(room: Room, alarms: readonly AlarmWindow[] = []): Forecast {
  const key = alarms.map((a) => `${a.from}-${a.to}`).join(",");
  let byKey = cache.get(room);
  if (!byKey) {
    byKey = new Map();
    cache.set(room, byKey);
  }
  let forecast = byKey.get(key);
  if (!forecast) {
    forecast = build(room, alarms);
    byKey.set(key, forecast);
  }
  return forecast;
}

function build(room: Room, alarms: readonly AlarmWindow[]): Forecast {
  const { width, height } = room;
  // Every door open, so sight is as far as it could ever be: the safe side to err on.
  const shadow: World = createWorld(room);
  for (const id of Object.keys(shadow.doorOpen)) shadow.doorOpen[id] = true;
  const guardsAt: GuardState[][] = [shadow.guards.map((g) => ({ ...g }))];
  const alarmAt = (t: number) => alarms.some((a) => t >= a.from && t < a.to);

  const ensure = (tick: number) => {
    while (guardsAt.length <= tick) {
      const next = shadow.tick + 1;
      const window = alarms.find((a) => a.from === next);
      if (window) shadow.alarmUntil = window.to;
      step(shadow, {}, TICK_MS);
      guardsAt.push(shadow.guards.map((g) => ({ ...g })));
    }
  };

  const hide = new Set<number>();
  for (const o of room.objects) {
    if (o.kind === "hide") for (const t of o.tiles) hide.add(t.y * width + t.x);
  }
  const floor = (x: number, y: number) => room.grid[y]?.[x] !== "#";

  const lasers = room.objects.filter((o) => o.kind === "laser");
  const beams = new Map(lasers.map((o) => [o.id, laserBeam(room, o)]));
  const cameras = room.objects
    .filter((o) => o.kind === "camera")
    .map((o) => {
      const { facing, fovDeg, range } = cameraCone(o);
      const apex = cameraApex(o);
      const watchedBy = (samples: readonly Vec[]) => {
        const watched: number[] = [];
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (!floor(x, y) || hide.has(y * width + x)) continue;
            const seen = samples.some((s) => {
              const p = { x: x + s.x, y: y + s.y };
              return inCone(apex, facing, p, range, fovDeg) && lineOfSight(shadow, apex, p);
            });
            if (seen) watched.push(y * width + x);
          }
        }
        return watched;
      };
      return { params: cameraParams(o), through: watchedBy(SAMPLES), rest: watchedBy(CENTRE) };
    });
  const guards = room.objects.filter((o) => o.kind === "guard");

  const maskFor =
    (cache: Map<number, Uint8Array>, samples: readonly Vec[], rest: boolean) =>
    (tick: number): Uint8Array => {
      const cached = cache.get(tick);
      if (cached) return cached;
      const mask = new Uint8Array(width * height);
      for (const laser of lasers) {
        if (!laserOn(laserParams(laser), tick)) continue;
        for (const t of beams.get(laser.id) ?? []) mask[t.y * width + t.x] = 1;
      }
      for (const camera of cameras) {
        if (alarmAt(tick) || cameraWatching(camera.params, tick)) {
          for (const i of rest ? camera.rest : camera.through) mask[i] = 1;
        }
      }
      if (guards.length > 0) {
        ensure(tick);
        const state = guardsAt[tick] as GuardState[];
        for (const object of guards) {
          const guard = state.find((g) => g.id === object.id);
          if (!guard) continue;
          const { sightTiles, fovDeg } = guardParams(object);
          const reach = Math.ceil(sightTiles) + 1;
          const cx = Math.floor(guard.pos.x);
          const cy = Math.floor(guard.pos.y);
          for (let y = Math.max(0, cy - reach); y <= Math.min(height - 1, cy + reach); y++) {
            for (let x = Math.max(0, cx - reach); x <= Math.min(width - 1, cx + reach); x++) {
              if (!floor(x, y) || hide.has(y * width + x)) continue;
              const seen = samples.some((s) => {
                const p = { x: x + s.x, y: y + s.y };
                return (
                  inCone(guard.pos, guard.facing, p, sightTiles, fovDeg) &&
                  lineOfSight(shadow, guard.pos, p)
                );
              });
              if (seen) mask[y * width + x] = 1;
            }
          }
        }
      }
      cache.set(tick, mask);
      return mask;
    };
  return {
    room,
    danger: maskFor(new Map(), SAMPLES, false),
    rest: maskFor(new Map(), CENTRE, true),
  };
}
