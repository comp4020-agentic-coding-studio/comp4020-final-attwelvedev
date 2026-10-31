import { type Callout, type ChannelMessage, COOLDOWN_MS, type Outgoing } from "../channels.ts";
import type { EntityView, RoleView, SoundCue } from "../perception.ts";
import type { Room } from "../rooms/format.ts";
import { blockedAt } from "../sim/collide.ts";
import { laserBeam } from "../sim/hazards.ts";
import { stationParts, tilesOf } from "../sim/stations.ts";
import { decodeSeen } from "../sim/visibility.ts";
import { createWorld, SPEED_TPS, type StationType, TICK_MS, type World } from "../sim/world.ts";
import { canSend, type PlayerInput, ROLES, type Role, type Seat, type Vec } from "../types.ts";
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
  radioToTell,
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
  markedFor: string | null; // a switches watcher: the lamps (as seen) it last marked a button for
  lastMarkAt: number; // when it last sent a mark (game ms): marks have a cooldown
  ear: Ear; // Can't see holding the earpiece: the tune heard, and the code last told
  toTell: number[]; // digits of the earpiece's code still to text, one a turn
  count: Count | null; // a sync lock's counter: the digit it last texted, and when
}
export interface BotTurn {
  input: PlayerInput;
  send: Outgoing | null;
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
}

// Jobs a seat works where it stands (Act on a part, the gear, a hand): a guide on one parks the
// Can't-see seat rather than steering it.
const WORK_KINDS = new Set<Job["target"]["kind"]>([
  "station",
  "watch",
  "take",
  "give",
  "sill",
  "tow",
]);

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
const REPEAT_MS = 1500; // a callout is repeated, not spammed
const FLAVOUR_MS = 10_000;
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
    },
    lastClipAt: Number.NEGATIVE_INFINITY,
    blindAt: null,
    celebrated: false,
    model: null,
    lastPos: null,
    bodies: {},
    actWas: false,
    gearWas: false,
    markedFor: null,
    lastMarkAt: Number.NEGATIVE_INFINITY,
    ear: emptyEar(),
    toTell: [],
    count: null,
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
  return { input: idle(m, m.holding || led ? ZERO : m.heading), send };
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
    DECODERS[o.params?.type as StationType]?.(view, inbox, b, o, view.tick);
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
    else if (e.kind === "crate") known.crates[e.id] = tileOf(e.pos);
    else if (e.kind === "checkpoint" && e.state === "reached") {
      known.checkpoint = Math.max(known.checkpoint, Number(e.id.slice(1)));
    } else if (e.kind === "sign" && e.shows) known.seq[e.shows.join()] = e.progress ?? 0;
    else if (e.kind === "guard" || e.kind === "camera" || e.kind === "laser") {
      known.seenHazards[e.id] = { lastTick: view.tick }; // in line of sight right now
    }
  }
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
      queue.slice(i + 1).some((j) => j.target.kind !== "exit" && isDone(room, j, known, at, seat)));
  while (m.ptr[seat] < queue.length && behind(m.ptr[seat])) m.ptr[seat]++;
  const queued = queue[m.ptr[seat]] ?? null;
  if (!queued) return { goal: exitTile(room, seat), job: queued };
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
  const goal = jobTile(room, job, seat);
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
  const options = clear.length > 0 ? clear : free;
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
      // sent back: every unsolved station has a fresh answer, so what was heard of it is stale
      for (const [id, b] of Object.entries(known.stations)) {
        if (b.solved) continue;
        // an earpiece's keypad: the digits told were the old code (a radio's digit is kept)
        const clue = room.objects.find((o) => o.id === id)?.params?.clue;
        if (String(clue ?? "").startsWith("g")) b.numbers = [];
        b.told = new Set();
        b.answer = [];
        b.heard = [];
        b.rule = null;
        b.shows = [];
        b.card = null; // switches are drawn again with a new card, from dark
        b.marked = [];
        b.used = 0;
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
  // adds nothing to the pair's step. Its presses still work.
  const led = view.you.hand !== undefined && known.holding[view.you.seat] !== undefined;
  const input = view.alarm
    ? idle(m)
    : press(room, view, m, known, pos, towedWalk(led, moveSelf(room, view, m, known, pos)));
  send = workSend(room, view, m, known, pos);
  if (send) return { input, send: stamp(m, send, now) };
  if (view.role === "deaf") send = guideBlind(room, view, m, known, now);
  else if (view.role === "mute") send = muteClip(room, view, m, now);
  return { input, send: stamp(m, send, now) };
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
  const job = queuesOf(room, m, view.role)[m.seat][m.ptr[m.seat]];
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
  const lamps = b.shows.join();
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
  const job = queuesOf(room, m, view.role)[m.seat][m.ptr[m.seat]];
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
  const job = queuesOf(room, m, view.role)[m.seat][m.ptr[m.seat]];
  const tile = tileOf(pos);
  const centred = Math.hypot(pos.x - (tile.x + 0.5), pos.y - (tile.y + 0.5)) < 0.15;
  const goal = job ? workGoal(room, m, job, known, m.seat) : null;
  const here = centred && goal !== null && goal.x === tile.x && goal.y === tile.y;
  const button = job && here ? pressFor(room, m, known, job, view.tick) : null;
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
  if (send) m.lastSpokeAt = now;
  return send;
}

