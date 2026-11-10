import { ASK_QUIET_MS, type Ask, type AskClock, type AskKind, reaskDue } from "../asks.ts";
import {
  type Callout,
  type ChannelMessage,
  COOLDOWN_MS,
  type Outgoing,
  STAMP_LIFE_MS,
} from "../channels.ts";
import { type EntityView, ITEM_WORDS, type RoleView, type SoundCue } from "../perception.ts";
import { cacheOf, type Room, secretDoors } from "../rooms/format.ts";
import { platePart } from "../sim/braille.ts";
import { blockedAt } from "../sim/collide.ts";
import { laserBeam } from "../sim/hazards.ts";
import { stationParts, tilesOf } from "../sim/stations.ts";
import { decodeSeen } from "../sim/visibility.ts";
import { createWorld, SPEED_TPS, type StationType, TICK_MS, type World } from "../sim/world.ts";
import {
  canReceive,
  canSend,
  type PlayerInput,
  ROLES,
  type Role,
  type Seat,
  type Vec,
} from "../types.ts";
import {
  beliefFrom,
  bellsStep,
  bellToMark,
  type Count,
  countStep,
  DECODERS,
  dialStep,
  type Ear,
  earStep,
  emptyBelief,
  emptyEar,
  keypadStep,
  linkedFrom,
  radioPad,
  radioToTell,
  readBraille,
  type StationBelief,
  switchesLeft,
  syncGo,
  TURN_WAIT_TICKS,
  vaultStep,
} from "./decode.ts";
import { type AlarmWindow, forecastFor } from "./forecast.ts";
import {
  claimJobs,
  clueTarget,
  exitTile,
  hintsOf,
  isDone,
  isOpen,
  type Job,
  jobTile,
  type Known,
} from "./jobs.ts";
import { DELTA, findPath, nearestReachable, planSafe, STEP_TICKS, type Step } from "./path.ts";
import { pickPhrase, type Situation } from "./phrases.ts";

// A bot thinks once per tick from its own role's view and the messages its role
// received, and answers with an input and at most one message. It reads nothing
// else about the live world (ADR 0007): a station is solved from what it perceives
// and what teammates send (clues FR5, ADR 0018), through its type's decoder
// (decode.ts). What it also holds is the room's static plan: the grid, the hints,
// and the hazards' timing (FR24).
export interface BotMemory {
  seat: Seat;
  tiles: string[] | null;
  heading: PlayerInput["move"]; // blind bots: last commanded direction
  holding: boolean;
  lastSpokeAt: number;
  lastFlavourAt: number;
  usedPhrases: Set<string>;
  seq: number;
  humans: ReadonlySet<Seat>; // seats held by people, so jobs go to them first
  roles: readonly [Role, Role, Role] | null; // who is what in this room
  lastCalloutAt: number;
  ignoreHumUntil: number; // a bot that has just been released is still on its plate
  humTicks: number; // ticks in a row it has heard a hum
  known: Known | null;
  ptr: [number, number, number]; // how far along each seat's job queue
  cacheDone: Set<string>; // cache jobs finished (`seat:index`): a job done by standing somewhere stays done
  cacheSince: Record<string, number>; // tick each open, unsolved cache was first perceived open and in play
  cacheGaveUp: Set<string>; // caches whose jobs this bot has given up: nobody finished them in time
  queues: Record<Seat, Job[]> | null;
  exec: Exec | null;
  nav: Nav;
  alarms: AlarmWindow[];
  alarmFrom: number | null;
  guide: Guide;
  lastClipAt: number;
  blindAt: Vec | null; // a Can't-speak bot: where it last saw the Can't-see seat
  celebrated: boolean;
  model: World | null;
  lastPos: Vec | null; // where the bot was last tick: a jump is the team being sent back
  bodies: Partial<Record<Seat, Vec>>; // where it last saw each player
  actWas: boolean; // pressed Act last tick: a press needs a release before the next
  gearWas: boolean;
  markedFor: string | null; // a switches watcher: the station and lamps (as seen) it last marked a button for
  lastMarkAt: number; // when it last sent a mark (game ms): marks have a cooldown
  wireMarkedAt: Record<string, number>; // when it last marked a wire panel's answer, by station
  postSince: number | null; // when it got to the ink it is lighting (game ms), or null
  ear: Ear; // Can't see holding the earpiece: the tune heard, and the code last told
  toTell: number[]; // digits of the earpiece's code (or a braille plate's number) still to text, one a turn
  toldPlate: string | null; // a Can't-see bot: the braille cells it last texted (read again after a send-back)
  count: Count | null; // a sync lock's counter: the digit it last texted, and when
  asks: Record<string, AskClock>; // the asks it is making, keyed "<kind>:<station>:<to>" (asks.ts)
  lastHeardAt: number; // the latest message it was sent or sent itself (game ms): an ask never lands within 2 s
}
export interface BotTurn {
  input: PlayerInput;
  send: Outgoing | null;
  ask?: Ask | null; // an ask to say this tick (asks.ts): it goes to the asked seat's view only
}

interface Exec {
  kind: "move" | "wait";
  to: Vec;
  left: number; // a wait's ticks still to go
}
interface Nav {
  key: string;
  plan: Step[];
  i: number;
  expect: Vec | null;
}
// What the guide believes about the blind seat it steers.
interface Guide {
  moving: boolean;
  heading: Vec; // the direction the blind will resume on `go`
  decided: string | null; // the tile a decision was last made on
  nextTick: number; // while the blind holds, when the next step of the plan is due
  still: number; // ticks the blind has not moved
  last: Vec | null;
  est: Vec | null; // where the blind is when it cannot be seen
  lastSentAt: number;
  lastSent: Callout | null;
  started: boolean;
  nav: Nav;
  lead: number; // how far a person coasts after "stop", in tiles: learnt, so "stop" is said that early
  stopFrom: Vec | null; // where they were when told to stop, to measure it
  bumped: Vec | null; // a person pushed at something here: until they are clear of it, line them up first
  tapAt: number; // when the guide last asked a person for a tap
  sentFrom: Vec | null; // where they were when last told a direction, to measure their progress
  nudges: number; // repeats of this direction since it was said or they last made progress (FR11)
  progressAt: number; // when they last made progress along it (or were told it)
  progressMark: number; // how far along it they were then, in tiles
}

// Jobs a seat works where it stands (Act on a part, the gear, a hand): a guide on one parks the
// Can't-see seat rather than steering it.
const WORK_KINDS = new Set<Job["target"]["kind"]>([
  "station",
  "keepsake",
  "watch",
  "take",
  "give",
  "sill",
  "tow",
]);

// A cache needs every seat's part (ADR 0024): a person may never do theirs, so a bot gives a cache's
// jobs up once it has been open this long without being solved, and goes back to its beat (FR1 of
// review fixes A: an uncovered cache never blocks a room for good)
export const CACHE_GIVE_UP_TICKS = 1200;
const PERCEIVED_TICKS = 40; // a hazard seen or heard in the last 2 s is planned around (A3)

// The hazards this bot has seen or heard lately: all it may plan around, since a role that
// has perceived nothing of a hazard knows nothing of it.
function perceivedHazards(known: Known, tick: number): ReadonlySet<string> {
  const out = new Set<string>();
  for (const [id, seen] of Object.entries(known.seenHazards)) {
    if (tick - seen.lastTick <= PERCEIVED_TICKS) out.add(id);
  }
  return out;
}

const newNav = (): Nav => ({ key: "", plan: [], i: 0, expect: null });
const ZERO: Vec = { x: 0, y: 0 };
const STEP_LEN = (SPEED_TPS * TICK_MS) / 1000;
const NUDGE_MS = 3000; // a person who has made no progress this long after a direction hears it again (FR11)
const NUDGE_QUIET_MS = 2000; // and only once nothing has been sent for this long
const PROGRESS = 0.25; // tiles along the heading that count as progress
const FLAVOUR_MS = 10_000;
const MARK_AFTER_MS = 20_000; // a torch carrier at the ink gives the others this long to read it first
const IDLE_MS = 5000; // a blind bot with nothing heard for this long stays put
const CLIP_MS = 10_000;
const HUM_TICKS = 3;
const STUCK_TICKS = 8; // a person who has not moved for this long, while told to, is against something
const TAP_NEAR_MS = 800; // between taps on the last stretch
const TAP_MS = 1100; // between one "tap" and the next
const LANE_SLACK = 0.15; // how far off the middle of a one-tile lane a person may be
const BUMP_SLACK = 0.1; // and just after they bumped

export function createBotMemory(
  seat: Seat,
  humans: ReadonlySet<Seat> = new Set(),
  roles: readonly [Role, Role, Role] | null = null,
): BotMemory {
  return {
    seat,
    tiles: null,
    heading: { ...ZERO },
    holding: true,
    lastSpokeAt: Number.NEGATIVE_INFINITY,
    lastFlavourAt: Number.NEGATIVE_INFINITY,
    usedPhrases: new Set(),
    seq: 0,
    humans,
    roles,
    lastCalloutAt: Number.NEGATIVE_INFINITY,
    ignoreHumUntil: 0,
    humTicks: 0,
    known: null,
    ptr: [0, 0, 0],
    queues: null,
    exec: null,
    nav: newNav(),
    alarms: [],
    alarmFrom: null,
    guide: {
      moving: false,
      heading: { ...ZERO },
      decided: null,
      nextTick: 0,
      still: 0,
      last: null,
      est: null,
      lastSentAt: Number.NEGATIVE_INFINITY,
      lastSent: null,
      started: false,
      nav: newNav(),
      lead: 0.8,
      stopFrom: null,
      bumped: null,
      tapAt: Number.NEGATIVE_INFINITY,
      sentFrom: null,
      nudges: 0,
      progressAt: Number.NEGATIVE_INFINITY,
      progressMark: 0,
    },
    lastClipAt: Number.NEGATIVE_INFINITY,
    blindAt: null,
    celebrated: false,
    model: null,
    lastPos: null,
    cacheDone: new Set(),
    cacheSince: {},
    cacheGaveUp: new Set(),
    bodies: {},
    actWas: false,
    gearWas: false,
    markedFor: null,
    lastMarkAt: Number.NEGATIVE_INFINITY,
    wireMarkedAt: {},
    postSince: null,
    ear: emptyEar(),
    toTell: [],
    toldPlate: null,
    count: null,
    asks: {},
    lastHeardAt: Number.NEGATIVE_INFINITY,
  };
}

const idle = (m: BotMemory, move: Vec = ZERO): PlayerInput => ({ seq: m.seq, move, act: false });
// A bot led by another's hand walks nowhere of its own: the leader walks for both (ADR 0019).
const towedWalk = (led: boolean, walk: PlayerInput): PlayerInput =>
  led ? { ...walk, move: ZERO } : walk;
