import type { Stamp } from "./channels.ts";
import { subtractRects } from "./clip.ts";
import { visiblePolygon } from "./cone.ts";
import { flipsOf, isMotif, type Motif } from "./rooms/format.ts";
import { beside, carried, gearOn, hatchBeside, objectOn, onSill, partner } from "./sim/gear.ts";
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
import { blocksSight, lineOfSight, soundReaches } from "./sim/sight.ts";
import {
  displayTiles,
  noteOf,
  PIP_TICKS,
  partAt,
  plaqueText,
  type StationPartKey,
  stationParts,
  stationShows,
  tuneNote,
  WIRE_COLOURS,
} from "./sim/stations.ts";
import { encodeSeen, type Visible, visibleFrom } from "./sim/visibility.ts";
import {
  CHECKPOINT_RADIUS,
  type GearItem,
  patrolOf,
  type RoomStatus,
  SEQUENCE_GAP_MS,
  type StationType,
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
    | "sight" // the lit tiles a hazard in the dark can see: all that reaches out of it
    | "station"
    | "gear" // gear lying on the floor or on a hatch sill (carried gear is the player's `item`)
    | "hatch"
    | "bell"
    | "lamp"
    | "ink" // UV ink, sent only while a torch lights it
    | "sidejob"
    | "card" // a switches station's target card: `card`
    | "lever" // a practice lever: `state` is "on" while it is flipped
    | "order" // a vault's order clue: `motifs`, its wings' motifs in socket order
    | "uv"; // a UV torch's pool of light: `polys`
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
  crateOnly?: boolean; // a plate: only a crate holds it, so it is drawn as a crate's seat
  shows?: string[]; // a sign's plate ids, in order
  flash?: "ok" | "wrong"; // a sign: the result of the last plate, for a moment
  progress?: number; // a sign: how many of them have been pressed in order so far
  present?: number; // a checkpoint: how many of the three players are at the flag now
  window?: number; // a sign: share (0 to 1) of the 5 s left to press the next one
  age?: number; // ms since a stamp landed
  seat?: Seat;
  role?: Role;
  facing?: Vec;
  moving?: boolean; // a player: walked this tick
  blocked?: boolean; // a player: holding a direction against a wall, door or crate
  // what a sighted viewer sees of it (stations.ts: stationShows), and where its parts stand: the
  // furniture is drawn from any of them, the state only where the station shows it
  station?: {
    type: StationType;
    shows: number[];
    solved: boolean;
    parts: { key: StationPartKey; at: Vec[] }[];
    furniture?: true; // only its parts are in sight, not where it shows its state: `shows` is empty
    teach?: true; // a teaching station (clues FR7)
    practice?: true; // its practice lever is on: dimmed, and its keys and bells only play (Task 38)
    motif?: Motif; // drawn on it, and on the station it feeds or is fed by (clues FR3)
    reveal?: number; // a solved wing's symbol, for the vault (clues FR2)
  };
  card?: number[]; // a target card's lamps: lit (1) or hollow (0), sighted only
  motifs?: Motif[]; // an order clue: the motif of each vault socket's wing, in socket order
  item?: GearItem; // gear, or what a player carries
  heldBy?: Seat; // a player being towed: whose hand they hold
  holding?: Seat; // a player leading: whose hand they hold
  text?: string; // ink, a wire panel's plaque, or a sign's own text
  dyed?: boolean; // a player splattered by the dye pack
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
    | "clue" // a chime with no picture (A2): `n` of them, heard only nearby
    | "cleared" // the room is cleared
    | "step" // your own footstep: centred, softer, and never the same cue as someone else's
    | "bump" // you are pushing at a wall, door or crate and getting nowhere
    | "tick" // a dial turned a notch
    | "tumbler" // a dial reached the right number: only with the stethoscope, at the safe's back
    | "key" // a keypad key; `n` is which, and sets the pitch
    | "snap" // a wire cut
    | "static" // a radio not yet tuned
    | "tone" // a tuned radio
    | "pip" // a tuned radio's digit; `n` of them
    | "clunk" // a switch, socket, vault handle or sync key
    | "practice" // a key or bell pressed while its practice lever is on: it plays, it counts for nothing
    | "lever" // a practice lever flipped: the whole room hears it
    | "bellnote" // a music-box bell struck or played; `n` is which
    | "bell" // the bell rope: the whole room hears it
    | "dye" // the dye pack: a wrong answer, heard by the team
    | "earpiece" // the earpiece's private tune: `n` is the note; only its holder hears it
    | "gear" // gear picked up, handed over, dropped or put on a sill
    | "solved"; // a station solved: heard by the team
  pan: number;
  gain: number;
  // unit vector from the listener to the source, rounded to 0.01, for a sound that comes from
  // somewhere: what a caption's arrow points along. Absent for your own and team-wide sounds.
  dir?: Vec;
  n?: number; // flag, exit, seq-ok, pip: a count; key, bellnote, earpiece: which note
}