// --- moving the bot's own avatar -----------------------------------------------

function moveSelf(room: Room, view: RoleView, m: BotMemory, known: Known, pos: Vec): PlayerInput {
  const seat = m.seat;
  const tile = tileOf(pos);
  const { goal, job } = goalFor(room, m, seat, view.role, pos, known, tile, view);

  // The guide steers by sight: when the Can't-see seat drops out of view it goes back to
  // where it last reckoned them to be, before doing anything of its own, unless its own job is a
  // station or gear job (it parks the Can't-see seat while it works one: guideBlind).
  const busy = job !== null && WORK_KINDS.has(job.target.kind);
  const lost = view.role === "deaf" && m.guide.est && !busy ? blindOutOfSight(view, m) : null;
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
    if (g.last && !towing && Math.hypot(p.x - g.last.x, p.y - g.last.y) > 1.5) forgetPlans(m);
    g.est = p;
    if (g.last && Math.hypot(p.x - g.last.x, p.y - g.last.y) < 0.01) g.still++;
    else g.still = 0;
    g.last = p;
    // it stopped on its own: a hum, or a wall
    if (g.moving && g.still >= 2 && blindIsBot && onPlate(room, p)) g.moving = false; // a hum
    if (g.bumped && Math.hypot(p.x - g.bumped.x, p.y - g.bumped.y) > 0.9) g.bumped = null; // clear of it
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
  const mine = queuesOf(room, m, view.role)[m.seat][m.ptr[m.seat]];
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
  } else if (g.moving && g.still >= STUCK_TICKS && !mapsOf(room).plateAt.has(key(tile))) {
    // A person pushing at something and getting nowhere: say so and stop them, rather than
    // calling the same direction again. Line them up with the lane before going on.
    callout = "stop";
    g.moving = false;
    g.bumped = { ...p };
    g.nextTick = stepTick + 4;
    g.still = 0;
  } else if (due) {
    const step = decide(room, m, g.nav, known, tile, stepTick, goal);
    g.decided = key(tile);
    const a = step !== "wait" && !blindIsBot ? approach(g, p, tile, step, now, stepTick) : null;
    if (step === "wait") {
      if (g.moving) {
        callout = tile.x === goal.x && tile.y === goal.y ? "stop" : "wait";
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
    } else if (!blindIsBot && needsLineUp(room, g, p, tile, step)) {
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
      }
    }
  }
  void job;

  if (!callout && g.moving && g.lastSent && now - g.lastSentAt >= REPEAT_MS) {
    callout = g.lastSent === "go" ? (WORD[headingWord(g.heading)] as Callout) : g.lastSent;
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
  if (now - m.lastFlavourAt >= FLAVOUR_MS && now - g.lastSentAt >= 1000) {
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
