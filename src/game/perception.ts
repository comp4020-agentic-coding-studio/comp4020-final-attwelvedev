import type { Stamp } from "./channels.ts";
import { subtractRects } from "./clip.ts";
import { visiblePolygon } from "./cone.ts";
import { flipsOf } from "./rooms/format.ts";
import {
  cameraApex,
  cameraCone,
  cameraParams,
  cameraWatching,
  guardParams,
  isWatching,
  laserBeam,
  laserOn,
  laserParams,
} from "./sim/hazards.ts";
import { blocksSight } from "./sim/sight.ts";
import {
  CHECKPOINT_RADIUS,
  patrolOf,
  type RoomStatus,
  SEQUENCE_GAP_MS,
  TICK_MS,
  type World,
} from "./sim/world.ts";
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
    | "sign"
    | "sight"; // the lit tiles a hazard in the dark can see: all that reaches out of it
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
    | "dim" // your own avatar while you stand in a dark zone
    | "hidden" // a player on a hide spot
    | "occupied" // an exit tile a player is standing on
    | Stamp;
  cone?: { fovDeg: number; range: number; from?: Vec }; // a hazard's sight; `from` when it sees from somewhere other than `pos` (a camera, from the wall)
  beam?: Vec[]; // a laser's tile centres
  polys?: Vec[][]; // a sight: the parts of a hazard's cone that are in the light, as polygons
  shows?: string[]; // a sign's plate ids, in order
  flash?: "ok" | "wrong"; // a sign: the result of the last plate, for a moment
  progress?: number; // a sign: how many of them have been pressed in order so far
  present?: number; // a checkpoint: how many of the three players are at the flag now
  window?: number; // a sign: share (0 to 1) of the 5 s left to press the next one
  age?: number; // ms since a stamp landed
  seat?: Seat;
  role?: Role;
  facing?: Vec;
}

export interface SoundCue {
  kind:
    | "footsteps"
    | "hum"
    | "door"
    | "guard"
    | "camera"
    | "laser"
    | "loot"
    | "checkpoint"
    | "caught"
    | "alarm"
    | "plate" // a plate pressed, anywhere: the team hears it
    | "plate-up" // a plate released
    | "crate" // a crate pushed on a tile
    | "flag" // players within reach of an unset checkpoint changed; `n` is how many
    | "exit" // players on the exit changed; `n` is how many
    | "seq-ok" // the right plate of a sequence; `n` of them are done
    | "seq-wrong" // a wrong plate, or the 5 s ran out
    | "seq-open" // the sequence is done
    | "hide" // someone stepped onto or off a hide spot
    | "cleared" // the room is cleared
    | "step" // your own footstep: centred, softer, and never the same cue as someone else's
    | "bump"; // you are pushing at a wall, door or crate and getting nowhere
  pan: number;
  gain: number;
  n?: number; // flag, exit and seq-ok: a count that sets the pitch and the caption
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
  alarm: boolean; // the alarm is on: deaf and mute see it, blind only ever hears it
  dark: boolean; // you are standing in a dark zone
}

