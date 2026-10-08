import type { Stamp } from "./channels.ts";
import {
  cameraParams,
  cameraWatching,
  cameraZone,
  guardParams,
  laserBeam,
  laserOn,
  laserParams,
} from "./sim/hazards.ts";
import { type RoomStatus, TICK_MS, type World } from "./sim/world.ts";
import type { Role, Seat, Vec } from "./types.ts";

export interface EntityView {
  id: string;
  kind:
    | "player"
    | "crate"
    | "door"
    | "plate"
    | "exit"
    | "stamp"
    | "guard"
    | "camera"
    | "laser"
    | "hide"
    | "checkpoint"
    | "loot"
    | "sign";
  pos: Vec;
  // a stamp's state is which stamp it is; a camera is watching or idle, a laser
  // on or off, a checkpoint reached or up
  state?:
    | "open"
    | "closed"
    | "pressed"
    | "up"
    | "watching"
    | "idle"
    | "on"
    | "off"
    | "reached"
    | Stamp;
  cone?: { fovDeg: number; range: number }; // a guard's sight
  zone?: [number, number, number, number]; // a camera's tiles, x0 y0 x1 y1 inclusive
  beam?: Vec[]; // a laser's tile centres
  shows?: string[]; // a sign's plate ids, in order
  age?: number; // ms since a stamp landed
  seat?: Seat;
  role?: Role;
  facing?: Vec;
}

export interface SoundCue {
  kind: "footsteps" | "hum" | "door";
  pan: number;
  gain: number;
}

export interface RoleView {
  tick: number;
  ack: number; // last input seq applied for this seat
  room: string;
  role: Role;
  full: boolean; // true when tiles are included
  you: { seat: Seat; pos?: Vec };
  tiles?: string[];
  entities: EntityView[];
  sounds: SoundCue[];
  status: RoomStatus;
  elapsedMs: number;
}

const HEARING_RANGE = 12;
const PAN_RANGE = 8;

const round = (n: number): number => Math.round(n * 1000) / 1000;
const rounded = (v: Vec): Vec => ({ x: round(v.x), y: round(v.y) });
const centre = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });

// What a seeing role is shown: the three players, then every object whose
// `visibleTo` lists the role. Doors and exits are one entity per tile.
function entitiesFor(world: World, seat: Seat, role: Role): EntityView[] {
  const out: EntityView[] = world.players.map((p) => {
    const e: EntityView = { id: `P${p.seat}`, kind: "player", pos: rounded(p.pos), seat: p.seat };
    if (p.seat === seat) e.role = role;
    if (p.moving) e.facing = { x: round(p.facing.x), y: round(p.facing.y) };
    return e;
  });
  for (const o of world.room.objects) {
    if (!o.visibleTo.includes(role)) continue;
    if (o.kind === "crate") {
      const crate = world.crates.find((c) => c.id === o.id);
      if (crate) out.push({ id: o.id, kind: "crate", pos: centre(crate.tile) });
    } else if (o.kind === "plate") {
      for (const t of o.tiles) {
        const state = world.pressed[o.id] ? "pressed" : "up";
        out.push({ id: o.id, kind: "plate", pos: centre(t), state });
      }
    } else if (o.kind === "door") {
      for (const t of o.tiles) {
        const state = world.doorOpen[o.id] ? "open" : "closed";
        out.push({ id: o.id, kind: "door", pos: centre(t), state });
      }
    } else if (o.kind === "exit") {
      for (const t of o.tiles) out.push({ id: o.id, kind: "exit", pos: centre(t) });
    } else if (o.kind === "guard") {
      const guard = world.guards.find((g) => g.id === o.id);
      if (!guard) continue;
      const { sightTiles, fovDeg } = guardParams(o);
      out.push({
        id: o.id,
        kind: "guard",
        pos: rounded(guard.pos),
        facing: rounded(guard.facing),
        cone: { fovDeg, range: sightTiles },
      });
    } else if (o.kind === "camera") {
      const watching = cameraWatching(cameraParams(o), world.tick);
      out.push({
        id: o.id,
        kind: "camera",
        pos: centre(o.tiles[0] as Vec),
        state: watching ? "watching" : "idle",
        zone: cameraZone(o),
      });
    } else if (o.kind === "laser") {
      out.push({
        id: o.id,
        kind: "laser",
        pos: centre(o.tiles[0] as Vec),
        state: laserOn(laserParams(o), world.tick) ? "on" : "off",
        beam: laserBeam(world.room, o).map(centre),
      });
    } else if (o.kind === "hide") {
      out.push({ id: o.id, kind: "hide", pos: centre(o.tiles[0] as Vec) });
    } else if (o.kind === "checkpoint") {
      const reached = Number(o.id.slice(1)) <= world.checkpoint;
      out.push({
        id: o.id,
        kind: "checkpoint",
        pos: centre(o.tiles[0] as Vec),
        state: reached ? "reached" : "up",
      });
    } else if (o.kind === "loot") {
      if (!world.lootTaken.includes(o.id)) {
        out.push({ id: o.id, kind: "loot", pos: centre(o.tiles[0] as Vec) });
      }
    } else if (o.kind === "sign") {
      const shows = Array.isArray(o.params?.shows)
        ? o.params.shows.filter((v): v is string => typeof v === "string")
        : [];
      out.push({ id: o.id, kind: "sign", pos: centre(o.tiles[0] as Vec), shows });
    }
  }
  for (const s of world.stamps) {
    out.push({ id: s.key, kind: "stamp", pos: s.pos, state: s.id, age: s.ageMs });
  }
  return out;
}