export interface RoleView {
  tick: number;
  ack: number; // last input seq applied for this seat
  room: string;
  role: Role;
  full: boolean; // true when tiles are included
  // motion: this seat's own walking and pushing, sent to every role (Can't see hears both already, so
  // it learns nothing it can't perceive). It reads only this seat's state, never another player's.
  // hand: whose hand this seat holds (FR22: Can't see's own screen says who), from its own state only
  you: {
    seat: Seat;
    pos?: Vec;
    motion?: { moving: boolean; blocked: boolean };
    hand?: Seat;
  };
  tiles?: string[];
  // The tiles in your line of sight, one string per row ("y:x0-x1,x2-x3"), for the sighted
  // only: the client draws mist outside them. Absent for Can't see.
  seen?: string[];
  entities: EntityView[];
  sounds: SoundCue[];
  status: RoomStatus;
  elapsedMs: number;
  loot: number; // what the team has taken in this room: they hear every chime, so it is no secret
  alarm: boolean; // the alarm is on: deaf and mute see it, blind only ever hears it
  dark: boolean; // you are standing in a dark zone
  gear: GearItem | null; // your own gear slot: every role knows what it carries
  sideJob?: { id: string; text: string; done: boolean }; // your own side job (phase 05)
  lamp?: { seat: Seat; tick: number }; // the lamp flashed this tick: for the sighted only
  act?: string; // what Act would do here, phrased from what this role perceives
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
  clue: 8,
  tick: 6,
  tumbler: 1.5, // touch range: beside the safe's back
  key: 6,
  snap: 6,
  static: 6,
  tone: 6,
  pip: 6,
  clunk: 6,
  practice: 6,
  bellnote: 8,
  gear: 6,
};
const UV_RADIUS = 2.5; // tiles a UV torch lights around its holder
const UV_RAYS = 48;
const PAN_RANGE = 8;
const LASER_HUM_RANGE = 3;
const SIGHT_RAYS = 32; // rays in a cone sent from the dark: fine enough to look smooth
const FLASH_TICKS = 12; // a sign shows its last result for 0.6 s
const OWN_STEP_GAIN = 0.6;
const BUMP_GAIN = 0.8;

const round = (n: number): number => Math.round(n * 1000) / 1000;
const rounded = (v: Vec): Vec => ({ x: round(v.x), y: round(v.y) });
const centre = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });

// A seat's own movement, from its own state only.
function motionOf(world: World, seat: Seat): { moving: boolean; blocked: boolean } {
  const p = world.players[seat];
  return { moving: p.moving, blocked: p.blocked };
}