// Sounds the world makes fade with distance, so Can't see learns what is near them
// and has to be TOLD the rest. How far each carries, in tiles: a click is quieter
// than a footstep. Sounds the game makes to the team (the flag and exit tones, the
// sequence, loot, a cleared room, being caught, the alarm) are not here: they are
// not in the room, so they carry everywhere.
const HEARING_RANGE = 12;
const RANGE: Partial<Record<SoundCue["kind"], number>> = {
  plate: 8,
  "plate-up": 6,
  hide: 6,
};
const PAN_RANGE = 8;
const LASER_HUM_RANGE = 3;
const SIGHT_RAYS = 32; // rays in a cone sent from the dark: fine enough to look smooth
const FLASH_TICKS = 12; // a sign shows its last result for 0.6 s
const OWN_STEP_GAIN = 0.6;
const BUMP_GAIN = 0.8;

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
    if (p.hidden) e.state = "hidden";
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
      for (const t of o.tiles) {
        const stood = world.players.some(
          (p) => Math.floor(p.pos.x) === t.x && Math.floor(p.pos.y) === t.y,
        );
        out.push({
          id: o.id,
          kind: "exit",
          pos: centre(t),
          ...(stood ? { state: "occupied" as const } : {}),
        });
      }
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
      const watching = isWatching(world, o);
      out.push({
        id: o.id,
        kind: "camera",
        pos: centre(o.tiles[0] as Vec),
        state: watching ? "watching" : "idle",
        facing: rounded(cameraCone(o).facing),
        cone: {
          fovDeg: cameraCone(o).fovDeg,
          range: cameraCone(o).range,
          from: rounded(cameraApex(o)),
        },
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
      const flag = centre(o.tiles[0] as Vec);
      out.push({
        id: o.id,
        kind: "checkpoint",
        pos: flag,
        state: reached ? "reached" : "up",
        present: world.players.filter(
          (p) => Math.hypot(p.pos.x - flag.x, p.pos.y - flag.y) <= CHECKPOINT_RADIUS,
        ).length,
      });
    } else if (o.kind === "loot") {
      if (!world.lootTaken.includes(o.id)) {
        out.push({ id: o.id, kind: "loot", pos: centre(o.tiles[0] as Vec) });
      }
    } else if (o.kind === "sign") {
      const shows = Array.isArray(o.params?.shows)
        ? o.params.shows.filter((v): v is string => typeof v === "string")
        : [];
      out.push({
        id: o.id,
        kind: "sign",
        pos: centre(o.tiles[0] as Vec),
        shows,
        ...signProgress(world, shows),
      });
    }
  }
  for (const s of world.stamps) {
    out.push({ id: s.key, kind: "stamp", pos: s.pos, state: s.id, age: s.ageMs });
  }
  return out;
}

// How far along its sequence door is: plates matched so far, and the share of
// the 5 s window left to press the next. A stale or broken run counts as none.
function signProgress(
  world: World,
  shows: string[],
): { progress: number; window?: number; flash?: "ok" | "wrong" } {
  const door = world.room.objects.find(
    (o) =>
      o.kind === "door" &&
      o.mode === "sequence" &&
      o.opensWhen?.length === shows.length &&
      o.opensWhen.every((id, i) => id === shows[i]),
  );
  const run = door ? world.seqProgress[door.id] : undefined;
  const last = door ? world.seqFlash[door.id] : undefined;
  const flash = last && world.tick - last.tick < FLASH_TICKS ? { flash: last.result } : {};
  if (!run) return { progress: 0, ...flash };
  if (run.next >= shows.length) return { progress: shows.length };
  const left = 1 - ((world.tick - run.at) * TICK_MS) / SEQUENCE_GAP_MS;
  return run.next > 0 && left > 0
    ? { progress: run.next, window: left, ...flash }
    : { progress: 0, ...flash };
}

const panOf = (source: Vec, listener: Vec): number =>
  Math.max(-1, Math.min(1, (source.x - listener.x) / PAN_RANGE));

function cue(kind: SoundCue["kind"], source: Vec, listener: Vec): SoundCue | null {
  const range = RANGE[kind] ?? HEARING_RANGE;
  const gain = 1 - Math.hypot(source.x - listener.x, source.y - listener.y) / range;
  if (gain <= 0) return null;
  return { kind, pan: panOf(source, listener), gain };
}