const tileOf = (p: Vec): Vec => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
const centreOf = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });
const key = (t: Vec) => `${t.x},${t.y}`;

const DIRECTIONS: Partial<Record<Callout, Vec>> = {
  up: DELTA.up,
  down: DELTA.down,
  left: DELTA.left,
  right: DELTA.right,
};
const WORD: Record<string, Callout> = { up: "up", down: "down", left: "left", right: "right" };

export function think(
  room: Room,
  view: RoleView,
  inbox: ChannelMessage[],
  memory: BotMemory,
  now: number,
): BotTurn {
  memory.seq++;
  for (const msg of inbox) memory.lastHeardAt = Math.max(memory.lastHeardAt, msg.sentAt);
  if (view.tiles) memory.tiles = view.tiles;
  if (view.role === "blind") return thinkBlind(view, inbox, memory, now);
  return thinkSighted(room, view, inbox, memory, now);
}

// --- Can't see: acts on what it is told, and on what it hears -------------------

function thinkBlind(view: RoleView, inbox: ChannelMessage[], m: BotMemory, now: number): BotTurn {
  if (view.sounds.some((s) => s.kind === "caught")) {
    // sent back to the start: whatever it was told before is about somewhere else
    m.holding = true;
    m.heading = { ...ZERO };
    m.toldPlate = null; // every answer is drawn again: the plate says something new
  }
  for (const msg of inbox) {
    if (msg.method !== "callout") continue; // never parses free text
    m.lastCalloutAt = now;
    const dir = DIRECTIONS[msg.callout];
    if (dir) {
      m.heading = { ...dir };
      m.holding = false;
      m.ignoreHumUntil = m.humTicks > 0 ? view.tick + 8 : 0; // still on the plate it was holding
    } else if (msg.callout === "stop" || msg.callout === "wait") {
      m.holding = true;
    } else if (msg.callout === "go" || msg.callout === "push") {
      if (m.holding && m.humTicks > 0) m.ignoreHumUntil = view.tick + 8;
      if (m.heading.x !== 0 || m.heading.y !== 0) m.holding = false;
    }
  }
  const moving = !m.holding && (m.heading.x !== 0 || m.heading.y !== 0);
  // A hum is a plate underfoot: stop and hold it. Held after the third tick of it, which
  // is when a bot walking at full speed has come to the middle of the plate's tile.
  m.humTicks = view.sounds.some((s) => s.kind === "hum") ? m.humTicks + 1 : 0;
  if (moving && view.tick >= m.ignoreHumUntil && m.humTicks >= HUM_TICKS) m.holding = true;
  if (moving && now - m.lastCalloutAt > IDLE_MS) m.holding = true; // nobody is steering
  if (view.status === "cleared") m.holding = true;
  // the stethoscope at a safe's back: the tumbler means the dial is on the number now (decode.ts)
  const tumbler = view.gear === "stethoscope" && view.sounds.some((s) => s.kind === "tumbler");
  // the earpiece: the code it plays, heard the same twice, is texted a digit a key (decode.ts)
  m.toTell.push(...earStep(view, m.ear));
  // a braille plate under its hand: Act once to read it, then text its number a digit a turn
  // (or its own cache's keepsake, once the vault is open and the hint says it can be taken: ADR 0024)
  // (its keepsake's own hint only: towed over floor gear it hears "Take the <gear>", and leaves it)
  const take =
    view.cache?.state === "vault" && view.act === `Take the ${ITEM_WORDS[view.cache.item]}`;
  const want = (view.act === "Read the plate" && !view.braille) || take;
  const read = want && !m.actWas;
  m.actWas = read;
  const cells = view.braille ? JSON.stringify(view.braille.cells) : null;
  const plate = view.braille ? readBraille(view.braille.cells) : null;
  if (cells && plate !== null && cells !== m.toldPlate) {
    m.toldPlate = cells;
    m.toTell.push(...String(plate).split("").map(Number));
  }
  const digit = tumbler ? undefined : m.toTell.shift();
  const send: Outgoing | null = tumbler
    ? { method: "callout", callout: "stop" }
    : digit !== undefined
      ? { method: "text", text: String(digit) }
      : null;
  // Led by the hand (a Can't-see bot never takes one: that is a sighted bot's `tow` job), the person
  // leading walks for both and both steer (ADR 0019): the heading it was last told would only pull
  // against them, so it adds nothing while it holds a hand, and keeps the heading for after.
  const led = view.you.hand !== undefined;
  return { input: { ...idle(m, m.holding || led ? ZERO : m.heading), act: read }, send };
}

// --- Seeing roles ------------------------------------------------------------

function ensureKnown(room: Room, m: BotMemory): Known {
  if (m.known) return m.known;
  const known: Known = {
    doorOpen: {},
    pressed: {},
    crates: {},
    seq: {},
    seenHazards: {},
    clues: {},
    checkpoint: 0,
    stations: {},
    gear: {},
    holding: {},
  };
  for (const o of room.objects) {
    if (o.kind === "station") known.stations[o.id] = emptyBelief();
    else if (o.kind === "gear" && o.tiles[0])
      known.gear[o.id] = { at: { ...o.tiles[0] }, heldBy: null, sill: null };
    if (o.kind === "door") known.doorOpen[o.id] = false;
    else if (o.kind === "plate") known.pressed[o.id] = false;
    else if (o.kind === "crate" && o.tiles[0]) known.crates[o.id] = { ...o.tiles[0] };
  }
  m.known = known;
  return known;
}

// What the bot believes of each station, where the gear is and who holds whose hand, from its own
// view and inbox (clues FR5): gear on the floor or a sill where it is seen, gear on a figure in
// sight (or its own slot) as held, a hand held as the figures show it. What is out of sight
// keeps its last belief.
function readStations(
  room: Room,
  view: RoleView,
  inbox: ChannelMessage[],
  m: BotMemory,
  known: Known,
): void {
  known.roles = rolesOf(m, view.role);
  const stations = room.objects.filter((o) => o.kind === "station");
  for (const o of stations)
    known.stations[o.id] = beliefFrom(view, inbox, o, known.stations[o.id] ?? emptyBelief());
  linkedFrom(room, view, known.stations);
  for (const o of stations) {
    const b = known.stations[o.id] as StationBelief;
    // While a cache is open and unsolved, a "stop" is about the cache's safe (its listener is at the
    // back of that one): the room's own dial does not take it as its number (ADR 0024)
    const aside =
      !cacheOf(o) &&
      Object.keys(known.cachesOpen ?? {}).some(
        (id) => known.stations[id]?.solved !== true && !m.cacheGaveUp.has(id),
      );
    const heard = aside
      ? inbox.filter((m) => !(m.method === "callout" && m.callout === "stop"))
      : inbox;
    // a keypad takes only the chimes of its own clue: another keypad's (a cache's, heard from the same
    // vent) names a different clue by its bearing and would spoil its code (ADR 0024)
    const own = o.params?.clue;
    const seen =
      o.params?.type === "keypad" && typeof own === "string" && view.you.pos
        ? {
            ...view,
            sounds: view.sounds.filter((c) => {
              if (c.kind !== "clue" || !c.dir || !view.you.pos) return true;
              const from = alongBearing(room, "clue", view.you.pos, c.dir);
              return from === null || from === own;
            }),
          }
        : view;
    DECODERS[o.params?.type as StationType]?.(seen, heard, b, o, view.tick, platePart(room, o.id));
  }
  linkedFrom(room, view, known.stations);
  if (view.sounds.some((c) => c.kind === "caught")) known.holding = {};
  const figures = view.entities.filter((e) => e.kind === "player" && e.seat !== undefined);
  for (const f of figures) {
    const seat = f.seat as Seat;
    if (f.heldBy !== undefined) known.holding[seat] = f.heldBy;
    else if (f.holding === undefined) delete known.holding[seat];
  }
  const hatchAt = (t: Vec) =>
    room.objects.find((o) => o.kind === "hatch" && o.tiles.some((h) => key(h) === key(t)))?.id;
  for (const [id, g] of Object.entries(known.gear)) {
    const item = room.objects.find((o) => o.id === id)?.params?.item;
    const lying = view.entities.find((e) => e.kind === "gear" && e.id === id);
    const holder =
      view.gear === item ? m.seat : figures.find((f) => f.item === item && f.seat !== m.seat)?.seat;
    if (lying) {
      const t = tileOf(lying.pos);
      const sill = hatchAt(t) ?? null;
      known.gear[id] = { at: sill ? null : t, heldBy: null, sill };
    } else if (holder !== undefined) {
      known.gear[id] = { at: null, heldBy: holder, sill: null };
    } else if (g.at && seenTile(view, g.at)) {
      // where it last lay is in sight and it is gone: someone out of sight has it
      known.gear[id] = { at: null, heldBy: null, sill: null };
    }
  }
}

// Whether a tile is in the view's line of sight (perception.ts: encodeSeen).
function seenTile(view: RoleView, t: Vec): boolean {
  return view.seen !== undefined && decodeSeen(view.seen).has(key(t));
}

const HEARD_KIND: Partial<Record<SoundCue["kind"], "guard" | "camera" | "laser">> = {
  guard: "guard",
  camera: "camera",
  laser: "laser",
};
const BEARING_COS = Math.cos((25 * Math.PI) / 180); // a hazard counts as "along the sound" within 25 degrees

// The nearest object of `kind` that lies along `dir` (within 25 degrees) from `me`.
function alongBearing(room: Room, kind: "clue", me: Vec, dir: Vec): string | null {
  let best: { id: string; d: number } | null = null;
  for (const o of room.objects) {
    const t = o.tiles[0];
    if (o.kind !== kind || !t) continue;
    const dx = t.x + 0.5 - me.x;
    const dy = t.y + 0.5 - me.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01 || (dx * dir.x + dy * dir.y) / d < BEARING_COS) continue;
    if (!best || d < best.d) best = { id: o.id, d };
  }
  return best?.id ?? null;
}

// A hazard heard, not seen: a cue carries only a direction, so it names the nearest hazard of
// its kind that lies along that bearing from where the bot stands. (A laser hums from its
// nearest beam tile, so any tile of the beam can be the source.)
function hearHazards(room: Room, view: RoleView, known: Known): void {
  const me = view.you.pos;
  if (!me) return;
  for (const s of view.sounds) {
    if (s.kind === "clue" && s.dir && s.n !== undefined) {
      // a chime: the nearest clue along the bearing says n, with no picture to go with it
      const clue = alongBearing(room, "clue", me, s.dir);
      if (clue) known.clues[clue] = s.n;
      continue;
    }
    const kind = HEARD_KIND[s.kind];
    if (!kind || !s.dir) continue;
    let best: { id: string; d: number } | null = null;
    for (const o of room.objects) {
      if (o.kind !== kind) continue;
      const spots =
        kind === "laser" ? [o.tiles[0] as Vec, ...laserBeam(room, o)] : [o.tiles[0] as Vec];
      for (const t of spots) {
        const dx = t.x + 0.5 - me.x;
        const dy = t.y + 0.5 - me.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.01) continue;
        if ((dx * s.dir.x + dy * s.dir.y) / d < BEARING_COS) continue;
        if (!best || d < best.d) best = { id: o.id, d };
      }
    }
    if (best) known.seenHazards[best.id] = { lastTick: view.tick };
  }
}