// What a seeing role is shown: the three players, then every object whose
// `visibleTo` lists the role. Doors and exits are one entity per tile.
function entitiesFor(world: World, seat: Seat, role: Role): EntityView[] {
  const out: EntityView[] = world.players.map((p) => {
    const e: EntityView = { id: `P${p.seat}`, kind: "player", pos: rounded(p.pos), seat: p.seat };
    if (p.seat === seat) e.role = role;
    // facing is sent while still too: a figure keeps the way it last turned
    e.facing = { x: round(p.facing.x), y: round(p.facing.y) };
    e.moving = p.moving;
    e.blocked = p.blocked;
    if (p.hidden) e.state = "hidden";
    const item = carried(world, p.seat)?.item;
    if (item) e.item = item;
    const leader = world.holding[p.seat];
    if (leader !== undefined) e.heldBy = leader;
    const mate = partner(world, p.seat);
    if (mate !== undefined && leader === undefined) e.holding = mate;
    if (world.tick < world.dyedUntil) e.dyed = true;
    return e;
  });
  const rung = (kind: "bell" | "lamp", id: string) =>
    world.events.some((e) => e.kind === kind && e.id === id);
  for (const o of world.room.objects) {
    if (!o.visibleTo.includes(role)) continue;
    if (o.kind === "crate") {
      const crate = world.crates.find((c) => c.id === o.id);
      if (crate) out.push({ id: o.id, kind: "crate", pos: centre(crate.tile) });
    } else if (o.kind === "plate") {
      for (const t of o.tiles) {
        const state = world.pressed[o.id] ? "pressed" : "up";
        out.push({
          id: o.id,
          kind: "plate",
          pos: centre(t),
          state,
          ...(o.params?.crateOnly === true ? { crateOnly: true } : {}),
        });
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
      const own = typeof o.params?.text === "string" ? o.params.text : undefined;
      const text = plaqueText(world, o.id) ?? own;
      out.push({
        id: o.id,
        kind: "sign",
        pos: centre(o.tiles[0] as Vec),
        shows,
        ...signProgress(world, shows),
        ...(text ? { text } : {}),
      });
    } else if (o.kind === "station") {
      const s = world.stations[o.id];
      if (!s) continue;
      out.push({
        id: o.id,
        kind: "station",
        pos: centre(o.tiles[0] as Vec),
        station: {
          type: s.type,
          shows: stationShows(world, s),
          solved: s.solved,
          parts: stationParts(o),
          ...(o.params?.teach === true ? { teach: true as const } : {}),
          ...(typeof o.params?.practice === "string" && world.levers[o.params.practice]
            ? { practice: true as const }
            : {}),
          ...(isMotif(o.params?.motif) ? { motif: o.params.motif } : {}),
          ...(s.solved && s.reveal !== undefined ? { reveal: s.reveal } : {}),
        },
      });
    } else if (o.kind === "card") {
      const s = world.stations[String(o.params?.of)];
      if (s)
        out.push({ id: o.id, kind: "card", pos: centre(o.tiles[0] as Vec), card: [...s.answer] });
    } else if (o.kind === "order") {
      const vault = world.room.objects.find((v) => v.params?.symbols === o.id);
      const from = Array.isArray(vault?.params?.from) ? vault.params.from : [];
      const motifs = from.map((id) => world.room.objects.find((x) => x.id === id)?.params?.motif);
      out.push({
        id: o.id,
        kind: "order",
        pos: centre(o.tiles[0] as Vec),
        motifs: motifs.filter(isMotif),
      });
    } else if (o.kind === "gear") {
      const g = world.gear.find((x) => x.id === o.id);
      const hatch = g?.sill ? world.room.objects.find((h) => h.id === g.sill) : undefined;
      const at = g?.at ?? hatch?.tiles[0];
      if (g && at) out.push({ id: g.id, kind: "gear", pos: centre(at), item: g.item });
    } else if (o.kind === "hatch") {
      for (const t of o.tiles) out.push({ id: o.id, kind: "hatch", pos: centre(t) });
    } else if (o.kind === "lever") {
      out.push({
        id: o.id,
        kind: "lever",
        pos: centre(o.tiles[0] as Vec),
        ...(world.levers[o.id] ? { state: "on" as const } : {}),
      });
    } else if (o.kind === "bell" || o.kind === "lamp") {
      out.push({
        id: o.id,
        kind: o.kind,
        pos: centre(o.tiles[0] as Vec),
        ...(rung(o.kind, o.id) ? { state: "on" as const } : {}),
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

function dirTo(source: Vec, listener: Vec): { dir: Vec } | Record<string, never> {
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) return {};
  return { dir: { x: Math.round((dx / d) * 100) / 100, y: Math.round((dy / d) * 100) / 100 } };
}

// A local sound: it fades with distance, and stops at a wall, glass or a closed door
// (a vent lets it through).
function cue(world: World, kind: SoundCue["kind"], source: Vec, listener: Vec): SoundCue | null {
  const range = RANGE[kind] ?? HEARING_RANGE;
  const gain = 1 - Math.hypot(source.x - listener.x, source.y - listener.y) / range;
  if (gain <= 0 || !soundReaches(world, source, listener)) return null;
  return { kind, pan: panOf(source, listener), gain, ...dirTo(source, listener) };
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
    const c = cue(world, "footsteps", p.pos, me);
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
      const c = cue(world, "door", e.at, me);
      if (c) out.push(c);
    } else if (e.kind === "loot") {
      out.push({ kind: "loot", pan: panOf(e.at, me), gain: 1, ...dirTo(e.at, me) }); // the whole team hears it
    } else if (e.kind === "checkpoint") {
      out.push({ kind: "checkpoint", pan: 0, gain: 1 });
    } else if (e.kind === "caught") {
      out.push({ kind: "caught", pan: 0, gain: 1 });
    } else if (e.kind === "plate") {
      // a click in the room: local, like any other sound the world makes
      const c = cue(world, e.pressed ? "plate" : "plate-up", e.at, me);
      if (c) out.push(c);
    } else if (e.kind === "crate") {
      const c = cue(world, "crate", e.at, me);
      if (c) out.push(c);
    } else if (e.kind === "clue") {
      const c = cue(world, "clue", e.at, me);
      if (c) out.push({ ...c, n: e.n });
    } else if (e.kind === "flag") {
      out.push({ kind: "flag", pan: panOf(e.at, me), gain: 1, n: e.present, ...dirTo(e.at, me) });
    } else if (e.kind === "exit") {
      out.push({ kind: "exit", pan: panOf(e.at, me), gain: 1, n: e.present, ...dirTo(e.at, me) });
    } else if (e.kind === "seq") {
      const kind = e.result === "ok" ? "seq-ok" : e.result === "open" ? "seq-open" : "seq-wrong";
      out.push({ kind, pan: panOf(e.at, me), gain: 1, n: e.n, ...dirTo(e.at, me) });
    } else if (e.kind === "hide") {
      const own = e.seat === seat;
      const c = own
        ? { kind: "hide" as const, pan: 0, gain: OWN_STEP_GAIN }
        : cue(world, "hide", e.at, me);
      if (c) out.push(c);
    } else if (e.kind === "cleared") {
      out.push({ kind: "cleared", pan: 0, gain: 1 });
    } else if (e.kind === "station") {
      stationSound(world, seat, e, out);
    } else if (e.kind === "gear") {
      const c = cue(world, "gear", e.at, me);
      if (c) out.push(c);
    } else if (e.kind === "lever") {
      out.push({ kind: "lever", pan: panOf(e.at, me), gain: 1, ...dirTo(e.at, me) }); // the whole room hears it
    } else if (e.kind === "bell") {
      out.push({ kind: "bell", pan: panOf(e.at, me), gain: 1, ...dirTo(e.at, me) }); // the whole room hears it
    } else if (e.kind === "dye") {
      out.push({ kind: "dye", pan: 0, gain: 1 });
    }
  }
  stationAmbience(world, seat, out);
  hazardSounds(world, me, out);
  return out;
}

const STATION_CLICK: Partial<Record<StationType, SoundCue["kind"]>> = {
  dial: "tick",
  radio: "tick",
  wires: "snap",
  keypad: "key",
  bells: "bellnote",
  switches: "clunk",
  vault: "clunk",
  sync: "clunk",
};

// A station worked: its click where it was worked, the tumbler for a stethoscope at the safe's
// back when a dial reaches the right number, and the whole team hears it solved.
function stationSound(
  world: World,
  seat: Seat,
  e: Extract<World["events"][number], { kind: "station" }>,
  out: SoundCue[],
): void {
  const me = world.players[seat].pos;
  const s = world.stations[e.id];
  if (!s) return;
  if (e.result === "solved") {
    out.push({ kind: "solved", pan: panOf(e.at, me), gain: 1, ...dirTo(e.at, me) });
    return;
  }
  if (e.result === "wrong") return; // the dye pack says it
  if (e.practice) {
    // a practice press: its own sound, never the key's or the bell's, so it is never taken for a solve
    const p = cue(world, "practice", e.at, me);
    if (p) out.push(p);
    return;
  }
  const kind = e.result === "press" && s.type === "dial" ? "clunk" : STATION_CLICK[s.type];
  const c = kind ? cue(world, kind, e.at, me) : null;
  const pitched = kind === "key" || kind === "bellnote";
  if (c) out.push(pitched && e.n !== undefined ? { ...c, n: e.n } : c);
  if (s.type === "dial" && e.result === "turn" && e.n === s.answer[s.input.length - 1]) {
    const back = world.room.objects.find((o) => o.id === e.id)?.params?.back;
    const at = Array.isArray(back) ? centre({ x: Number(back[0]), y: Number(back[1]) }) : null;
    const t =
      at && carried(world, seat)?.item === "stethoscope" ? cue(world, "tumbler", at, me) : null;
    if (t) out.push(t);
  }
}

// What stations sound like while nothing is done to them: a radio's static (or, tuned, its tone
// and every PIP_TICKS its digit in pips), a music box playing its tune, and the earpiece's tune
// for its holder alone (FR17: a sound with no picture, like the clue chime).
function stationAmbience(world: World, seat: Seat, out: SoundCue[]): void {
  const me = world.players[seat].pos;
  for (const o of world.room.objects) {
    if (o.kind !== "station") continue;
    const s = world.stations[o.id];
    const at = centre(o.tiles[0] as Vec);
    if (s?.type === "radio") {
      const c = cue(world, s.solved ? "tone" : "static", at, me);
      if (c) out.push(c);
      const pip = s.solved && world.tick % PIP_TICKS === 0 ? cue(world, "pip", at, me) : null;
      if (pip) out.push({ ...pip, n: s.answer[1] });
    } else if (s?.type === "bells" && !s.solved) {
      const note = noteOf(world, s);
      const tune = o.params?.tune;
      const from = Array.isArray(tune) ? centre({ x: Number(tune[0]), y: Number(tune[1]) }) : at;
      const c = note === undefined ? null : cue(world, "bellnote", from, me);
      if (c) out.push({ ...c, n: note });
    }
  }
  const mine = carried(world, seat);
  const note = mine?.item === "earpiece" ? tuneNote(world, mine.id) : undefined;
  if (note !== undefined) out.push({ kind: "earpiece", pan: 0, gain: 1, n: note });
}

// Guards' footsteps while they patrol, a servo whir the tick a camera starts
// watching, and a hum within LASER_HUM_RANGE of a laser that is on.
function hazardSounds(world: World, me: Vec, out: SoundCue[]): void {
  for (const o of world.room.objects) {
    if (o.kind === "guard") {
      const guard = world.guards.find((g) => g.id === o.id);
      // footsteps only while it walks: standing and turning round it is silent
      if (!guard?.moving || patrolOf(o.params).length < 2) continue;
      const c = cue(world, "guard", guard.pos, me);
      if (c) out.push(c);
    } else if (o.kind === "camera") {
      const params = cameraParams(o);
      const starts =
        cameraWatching(params, world.tick) &&
        !(world.tick > 0 && cameraWatching(params, world.tick - 1));
      const c = starts ? cue(world, "camera", centre(o.tiles[0] as Vec), me) : null;
      if (c) out.push(c);
    } else if (o.kind === "laser") {
      if (!laserOn(laserParams(o), world.tick)) continue;
      const near = [centre(o.tiles[0] as Vec), ...laserBeam(world.room, o).map(centre)]
        .map((t) => ({ t, d: Math.hypot(t.x - me.x, t.y - me.y) }))
        .sort((a, b) => a.d - b.d)[0];
      if (near && near.d <= LASER_HUM_RANGE) {
        out.push({
          kind: "laser",
          pan: panOf(near.t, me),
          gain: 1 - near.d / LASER_HUM_RANGE,
          ...dirTo(near.t, me),
        });
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
    } else if (e.kind === "stamp") {
      out.push(e); // a mark shows wherever it lands, even in the dark
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
    (tx, ty) => blocksSight(world, tx, ty, true), // a hazard's sight: cover blocks it
    SIGHT_RAYS,
  );
  const dark = zones.map(([x0, y0, x1, y1]) => ({ x0, y0, x1: x1 + 1, y1: y1 + 1 }));
  const polys = subtractRects(fan, dark).map((poly) =>
    poly.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })),
  );
  const first = polys[0]?.[0];
  return first ? { id: e.id, kind: "sight", pos: first, polys, state: e.state } : null;
}

// What a sighted role may be told of: itself, marks (they show wherever they land, even in
// the dark), the lit tiles a hazard in the dark covers, and anything else only if its
// tile is in line of sight. A laser keeps just the part of its beam that is seen.
function inSight(
  world: World,
  entities: EntityView[],
  seat: Seat,
  seen: Visible,
  zones: Zone[],
): EntityView[] {
  const out: EntityView[] = [];
  for (const e of entities) {
    if (e.kind === "stamp" || e.kind === "sight" || (e.kind === "player" && e.seat === seat)) {
      out.push(e);
    } else if (e.kind === "station") {
      // a station's state is seen where it shows it: its face, wires, keys or lamps (switches: the
      // lamps alone, never the panel by the buttons, so the pattern is told across the glass). Its
      // furniture is drawn from any part in sight, with nothing of its state. A display in a dark
      // zone shows nothing without the goggles (FR19), wherever the station's anchor stands.
      const o = world.room.objects.find((x) => x.id === e.id);
      const shown = (o ? displayTiles(o) : []).some(
        (t) => seen.has(t.x, t.y) && !inAny(zones, centre(t)),
      );
      const parts = e.station?.parts ?? [];
      const furniture = parts.some((p) => p.at.some((t) => seen.has(t.x, t.y)));
      if (shown) out.push(e);
      else if (furniture && e.station)
        out.push({ ...e, station: { ...e.station, shows: [], furniture: true } });
    } else if (e.beam) {
      const beam = e.beam.filter((t) => seen.has(Math.floor(t.x), Math.floor(t.y)));
      if (seen.has(Math.floor(e.pos.x), Math.floor(e.pos.y)) || beam.length > 0) {
        out.push({ ...e, beam });
      }
    } else if (seen.has(Math.floor(e.pos.x), Math.floor(e.pos.y))) {
      out.push(e);
    }
  }
  return out;
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
    you: { seat, motion: motionOf(world, seat) },
    entities: [],
    sounds: [],
    status: world.status,
    elapsedMs: world.tick * TICK_MS,
    loot: world.loot,
    alarm: false,
    dark: false,
    gear: carried(world, seat)?.item ?? null, // own state: each role knows what it carries
  };
  const hand = partner(world, seat);
  if (hand !== undefined) view.you.hand = hand; // own state (FR22)
  const hint = actHint(world, seat, role);
  if (hint) view.act = hint; // phrased per role: never a colour for Can't see
  const alarm = world.tick < world.alarmUntil;
  if (role !== "blind") {
    const me = world.players[seat].pos;
    view.you.pos = rounded(me);
    // goggles (FR19): the wearer sees into dark zones under the normal line-of-sight rules
    const dark = darkZones(world);
    const zones = carried(world, seat)?.item === "goggles" ? [] : dark;
    view.dark = inAny(dark, me);
    view.alarm = alarm;
    const seen = visibleFrom(world, me);
    view.seen = encodeSeen(seen.tiles);
    view.entities = [
      ...inSight(
        world,
        zones.length === 0 ? entitiesFor(world, seat, role) : darken(world, seat, role, zones),
        seat,
        seen,
        zones,
      ),
      ...uvLight(world, role, seen, zones),
    ];
    if (full) view.tiles = zones.length === 0 ? world.room.grid : maskTiles(world.room.grid, zones);
    // the lamp (FR25) is a light: for the sighted only
    const lamp = world.events.find((e) => e.kind === "lamp");
    if (lamp?.kind === "lamp") view.lamp = { seat: lamp.seat, tick: world.tick };
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
  follow: Seat | null,
  roles: [Role, Role, Role],
  full: boolean,
): RoleView {
  // Nobody followed: the whole room as someone who can see it, and nothing to hear. Seat 0 is only
  // the nominal viewpoint, and the camera is given no position to follow.
  const seat: Seat = follow ?? 0;
  const role: Role = follow === null ? "deaf" : (roles[follow] as Role);
  const alarm = follow !== null && world.tick < world.alarmUntil;
  const view: RoleView = {
    tick: world.tick,
    ack: 0,
    room: world.room.id,
    role,
    full,
    you: follow === null ? { seat } : { seat, pos: rounded(world.players[seat].pos) },
    entities: entitiesFor(world, seat, role),
    sounds:
      follow === null || role === "deaf"
        ? []
        : alarm
          ? [{ kind: "alarm", pan: 0, gain: 1 }]
          : soundsFor(world, seat),
    status: world.status,
    elapsedMs: world.tick * TICK_MS,
    loot: world.loot,
    alarm: role === "deaf" ? false : alarm,
    dark: false,
    gear: follow === null ? null : (carried(world, seat)?.item ?? null),
  };
  if (full) view.tiles = world.room.grid;
  return view;
}

// UV torches (FR18), for a sighted viewer: each pool of light they can see any of, and the ink
// inside a pool that is in their sight and not in a dark zone they cannot see into.
function uvLight(world: World, role: Role, seen: Visible, zones: Zone[]): EntityView[] {
  const out: EntityView[] = [];
  const torches = world.gear.flatMap((g) =>
    g.item === "uv" && g.heldBy !== null ? [world.players[g.heldBy].pos] : [],
  );
  for (const [i, from] of torches.entries()) {
    const poly = visiblePolygon(
      { origin: from, facing: { x: 1, y: 0 }, fovDeg: 360, range: UV_RADIUS },
      (tx, ty) => blocksSight(world, tx, ty),
      UV_RAYS,
    ).map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
    const r = Math.ceil(UV_RADIUS);
    const lit = (tx: number, ty: number) =>
      Math.hypot(tx + 0.5 - from.x, ty + 0.5 - from.y) <= UV_RADIUS &&
      lineOfSight(world, from, centre({ x: tx, y: ty }), false);
    let visible = false;
    for (let dy = -r; dy <= r && !visible; dy++) {
      for (let dx = -r; dx <= r && !visible; dx++) {
        const t = { x: Math.floor(from.x) + dx, y: Math.floor(from.y) + dy };
        visible = seen.has(t.x, t.y) && lit(t.x, t.y) && !inAny(zones, centre(t));
      }
    }
    if (visible) out.push({ id: `uv${i}`, kind: "uv", pos: rounded(from), polys: [poly] });
    for (const o of world.room.objects) {
      const t = o.tiles[0] as Vec;
      if (o.kind !== "ink" || !o.visibleTo.includes(role) || out.some((e) => e.id === o.id))
        continue;
      if (!lit(t.x, t.y) || !seen.has(t.x, t.y) || inAny(zones, centre(t))) continue;
      const text = plaqueText(world, o.id) ?? String(o.params?.text ?? "");
      out.push({ id: o.id, kind: "ink", pos: centre(t), text });
    }
  }
  return out;
}

const GEAR_NAME: Record<GearItem, string> = {
  earpiece: "earpiece",
  goggles: "goggles",
  stethoscope: "stethoscope",
  uv: "UV torch",
};

// The Act hint: what Act would do here, in the order the simulation tries it (gear.ts: actOn).
// Built from what this role perceives: a wire's colour only for those who can see it.
function actHint(world: World, seat: Seat, role: Role): string | undefined {
  if (world.holding[seat] !== undefined) return "Let go";
  const tile = {
    x: Math.floor(world.players[seat].pos.x),
    y: Math.floor(world.players[seat].pos.y),
  };
  const part = partAt(world, tile);
  if (part) {
    const n = part.index + 1;
    const { type } = part.station;
    if (part.key === "pads") {
      const way = part.index === 0 ? "left" : "right";
      return type === "dial" ? `Turn the dial ${way}` : `Turn the knob ${way}`;
    }
    if (part.key === "anchor") return type === "dial" ? "Enter the number" : "Open the vault";
    if (part.key === "wires") {
      const colour = WIRE_COLOURS[part.station.answer[2 + part.index] as number];
      return role === "blind" ? `Cut wire ${n}` : `Cut the ${colour} wire`;
    }
    if (part.key === "keys") return type === "sync" ? `Turn key ${n}` : `Press key ${n}`;
    if (part.key === "bells") return `Strike bell ${n}`;
    if (part.key === "buttons") return `Press button ${n}`;
    return `Turn socket ${n}`;
  }
  const mine = carried(world, seat);
  const lying = gearOn(world, tile);
  if (!mine && lying) return `Take the ${GEAR_NAME[lying.item]}`;
  const hatch = hatchBeside(world, tile);
  const sill = hatch && onSill(world, hatch.id);
  if (hatch && mine && !sill) return `Put the ${GEAR_NAME[mine.item]} on the sill`;
  if (sill && !mine) return `Take the ${GEAR_NAME[sill.item]} from the sill`;
  const near = beside(world, seat);
  const mate = partner(world, seat);
  if (mate !== undefined && near.includes(mate)) return "Let go";
  if (mate === undefined && near.some((s) => partner(world, s) === undefined)) return "Hold hands";
  if (objectOn(world, "bell", tile)) return "Ring the bell";
  if (objectOn(world, "lamp", tile)) return "Flash the lamp";
  const lever = objectOn(world, "lever", tile);
  if (lever) return world.levers[lever.id] ? "Switch practice off" : "Switch practice on";
  if (mine && lying) return `Swap the ${GEAR_NAME[mine.item]} for the ${GEAR_NAME[lying.item]}`;
  return undefined;
}