// What a hearing role is told: others' footsteps, a hum while standing on a
// plate, and a click when a door opens. Sound is how the Can't-see player
// learns anything about the room.
function soundsFor(world: World, seat: Seat): SoundCue[] {
  const me = world.players[seat].pos;
  const out: SoundCue[] = [];
  for (const p of world.players) {
    // someone pressed against a wall is not walking, so makes no footsteps
    if (p.seat === seat || !p.moving || p.blocked) continue;
    const c = cue("footsteps", p.pos, me);
    if (c) out.push(c);
  }
  // Your own movement, so Can't see knows they are moving or stopped. Centred and a
  // different cue from other players' footsteps (which are panned), so the two
  // are never confused. Only you hear your own bump.
  const mine = world.players[seat];
  if (mine.moving) {
    out.push(
      mine.blocked
        ? { kind: "bump", pan: 0, gain: BUMP_GAIN }
        : { kind: "step", pan: 0, gain: OWN_STEP_GAIN },
    );
  }
  const tile = { x: Math.floor(me.x), y: Math.floor(me.y) };
  const onPlate = world.room.objects.some(
    (o) => o.kind === "plate" && o.tiles.some((t) => t.x === tile.x && t.y === tile.y),
  );
  if (onPlate) out.push({ kind: "hum", pan: 0, gain: 1 });
  for (const e of world.events) {
    if (e.kind === "door" && e.open) {
      const c = cue("door", e.at, me);
      if (c) out.push(c);
    } else if (e.kind === "loot") {
      out.push({ kind: "loot", pan: panOf(e.at, me), gain: 1 }); // the whole team hears it
    } else if (e.kind === "checkpoint") {
      out.push({ kind: "checkpoint", pan: 0, gain: 1 });
    } else if (e.kind === "caught") {
      out.push({ kind: "caught", pan: 0, gain: 1 });
    } else if (e.kind === "plate") {
      // a click in the room: local, like any other sound the world makes
      const c = cue(e.pressed ? "plate" : "plate-up", e.at, me);
      if (c) out.push(c);
    } else if (e.kind === "crate") {
      const c = cue("crate", e.at, me);
      if (c) out.push(c);
    } else if (e.kind === "flag") {
      out.push({ kind: "flag", pan: panOf(e.at, me), gain: 1, n: e.present });
    } else if (e.kind === "exit") {
      out.push({ kind: "exit", pan: panOf(e.at, me), gain: 1, n: e.present });
    } else if (e.kind === "seq") {
      const kind = e.result === "ok" ? "seq-ok" : e.result === "open" ? "seq-open" : "seq-wrong";
      out.push({ kind, pan: panOf(e.at, me), gain: 1, n: e.n });
    } else if (e.kind === "hide") {
      const own = e.seat === seat;
      const c = own
        ? { kind: "hide" as const, pan: 0, gain: OWN_STEP_GAIN }
        : cue("hide", e.at, me);
      if (c) out.push(c);
    } else if (e.kind === "cleared") {
      out.push({ kind: "cleared", pan: 0, gain: 1 });
    }
  }
  hazardSounds(world, me, out);
  return out;
}

// Guards' footsteps while they patrol, a servo whir the tick a camera starts
// watching, and a hum within LASER_HUM_RANGE of a laser that is on.
function hazardSounds(world: World, me: Vec, out: SoundCue[]): void {
  for (const o of world.room.objects) {
    if (o.kind === "guard") {
      const guard = world.guards.find((g) => g.id === o.id);
      // footsteps only while it walks: standing and turning round it is silent
      if (!guard?.moving || patrolOf(o.params).length < 2) continue;
      const c = cue("guard", guard.pos, me);
      if (c) out.push(c);
    } else if (o.kind === "camera") {
      const params = cameraParams(o);
      const starts =
        cameraWatching(params, world.tick) &&
        !(world.tick > 0 && cameraWatching(params, world.tick - 1));
      const c = starts ? cue("camera", centre(o.tiles[0] as Vec), me) : null;
      if (c) out.push(c);
    } else if (o.kind === "laser") {
      if (!laserOn(laserParams(o), world.tick)) continue;
      const near = [centre(o.tiles[0] as Vec), ...laserBeam(world.room, o).map(centre)]
        .map((t) => ({ t, d: Math.hypot(t.x - me.x, t.y - me.y) }))
        .sort((a, b) => a.d - b.d)[0];
      if (near && near.d <= LASER_HUM_RANGE) {
        out.push({ kind: "laser", pan: panOf(near.t, me), gain: 1 - near.d / LASER_HUM_RANGE });
      }
    }
  }
}

type Zone = [number, number, number, number];
const darkZones = (world: World): Zone[] =>
  flipsOf(world.room).flatMap((f) => (f.kind === "dark" ? [f.zone] : []));
const inZone = (z: Zone, p: Vec): boolean =>
  Math.floor(p.x) >= z[0] &&
  Math.floor(p.x) <= z[2] &&
  Math.floor(p.y) >= z[1] &&
  Math.floor(p.y) <= z[3];
const inAny = (zones: Zone[], p: Vec): boolean => zones.some((z) => inZone(z, p));