function observe(room: Room, view: RoleView, inbox: ChannelMessage[], m: BotMemory): Known {
  const known = ensureKnown(room, m);
  readStations(room, view, inbox, m, known);
  hearHazards(room, view, known);
  for (const e of view.entities) {
    if (e.kind === "door") known.doorOpen[e.id] = e.state === "open";
    else if (e.kind === "plate") known.pressed[e.id] = e.state === "pressed";
    else if (e.kind === "braille" && e.state === "on") known.read = { ...known.read, [e.id]: true };
    else if (e.kind === "crate") known.crates[e.id] = tileOf(e.pos);
    else if (e.kind === "checkpoint" && e.state === "reached") {
      known.checkpoint = Math.max(known.checkpoint, Number(e.id.slice(1)));
    } else if (e.kind === "sign" && e.shows) known.seq[e.shows.join()] = e.progress ?? 0;
    else if (e.kind === "guard" || e.kind === "camera" || e.kind === "laser") {
      known.seenHazards[e.id] = { lastTick: view.tick }; // in line of sight right now
    }
  }
  perceiveCaches(room, view, known);
  giveUpCaches(room, view, known, m);
  // an alarm speeds the guards up and holds the cameras on: the forecast needs its windows
  if (view.alarm && m.alarmFrom === null) m.alarmFrom = view.tick;
  if (!view.alarm && m.alarmFrom !== null) {
    m.alarms = [...m.alarms, { from: m.alarmFrom, to: view.tick }];
    m.alarmFrom = null;
    m.nav = newNav();
    m.guide.nav = newNav();
  }
  return known;
}

// What a bot has perceived of each cache (ADR 0024), never read from the simulation: the team-wide
// `cacheEvent` (its `at` is a door's centre, or the item's tile), a secret door seen open, and the
// owner's own `view.cache`. An uncover opens the chamber door in its belief, a solve the vault door.
function perceiveCaches(room: Room, view: RoleView, known: Known): void {
  const same = (a: Vec, b: Vec) => Math.floor(a.x) === b.x && Math.floor(a.y) === b.y;
  const open = (id: string) => {
    known.cachesOpen = { ...known.cachesOpen, [id]: true };
  };
  const taken = (id: string) => {
    known.cachesTaken = { ...known.cachesTaken, [id]: true };
  };
  const doors = secretDoors(room);
  const ev = view.cacheEvent;
  for (const d of doors) {
    const spec = room.objects.find((o) => o.id === d.id);
    const c = spec ? cacheOf(spec) : null;
    if (!c) continue;
    if (ev?.result === "uncover" && same(ev.at, c.chamber.door)) {
      open(d.id);
      known.doorOpen[d.chamber.id] = true;
    }
    if (ev?.result === "solved" && same(ev.at, c.chamber.vault.door)) {
      open(d.id);
      known.doorOpen[d.chamber.id] = true;
      known.doorOpen[d.vault.id] = true;
      const b = known.stations[d.id];
      if (b) b.solved = true;
    }
    if (ev?.result === "taken" && same(ev.at, c.chamber.vault.item)) taken(d.id);
    if (view.entities.some((e) => e.kind === "door" && e.secret && e.id === d.chamber.id)) {
      open(d.id);
    }
    if (view.cache?.id === d.id) {
      if (view.cache.state === "open" || view.cache.state === "vault") open(d.id);
      if (view.cache.state === "vault" || view.cache.state === "taken") {
        // solved: its vault is open too
        known.doorOpen[d.vault.id] = true;
        const b = known.stations[d.id];
        if (b) b.solved = true;
      }
      if (view.cache.state === "taken") taken(d.id);
    }
  }
}

// An open cache left unsolved for CACHE_GIVE_UP_TICKS once it is in play is given up: its jobs end for
// this bot and the room's own stations take every callout again. In play: the seat's beat has reached
// the last beat any of the cache's jobs waits for (`currentJob`), since before that nobody is meant to
// be working it. It reads only the bot's own view and the static job plan (ADR 0018).
function giveUpCaches(room: Room, view: RoleView, known: Known, m: BotMemory): void {
  const queues = queuesOf(room, m, view.role);
  const beat =
    queues[m.seat].slice(m.ptr[m.seat]).find((j) => j.cache === undefined)?.beat ?? Infinity;
  for (const id of Object.keys(known.cachesOpen ?? {})) {
    if (known.stations[id]?.solved === true || m.cacheGaveUp.has(id)) continue;
    const jobs = [0, 1, 2].flatMap((s) => queues[s as Seat].filter((j) => j.cache === id));
    const last = Math.max(0, ...jobs.map((j) => j.beat));
    if (beat < last) continue;
    const since = m.cacheSince[id] ?? view.tick;
    m.cacheSince[id] = since;
    if (view.tick - since >= CACHE_GIVE_UP_TICKS) m.cacheGaveUp.add(id);
  }
}

// A send-back shuts every chamber again: what was perceived of them is forgotten, and re-learned
// from the door (if seen) or the owner's view.
function forgetCaches(room: Room, view: RoleView, known: Known, m: BotMemory): void {
  m.cacheDone.clear();
  m.cacheSince = {};
  m.cacheGaveUp.clear();
  known.cachesOpen = {};
  known.cachesTaken = {};
  for (const d of secretDoors(room)) {
    known.doorOpen[d.chamber.id] = false;
    known.doorOpen[d.vault.id] = false;
  }
  perceiveCaches(room, view, known);
}

// The job a seat is on: a cache job that is active (its cache perceived open, not taken, not done)
// comes first; otherwise the first beat job from the pointer on. The beat job is parked, not lost:
// when the cache jobs end it is current again.
function currentJob(
  room: Room,
  m: BotMemory,
  known: Known,
  own: Role,
  seat: Seat,
  at?: Vec,
): Job | null {
  const queue = queuesOf(room, m, own)[seat];
  // a cache job waits for its beat: a cache uncovered early is worked when the seat gets there, since
  // what it needs (a door, a teammate, the gear) may not be in play before
  const beat = queue.slice(m.ptr[seat]).find((j) => j.cache === undefined)?.beat ?? Infinity;
  const active = queue.find((j) => {
    if (j.cache === undefined || m.cacheDone.has(`${seat}:${j.index}`) || j.beat > beat)
      return false;
    if (m.cacheGaveUp.has(j.cache)) return false;
    if (known.cachesOpen?.[j.cache] !== true || known.cachesTaken?.[j.cache] === true) return false;
    if (j.target.kind === "keepsake" && known.stations[j.cache]?.solved !== true) return false;
    if (!isDone(room, j, known, at, seat)) return true;
    m.cacheDone.add(`${seat}:${j.index}`); // done by being there: leaving does not undo it
    return false;
  });
  return active ?? queue.slice(m.ptr[seat]).find((j) => j.cache === undefined) ?? null;
}

function rolesOf(m: BotMemory, own: Role): readonly [Role, Role, Role] {
  if (m.roles) return m.roles;
  // roles rotate one place per room, so one seat's role gives all three
  const shift = (ROLES.indexOf(own) - m.seat + 3) % 3;
  const at = (s: number) => ROLES[(s + shift) % 3] as Role;
  return [at(0), at(1), at(2)];
}

function queuesOf(room: Room, m: BotMemory, own: Role): Record<Seat, Job[]> {
  if (m.queues) return m.queues;
  const roles = rolesOf(m, own);
  const spawn = (s: Seat) => {
    const t = room.objects.find((o) => o.id === `s${s + 1}`)?.tiles[0];
    return t ? centreOf(t) : undefined;
  };
  m.queues = claimJobs(
    room,
    hintsOf(room),
    ([0, 1, 2] as const).map((seat) => ({
      seat,
      role: roles[seat],
      human: m.humans.has(seat),
      pos: spawn(seat),
    })),
  );
  return m.queues;
}

interface Maps {
  doorAt: Map<string, string>;
  plateAt: Map<string, string>;
  doorsOf: Map<string, string[]>; // plate id -> the doors it opens
}
const mapsCache = new WeakMap<Room, Maps>();
function mapsOf(room: Room): Maps {
  let maps = mapsCache.get(room);
  if (maps) return maps;
  maps = { doorAt: new Map(), plateAt: new Map(), doorsOf: new Map() };
  for (const o of room.objects) {
    if (o.kind === "door") {
      for (const t of o.tiles) maps.doorAt.set(key(t), o.id);
      for (const p of o.opensWhen ?? [])
        maps.doorsOf.set(p, [...(maps.doorsOf.get(p) ?? []), o.id]);
    } else if (o.kind === "plate") {
      for (const t of o.tiles) maps.plateAt.set(key(t), o.id);
    }
  }
  mapsCache.set(room, maps);
  return maps;
}

// A plate that is not wanted is kept off: stepping on one can trip an alarm, break a
// sequence, or stop a Can't-see player who hears the hum. Once every door it
// opens is open it is just floor.
function plateFree(room: Room, known: Known, id: string): boolean {
  const doors = mapsOf(room).doorsOf.get(id) ?? [];
  return doors.length > 0 && doors.every((d) => known.doorOpen[d] === true);
}

function blockedFor(room: Room, known: Known, goal: Vec) {
  const { doorAt, plateAt } = mapsOf(room);
  const crates = new Set(Object.values(known.crates).map(key));
  return (x: number, y: number): boolean => {
    const ch = room.grid[y]?.[x];
    if (ch === undefined || ch === "#" || ch === "=" || ch === "%" || ch === "H") return true;
    const k = `${x},${y}`;
    if (ch === "D" && known.doorOpen[doorAt.get(k) ?? ""] !== true) return true;
    if (crates.has(k)) return true;
    const plate = plateAt.get(k);
    if (plate && !(goal.x === x && goal.y === y) && !plateFree(room, known, plate)) return true;
    return false;
  };
}

