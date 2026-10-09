import type { Callout, ChannelMessage, Outgoing } from "../channels.ts";
import type { EntityView, RoleView } from "../perception.ts";
import type { Room } from "../rooms/format.ts";
import { blockedAt } from "../sim/collide.ts";
import { createWorld, SPEED_TPS, TICK_MS, type World } from "../sim/world.ts";
import { type PlayerInput, ROLES, type Role, type Seat, type Vec } from "../types.ts";
import { type AlarmWindow, forecastFor } from "./forecast.ts";
import {
  claimJobs,
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
// else about the live world (ADR 0007). What it also holds is the room's static
// plan: the grid, the hints, and the hazards' timing (FR24).
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
  celebrated: boolean;
  model: World | null;
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
}

const newNav = (): Nav => ({ key: "", plan: [], i: 0, expect: null });
const ZERO: Vec = { x: 0, y: 0 };
const STEP_LEN = (SPEED_TPS * TICK_MS) / 1000;
const REPEAT_MS = 1500; // a callout is repeated, not spammed
const FLAVOUR_MS = 10_000;
const IDLE_MS = 5000; // a blind bot with nothing heard for this long stays put
const CLIP_MS = 10_000;
const HUM_TICKS = 3;

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
    },
    lastClipAt: Number.NEGATIVE_INFINITY,
    celebrated: false,
    model: null,
  };
}

const idle = (m: BotMemory, move: Vec = ZERO): PlayerInput => ({ seq: m.seq, move, act: false });
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
  return thinkSighted(room, view, memory, now);
}

// --- Can't see: acts on what it is told, and on what it hears -------------------