// Nothing inside a dark zone is sent to a seeing role: not tiles, not objects,
// not the other players. Their own avatar is a dim ring while they stand in it.
function darken(world: World, seat: Seat, role: Role, zones: Zone[]): EntityView[] {
  const out: EntityView[] = [];
  for (const e of entitiesFor(world, seat, role)) {
    if (e.kind === "player" && e.seat === seat) {
      out.push(inAny(zones, e.pos) ? { ...e, state: "dim" } : e);
    } else if (!inAny(zones, e.pos)) {
      out.push(e.beam ? { ...e, beam: e.beam.filter((t) => !inAny(zones, t)) } : e);
    } else if ((e.kind === "guard" || e.kind === "camera") && e.cone) {
      // The hazard itself stays in the dark, but what it can see does not stop at the
      // edge: the tiles in the light that it covers are sent, and nothing of where it is.
      const sight = sightInLight(world, e, zones);
      if (sight) out.push(sight);
    }
  }
  return out;
}

// What a guard or a watching camera in the dark can see, cut to the light: its real cone (the
// rays stop at walls, closed doors and cover) with the dark zones taken out. Only polygons
// in the light are sent, so nothing says where the hazard is or what is in the dark.
function sightInLight(world: World, e: EntityView, zones: Zone[]): EntityView | null {
  const cone = e.cone;
  if (!cone || (e.kind === "camera" && e.state !== "watching")) return null;
  const fan = visiblePolygon(
    {
      origin: cone.from ?? e.pos,
      facing: e.facing ?? { x: 1, y: 0 },
      fovDeg: cone.fovDeg,
      range: cone.range,
    },
    (tx, ty) => blocksSight(world, tx, ty),
    SIGHT_RAYS,
  );
  const dark = zones.map(([x0, y0, x1, y1]) => ({ x0, y0, x1: x1 + 1, y1: y1 + 1 }));
  const polys = subtractRects(fan, dark).map((poly) =>
    poly.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })),
  );
  const first = polys[0]?.[0];
  return first ? { id: e.id, kind: "sight", pos: first, polys, state: e.state } : null;
}

function maskTiles(grid: string[], zones: Zone[]): string[] {
  return grid.map((row, y) =>
    [...row].map((ch, x) => (inAny(zones, { x: x + 0.5, y: y + 0.5 }) ? " " : ch)).join(""),
  );
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
    alarm: false,
    dark: false,
  };
  const alarm = world.tick < world.alarmUntil;
  if (role !== "blind") {
    const me = world.players[seat].pos;
    view.you.pos = rounded(me);
    const zones = darkZones(world);
    view.dark = inAny(zones, me);
    view.alarm = alarm;
    view.entities =
      zones.length === 0 ? entitiesFor(world, seat, role) : darken(world, seat, role, zones);
    if (full) view.tiles = zones.length === 0 ? world.room.grid : maskTiles(world.room.grid, zones);
  }
  if (role !== "deaf")
    view.sounds = alarm ? [{ kind: "alarm", pan: 0, gain: 1 }] : soundsFor(world, seat);
  return view;
}

// A spectator follows one seat and sees the whole room regardless of that
// seat's role or any dark zone (spec §4.1: full tiles and entities, no dark
// masking), but hears only what that seat would hear, so the sound and the
// sight they're given always agree.
export function spectatorView(
  world: World,
  follow: Seat,
  roles: [Role, Role, Role],
  full: boolean,
): RoleView {
  const role = roles[follow];
  const alarm = world.tick < world.alarmUntil;
  const view: RoleView = {
    tick: world.tick,
    ack: 0,
    room: world.room.id,
    role,
    full,
    you: { seat: follow, pos: rounded(world.players[follow].pos) },
    entities: entitiesFor(world, follow, role),
    sounds:
      role === "deaf"
        ? []
        : alarm
          ? [{ kind: "alarm", pan: 0, gain: 1 }]
          : soundsFor(world, follow),
    status: world.status,
    elapsedMs: world.tick * TICK_MS,
    alarm: role === "deaf" ? false : alarm,
    dark: false,
  };
  if (full) view.tiles = world.room.grid;
  return view;
}