// The first step of the way to `goal` from the tile at the centre of which the
// subject stands, starting on `stepTick`. The plan is cached and followed while
// the room it was made for stays the same.
function decide(
  room: Room,
  m: BotMemory,
  nav: Nav,
  known: Known,
  tile: Vec,
  stepTick: number,
  goal: Vec,
): Step {
  const open = Object.keys(known.doorOpen)
    .filter((d) => known.doorOpen[d])
    .join();
  const crates = Object.values(known.crates).map(key).join(";");
  const alarms = m.alarms.map((a) => `${a.from}-${a.to}`).join();
  const perceived = perceivedHazards(known, stepTick - 1);
  const planKey = `${key(goal)}|${open}|${crates}|${alarms}|${[...perceived].sort().join()}`;
  if (
    nav.key === planKey &&
    nav.i < nav.plan.length &&
    nav.expect &&
    nav.expect.x === tile.x &&
    nav.expect.y === tile.y
  ) {
    const step = nav.plan[nav.i++] as Step;
    nav.expect = { x: tile.x + DELTA[step].x, y: tile.y + DELTA[step].y };
    return step;
  }
  const grid = {
    width: room.width,
    height: room.height,
    blocked: blockedFor(room, known, goal),
  };
  const target = findPath(grid, tile, goal) ? goal : nearestReachable(grid, tile, goal);
  const forecast = forecastFor(room, m.alarms, perceived);
  const plan = planSafe({
    ...grid,
    from: tile,
    to: target,
    tick: stepTick,
    danger: (x, y, t) => forecast.danger(Math.max(0, t))[y * room.width + x] === 1,
    rest: (x, y, t) => forecast.rest(Math.max(0, t))[y * room.width + x] === 1,
  });
  // Waiting on a hazard keeps it in mind: standing still short of it hides it, and a bot that
  // forgot it after 2 s would walk into what it is waiting for.
  if (perceived.size > 0 && (plan === null || plan[0] === "wait")) {
    for (const id of perceived) {
      const seen = known.seenHazards[id];
      if (seen) seen.lastTick = Math.max(seen.lastTick, stepTick - 1);
    }
  }
  nav.key = planKey;
  nav.plan = plan ?? [];
  nav.i = 0;
  nav.expect = tile;
  if (nav.plan.length === 0) {
    nav.expect = tile;
    return "wait";
  }
  const step = nav.plan[nav.i++] as Step;
  nav.expect = { x: tile.x + DELTA[step].x, y: tile.y + DELTA[step].y };
  return step;
}

// Where a plate of a sequence door stands: its place in the order, how far the sign says
// the sequence has got, and whether it is this seat's turn to step on. The first plate also
// waits until every person with a plate in the sequence is next to theirs (when they can be
// seen), so a person is not left to catch up with a window that has already started.
function sequenceTurn(
  room: Room,
  m: BotMemory,
  job: Job,
  known: Known,
  view: RoleView,
): { n: number; progress: number; ready: boolean } | null {
  if (job.target.kind !== "plate") return null;
  const plate = job.target.id;
  const door = room.objects.find(
    (o) => o.kind === "door" && o.mode === "sequence" && o.opensWhen?.includes(plate),
  );
  if (!door?.opensWhen || known.doorOpen[door.id] === true) return null;
  const order = door.opensWhen;
  const n = order.indexOf(plate);
  const progress = known.seq[order.join()] ?? 0;
  let ready = progress === n;
  if (ready && n === 0) {
    const queues = queuesOf(room, m, view.role);
    for (const seat of m.humans) {
      const theirs = queues[seat].find(
        (j) => j.target.kind === "plate" && order.includes(j.target.id) && j !== job,
      );
      const body = view.entities.find((e) => e.kind === "player" && e.seat === seat);
      if (theirs?.target.kind !== "plate" || !body) continue;
      const t = theirs.target.tile;
      if (Math.hypot(body.pos.x - (t.x + 0.5), body.pos.y - (t.y + 0.5)) > 2.2) ready = false;
    }
  }
  return { n, progress, ready };
}

// Where a seat is headed: the first job of its queue not yet done, or the exit.
// A plate it may not step on yet is approached as far as the tile before it.
function goalFor(
  room: Room,
  m: BotMemory,
  seat: Seat,
  own: Role,
  at: Vec | undefined,
  known: Known,
  from: Vec,
  view: RoleView,
): { goal: Vec; job: Job | null } {
  const queue = queuesOf(room, m, own)[seat];
  // a job is behind a seat once it is done, or once a later one is (a bot that takes over
  // late has no business walking back to a waypoint the team passed long ago)
  const behind = (i: number) =>
    isDone(room, queue[i] as Job, known, at, seat) ||
    (queue[i]?.target.kind === "tile" &&
      queue
        .slice(i + 1)
        .some(
          (j) =>
            j.cache === undefined && j.target.kind !== "exit" && isDone(room, j, known, at, seat),
        ));
  while (
    m.ptr[seat] < queue.length &&
    (queue[m.ptr[seat]]?.cache !== undefined || behind(m.ptr[seat]))
  )
    m.ptr[seat]++;
  const queued = currentJob(room, m, known, own, seat, at);
  // A torch only lights what is in its pool, so a seat carrying one whose ink has not yet been cut
  // stands at that ink and lights it for the others (a teammate who has no reading job of its own).
  // (Only for the bot's own seat: the same function works out where the Can't-see seat it guides goes.
  // A seat whose own job is to work a wire panel reads the ink in doing it, so it keeps that job.)
  const readsInk = queue.slice(m.ptr[seat]).some(
    (j) =>
      j.target.kind === "station" &&
      known.stations[j.target.id]?.answer !== undefined &&
      platePart(room, j.target.id) === undefined && // a plated panel's ink is blank (inkPost)
      room.objects.find((o) => o.id === (j.target as { id: string }).id)?.params?.numbered === true,
  );
  const post = seat === m.seat && view.gear === "uv" && !readsInk ? inkPost(room, known) : null;
  if (post) return { goal: post, job: null };
  if (!queued) return { goal: lookAtDoor(room, known, from, exitTile(room, seat)), job: queued };
  // gear passes hand to hand in the hints' order: a gear job waits for every earlier one to be done
  if (GEAR_KINDS.has(queued.target.kind) && !gearTurn(room, m, queued, known, own)) {
    return { goal: from, job: null };
  }
  const worked = workGoal(room, m, queued, known, seat);
  if (worked) return { goal: worked, job: queued };
  let job: Job = queued;
  if (queued.target.kind === "plate" && queued.target.clue) {
    // a clue job's plate is the one the chime heard names; until one is heard, stay put and listen
    const heard = clueTarget(queued, known);
    if (!heard) return { goal: from, job: queued };
    job = { ...queued, target: { kind: "plate", id: heard.id, tile: heard.tile } };
  }
  const goal =
    job.target.kind === "exit"
      ? lookAtDoor(room, known, from, jobTile(room, job, seat))
      : jobTile(room, job, seat);
  const turn = job.target.kind === "plate" ? sequenceTurn(room, m, job, known, view) : null;
  if (job.target.kind === "plate" && turn) {
    // A sequence door counts presses, in order, each within 5 s of the last. Stand off
    // the plate until it is this seat's turn; if the sequence starts again while on it,
    // step off, so that the next press is a new one.
    const on = at !== undefined && tileOf(at).x === goal.x && tileOf(at).y === goal.y;
    const stay = on ? turn.progress > turn.n : turn.ready;
    if (!stay) {
      const blocked = blockedFor(room, known, goal);
      let before: Vec | undefined;
      if (on) {
        // off the plate, to a free tile beside it (west first: the way the team came)
        before = [
          { x: goal.x - 1, y: goal.y },
          { x: goal.x, y: goal.y - 1 },
          { x: goal.x, y: goal.y + 1 },
          { x: goal.x + 1, y: goal.y },
        ].find((t) => !blocked(t.x, t.y));
      } else {
        const path = findPath({ width: room.width, height: room.height, blocked }, from, goal);
        before = path && path.length >= 2 ? path[path.length - 2] : undefined;
      }
      if (before) return { goal: before, job };
    }
    return { goal, job };
  }
  if (job.target.kind === "plate" && !isOpen(job, known)) {
    const grid = { width: room.width, height: room.height, blocked: blockedFor(room, known, goal) };
    const path = findPath(grid, from, goal);
    const before = path && path.length >= 2 ? path[path.length - 2] : undefined;
    if (before) return { goal: before, job };
  }
  return { goal, job };
}

// A door that opens out of the bot's sight and hearing is never reported, so it goes on believing
// it shut. Where the way to `goal` is blocked only by doors it believes closed, it goes and looks:
// the tile before the first of them, from which the door is in view and what it sees stands.
function lookAtDoor(room: Room, known: Known, from: Vec, goal: Vec): Vec {
  const grid = { width: room.width, height: room.height };
  const believed = blockedFor(room, known, goal);
  if (findPath({ ...grid, blocked: believed }, from, goal)) return goal;
  const { doorAt } = mapsOf(room);
  const ignoringDoors = (x: number, y: number) =>
    believed(x, y) && !(room.grid[y]?.[x] === "D" && doorAt.has(`${x},${y}`));
  const path = findPath({ ...grid, blocked: ignoringDoors }, from, goal);
  // the first door it believes shut (one it believes open, such as a cache's vault door, is no reason to stop)
  const door =
    path?.findIndex(
      (t) => room.grid[t.y]?.[t.x] === "D" && known.doorOpen[doorAt.get(key(t)) ?? ""] !== true,
    ) ?? -1;
  return path && door > 0 ? (path[door - 1] as Vec) : goal;
}

// The floor tile in front of the nearest ink sign of a numbered wire panel that is not yet cut, or
// null. "Cut" is seen in the one place a seat can see it from the corridor: the door that panel
// opens, believed open (a sign's own wire panel is out of sight from the post).
function inkPost(room: Room, known: Known): Vec | null {
  for (const o of room.objects) {
    if (o.kind !== "station" || o.params?.type !== "wires" || o.params.numbered !== true) continue;
    if (cacheOf(o)) continue; // bots ignore caches: nobody opens one, so its ink is never worth a post
    if (platePart(room, o.id) !== undefined) continue; // a plated panel's ink is blank: the plate tells
    if (known.stations[o.id]?.solved) continue;
    const doors = room.objects.filter((d) => d.kind === "door" && d.opensWhen?.includes(o.id));
    if (doors.length > 0 && doors.every((d) => known.doorOpen[d.id] === true)) continue;
    const sign = room.objects.find((x) => x.id === o.params?.plaque)?.tiles[0];
    if (!sign) continue;
    const below = { x: sign.x, y: sign.y + 1 };
    const above = { x: sign.x, y: sign.y - 1 };
    const open = (t: Vec) => room.grid[t.y]?.[t.x] === ".";
    const front = [above, below].find(open);
    if (front) return front;
  }
  return null;
}

const GEAR_KINDS = new Set<Job["target"]["kind"]>(["take", "give", "sill"]);

