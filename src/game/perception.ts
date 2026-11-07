import type { Stamp } from "./channels.ts";
import { intersectLight, subtractRects } from "./clip.ts";
import { visiblePolygon } from "./cone.ts";
import { footHalf, footLit, lightPolygon, lightTouches } from "./light.ts";
import { linkOf } from "./links.ts";
import {
  cacheOf,
  flipsOf,
  type ItemId,
  inRect,
  isMotif,
  type Motif,
  type RoomObject,
  secretDoors,
} from "./rooms/format.ts";
import { besidePlate, brailleCells, plateNumber, platePart } from "./sim/braille.ts";
import { indexOf, tileKey } from "./sim/collide.ts";
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
  bandDigit,
  cacheOpen,
  displayTiles,
  noteOf,
  PIP_TICKS,
  partAt,
  plaqueText,
  type StationPartKey,
  stationParts,
  stationShows,
  tuneNote,
  tuneRest,
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
    | "wire" // a station's wire to its remote part: `route`; layout, sent to every sighted seat wherever it stands
    | "gear" // gear lying on the floor or on a hatch sill (carried gear is the player's `item`)
    | "hatch"
    | "bell"
    | "lamp"
    | "ink" // UV ink, sent only while a torch lights it
    | "braille" // a braille plate on the floor: where it is, never what it says
    | "keepsake" // a solved cache's item standing in its open vault: `keep`; for the sighted
    | "motiftile" // a cache's motif tile: `motif`; drawn for the sighted whether or not the cache is open
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
  route?: Vec[]; // a wire: its points in tile space
  polys?: Vec[][]; // a sight: the parts of a hazard's cone that are in the light, as polygons
  crateOnly?: boolean; // a plate: only a crate holds it, so it is drawn as a crate's seat
  shows?: string[]; // a sign's plate ids, in order
  flash?: "ok" | "wrong"; // a sign: the result of the last plate, for a moment; a braille plate: "ok" the tick it is read
  progress?: number; // a sign: how many of them have been pressed in order so far
  present?: number; // a checkpoint: how many of the three players are at the flag now
  window?: number; // a sign: share (0 to 1) of the 5 s left to press the next one
  age?: number; // ms since a stamp landed
  seat?: Seat;
  role?: Role;
  facing?: Vec;
  moving?: boolean; // a player: walked this tick
  blocked?: boolean; // a player: holding a direction against a wall, door or crate
  pulling?: boolean; // a player in a hand-holding pair that is in a tug of war: both figures strain
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
    jammed?: true; // a teaching station or cache after a wrong answer: it ignores input for 3 s (FR13)
    motif?: Motif; // drawn on it, and on the station it feeds or is fed by (clues FR3)
    reveal?: number; // a solved wing's symbol, for the vault (clues FR2)
    stash?: ItemId; // a found cache's item (caches FR10), for the sighted
    cache?: true; // a cache's dial: its `back` tile is drawn as an inspection plate (the entity exists only once open)
  };
  keep?: ItemId; // a keepsake: the item standing in an open vault
  secret?: true; // a door: one of a cache's two secret doors (open, so already known to every sighted seat)
  opens?: "stations" | "sequence"; // a door: what opens it, when not held plates (the room shows its plates and stations)
  card?: number[]; // a target card's lamps: lit (1) or hollow (0), sighted only
  motifs?: Motif[]; // an order clue: the motif of each vault socket's wing, in socket order
  motif?: Motif; // a motif tile's symbol
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
    | "rest" // a quiet low chime where a keypad's tune rests (FR14): no picture, like `clue`
    | "cleared" // the room is cleared
    | "step" // your own footstep: centred, softer, and never the same cue as someone else's
    | "bump" // you are pushing at a wall, door or crate and getting nowhere
    | "tick" // a dial turned a notch
    | "hollow" // a step on a cache dial's inspection plate: metal over a hollow, in place of step and footsteps
    | "tumbler" // a dial reached the right number: only with the stethoscope, at the safe's back
    | "key" // a keypad key; `n` is which, and sets the pitch
    | "snap" // a wire cut
    | "static" // a radio not yet tuned
    | "tone" // a tuned radio
    | "pip" // a tuned radio's digit; `n` of them
    | "clunk" // a switch, socket, vault handle or sync key
    | "practice" // a key or bell pressed while its practice lever is on: it plays, it counts for nothing
    | "lever" // a practice lever flipped: the whole room hears it
    | "pull" // a tug of war between two hand-holders: only those two hear it
    | "bellnote" // a music-box bell struck or played; `n` is which
    | "bell" // the bell rope: the whole room hears it
    | "dye" // the dye pack: a wrong answer, heard by the team
    | "tap" // Can't see read a braille plate: a fingertip tap where it lies
    | "jam" // a teaching station or cache jammed by a wrong answer: a short buzz where it stands
    | "earpiece" // the earpiece's private tune: `n` is the note; only its holder hears it
    | "gear" // gear picked up, handed over, dropped or put on a sill
    | "uncover" // a cache uncovered: heard by the team, wherever it is
    | "stash" // a cache solved, its stash found: heard by the team
    | "solved"; // a station solved: heard by the team
  pan: number;
  gain: number;
  // unit vector from the listener to the source, rounded to 0.01, for a sound that comes from
  // somewhere: what a caption's arrow points along. Absent for your own and team-wide sounds.
  dir?: Vec;
  n?: number; // flag, exit, seq-ok, pip: a count; key, bellnote, earpiece, practice: which note; uncover, stash: the owner's seat
  item?: ItemId; // stash: what was found (the cleared card names it to everyone too)
  of?: "key" | "bellnote"; // practice: whether the note was a keypad key or a bell
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
  hue?: string; // the room's wall hue (room meta), only on a full view, with `tiles`: room layout, no perception
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
  // your own seat's cache, if the room has one for it (caches FR3): the riddle is the owner's alone
  cache?: {
    id: string;
    motif: Motif;
    riddle: string;
    item: ItemId;
    state: "hidden" | "open" | "vault" | "taken";
    by?: Seat; // who solved it
  };
  keepsake?: ItemId; // your own slot: the item you took, kept apart from gear (every role knows it)
  // this tick's secret-door moment or take, for every role: the sighted slide the door, the hearing
  // hear the cue, the rest read the caption (caches FR9). Only the solve and the take name the item.
  cacheEvent?: { result: "uncover" | "solved" | "taken"; at: Vec; owner: Seat; item?: ItemId };
  lamp?: { seat: Seat; tick: number }; // the lamp flashed this tick: for the sighted only
  act?: string; // what Act would do here, phrased from what this role perceives
  braille?: { id: string; cells: number[][]; teach?: true }; // Can't see's own open plate: its cells, never the number
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
  rest: 8,
  tick: 6,
  hollow: 6, // a step on the plate carries only a little way
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
  jam: 6,
  tap: 4, // a fingertip on metal: only those close by hear it
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
    // both ends of a pair in a tug of war strain: the picture of what the pair hears (ADR 0019)
    if (mate !== undefined && world.pulling[leader !== undefined ? p.seat : (mate as Seat)])
      e.pulling = true;
    if (world.tick < world.dyedUntil) e.dyed = true;
    return e;
  });
  const secretIds = new Set(secretDoors(world.room).flatMap((d) => [d.chamber.id, d.vault.id]));
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
      if (secretClosed(world).has(o.id)) continue; // a closed secret door is wall to every view
      const secret = secretIds.has(o.id); // only ever sent open, so it tells nothing a view lacks
      for (const t of o.tiles) {
        const state = world.doorOpen[o.id] ? "open" : "closed";
        const opens = doorOpens(world, o);
        out.push({
          id: o.id,
          kind: "door",
          pos: centre(t),
          state,
          ...(secret ? { secret } : {}),
          ...(opens ? { opens } : {}),
        });
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
      if (!s || !cacheOpen(world, o.id)) continue; // a hidden cache is in no one's view
      const item = cacheOf(o)?.item;
      // its wire is layout of its own, sent whatever the station is (the user, screenshots 105 to 107): only a route
      const route =
        role === "blind" ? null : linkOf({ type: s.type, parts: stationParts(o) }, world.room.grid);
      if (route) out.push({ id: `${o.id}.wire`, kind: "wire", pos: route[0] as Vec, route });
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
          ...(world.tick < (world.jammedUntil[o.id] ?? 0) ? { jammed: true as const } : {}),
          ...(isMotif(o.params?.motif) ? { motif: o.params.motif } : {}),
          ...(s.solved && s.reveal !== undefined ? { reveal: s.reveal } : {}),
          ...(item && world.cacheBy[o.id] !== undefined ? { stash: item } : {}),
          ...(item && s.type === "dial" ? { cache: true as const } : {}),
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
    } else if (o.kind === "braille") {
      // the sighted see a hand on it while it is read (`on`), and a pulse the tick it is opened
      const read = world.events.some((e) => e.kind === "braille" && e.id === o.id);
      const held = Object.values(world.reading).includes(o.id);
      out.push({
        id: o.id,
        kind: "braille",
        pos: centre(o.tiles[0] as Vec),
        ...(held ? { state: "on" as const } : {}),
        ...(read ? { flash: "ok" as const } : {}),
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
  // a solved cache's item stands in its open vault until its owner takes it: for the sighted, and
  // its name is public from the solve (the cleared card shows it to everyone)
  if (role !== "blind") {
    for (const o of world.room.objects) {
      const cache = cacheOf(o);
      if (!cache || world.cacheBy[o.id] === undefined || world.cacheTaken[o.id] !== undefined)
        continue;
      out.push({
        id: `${o.id}.keep`,
        kind: "keepsake",
        pos: centre(cache.chamber.vault.item),
        keep: cache.item,
      });
    }
  }
  // a cache's motif tiles look alike but for the symbol: drawn for the sighted from the start, so a
  // decoy and the right tile are told apart only by what the riddle says (caches FR4)
  if (role !== "blind") {
    for (const o of world.room.objects) {
      const cache = cacheOf(o);
      if (!cache) continue;
      for (const [i, t] of cache.tiles.entries()) {
        out.push({ id: `${o.id}.m${i}`, kind: "motiftile", pos: centre(t.at), motif: t.motif });
      }
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
  const reach = 1 - Math.hypot(source.x - listener.x, source.y - listener.y) / range;
  if (reach <= 0 || !soundReaches(world, source, listener)) return null;
  // the tumbler is a touch-range sound: inside its 1.5 tiles it is the whole clue, so it fades only a
  // little (to 0.6 at the edge) instead of to nothing, where a click this short is lost under the
  // dial's own tick
  const gain = kind === "tumbler" ? 0.6 + 0.4 * reach : reach;
  return { kind, pan: panOf(source, listener), gain, ...dirTo(source, listener) };
}

// What a hearing role is told: others' footsteps, a hum while standing on a
// plate, and a click when a door opens. Sound is how the Can't-see player
// learns anything about the room.
// Whether a body stands on the inspection plate of a cache's dial: the dial's `back` tile, where the
// stethoscope is listened with (an ordinary safe has no plate, so its back tile sounds like any floor).
function onInspectionPlate(world: World, pos: Vec): boolean {
  const tile = { x: Math.floor(pos.x), y: Math.floor(pos.y) };
  return world.room.objects.some((o) => {
    if (o.kind !== "station" || !cacheOf(o) || world.stations[o.id]?.type !== "dial") return false;
    const back = o.params?.back;
    return Array.isArray(back) && Number(back[0]) === tile.x && Number(back[1]) === tile.y;
  });
}

function soundsFor(world: World, seat: Seat): SoundCue[] {
  const me = world.players[seat].pos;
  const out: SoundCue[] = [];
  for (const p of world.players) {
    // someone pressed against a wall is not walking, so makes no footsteps
    if (p.seat === seat || !p.moving || p.blocked) continue;
    const c = cue(world, onInspectionPlate(world, p.pos) ? "hollow" : "footsteps", p.pos, me);
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
        : {
            kind: onInspectionPlate(world, mine.pos) ? "hollow" : "step",
            pan: 0,
            gain: OWN_STEP_GAIN,
          },
    );
  }
  const tile = { x: Math.floor(me.x), y: Math.floor(me.y) };
  const onPlate = world.room.objects.some(
    (o) => o.kind === "plate" && o.tiles.some((t) => t.x === tile.x && t.y === tile.y),
  );
  if (onPlate) out.push({ kind: "hum", pan: 0, gain: 1 });
  for (const e of world.events) {
    if (e.kind === "door" && e.open) {
      // an ordinary door is team progress (ADR 0025): every hearing seat hears it, from anywhere
      out.push({ kind: "door", pan: panOf(e.at, me), gain: 1, ...dirTo(e.at, me) });
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
      const c = cue(world, e.rest ? "rest" : "clue", e.at, me);
      if (c) out.push(e.rest ? c : { ...c, n: e.n });
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
    } else if (e.kind === "pull") {
      // a strain between the two who hold hands: it is theirs alone, centred in their heads like the
      // earpiece, and nobody else in the room hears it
      if (seat === e.leader || seat === e.towed) out.push({ kind: "pull", pan: 0, gain: 1 });
    } else if (e.kind === "lever") {
      out.push({ kind: "lever", pan: panOf(e.at, me), gain: 1, ...dirTo(e.at, me) }); // the whole room hears it
    } else if (e.kind === "bell") {
      out.push({ kind: "bell", pan: panOf(e.at, me), gain: 1, ...dirTo(e.at, me) }); // the whole room hears it
    } else if (e.kind === "dye") {
      out.push({ kind: "dye", pan: 0, gain: 1 });
    } else if (e.kind === "braille") {
      const c = cue(world, "tap", e.at, me);
      if (c) out.push(c);
    } else if (e.kind === "cache") {
      // team-wide, like "solved": the whole crew hears it opened and found, wherever they stand
      const obj = world.room.objects.find((o) => o.id === e.id);
      const cache = obj ? cacheOf(obj) : null;
      if (e.result === "taken") {
        // the take counts the loot: the same chime as any loot, naming whose and what
        out.push({
          kind: "loot",
          pan: panOf(e.at, me),
          gain: 1,
          ...(cache ? { n: cache.owner - 1, item: cache.item } : {}),
          ...dirTo(e.at, me),
        });
        continue;
      }
      const kind = e.result === "uncover" ? "uncover" : "stash";
      // `n` is whose cache it is; only the stash says what was in it (an opened panel shows nothing yet)
      const who = cache ? { n: cache.owner - 1 } : {};
      const what = kind === "stash" && cache ? { item: cache.item } : {};
      out.push({ kind, pan: panOf(e.at, me), gain: 1, ...who, ...what, ...dirTo(e.at, me) });
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
  if (e.result === "wrong") return; // the dye pack says it, or (teaching, cache) the jam
  if (e.result === "jam") {
    const c = cue(world, "jam", e.at, me);
    if (c) out.push(c);
    return;
  }
  if (e.practice) {
    // a practice press: its own sound, never the key's or the bell's, so it is never taken for a solve
    // it carries the note and its source, so the client can play the real chime quietly (Task 42)
    const p = cue(world, "practice", e.at, me);
    const of = STATION_CLICK[s.type];
    if (p)
      out.push(e.n !== undefined && (of === "key" || of === "bellnote") ? { ...p, n: e.n, of } : p);
    return;
  }
  const kind = e.result === "press" && s.type === "dial" ? "clunk" : STATION_CLICK[s.type];
  const c = kind ? cue(world, kind, e.at, me) : null;
  const pitched = kind === "key" || kind === "bellnote";
  if (c) out.push(pitched && e.n !== undefined ? { ...c, n: e.n } : c);
  // a digit a braille plate carries is the plate's alone: no tumbler gives it away (FR5)
  const told = platePart(world.room, e.id) === s.input.length - 1;
  if (s.type === "dial" && e.result === "turn" && e.n === s.answer[s.input.length - 1] && !told) {
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
    if (o.kind !== "station" || !cacheOpen(world, o.id)) continue;
    const s = world.stations[o.id];
    const at = centre(o.tiles[0] as Vec);
    if (s?.type === "radio") {
      const digit = s.solved ? s.answer[1] : s.tuned ? bandDigit(s) : undefined;
      const c = cue(world, s.solved || s.tuned ? "tone" : "static", at, me);
      if (c) out.push(c);
      const pip =
        digit !== undefined && world.tick % PIP_TICKS === 0 ? cue(world, "pip", at, me) : null;
      if (pip) out.push({ ...pip, n: digit });
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
  else if (mine?.item === "earpiece" && tuneRest(world, mine.id))
    out.push({ kind: "rest", pan: 0, gain: 1 }); // private to the holder already
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

// A camera whose tile is out of sight is not sent (a hazard is told only within line of sight, ADR
// 0012), but where it looks can fall on ground the seat does see: through glass, down a corridor. That ground
// is lit for the seat, and a hazard in the dark already tells it so: the part of its cone in the light, as a
// `sight`, nothing of where it stands. So the same for a camera out of sight (ADR 0022): its real cone (the
// rays stop at walls and cover, as in `sightInLight`), cut to the seat's own light polygon, and to the lit
// side of any dark zone, and marked watching or idle as the camera would be. A camera already told of, or
// already shown as a `sight` from the dark, is skipped.
function farSights(
  world: World,
  role: Role,
  me: Vec,
  zones: Zone[],
  told: readonly EntityView[],
): EntityView[] {
  const out: EntityView[] = [];
  let light: Vec[] | null = null; // the seat's light, once a camera needs it
  for (const o of world.room.objects) {
    if (o.kind !== "camera" || !o.visibleTo.includes(role)) continue;
    if (told.some((e) => e.id === o.id)) continue;
    const cone = cameraCone(o);
    const fan = visiblePolygon(
      { origin: cameraApex(o), facing: cone.facing, fovDeg: cone.fovDeg, range: cone.range },
      (tx, ty) => blocksSight(world, tx, ty, true),
      SIGHT_RAYS,
    );
    light ??= lightPolygon(me, maskCache(world, world.room.grid), closedAt(world));
    const dark = zones.map(([x0, y0, x1, y1]) => ({ x0, y0, x1: x1 + 1, y1: y1 + 1 }));
    const polys = subtractRects(fan, dark)
      .flatMap((piece) => intersectLight(piece, light as Vec[], me))
      .map((poly) =>
        poly.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })),
      );
    const first = polys[0]?.[0];
    // idle or watching, as the camera itself would read: an idle one is drawn as a dashed outline, as up close
    if (first)
      out.push({
        id: o.id,
        kind: "sight",
        pos: first,
        polys,
        state: isWatching(world, o) ? "watching" : "idle",
      });
  }
  return out;
}

// What a sighted role may be told of: itself, marks (they show wherever they land, even in
// the dark), the lit tiles a hazard in the dark covers, and anything else only if its
// tile is in line of sight. A laser keeps just the part of its beam that is seen.
// What stands on open floor and is sent when the exact light covers some of it, as the client draws it. Not a
// guard or a camera: what they see is sent apart (`farSights`), and where they are stays the tile set's.
const ON_FLOOR = new Set<EntityView["kind"]>([
  "player",
  "crate",
  "checkpoint",
  "loot",
  "gear",
  "bell",
  "lamp",
  "lever",
  "keepsake",
  "card",
]);
function inSight(
  world: World,
  entities: EntityView[],
  seat: Seat,
  seen: Visible,
  zones: Zone[],
  touches: (t: Vec) => boolean,
  light: () => Vec[],
): EntityView[] {
  const out: EntityView[] = [];
  // a tile is in view when the tile set has it or the exact light the client draws touches any of it:
  // the client already draws that light, so sending what it touches tells nothing new, and a station
  // the light reached but the tile set missed used to pop in at a tile boundary as you moved a hair
  // (a tile is asked about for its display and again for its furniture, and an untouched one costs a
  // full sweep of rays, so the answer is kept for the view)
  const asked = new Map<string, boolean>();
  const lit = (t: Vec) => {
    if (seen.has(t.x, t.y)) return true;
    const key = `${t.x},${t.y}`;
    const known = asked.get(key);
    if (known !== undefined) return known;
    const hit = touches(t);
    asked.set(key, hit);
    return hit;
  };
  for (const e of entities) {
    if (
      e.kind === "stamp" ||
      e.kind === "sight" ||
      e.kind === "wire" ||
      (e.kind === "player" && e.seat === seat)
    ) {
      out.push(e);
    } else if (e.kind === "station") {
      // a station's state is seen where it shows it: its face, wires, keys or lamps (switches: the
      // lamps alone, never the panel by the buttons, so the pattern is told across the glass). Its
      // furniture is drawn from any part in sight, with nothing of its state. A display in a dark
      // zone shows nothing without the goggles (FR19), wherever the station's anchor stands.
      const o = world.room.objects.find((x) => x.id === e.id);
      const shown = (o ? displayTiles(o) : []).some((t) => lit(t) && !inAny(zones, centre(t)));
      const parts = e.station?.parts ?? [];
      const furniture = parts.some((p) => p.at.some(lit));
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
    } else if (
      ON_FLOOR.has(e.kind) &&
      lit({ x: Math.floor(e.pos.x), y: Math.floor(e.pos.y) }) &&
      footLit(light(), e.pos, footHalf(e.kind))
    ) {
      // a thing on the floor whose tile the tile set missed but whose footprint the exact light covers in
      // part: the client draws that light, and the thing in it (the user, playtest L1, L3, L5: a figure, the
      // flag and the goggles vanished while part of each was lit). By the client's own rule (litEntities).
      out.push(e);
    } else if (e.kind === "door" && !e.secret) {
      // a door is part of the map every sighted player holds, so it is sent whether or not its tile is
      // in the light (its outline used to pop in and out as you moved by a hair); its true state goes
      // too, since an ordinary door opening is team-wide (ADR 0025). A closed secret door is never here.
      out.push(e);
    }
  }
  return out;
}

// Whether a door tile is shut, as the client's light reads it: a tile with no door in the index counts
// as shut, exactly as `blocksSight` does.
const closedAt = (world: World) => (tx: number, ty: number) => {
  const id = indexOf(world.room).doorAt.get(tileKey(tx, ty));
  return !id || !world.doorOpen[id];
};

// What a standing place sees, kept per world, per place and door state. The tile set and the exact
// light depend on nothing else (the grid with the secret doors shut, and which doors are open), and the
// linter and the bots ask again and again from places that have not moved. A view asks about every
// station part the tile set missed, each a sweep of rays, so those answers are kept too.
interface Place {
  seen: Visible;
  encoded: string[];
  touch: (t: Vec) => boolean;
  light: () => Vec[]; // the exact light the client draws, built on first use
}
const TOUCH_PLACES = 24; // places kept per world: three seats and a few recent steps
const places = new WeakMap<World, Map<string, Place>>();
function placeOf(world: World, me: Vec): Place {
  const all = places.get(world) ?? new Map<string, Place>();
  places.set(world, all);
  const key = `${me.x},${me.y}|${JSON.stringify(world.doorOpen)}`;
  const kept = all.get(key);
  if (kept) return kept;
  if (all.size >= TOUCH_PLACES) all.delete(all.keys().next().value as string);
  const seen = visibleFrom(world, me);
  const memo = new Map<string, boolean>();
  let grid: string[] | null = null;
  let light: Vec[] | null = null;
  const place: Place = {
    light: () => {
      grid ??= maskCache(world, world.room.grid);
      light ??= lightPolygon(me, grid, closedAt(world));
      return light;
    },
    seen,
    encoded: encodeSeen(seen.tiles),
    touch: (t) => {
      const at = `${t.x},${t.y}`;
      const have = memo.get(at);
      if (have !== undefined) return have;
      grid ??= maskCache(world, world.room.grid);
      const hit = lightTouches(me, grid, closedAt(world), t.x, t.y);
      memo.set(at, hit);
      return hit;
    },
  };
  all.set(key, place);
  return place;
}

// What opens an ordinary door, when it is not held plates: a sequence, or a station solved. The room
// already shows both, so the view tells nothing it does not; the door's chip says it truthfully.
function doorOpens(world: World, door: RoomObject): "stations" | "sequence" | undefined {
  if (door.mode === "sequence") return "sequence";
  const stations = (door.opensWhen ?? []).some((id) => id in world.stations);
  return stations ? "stations" : undefined;
}

// The secret doors still shut, by door id: a closed one is wall to every sighted view and in no list.
function secretClosed(world: World): Set<string> {
  const out = new Set<string>();
  for (const d of secretDoors(world.room)) {
    if (!world.doorOpen[d.chamber.id]) out.add(d.chamber.id);
    if (!world.doorOpen[d.vault.id]) out.add(d.vault.id);
  }
  return out;
}

// The tile grid a sighted seat or a watcher is sent: every chamber and vault not yet open, and its
// secret door tile, reads "#", exactly as the wall around it (ADR 0007: nothing tells a role a
// chamber exists). The chamber opens with its door, the vault with its own.
function maskCache(world: World, grid: string[]): string[] {
  const hide: { rect: [number, number, number, number]; doors: Vec[] }[] = [];
  for (const d of secretDoors(world.room)) {
    const cache = cacheOf(world.room.objects.find((o) => o.id === d.id) as never);
    if (!cache) continue;
    if (!world.doorOpen[d.chamber.id]) {
      hide.push({ rect: cache.chamber.rect, doors: [...d.chamber.tiles] });
    } else if (!world.doorOpen[d.vault.id]) {
      hide.push({ rect: cache.chamber.vault.rect, doors: [...d.vault.tiles] });
    }
  }
  if (hide.length === 0) return grid;
  return grid.map((row, y) =>
    [...row]
      .map((ch, x) =>
        hide.some((h) => inRect(h.rect, { x, y }) || h.doors.some((t) => t.x === x && t.y === y))
          ? "#"
          : ch,
      )
      .join(""),
  );
}

function maskTiles(grid: string[], zones: Zone[]): string[] {
  return grid.map((row, y) =>
    [...row].map((ch, x) => (inAny(zones, { x: x + 0.5, y: y + 0.5 }) ? " " : ch)).join(""),
  );
}

// A seat's own cache, if the room has one for it: only the owner is ever told its riddle (also used
// for the reveal, which is sent to one person at a time).
export function cacheFor(world: World, seat: Seat): RoleView["cache"] {
  for (const o of world.room.objects) {
    const cache = cacheOf(o);
    if (!cache || cache.owner !== seat + 1) continue;
    const by = world.cacheBy[o.id];
    return {
      id: o.id,
      motif: cache.motif,
      riddle: cache.riddle,
      item: cache.item,
      state:
        world.cacheTaken[o.id] !== undefined
          ? "taken"
          : by !== undefined
            ? "vault"
            : world.cacheUncovered.includes(o.id)
              ? "open"
              : "hidden",
      ...(by !== undefined ? { by } : {}),
    };
  }
  return undefined;
}

// The item a seat took, for its own view: the keepsake slot, apart from gear.
function keepsakeFor(world: World, seat: Seat): ItemId | undefined {
  for (const o of world.room.objects) {
    const cache = cacheOf(o);
    if (cache && world.cacheTaken[o.id] === seat) return cache.item;
  }
  return undefined;
}

// This tick's secret-door moment or take: team-wide, so the same for every role (sensory parity).
function cacheEventOf(world: World): RoleView["cacheEvent"] {
  for (const e of world.events) {
    if (e.kind !== "cache") continue;
    const cache = cacheOf(world.room.objects.find((o) => o.id === e.id) as never);
    if (!cache) continue;
    return {
      result: e.result,
      at: e.at,
      owner: (cache.owner - 1) as Seat,
      ...(e.result === "uncover" ? {} : { item: cache.item }),
    };
  }
  return undefined;
}

// Can't see's open braille plate: its cells only, never the number they spell (FR6). Nobody else
// is ever sent them: the sighted see the plate, not what is raised on it.
function brailleFor(world: World, seat: Seat, role: Role): RoleView["braille"] {
  if (role !== "blind") return undefined;
  const id = world.reading[seat];
  const n = id === undefined ? undefined : plateNumber(world, id);
  if (id === undefined || n === undefined) return undefined;
  const plate = world.room.objects.find((o) => o.id === id);
  return {
    id,
    cells: brailleCells(n),
    ...(plate?.params?.teach === true ? { teach: true as const } : {}),
  };
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
  const cache = cacheFor(world, seat);
  if (cache) view.cache = cache;
  const kept = keepsakeFor(world, seat);
  if (kept) view.keepsake = kept;
  const moment = cacheEventOf(world);
  if (moment) view.cacheEvent = moment;
  const hint = actHint(world, seat, role);
  if (hint) view.act = hint; // phrased per role: never a colour for Can't see
  const braille = brailleFor(world, seat, role);
  if (braille) view.braille = braille; // own seat only, and only Can't see
  const alarm = world.tick < world.alarmUntil;
  if (full) {
    const hue = world.room.meta.hue;
    if (typeof hue === "string") view.hue = hue;
  }
  if (role !== "blind") {
    const me = world.players[seat].pos;
    view.you.pos = rounded(me);
    // goggles (FR19): the wearer sees into dark zones under the normal line-of-sight rules
    const dark = darkZones(world);
    const zones = carried(world, seat)?.item === "goggles" ? [] : dark;
    view.dark = inAny(dark, me);
    view.alarm = alarm;
    const { seen, encoded, touch: touches, light } = placeOf(world, me);
    view.seen = [...encoded]; // a copy: a view is the caller's to change
    const told = inSight(
      world,
      zones.length === 0 ? entitiesFor(world, seat, role) : darken(world, seat, role, zones),
      seat,
      seen,
      zones,
      touches,
      light,
    );
    view.entities = [
      ...told,
      ...farSights(world, role, me, zones, told),
      ...uvLight(world, role, seen, zones),
    ];
    if (full) {
      const grid = maskCache(world, world.room.grid);
      view.tiles = zones.length === 0 ? grid : maskTiles(grid, zones);
    }
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
  if (full) view.tiles = maskCache(world, world.room.grid); // a watcher sees the room, masked like the sighted
  if (full && typeof world.room.meta.hue === "string") view.hue = world.room.meta.hue;
  const braille = follow === null ? undefined : brailleFor(world, seat, role);
  if (braille) view.braille = braille; // a watcher of Can't see reads over their shoulder
  const moment = cacheEventOf(world);
  if (moment) view.cacheEvent = moment;
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

// What a keepsake is called (the take hint; a bot owner matches it: bots/brain.ts thinkBlind)
export const ITEM_WORDS: Record<ItemId, string> = {
  watch: "gold watch",
  ledger: "ledger",
  ring: "signet ring",
  goblet: "silver goblet",
  pen: "fountain pen",
  necklace: "pearl necklace",
};

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
  // a plate under Can't see's hand comes before anything else Act could do (step.ts: readPlate)
  if (!part && role === "blind" && besidePlate(world, tile)) {
    return "Read the plate";
  }
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
  for (const obj of world.room.objects) {
    const cache = cacheOf(obj);
    const item = cache?.chamber.vault.item;
    if (!cache || !item || item.x !== tile.x || item.y !== tile.y) continue;
    if (world.cacheBy[obj.id] === undefined || world.cacheTaken[obj.id] !== undefined) continue;
    return seat === cache.owner - 1
      ? `Take the ${ITEM_WORDS[cache.item]}`
      : "Only its owner can take this";
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