function thinkBlind(view: RoleView, inbox: ChannelMessage[], m: BotMemory, now: number): BotTurn {
  for (const msg of inbox) {
    if (msg.family !== "say" || msg.kind !== "callout") continue; // never parses free text
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
  return { input: idle(m, m.holding ? ZERO : m.heading), send: null };
}

// --- Seeing roles ------------------------------------------------------------

function ensureKnown(room: Room, m: BotMemory): Known {
  if (m.known) return m.known;
  const known: Known = { doorOpen: {}, pressed: {}, crates: {} };
  for (const o of room.objects) {
    if (o.kind === "door") known.doorOpen[o.id] = false;
    else if (o.kind === "plate") known.pressed[o.id] = false;
    else if (o.kind === "crate" && o.tiles[0]) known.crates[o.id] = { ...o.tiles[0] };
  }
  m.known = known;
  return known;
}

function observe(room: Room, view: RoleView, m: BotMemory): Known {
  const known = ensureKnown(room, m);
  for (const e of view.entities) {
    if (e.kind === "door") known.doorOpen[e.id] = e.state === "open";
    else if (e.kind === "plate") known.pressed[e.id] = e.state === "pressed";
    else if (e.kind === "crate") known.crates[e.id] = tileOf(e.pos);
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
    if (ch === undefined || ch === "#") return true;
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
  const planKey = `${key(goal)}|${open}|${crates}|${alarms}`;
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
  const forecast = forecastFor(room, m.alarms);
  const plan = planSafe({
    ...grid,
    from: tile,
    to: target,
    tick: stepTick,
    danger: (x, y, t) => forecast.danger(Math.max(0, t))[y * room.width + x] === 1,
    rest: (x, y, t) => forecast.rest(Math.max(0, t))[y * room.width + x] === 1,
  });
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
): { goal: Vec; job: Job | null } {
  const queue = queuesOf(room, m, own)[seat];
  // a job is behind a seat once it is done, or once a later one is (a bot that takes over
  // late has no business walking back to a waypoint the team passed long ago)
  const behind = (i: number) =>
    isDone(room, queue[i] as Job, known, at) ||
    queue.slice(i + 1).some((j) => j.target.kind !== "exit" && isDone(room, j, known, at));
  while (m.ptr[seat] < queue.length && behind(m.ptr[seat])) m.ptr[seat]++;
  const job = queue[m.ptr[seat]] ?? null;
  if (!job) return { goal: exitTile(room, seat), job };
  const goal = jobTile(room, job, seat);
  if (job.target.kind === "plate" && !isOpen(job, known)) {
    const grid = { width: room.width, height: room.height, blocked: blockedFor(room, known, goal) };
    const path = findPath(grid, from, goal);
    const before = path && path.length >= 2 ? path[path.length - 2] : undefined;
    if (before) return { goal: before, job };
  }
  return { goal, job };
}

function thinkSighted(room: Room, view: RoleView, m: BotMemory, now: number): BotTurn {
  const known = observe(room, view, m);
  const pos =
    view.you.pos ?? centreOf(room.objects.find((o) => o.id === `s${m.seat + 1}`)?.tiles[0] ?? ZERO);
  let send: Outgoing | null = null;

  if (view.status === "cleared") {
    if (!m.celebrated) {
      m.celebrated = true;
      if (view.role === "mute") {
        send = { family: "show", kind: "face", id: "f02" };
      } else {
        send = { family: "say", kind: "text", text: pickPhrase("cleared", m.usedPhrases, m.seq) };
      }
    }
    return { input: idle(m), send: stamp(m, send, now) };
  }

  const input = view.alarm ? idle(m) : moveSelf(room, view, m, known, pos);
  if (view.role === "deaf") send = guideBlind(room, view, m, known, now);
  else if (view.role === "mute") send = muteClip(view, m, now);
  return { input, send: stamp(m, send, now) };
}

function stamp(m: BotMemory, send: Outgoing | null, now: number): Outgoing | null {
  if (send) m.lastSpokeAt = now;
  return send;
}

// --- moving the bot's own avatar -----------------------------------------------

function moveSelf(room: Room, view: RoleView, m: BotMemory, known: Known, pos: Vec): PlayerInput {
  const seat = m.seat;
  const tile = tileOf(pos);
  const { goal, job } = goalFor(room, m, seat, view.role, pos, known, tile);

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
    g.est = p;
    if (g.last && Math.hypot(p.x - g.last.x, p.y - g.last.y) < 0.01) g.still++;
    else g.still = 0;
    g.last = p;
    if (g.moving && g.still >= 2 && blindIsBot) g.moving = false; // it stopped on its own: a hum, or a wall
  } else {
    const spawn = room.objects.find((o) => o.id === `s${b + 1}`)?.tiles[0];
    const est = g.est ?? centreOf(spawn ?? ZERO);
    p = g.moving ? reckon(room, m, known, est, g.heading) : est;
    if (g.moving && mapsOf(room).plateAt.has(key(tileOf(p)))) g.moving = false; // it hears the hum
    g.est = p;
  }

  const tile = tileOf(p);
  const { goal, job } = goalFor(room, m, b as Seat, "blind", p, known, tile);
  let callout: Callout | null = null;

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
  } else if (due) {
    const step = decide(room, m, g.nav, known, tile, stepTick, goal);
    g.decided = key(tile);
    if (step === "wait") {
      if (g.moving) {
        callout = tile.x === goal.x && tile.y === goal.y ? "stop" : "wait";
        g.moving = false;
      }
      g.nextTick = stepTick + STEP_TICKS;
    } else {
      const heading = DELTA[step];
      const same = g.moving && g.heading.x === heading.x && g.heading.y === heading.y;
      if (!same) {
        const resumes = !g.moving && g.heading.x === heading.x && g.heading.y === heading.y;
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
    return { family: "say", kind: "callout", callout };
  }
  if (now - m.lastFlavourAt >= FLAVOUR_MS && now - g.lastSentAt >= 1000) {
    const situation: Situation = !g.started ? "start" : g.moving ? "moving" : "waiting";
    g.started = true;
    m.lastFlavourAt = now;
    return { family: "say", kind: "text", text: pickPhrase(situation, m.usedPhrases, m.seq) };
  }
  return null;
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

function muteClip(view: RoleView, m: BotMemory, now: number): Outgoing | null {
  if (now - m.lastClipAt < CLIP_MS || !view.you.pos) return null;
  const roles = rolesOf(m, view.role);
  const b = roles.indexOf("blind");
  const blind = view.entities.find((e) => e.kind === "player" && e.seat === b);
  if (!blind) return null;
  const mine = view.you.pos;
  const wrong = view.entities.some(
    (e) =>
      e.kind === "door" &&
      e.state === "closed" &&
      Math.min(blind.pos.x, mine.x) < e.pos.x &&
      e.pos.x < Math.max(blind.pos.x, mine.x),
  );
  if (!wrong) return null;
  m.lastClipAt = now;
  return { family: "sound", clip: "airhorn" };
}