// Is it this gear job's turn? Gear passes hand to hand in the hints' order: a job on an item waits
// until the one before it on the same item has happened (a take, once the item has left where
// it lay; a give or a sill, once it is where that job put it).
function gearTurn(room: Room, m: BotMemory, job: Job, known: Known, own: Role): boolean {
  const item = (j: Job) =>
    GEAR_KINDS.has(j.target.kind) ? (j.target as { gear: string }).gear : null;
  const before = ([0, 1, 2] as const)
    .flatMap((s) => queuesOf(room, m, own)[s].map((j) => ({ j, s })))
    .filter(({ j }) => j.index < job.index && item(j) === item(job))
    .sort((a, b) => b.j.index - a.j.index)[0];
  if (!before) return true;
  if (before.j.target.kind !== "take") return isDone(room, before.j, known, undefined, before.s);
  const g = known.gear?.[item(job) as string];
  const start = room.objects.find((o) => o.id === item(job))?.tiles[0];
  return g !== undefined && !(g.at && start && g.at.x === start.x && g.at.y === start.y);
}

// Where a station, gear or tow job sends its seat: the tile of the part to press next, the gear
// (or its holder, or the sill), the teammate to take by the hand, or the tow's end.
function workGoal(room: Room, m: BotMemory, job: Job, known: Known, seat: Seat): Vec | null {
  const t = job.target;
  if (t.kind === "station") return stationStep(room, m, known, t.id)?.tile ?? null;
  if (t.kind === "listen") return t.tile;
  if (t.kind === "keepsake") {
    const vault = secretDoors(room).find((d) => d.id === t.cache)?.vault.id;
    return known.stations[t.cache]?.solved && vault && known.doorOpen[vault] ? t.tile : null;
  }
  if (t.kind === "watch") return known.stations[t.station]?.card ? t.tile : (t.read ?? t.tile);
  if (t.kind === "take" || t.kind === "give" || t.kind === "sill") {
    const g = known.gear?.[t.gear];
    if (!g) return null;
    if (g.heldBy !== null && g.heldBy !== seat) return m.lastPos ? tileOf(m.lastPos) : null; // wait for it
    if (g.heldBy !== seat || t.kind === "take") {
      if (g.at) return g.at;
      const hatch = g.sill ? room.objects.find((o) => o.id === g.sill)?.tiles[0] : undefined;
      return hatch ? besideOf(room, known, hatch, m.lastPos) : null;
    }
    if (t.kind === "give") {
      const to = known.roles?.indexOf(t.to) ?? -1;
      const p = to >= 0 ? m.bodies[to as Seat] : undefined;
      if (!p) return null;
      // beside them, on the side away from the others: G hands it to whoever is nearest
      const others = ([0, 1, 2] as const)
        .filter((s) => s !== seat && s !== to)
        .flatMap((s) => (m.bodies[s] ? [m.bodies[s] as Vec] : []));
      return besideOf(room, known, tileOf(p), m.lastPos, others);
    }
    const hatch = room.objects.find((o) => o.id === t.hatch)?.tiles[0];
    return hatch ? besideOf(room, known, hatch, m.lastPos) : null;
  }
  if (t.kind === "tow") {
    const towed = known.roles?.indexOf(t.role) ?? -1;
    if (towed < 0) return null;
    if (known.holding?.[towed as Seat] === seat) return t.to;
    const p = m.bodies[towed as Seat];
    return p ? besideOf(room, known, tileOf(p), m.lastPos) : null;
  }
  return null;
}

// The floor tile next to `tile` nearest `from` (west first on a tie): where to stand to reach it.
// Tiles where one of `avoid` would be as near as `tile` itself are left out while others remain.
function besideOf(
  room: Room,
  known: Known,
  tile: Vec,
  from: Vec | null,
  avoid: Vec[] = [],
): Vec | null {
  const blocked = blockedFor(room, known, tile);
  const free = [
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y - 1 },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x + 1, y: tile.y },
  ].filter((t) => !blocked(t.x, t.y));
  const clear = free.filter((t) =>
    avoid.every((a) => Math.hypot(a.x - (t.x + 0.5), a.y - (t.y + 0.5)) > 1.01),
  );
  // never a cache's motif or decoy tile: an Act there (a hand taken, gear lifted) would uncover it, and
  // uncovering is for the people (ADR 0024, FR1)
  const motifs = new Set(
    room.objects.flatMap((o) => cacheOf(o)?.tiles.map((t) => key(t.at)) ?? []),
  );
  const plain = (clear.length > 0 ? clear : free).filter((t) => !motifs.has(key(t)));
  const options = plain.length > 0 ? plain : clear.length > 0 ? clear : free;
  if (!from) return options[0] ?? null;
  const d = (t: Vec) => Math.hypot(t.x + 0.5 - from.x, t.y + 0.5 - from.y);
  return options.reduce<Vec | null>((a, b) => (a === null || d(b) < d(a) ? b : a), null);
}

// The next press a station needs, from the bot's belief (clues FR5): which tile to stand on. Only
// a station type with a decoder (decode.ts: DECODERS) is worked; the decoder fills the belief's
// answer, and the part to press is a tile a teammate marked, or the part its answer names next. A
// sync lock is turned by every seat that has a key (one each): it has no secret, only a moment.
interface Press {
  tile: Vec;
}
function stationStep(room: Room, m: BotMemory, known: Known, id: string): Press | null {
  const b = known.stations[id];
  const o = room.objects.find((x) => x.id === id);
  if (!b || !o || b.solved) return null;
  const p = o.params ?? {};
  const type = p.type as StationType;
  if (type === "vault") {
    const t = vaultStep(o, b);
    return t ? { tile: t } : null;
  }
  if (type === "sync") {
    const order = (m.roles ?? ["blind", "deaf", "mute"])
      .map((role, seat) => ({ role, seat }))
      .filter((x) => x.role !== "blind");
    const mine = order.findIndex((x) => x.seat === m.seat);
    const t = mine >= 0 ? tilesOf(p.keys)[mine] : undefined;
    return t ? { tile: t } : null;
  }
  if (!DECODERS[type]) return null;
  if (type === "dial" || type === "keypad" || type === "bells") {
    const t =
      type === "dial" ? dialStep(o, b) : type === "keypad" ? keypadStep(o, b) : bellsStep(o, b);
    return t ? { tile: t } : null;
  }
  // a radio is turned on its right-hand pad until it is tuned; then its digit is watched for
  if (type === "radio") {
    if (platePart(room, id) !== undefined) {
      const t = radioPad(o, b); // the band is on the plate: wait for it, then turn toward it
      return t ? { tile: t } : null;
    }
    const t = tilesOf(p.pads)[1];
    return t ? { tile: t } : null;
  }
  // switches: the button its own reading names (the lamps and the card both known), else the next
  // button a watcher marked
  if (type === "switches") {
    const own = b.answer[0];
    const t = own !== null && own !== undefined ? tilesOf(p.buttons)[own] : b.marked[b.used];
    return t ? { tile: t } : null;
  }
  const marked = b.marked[0];
  if (marked) return { tile: marked };
  // the plaque read but the wires not yet seen: the panel's anchor, where an Act cuts nothing
  if (type === "wires" && b.rule !== null && b.shows.length === 0)
    return { tile: o.tiles[0] as Vec };
  const next = b.answer.find((v) => v !== null);
  const parts = stationParts(o).filter((x) => x.key !== "anchor" && x.key !== "back");
  const t = next === undefined || next === null ? undefined : parts[0]?.at[next];
  return t ? { tile: t } : null;
}

// The team was caught and sent back: every plan, step under way and belief about where
// the Can't-see seat is, is about a place nobody is in any more.
function forgetPlans(m: BotMemory): void {
  m.exec = null;
  m.nav = newNav();
  const g = m.guide;
  g.moving = false;
  g.heading = { ...ZERO }; // the Can't-see bot forgot its direction when it was sent back
  g.decided = null;
  g.nextTick = 0;
  g.still = 0;
  g.last = null;
  g.est = null;
  g.nav = newNav();
  g.bumped = null;
  g.stopFrom = null;
  g.sentFrom = null;
}

function thinkSighted(
  room: Room,
  view: RoleView,
  inbox: ChannelMessage[],
  m: BotMemory,
  now: number,
): BotTurn {
  const known = observe(room, view, inbox, m);
  if (view.you.pos) {
    const last = m.lastPos;
    if (last && Math.hypot(view.you.pos.x - last.x, view.you.pos.y - last.y) > 1.5) {
      forgetPlans(m);
      m.markedFor = null;
      known.read = {}; // a plate read before says something else now
      forgetCaches(room, view, known, m); // every chamber is shut again
      // sent back: every unsolved station has a fresh answer, so what was heard of it is stale
      for (const [id, b] of Object.entries(known.stations)) {
        if (b.solved) continue;
        // an earpiece's keypad: the digits told were the old code (a radio's digit is kept)
        const clue = room.objects.find((o) => o.id === id)?.params?.clue;
        if (String(clue ?? "").startsWith("g")) {
          b.numbers = [];
          b.plateFrom = null;
        }
        b.told = new Set();
        b.answer = [];
        b.heard = [];
        b.rule = null;
        b.wire = null;
        b.shows = [];
        b.card = null; // switches are drawn again with a new card, from dark
        b.marked = [];
        b.used = 0;
        b.plate = null;
      }
    }
    m.lastPos = view.you.pos;
  }
  const pos =
    view.you.pos ?? centreOf(room.objects.find((o) => o.id === `s${m.seat + 1}`)?.tiles[0] ?? ZERO);
  let send: Outgoing | null = null;

  if (view.status === "cleared") {
    if (!m.celebrated) {
      m.celebrated = true;
      if (view.role === "mute") {
        send = { method: "face", id: "f02" };
      } else {
        send = { method: "text", text: pickPhrase("cleared", m.usedPhrases, m.seq) };
      }
    }
    return { input: idle(m), send: stamp(m, send, now) };
  }

  for (const e of view.entities)
    if (e.kind === "player" && e.seat !== undefined) m.bodies[e.seat] = e.pos;
  // Led by another's hand (a person took it: a bot only ever leads, in a `tow` job), the leader
  // walks for both and both steer (ADR 0019): a bot's own walk would only pull against them, so it
  // adds nothing to the pair's step. It presses no Act (that would let go: see `press`).
  const led = view.you.hand !== undefined && known.holding[view.you.seat] !== undefined;
  const input = view.alarm
    ? idle(m)
    : press(room, view, m, known, pos, towedWalk(led, moveSelf(room, view, m, known, pos)));
  send = workSend(room, view, m, known, pos);
  const ask = view.role === "mute" ? turnerAsk(room, view, m, known, pos, now) : null;
  if (send) return { input, send: stamp(m, send, now), ask };
  if (view.role === "deaf") send = guideBlind(room, view, m, known, now);
  else if (view.role === "mute") send = muteClip(room, view, m, now);
  return { input, send: stamp(m, send, now), ask };
}