function cue(kind: SoundCue["kind"], source: Vec, listener: Vec): SoundCue | null {
  const gain = 1 - Math.hypot(source.x - listener.x, source.y - listener.y) / HEARING_RANGE;
  if (gain <= 0) return null;
  const pan = Math.max(-1, Math.min(1, (source.x - listener.x) / PAN_RANGE));
  return { kind, pan, gain };
}

// What a hearing role is told: others' footsteps, a hum while standing on a
// plate, and a click when a door opens. Sound is how the Can't-see player
// learns anything about the room.
function soundsFor(world: World, seat: Seat): SoundCue[] {
  const me = world.players[seat].pos;
  const out: SoundCue[] = [];
  for (const p of world.players) {
    if (p.seat === seat || !p.moving) continue;
    const c = cue("footsteps", p.pos, me);
    if (c) out.push(c);
  }
  const tile = { x: Math.floor(me.x), y: Math.floor(me.y) };
  const onPlate = world.room.objects.some(
    (o) => o.kind === "plate" && o.tiles.some((t) => t.x === tile.x && t.y === tile.y),
  );
  if (onPlate) out.push({ kind: "hum", pan: 0, gain: 1 });
  for (const e of world.events) {
    if (e.kind !== "door" || !e.open) continue;
    const c = cue("door", e.at, me);
    if (c) out.push(c);
  }
  return out;
}

// The one place that decides what a role may know (ADR 0007). A field added to
// RoleView must be gated here against the role tables in types.ts.
export function viewFor(world: World, seat: Seat, role: Role, full: boolean): RoleView {
  const view: RoleView = {
    tick: world.tick,
    ack: world.players[seat].lastSeq,
    room: world.room.id,
    role,
    full,
    you: { seat },
    entities: [],
    sounds: [],
    status: world.status,
    elapsedMs: world.tick * TICK_MS,
  };
  if (role !== "blind") {
    view.you.pos = rounded(world.players[seat].pos);
    view.entities = entitiesFor(world, seat, role);
    if (full) view.tiles = world.room.grid;
  }
  if (role !== "deaf") view.sounds = soundsFor(world, seat);
  return view;
}
