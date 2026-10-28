import { viewFor } from "../perception.ts";
import { step } from "../sim/step.ts";
import { createWorld, TICK_MS } from "../sim/world.ts";
import type { Role } from "../types.ts";
import type { Room } from "./format.ts";

// A cheap look at a room before it is built (the room-mockup script): for every role and every tile
// a body can stand on, what the game's own `viewFor` says that role sees and hears from there. It
// holds no rules of its own, so it cannot drift from the game; the page only draws these answers.
export interface MockCell {
  seen: string[]; // the tiles in line of sight, as the view encodes them
  entities: string[]; // ids of what is in sight (never the players)
  sounds: { kind: string; dir?: { x: number; y: number }; gain: number }[]; // distinct cues over one cycle
}

export interface Mockup {
  id: string;
  name: string;
  width: number;
  height: number;
  grid: string[];
  objects: { id: string; kind: string; tiles: { x: number; y: number }[]; note: string }[];
  beats: { name: string; x: [number, number]; lead?: Role; cue?: string }[];
  dark: [number, number, number, number][];
  cycleTicks: number; // how long the hazards take to repeat, which is how long sounds were collected
  roles: Record<Role, { cells: Record<string, MockCell> }>;
}

const ROLES: Role[] = ["blind", "deaf", "mute"];
const MAX_CYCLE_S = 24;

// The ticks after which every camera, laser and clue has repeated, at most MAX_CYCLE_S.
function cycleOf(room: Room): number {
  const seconds: number[] = [];
  for (const o of room.objects) {
    const p = o.params ?? {};
    const num = (k: string, or: number) => (typeof p[k] === "number" ? (p[k] as number) : or);
    if (o.kind === "camera") seconds.push(num("periodS", 6));
    else if (o.kind === "laser") seconds.push(num("onS", 2) + num("offS", 2));
    else if (o.kind === "clue") seconds.push(num("everyS", 2));
  }
  const ticks = seconds.map((s) => Math.round((s * 1000) / TICK_MS));
  const lcm = (a: number, b: number): number => {
    const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
    return (a / gcd(a, b)) * b;
  };
  const cap = Math.round((MAX_CYCLE_S * 1000) / TICK_MS);
  return Math.min(cap, ticks.reduce(lcm, Math.round(1000 / TICK_MS)));
}

const note = (o: Room["objects"][number]): string => {
  const p = o.params ?? {};
  if (o.kind === "door") return `opens when ${(o.opensWhen ?? []).join(", ")}`;
  if (o.kind === "laser") return `${p.dir ?? "right"}, on ${p.onS ?? 2} s, off ${p.offS ?? 2} s`;
  if (o.kind === "camera")
    return `looks ${p.facingDeg ?? 90}°, watches ${p.watchingS ?? 3} of ${p.periodS ?? 6} s`;
  if (o.kind === "clue") return `chimes ${p.n ?? 1} every ${p.everyS ?? 2} s`;
  if (o.kind === "guard") return "patrols";
  return "";
};

export function buildMockup(room: Room): Mockup {
  const cycleTicks = cycleOf(room);
  const roles = {} as Mockup["roles"];
  for (const role of ROLES) roles[role] = { cells: {} };
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      if (room.grid[y]?.[x] !== ".") continue;
      for (const role of ROLES) {
        // seat 1 stands here and the other two are parked in the corner, out of the way
        const world = createWorld(room);
        world.players[0].pos = { x: 1.5, y: 1.5 };
        world.players[2].pos = { x: 1.5, y: 1.5 };
        world.players[1].pos = { x: x + 0.5, y: y + 0.5 };
        const first = viewFor(world, 1, role, false);
        const sounds = new Map<string, MockCell["sounds"][number]>();
        for (let t = 0; t < cycleTicks; t++) {
          step(world, {}, TICK_MS);
          world.players[1].pos = { x: x + 0.5, y: y + 0.5 };
          for (const s of viewFor(world, 1, role, false).sounds) {
            // one entry per kind and rough bearing (a walking guard's loudness and angle drift a
            // hair each tick), keeping the loudest
            const bearing = s.dir
              ? Math.round((Math.atan2(s.dir.y, s.dir.x) * 180) / Math.PI / 45)
              : "";
            const key = `${s.kind}:${bearing}`;
            const had = sounds.get(key);
            if (!had || s.gain > had.gain) {
              sounds.set(key, { kind: s.kind, ...(s.dir ? { dir: s.dir } : {}), gain: s.gain });
            }
          }
        }
        roles[role].cells[`${x},${y}`] = {
          seen: first.seen ?? [],
          entities: first.entities.filter((e) => e.kind !== "player").map((e) => e.id),
          sounds: [...sounds.values()],
        };
      }
    }
  }
  const dark = Array.isArray(room.meta.flips)
    ? (room.meta.flips as { kind?: string; zone?: [number, number, number, number] }[])
        .filter((f) => f.kind === "dark" && f.zone)
        .map((f) => f.zone as [number, number, number, number])
    : [];
  return {
    id: room.id,
    name: room.name,
    width: room.width,
    height: room.height,
    grid: room.grid,
    objects: room.objects.map((o) => ({ id: o.id, kind: o.kind, tiles: o.tiles, note: note(o) })),
    beats: room.beats.map((b) => ({
      name: b.name,
      x: b.x,
      ...(b.lead ? { lead: b.lead } : {}),
      ...(b.cue ? { cue: b.cue } : {}),
    })),
    dark,
    cycleTicks,
    roles,
  };
}