// The ask for `kind` while the bot wants it (asks.ts): sent every tick it is wanted, so the game
// keeps it live and the chip stays up; `saidAt` (game ms) is when it was last *said*, which the
// clock moves on (the first time, then by `reaskDue`). Progress (`progressed`) restarts the gap;
// `atSpot` holds it while the person is doing the thing. Null while it is not wanted yet (a first
// ask never lands within the quiet window of a message).
export function askFor(
  m: BotMemory,
  kind: AskKind,
  to: Seat,
  station: string,
  now: number,
  atSpot: boolean,
  progressed: boolean,
): Ask | null {
  const k = `${kind}:${station}:${to}`;
  let c = m.asks[k];
  if (!c) {
    if (now - m.lastHeardAt < ASK_QUIET_MS) return null;
    c = m.asks[k] = { firstAt: now, lastAt: now, count: 1, progressAt: Number.NEGATIVE_INFINITY };
  } else {
    if (progressed) c.progressAt = now;
    if (reaskDue(c, now, m.lastHeardAt, atSpot)) {
      c.lastAt = now;
      c.count++;
    }
  }
  return { kind, from: m.seat, to, station, saidAt: c.lastAt };
}

// Smoke use of the ask (Task 299): a Can't speak turner at a real safe whose listener is a person
// asks them to say Stop on the click. The listener at the safe's back is the spot.
function turnerAsk(
  room: Room,
  view: RoleView,
  m: BotMemory,
  known: Known,
  pos: Vec,
  now: number,
): Ask | null {
  const job = currentJob(room, m, known, view.role, m.seat, pos);
  if (job?.target.kind !== "station") return null;
  const id = job.target.id;
  const o = room.objects.find((x) => x.id === id);
  const b = known.stations[id];
  if (o?.params?.type !== "dial" || o.params.teach === true || !b || b.solved) return null;
  const listener = rolesOf(m, view.role).indexOf("blind");
  if (listener < 0 || !m.humans.has(listener as Seat)) return null;
  const them = m.bodies[listener as Seat];
  const theirs = them && currentJob(room, m, known, view.role, listener as Seat, them);
  const atSpot =
    !!them &&
    theirs?.target.kind === "listen" &&
    theirs.target.station === id &&
    tileOf(them).x === theirs.target.tile.x &&
    tileOf(them).y === theirs.target.tile.y;
  const c = m.asks[`stop-on-click:${id}:${listener}`];
  const progressed =
    !!c && b.changedAt * TICK_MS > c.progressAt && b.changedAt * TICK_MS > c.lastAt;
  return askFor(m, "stop-on-click", listener as Seat, id, now, atSpot, progressed);
}

// What a seat's work has it tell the others (P3): a radio's digit, as text, once (a radio that
// feeds a station; Can't speak, who cannot text, keeps it); a switches watcher's next button, an
// `x` on it, each time the lamps it sees have changed since its last mark; and a music box's
// watcher the tune's bells, an `x` each, in order.
function workSend(
  room: Room,
  view: RoleView,
  m: BotMemory,
  known: Known,
  pos: Vec,
): Outgoing | null {
  const count = syncCount(room, view, m, known, pos);
  if (count !== null) return { method: "text", text: String(count) };
  if (canSend(view.role, "text")) {
    for (const o of room.objects) {
      const b = known.stations[o.id];
      const d = o.kind === "station" && b ? radioToTell(o, b) : null;
      if (d === null || !b) continue;
      b.told.add(0);
      return { method: "text", text: String(d) };
    }
  }
  const job = currentJob(room, m, known, view.role, m.seat, pos);
  // A wire panel whose answer this bot read from ink or a plaque that only it can read (room 7's ink
  // needs the torch it holds): it marks that wire whatever its job is, so a teammate who has no way
  // to read it cuts the right one, and marks it again each time the last mark has faded, until it
  // is cut. A mark is a message Can't speak may send.
  const now = view.tick * TICK_MS;
  if (canSend(view.role, "mark") && now - m.lastMarkAt >= COOLDOWN_MS.mark) {
    for (const w of room.objects) {
      const wb = known.stations[w.id];
      const want = w.params?.type === "wires" && wb ? wb.answer[0] : null;
      const at = want == null ? undefined : tilesOf(w.params?.wires)[want];
      if (!wb || wb.solved || !at || w.params?.numbered !== true) continue;
      // standing at the ink lights it for the others first; the answer is only handed over once
      // they have had a while to read it, and again each time the last mark has faded
      if (m.postSince === null || now - m.postSince < MARK_AFTER_MS) continue;
      if (now - (m.wireMarkedAt[w.id] ?? Number.NEGATIVE_INFINITY) < STAMP_LIFE_MS) continue;
      m.wireMarkedAt[w.id] = now;
      m.lastMarkAt = now;
      return { method: "mark", id: "x", at: centreOf(at) };
    }
  }
  if (job?.target.kind !== "watch" || !canSend(view.role, "mark")) return null;
  const o = room.objects.find((x) => x.id === (job.target as { station: string }).station);
  const b = o && known.stations[o.id];
  if (!o || !b || b.solved) return null;
  const tile = tileOf(pos);
  if (tile.x !== job.target.tile.x || tile.y !== job.target.tile.y) return null;
  const cool = view.tick * TICK_MS - m.lastMarkAt < COOLDOWN_MS.mark;
  if (o.params?.type === "bells") {
    // a music box's watcher at its tune box: the tune's bells, an x each, in order
    const next = bellToMark(o, b);
    if (!next || cool) return null;
    b.told.add(next.i);
    m.lastMarkAt = view.tick * TICK_MS;
    return { method: "mark", id: "x", at: centreOf(next.at) };
  }
  const left = switchesLeft(o, b, view.tick);
  const next = left?.[0];
  const lamps = `${o.id}:${b.shows.join()}`; // per station: two watchers' lamps may read alike
  if (next === undefined || m.markedFor === lamps) return null;
  const at = tilesOf(o.params?.buttons)[next];
  if (!at || cool) return null;
  m.markedFor = lamps;
  m.lastMarkAt = view.tick * TICK_MS;
  return { method: "mark", id: "x", at: centreOf(at) };
}

// A sync lock's counter (a key holder who can text) counts the turn down, "3", "2", "1", once it
// sees every key stood on (decode.ts: countStep). Returns the digit to text this tick.
function syncCount(
  room: Room,
  view: RoleView,
  m: BotMemory,
  known: Known,
  pos: Vec,
): number | null {
  const job = currentJob(room, m, known, view.role, m.seat, pos);
  const o =
    job?.target.kind === "station"
      ? room.objects.find((x) => x.id === (job.target as { id: string }).id)
      : undefined;
  if (o?.params?.type !== "sync" || !canSend(view.role, "text") || known.stations[o.id]?.solved) {
    m.count = null;
    return null;
  }
  const mine = stationStep(room, m, known, o.id)?.tile;
  const tile = tileOf(pos);
  const on = mine !== undefined && mine.x === tile.x && mine.y === tile.y;
  const keys = tilesOf(o.params.keys);
  const stood =
    on &&
    keys.every((k) =>
      Object.values(m.bodies).some((b) => b && tileOf(b).x === k.x && tileOf(b).y === k.y),
    );
  const next = countStep(m.count, stood, view.tick);
  m.count = next.count;
  return next.say;
}

// Act or G, pressed once a seat stands where its station, gear or tow job wants it, and let go
// the tick after (the simulation acts on the press). A sync key is turned on the count's "1".
function press(
  room: Room,
  view: RoleView,
  m: BotMemory,
  known: Known,
  pos: Vec,
  input: PlayerInput,
): PlayerInput {
  const job = currentJob(room, m, known, view.role, m.seat, pos);
  const tile = tileOf(pos);
  const centred = Math.hypot(pos.x - (tile.x + 0.5), pos.y - (tile.y + 0.5)) < 0.15;
  const goal = job ? workGoal(room, m, job, known, m.seat) : null;
  const here = centred && goal !== null && goal.x === tile.x && goal.y === tile.y;
  // a station seen jammed (FR13) ignores every press: the bot waits the jam out on its tile
  const jammed =
    job?.target.kind === "station" &&
    view.entities.some((e) => e.id === (job.target as { id: string }).id && e.station?.jammed);
  const pressed = job && here ? (jammed ? "wait" : pressFor(room, m, known, job, view.tick)) : null;
  // An Act from a towed seat lets go of the hand that leads it (sim/gear.ts: actOn), so a bot a
  // person is leading never presses one: it waits, and works once they let go. G is unaffected.
  const towed = view.you.hand !== undefined && known.holding[view.you.seat] !== undefined;
  const button = pressed === "act" && towed ? "wait" : pressed;
  const was = button === "act" ? m.actWas : button === "gear" ? m.gearWas : false;
  m.actWas = button === "act" && !was;
  m.gearWas = button === "gear" && !was;
  if (m.actWas && job?.target.kind === "station") {
    // a switches button pressed for a watcher's mark: that mark is used
    const b = known.stations[job.target.id];
    const mark = b?.marked[b.used];
    if (b && mark && mark.x === tile.x && mark.y === tile.y && b.answer[0] == null) b.used++;
  }
  if (button === "wait") return idle(m);
  if (!button) return input;
  return was ? idle(m) : { ...idle(m), [button]: true };
}

// Which button a job wants pressed by a seat standing where it should: "wait" holds still.
function pressFor(
  room: Room,
  m: BotMemory,
  known: Known,
  job: Job,
  tick: number,
): "act" | "gear" | "wait" | null {
  const t = job.target;
  if (t.kind === "station") {
    const o = room.objects.find((x) => x.id === t.id);
    // a real safe's turner gives the listener at its back time to hear each notch
    const b = known.stations[t.id];
    if (o?.params?.type === "dial" && o.params.teach !== true && b) {
      return tick - b.changedAt < TURN_WAIT_TICKS ? "wait" : "act";
    }
    if (o?.params?.type !== "sync") return "act";
    // the counter turns on its own "1"; the others when they read it (decode.ts: syncGo)
    const own = m.count?.n === 1 && tick - m.count.at <= 2;
    return own || (b !== undefined && syncGo(b, tick)) ? "act" : "wait";
  }
  if (t.kind === "take" || t.kind === "give" || t.kind === "sill") {
    const g = known.gear?.[t.gear];
    if (!g) return null;
    if (g.heldBy === null) return "act"; // take it: it lies here, or on the sill beside
    if (g.heldBy !== m.seat) return "wait"; // someone else has it
    if (t.kind === "give") return nearestIs(m, known.roles?.indexOf(t.to) ?? -1) ? "gear" : "wait";
    return t.kind === "sill" ? "act" : null;
  }
  if (t.kind === "keepsake") return "act";
  if (t.kind === "tow") return "act"; // take their hand beside them, or let go at the end
  return null;
}

// Is `to` the teammate G would hand gear to: the nearest one seen beside this bot? (A teammate
// holding gear of their own is passed over by G too, but bots carry one item between them.)
function nearestIs(m: BotMemory, to: number): boolean {
  const me = m.lastPos;
  if (!me || to < 0) return false;
  const d = (s: Seat) => {
    const b = m.bodies[s];
    return b ? Math.hypot(b.x - me.x, b.y - me.y) : Number.POSITIVE_INFINITY;
  };
  const mine = d(to as Seat);
  return (
    mine <= 1.5 && ([0, 1, 2] as const).every((s) => s === m.seat || s === to || d(s) > mine + 0.01)
  );
}

function stamp(m: BotMemory, send: Outgoing | null, now: number): Outgoing | null {
  if (send) {
    m.lastSpokeAt = now;
    m.lastHeardAt = Math.max(m.lastHeardAt, now);
  }
  return send;
}

// --- moving the bot's own avatar -----------------------------------------------

function moveSelf(room: Room, view: RoleView, m: BotMemory, known: Known, pos: Vec): PlayerInput {
  const seat = m.seat;
  const tile = tileOf(pos);
  const { goal, job } = goalFor(room, m, seat, view.role, pos, known, tile, view);
  // how long it has stood at the ink it is lighting (the mark waits on this, see workSend)
  const post = view.gear === "uv" && job === null ? inkPost(room, known) : null;
  const atPost = post !== null && post.x === tile.x && post.y === tile.y;
  if (!atPost) m.postSince = null;
  else m.postSince ??= view.tick * TICK_MS;

  // The guide steers by sight: when the Can't-see seat drops out of view it goes back to
  // where it last reckoned them to be, before doing anything of its own, unless its own job is a
  // station or gear job (it parks the Can't-see seat while it works one: guideBlind).
  const busy = job !== null && WORK_KINDS.has(job.target.kind);
  const lost = view.role === "deaf" && m.guide.est && !busy ? blindOutOfSight(view, m) : null;
  // a guide with nothing of its own left but the exit holds still while the Can't-see seat listens at
  // a safe: walking off and back to keep them in sight is noise to a person standing there (Task 289)
  const idleGuide = job === null || job.target.kind === "exit";
  if (view.role === "deaf" && idleGuide && blindListening(room, m, known, view.role, m.guide.est)) {
    return follow(room, view, m, known, pos, tile);
  }
  if (lost) return follow(room, view, m, known, pos, centreOf(tileOf(lost)));

  // pushing: stand behind the crate and walk into it until it is where it belongs
  if (job?.target.kind === "push") {
    const crate = known.crates[job.target.crate];
    if (crate) {
      const dx = Math.sign(job.target.to.x - crate.x);
      const dy = Math.sign(job.target.to.y - crate.y);
      const stand = { x: crate.x - dx, y: crate.y - dy };
      if (tile.x === stand.x && tile.y === stand.y) {
        m.exec = null;
        return idle(m, { x: dx, y: dy });
      }
      return follow(room, view, m, known, pos, stand);
    }
  }
  return follow(room, view, m, known, pos, goal);
}

// Does any seat a person plays receive callouts? (The keep-alive is bot to bot only: Task 290.)
function personHearsCallouts(m: BotMemory, roles: readonly [Role, Role, Role]): boolean {
  return [...m.humans].some((s) => canReceive(roles[s], "callout"));
}

// Is a person playing Can't see standing on the tile of their listen job, while that safe is unsolved?
// They are listening for the tumbler: the guide says nothing to move them (Task 289). (A bot listener
// is left to the rules it had: it hears no noise, and its caches are proven with them.)
function blindListening(
  room: Room,
  m: BotMemory,
  known: Known,
  own: Role,
  at: Vec | null,
): boolean {
  const b = rolesOf(m, own).indexOf("blind");
  if (b < 0 || b === m.seat || !at || !m.humans.has(b as Seat)) return false;
  const job = currentJob(room, m, known, own, b as Seat, at);
  if (job?.target.kind !== "listen" || known.stations[job.target.station]?.solved === true)
    return false;
  // (to the tile's edge inclusive: the view rounds a sim's 23.99999 up to 24, still on the tile)
  const t = job.target.tile;
  return Math.abs(at.x - (t.x + 0.5)) <= 0.5 && Math.abs(at.y - (t.y + 0.5)) <= 0.5;
}

// Where the guide last put the Can't-see seat, if it cannot see them now.
function blindOutOfSight(view: RoleView, m: BotMemory): Vec | null {
  const b = rolesOf(m, view.role).indexOf("blind");
  if (b < 0 || b === m.seat) return null;
  const seen = view.entities.some((e) => e.kind === "player" && e.seat === b);
  return seen ? null : m.guide.est;
}

function follow(
  room: Room,
  view: RoleView,
  m: BotMemory,
  known: Known,
  pos: Vec,
  goal: Vec,
): PlayerInput {
  for (let guard = 0; guard < 4; guard++) {
    const exec = m.exec;
    if (exec?.kind === "wait") {
      if (exec.left > 0) {
        exec.left--;
        return idle(m);
      }
      m.exec = null;
      continue;
    }
    if (exec?.kind === "move") {
      const dx = exec.to.x - pos.x;
      const dy = exec.to.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-4) {
        m.exec = null;
        continue;
      }
      const scale = Math.min(1, dist / STEP_LEN) / dist;
      return idle(m, { x: dx * scale, y: dy * scale });
    }
    const tile = tileOf(pos);
    const centre = centreOf(tile);
    if (Math.hypot(centre.x - pos.x, centre.y - pos.y) > 0.02) {
      m.exec = { kind: "move", to: centre, left: 0 }; // back to the middle of the tile first
      continue;
    }
    const step = decide(room, m, m.nav, known, tile, view.tick + 1, goal);
    m.exec =
      step === "wait"
        ? { kind: "wait", to: centre, left: STEP_TICKS }
        : {
            kind: "move",
            to: centreOf({ x: tile.x + DELTA[step].x, y: tile.y + DELTA[step].y }),
            left: 0,
          };
  }
  return idle(m);
}

// --- Can't hear: steers the Can't-see seat ------------------------------------

function guideBlind(
  room: Room,
  view: RoleView,
  m: BotMemory,
  known: Known,
  now: number,
): Outgoing | null {
  const roles = rolesOf(m, view.role);
  const b = roles.indexOf("blind") as Seat | -1;
  if (b < 0 || b === m.seat) return null;
  const g = m.guide;
  const blindIsBot = !m.humans.has(b as Seat);
  const seen = view.entities.find((e: EntityView) => e.kind === "player" && e.seat === b);
  const stepTick = view.tick + 1;

  // where the blind is: seen, or reckoned from what it was told when it is in the dark
  let p: Vec;
  if (seen) {
    p = seen.pos;
    // sent back; a hand taken in front swings them round behind, which is no reason to forget
    const towing = known.holding[b as Seat] === m.seat;
    // (against where it was reckoned to be, which is where it was last seen while it stays in sight:
    // a seat that walked out of sight and is seen again further on has not been sent back)
    const was = g.est ?? g.last;
    if (was && !towing && Math.hypot(p.x - was.x, p.y - was.y) > 1.5) forgetPlans(m);
    g.est = p;
    if (g.last && Math.hypot(p.x - g.last.x, p.y - g.last.y) < 0.01) g.still++;
    else g.still = 0;
    g.last = p;
    // it stopped on its own: a hum, or a wall
    if (g.moving && g.still >= 2 && blindIsBot && onPlate(room, p)) g.moving = false; // a hum
    if (g.bumped && Math.hypot(p.x - g.bumped.x, p.y - g.bumped.y) > 0.9) g.bumped = null; // clear of it
    if (seen.blocked && !blindIsBot) g.bumped = { ...p }; // a person pushing at something: line them up
    if (g.stopFrom && !g.moving && g.still >= 3) {
      // they have come to rest: that far is how long a person takes to react, in tiles
      const coasted = Math.hypot(p.x - g.stopFrom.x, p.y - g.stopFrom.y);
      g.lead = Math.max(0.2, Math.min(2, (g.lead + coasted) / 2));
      g.stopFrom = null;
    }
  } else {
    const spawn = room.objects.find((o) => o.id === `s${b + 1}`)?.tiles[0];
    const est = g.est ?? centreOf(spawn ?? ZERO);
    p = g.moving ? reckon(room, m, known, est, g.heading) : est;
    if (g.moving && mapsOf(room).plateAt.has(key(tileOf(p)))) g.moving = false; // it hears the hum
    g.est = p;
  }

  const tile = tileOf(p);
  // while the guide works a station or gear job of its own, the Can't-see seat waits where it is
  const mine = currentJob(room, m, known, view.role, m.seat, p) ?? undefined;
  const parked = mine !== undefined && WORK_KINDS.has(mine.target.kind);
  const { goal, job } = parked
    ? { goal: tile, job: null }
    : goalFor(room, m, b as Seat, "blind", p, known, tile, view);
  let callout: Callout | null = null;
  let tap: string | null = null;

  const atCentre =
    Math.abs(p.x - (tile.x + 0.5)) <= 0.1001 && Math.abs(p.y - (tile.y + 0.5)) <= 0.1001;
  const due = g.moving
    ? blindIsBot
      ? atCentre && g.decided !== key(tile)
      : true
    : stepTick >= g.nextTick;

  if (view.alarm) {
    if (g.moving) {
      callout = "wait";
      g.moving = false;
    }
  } else if (!g.moving && blindListening(room, m, known, view.role, p)) {
    // stopped at a safe's back to listen: no direction, tap or repeat until the safe opens (Task 289)
  } else if (
    g.moving &&
    g.still >= STUCK_TICKS &&
    !mapsOf(room).plateAt.has(key(tile)) &&
    (blindIsBot || seen?.blocked === true || progress(g, p) >= PROGRESS)
  ) {
    // A body pushing at something and getting nowhere: say so and stop them, rather than
    // calling the same direction again. Line them up with the lane before going on. (A person
    // who has not set off, or turned the wrong way, is not against anything: they get one nudge.)
    callout = "stop";
    g.moving = false;
    g.bumped = { ...p };
    g.nextTick = stepTick + 4;
    g.still = 0;
  } else if (due) {
    const step = decide(room, m, g.nav, known, tile, stepTick, goal);
    g.decided = key(tile);
    // (a person who bumped into something is lined up with the lane before anything else)
    const lineUp =
      step !== "wait" && !blindIsBot && g.bumped !== null && needsLineUp(room, g, p, tile, step);
    const a =
      step !== "wait" && !blindIsBot && !lineUp ? approach(g, p, tile, step, now, stepTick) : null;
    const onGoal = tile.x === goal.x && tile.y === goal.y;
    // only for a person in sight: out of it, nothing moves the estimate after a tap, so the same tap
    // would be asked for forever (F1)
    const edge =
      seen && step === "wait" && onGoal && !blindIsBot && !g.moving ? edgeWord(p, tile) : null;
    if (edge) {
      // a person at the very edge of their goal's tile (the view rounds 29.99999 up onto it, the sim
      // does not): tap them to its middle, or they wait there forever for a plate that is not pressed
      if (stepTick >= g.nextTick && now - g.tapAt >= TAP_MS) {
        g.tapAt = now;
        g.nextTick = stepTick + 16;
        tap = `Tap ${edge}.`;
      }
    } else if (step === "wait") {
      if (g.moving) {
        callout = onGoal ? "stop" : "wait";
        g.moving = false;
      }
      g.nextTick = stepTick + STEP_TICKS;
    } else if (a) {
      if (a.stop) {
        callout = "stop";
        g.moving = false;
        g.stopFrom = { ...p };
        g.nextTick = stepTick + 6;
      } else if (a.tap) {
        tap = a.tap;
        g.tapAt = now;
        g.nextTick = stepTick + 10;
      }
    } else if (!blindIsBot && seen && needsLineUp(room, g, p, tile, step)) {
      // A person cannot hold a direction to within a tenth of a tile, and a lane one tile wide
      // allows no more: stop them, then ask for a tap toward the middle of the lane, and look
      // again. Said in words, since a tap is smaller than any call.
      if (g.moving) {
        callout = "stop";
        g.moving = false;
        g.nextTick = stepTick + 6;
      } else if (stepTick >= g.nextTick && now - g.tapAt >= TAP_MS) {
        g.tapAt = now;
        g.nextTick = stepTick + 16;
        tap = `Tap ${lineUpWord(p, tile, step)}.`;
      }
    } else {
      const heading = DELTA[step];
      const same = g.moving && g.heading.x === heading.x && g.heading.y === heading.y;
      if (!same) {
        // a person is told the direction in words each time: "go" leans on what they remember
        const resumes =
          blindIsBot && !g.moving && g.heading.x === heading.x && g.heading.y === heading.y;
        callout = resumes ? "go" : (WORD[step] as Callout);
        g.heading = { ...heading };
        g.moving = true;
        g.sentFrom = { ...p };
        g.nudges = 0;
        g.progressAt = now;
        g.progressMark = 0;
      }
    }
  }
  void job;

  // a direction is said once (FR10). A person who makes no progress along it hears it again after
  // 3 s, 6 s, 12 s, then every 12 s; progress (PROGRESS tiles past the last mark) or a new direction
  // starts that over, and a repeat waits for 2 s with nothing sent (FR11, as changed on 2026-11-10).
  // A bot Can't see is nudged once, as before: the stuck rule handles it.
  let nudgeAt = Number.POSITIVE_INFINITY;
  if (g.moving && !blindIsBot) {
    const along = progress(g, p);
    if (along - g.progressMark >= PROGRESS) {
      g.progressMark = along;
      g.progressAt = now;
      g.nudges = 0;
    }
    const gap = NUDGE_MS * 2 ** Math.min(g.nudges, 2);
    // (a work text such as a digit counts too, through `stamp`'s lastSpokeAt: a repeat on its heels
    // would cut it off on a person's client, Task 291)
    const quiet = Math.max(g.lastSentAt, m.lastFlavourAt, m.lastSpokeAt) + NUDGE_QUIET_MS;
    nudgeAt = Math.max(Math.max(g.lastSentAt, g.progressAt) + gap, quiet);
  } else if (g.moving && g.nudges < 1 && progress(g, p) < PROGRESS) {
    nudgeAt = g.lastSentAt + NUDGE_MS;
  }
  if (!callout && !tap && now >= nudgeAt) {
    callout = WORD[headingWord(g.heading)] as Callout;
    g.nudges++;
  }
  // a bot Can't see holds after IDLE_MS with nothing heard ("nobody is steering"), and on a long straight
  // run nothing is said (FR10): the guide keeps it walking by saying the heading again every IDLE_MS / 2.
  // Bot to bot only; a person is never repeated at this way. Not on a plate, where a fresh direction
  // would walk it off the hum it is about to hold (F7). And not when a person receives callouts at all:
  // `route` sends one to every role that receives it, so a person playing Can't speak would hear the
  // heading every 2.5 s (Task 290). The stuck rule recovers a held bot then, at a cost in time.
  if (
    !callout &&
    !tap &&
    blindIsBot &&
    !personHearsCallouts(m, roles) &&
    g.moving &&
    now - g.lastSentAt >= IDLE_MS / 2 &&
    !mapsOf(room).plateAt.has(key(tile))
  ) {
    callout = WORD[headingWord(g.heading)] as Callout;
  }
  if (callout) {
    g.lastSentAt = now;
    g.lastSent = callout;
    return { method: "callout", callout };
  }
  if (tap) {
    g.lastSentAt = now;
    return { method: "text", text: tap };
  }
  // (flavour holds off when a repeat is due within 2 s, so it never pushes the repeat back)
  if (
    now - m.lastFlavourAt >= FLAVOUR_MS &&
    now - g.lastSentAt >= 1000 &&
    nudgeAt - now >= NUDGE_QUIET_MS
  ) {
    const situation: Situation = !g.started ? "start" : g.moving ? "moving" : "waiting";
    g.started = true;
    m.lastFlavourAt = now;
    return { method: "text", text: pickPhrase(situation, m.usedPhrases, m.seq) };
  }
  return null;
}

// The end of the straight run a person is on, as a person needs it: stop them a coast's
// length early (what this person has done before), and for the last stretch ask for taps,
// since a run cannot be stopped to within a tile by someone who hears it late.
interface Approach {
  stop?: true;
  tap?: string;
}
function approach(
  g: Guide,
  p: Vec,
  tile: Vec,
  step: Step,
  now: number,
  stepTick: number,
): Approach | null {
  const delta = DELTA[step];
  const i0 = Math.max(0, g.nav.i - 1);
  let run = 0;
  while (g.nav.plan[i0 + run] === step) run++;
  const end = centreOf({
    x: tile.x + delta.x * Math.max(1, run),
    y: tile.y + delta.y * Math.max(1, run),
  });
  const along = (end.x - p.x) * delta.x + (end.y - p.y) * delta.y; // tiles left in the way they head
  if (g.moving) {
    const same = g.heading.x === delta.x && g.heading.y === delta.y;
    return same && along <= g.lead + 0.05 && along > -0.3 ? { stop: true } : null;
  }
  if (along > 1.5) return null; // a long way: a run
  const ready = stepTick >= g.nextTick && now - g.tapAt >= TAP_NEAR_MS;
  if (Math.abs(along) <= 0.3) return null; // there already
  if (!ready) return {};
  const word = along > 0 ? headingWord(delta) : headingWord({ x: -delta.x, y: -delta.y });
  return { tap: `Tap ${word}.` };
}

// Whether a body stands on a plate: it stops there on its own when it hears the hum.
function onPlate(room: Room, p: Vec): boolean {
  return mapsOf(room).plateAt.has(key(tileOf(p)));
}

// How far a person is from the middle of their lane, across the way they are headed.
function offLane(p: Vec, tile: Vec, step: Step): number {
  return step === "left" || step === "right" ? p.y - (tile.y + 0.5) : p.x - (tile.x + 0.5);
}

// Is there a wall on either side of the tile they are in, or the one they are headed for?
function tight(room: Room, tile: Vec, step: Step): boolean {
  const next = { x: tile.x + DELTA[step].x, y: tile.y + DELTA[step].y };
  const side = step === "left" || step === "right" ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const wall = (t: Vec) => {
    const ch = room.grid[t.y]?.[t.x];
    return ch === undefined || ch === "#" || ch === "D" || ch === "=" || ch === "%" || ch === "H";
  };
  return [tile, next].some(
    (t) => wall({ x: t.x + side.x, y: t.y + side.y }) || wall({ x: t.x - side.x, y: t.y - side.y }),
  );
}

function needsLineUp(room: Room, g: Guide, p: Vec, tile: Vec, step: Step): boolean {
  const off = Math.abs(offLane(p, tile, step));
  if (g.bumped) return off > BUMP_SLACK;
  return tight(room, tile, step) && off > LANE_SLACK;
}

// The direction that brings them back toward the middle of the lane.
function lineUpWord(p: Vec, tile: Vec, step: Step): string {
  const off = offLane(p, tile, step);
  if (step === "left" || step === "right") return off > 0 ? "up" : "down";
  return off > 0 ? "left" : "right";
}

// The way to tap a person toward the middle of the tile they are on, when they are near its edge.
function edgeWord(p: Vec, tile: Vec): string | null {
  const dx = tile.x + 0.5 - p.x;
  const dy = tile.y + 0.5 - p.y;
  if (Math.abs(dx) > 0.3) return dx > 0 ? "right" : "left";
  if (Math.abs(dy) > 0.3) return dy > 0 ? "down" : "up";
  return null;
}

// How far a person has gone along their heading since they were told it, in tiles.
function progress(g: Guide, p: Vec): number {
  if (!g.sentFrom) return 0;
  return (p.x - g.sentFrom.x) * g.heading.x + (p.y - g.sentFrom.y) * g.heading.y;
}

function headingWord(h: Vec): string {
  if (h.x > 0) return "right";
  if (h.x < 0) return "left";
  return h.y > 0 ? "down" : "up";
}

// One tick of the blind's walk, for when it cannot be seen: the simulation's own collision.
function reckon(room: Room, m: BotMemory, known: Known, from: Vec, heading: Vec): Vec {
  m.model ??= createWorld(room);
  const model = m.model;
  for (const id of Object.keys(model.doorOpen)) model.doorOpen[id] = known.doorOpen[id] === true;
  model.crates = Object.entries(known.crates).map(([id, tile]) => ({ id, tile }));
  const next = { x: from.x + heading.x * STEP_LEN, y: from.y + heading.y * STEP_LEN };
  return blockedAt(model, next) ? from : next;
}

// --- Can't speak: a clip when the blind teammate is on the wrong side of a door -----

function muteClip(room: Room, view: RoleView, m: BotMemory, now: number): Outgoing | null {
  if (now - m.lastClipAt < CLIP_MS || !view.you.pos) return null;
  const roles = rolesOf(m, view.role);
  const b = roles.indexOf("blind");
  // Where the Can't-see seat is: seen now, else where it was last seen, else its spawn.
  const seen = view.entities.find((e) => e.kind === "player" && e.seat === b);
  if (seen) m.blindAt = seen.pos;
  const spawn = room.objects.find((o) => o.id === `s${b + 1}`)?.tiles[0];
  const blind = m.blindAt ?? (spawn ? centreOf(spawn) : null);
  if (!blind) return null;
  const mine = view.you.pos;
  const wrong = view.entities.some(
    (e) =>
      e.kind === "door" &&
      e.state === "closed" &&
      Math.min(blind.x, mine.x) < e.pos.x &&
      e.pos.x < Math.max(blind.x, mine.x),
  );
  if (!wrong) return null;
  m.lastClipAt = now;
  return { method: "clip", clip: "airhorn" };
}
