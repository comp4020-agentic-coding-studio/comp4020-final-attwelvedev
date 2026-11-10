import { cacheOf, inRect, type Room } from "../rooms/format.ts";
import { platePart } from "../sim/braille.ts";
import { canReceive, canSend, type Method, type Role, type Seat, type Vec } from "../types.ts";
import type { StationBelief } from "./decode.ts";

// A room's hints (metadata key `hints`) say what the team has to do, beat by
// beat. Bots claim jobs, humans first, then follow their own queue.
export type JobTarget =
  // stand on it until its door opens (`until`); a `clue` job names its plate by the chime heard
  | { kind: "plate"; id: string; tile: Vec; clue?: ClueChoice }
  | { kind: "flag"; id: string; tile: Vec; n: number } // stand at a checkpoint until the team has set it
  | { kind: "tile"; tile: Vec } // a waypoint
  | { kind: "exit" } // this seat's exit tile
  | { kind: "push"; crate: string; to: Vec } // push a crate onto a tile
  // work a station until it is solved; `at` is where its clue is perceived (a plaque read, a code
  // heard), stood on until the answer is worked out; a keypad's code is heard, so `hearing`
  | { kind: "station"; id: string; at?: Vec; hearing?: true }
  | { kind: "listen"; station: string; tile: Vec } // stand here (at a safe's back) until it is solved
  // read a switches station's card, then stand where its lamps are seen and mark each button to press
  // (`read`: where its card is read first, when it is not in sight from `tile`)
  | { kind: "watch"; station: string; tile: Vec; read?: Vec; hearing?: true }
  | { kind: "take"; gear: string } // pick up a piece of gear
  | { kind: "give"; gear: string; to: Role } // hand it to the seat with this role
  | { kind: "sill"; gear: string; hatch: string } // put it on a hatch sill
  | { kind: "tow"; role: Role; to: Vec } // hold this role's hand and lead them to a tile
  | { kind: "keepsake"; cache: string; tile: Vec } // a bot owner takes its keepsake from the vault
  | { kind: "read"; plate: string; tile: Vec }; // Can't see reads a braille plate and texts its number

// A plate chosen by a chime: the clue, and the plates of its beat in reading order (plate n is the
// n-th). `id` and `tile` on the target are what the room file says, which only the linter reads.
export interface ClueChoice {
  id: string;
  plates: { id: string; tile: Vec }[];
}

export interface Job {
  index: number; // position in the room's hint list, the job's identity
  beat: number; // 1-based, into room.beats
  target: JobTarget;
  prefer?: Role;
  until?: string; // a plate job is done when this door is open
  after?: string; // wait for this plate to be pressed before stepping on
  all: boolean; // every seat does it, rather than one
  cache?: string; // a cache job: only while this cache is uncovered and not done (ADR 0024)
}

// What a bot has seen of the room: kept between ticks, since a dark zone hides things. Stations,
// gear and held hands too come from its own view and inbox (clues FR5), never the simulation.
export interface Known {
  stations: Record<string, StationBelief>; // what it has worked out of each station (decode.ts)
  gear: Record<string, { at: Vec | null; heldBy: Seat | null; sill: string | null }>;
  holding: Partial<Record<Seat, Seat>>; // towed seat -> leader
  roles?: readonly [Role, Role, Role]; // who is what, so a give job knows its seat
  doorOpen: Record<string, boolean>;
  pressed: Record<string, boolean>;
  crates: Record<string, Vec>; // tile of each crate
  checkpoint: number; // the highest checkpoint reached
  seq: Record<string, number>; // sequence signs: plates matched so far, by the plates it shows ("p7,p1,p4")
  seenHazards: Record<string, { lastTick: number }>; // hazards perceived (seen, or heard from the right place), by id
  clues: Record<string, number>; // the count n of each clue chime heard, by clue id
  read?: Record<string, true>; // braille plates seen read (a hand on them), by id: forgotten on a send-back
  cachesOpen?: Record<string, true>; // caches perceived uncovered: forgotten on a send-back
  cachesTaken?: Record<string, true>; // caches whose keepsake was seen taken
}

export interface SeatInfo {
  seat: Seat;
  role: Role;
  human: boolean;
  pos?: Vec; // where a human stands, for "nearest job"
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isTile = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n));
const ROLES = new Set(["blind", "deaf", "mute"]);

// One job from the room's hints, or why it is not one: the message is the linter's.
export function parseJob(room: Room, j: unknown, index: number): Job | string {
  if (!isRecord(j) || typeof j.beat !== "number" || !Number.isInteger(j.beat)) {
    return `hint job ${index + 1} needs an integer "beat"`;
  }
  if (j.beat < 1 || j.beat > Math.max(1, room.beats.length)) {
    return `hint job ${index + 1} is in beat ${j.beat}, but the room has ${room.beats.length}`;
  }
  let target: JobTarget | null = null;
  let cache: string | undefined;
  if (j.cache !== undefined) {
    const named =
      typeof j.cache === "string" ? room.objects.find((o) => o.id === j.cache) : undefined;
    if (!named || !cacheOf(named)) {
      return `hint job ${index + 1} names cache ${String(j.cache)}, which is not a cache`;
    }
    cache = named.id;
  }
  // a chamber is for the people (caches FR8): no job may send a bot to a tile inside one
  for (const key of ["at", "read", "to", "goTo"] as const) {
    const t = j[key];
    if (!isTile(t) || cache !== undefined) continue;
    for (const o of room.objects) {
      const c = cacheOf(o);
      if (c && inRect(c.chamber.rect, { x: t[0], y: t[1] })) {
        return `hint job ${index + 1} has "${key}" ${JSON.stringify(t)} inside the chamber of cache ${o.id}: bots never go in; only a cache job may`;
      }
    }
  }
  // bots never work a cache (caches FR8): it is for the people, and the room clears without it
  for (const key of ["station", "listen", "watch"] as const) {
    const named =
      typeof j[key] === "string" ? room.objects.find((o) => o.id === j[key]) : undefined;
    if (named && cacheOf(named) && cache === undefined) {
      return `hint job ${index + 1} ${key === "station" ? "works" : key === "listen" ? "listens at" : "watches"} ${named.id}, which is a cache: bots never work a cache; only a cache job may`;
    }
  }
  const gearId = (id: unknown) =>
    room.objects.find((o) => o.id === id && o.kind === "gear") ? (id as string) : null;
  if (j.keepsake !== undefined) {
    const spec = room.objects.find((o) => o.id === j.keepsake);
    const c = spec ? cacheOf(spec) : null;
    if (!spec || !c) {
      return `hint job ${index + 1} takes the keepsake of ${String(j.keepsake)}, which is not a cache`;
    }
    if (cache !== spec.id) {
      return `hint job ${index + 1} takes the keepsake of ${spec.id}, so it needs "cache": "${spec.id}"`;
    }
    target = { kind: "keepsake", cache: spec.id, tile: c.chamber.vault.item };
  } else if (typeof j.station === "string") {
    if (!room.objects.some((o) => o.id === j.station && o.kind === "station")) {
      return `hint job ${index + 1} works ${j.station}, which is not a station in this room`;
    }
    if (j.at !== undefined && (!isTile(j.at) || room.grid[j.at[1]]?.[j.at[0]] !== ".")) {
      return `hint job ${index + 1} works ${j.station} from ${JSON.stringify(j.at)}, which is not floor`;
    }
    const type = room.objects.find((o) => o.id === j.station)?.params?.type;
    target = {
      kind: "station",
      id: j.station,
      ...(isTile(j.at) ? { at: { x: j.at[0], y: j.at[1] } } : {}),
      // a keypad's code is heard; so is a music box's tune, where it is worked from its tune box
      ...(type === "keypad" || (type === "bells" && isTile(j.at))
        ? { hearing: true as const }
        : {}),
    };
  } else if (typeof j.listen === "string") {
    if (!room.objects.some((o) => o.id === j.listen && o.kind === "station")) {
      return `hint job ${index + 1} listens at ${j.listen}, which is not a station in this room`;
    }
    if (!isTile(j.at) || room.grid[j.at[1]]?.[j.at[0]] !== ".") {
      return `hint job ${index + 1} listens at ${JSON.stringify(j.at)}, which is not floor`;
    }
    target = { kind: "listen", station: j.listen, tile: { x: j.at[0], y: j.at[1] } };
  } else if (typeof j.watch === "string") {
    const o = room.objects.find((x) => x.id === j.watch && x.kind === "station");
    const watched = o?.params?.type;
    if (watched !== "switches" && watched !== "bells") {
      return `hint job ${index + 1} watches ${j.watch}, which is not a switches station or music box in this room`;
    }
    if (!isTile(j.at) || room.grid[j.at[1]]?.[j.at[0]] !== ".") {
      return `hint job ${index + 1} watches from ${JSON.stringify(j.at)}, which is not floor`;
    }
    if (j.read !== undefined && (!isTile(j.read) || room.grid[j.read[1]]?.[j.read[0]] !== ".")) {
      return `hint job ${index + 1} reads a card from ${JSON.stringify(j.read)}, which is not floor`;
    }
    target = {
      kind: "watch",
      station: j.watch,
      tile: { x: j.at[0], y: j.at[1] },
      ...(isTile(j.read) ? { read: { x: j.read[0], y: j.read[1] } } : {}),
      // a music box's watcher hears the tune at its box and marks the bells in order
      ...(watched === "bells" ? { hearing: true as const } : {}),
    };
  } else if (typeof j.take === "string") {
    const gear = gearId(j.take);
    if (!gear) return `hint job ${index + 1} takes ${j.take}, which is not gear in this room`;
    target = { kind: "take", gear };
  } else if (typeof j.give === "string") {
    const gear = gearId(j.give);
    if (!gear) return `hint job ${index + 1} gives ${j.give}, which is not gear in this room`;
    if (typeof j.to !== "string" || !ROLES.has(j.to)) {
      return `hint job ${index + 1} gives to "${String(j.to)}", which is not a role`;
    }
    target = { kind: "give", gear, to: j.to as Role };
  } else if (typeof j.sill === "string") {
    const gear = gearId(j.sill);
    if (!gear)
      return `hint job ${index + 1} puts ${j.sill} on a sill, but it is not gear in this room`;
    if (!room.objects.some((o) => o.id === j.hatch && o.kind === "hatch")) {
      return `hint job ${index + 1} names ${String(j.hatch)}, which is not a hatch in this room`;
    }
    target = { kind: "sill", gear, hatch: j.hatch as string };
  } else if (typeof j.tow === "string") {
    if (!ROLES.has(j.tow)) return `hint job ${index + 1} tows "${j.tow}", which is not a role`;
    if (!isTile(j.to) || room.grid[j.to[1]]?.[j.to[0]] !== ".") {
      return `hint job ${index + 1} tows to ${JSON.stringify(j.to)}, which is not floor`;
    }
    target = { kind: "tow", role: j.tow as Role, to: { x: j.to[0], y: j.to[1] } };
  } else if (typeof j.read === "string") {
    const plate = room.objects.find((o) => o.id === j.read && o.kind === "braille");
    const tile = plate?.tiles[0];
    if (!plate || !tile)
      return `hint job ${index + 1} reads ${j.read}, which is not a braille plate in this room`;
    target = { kind: "read", plate: plate.id, tile };
  } else if (typeof j.push === "string") {
    const crate = room.objects.find((o) => o.id === j.push && o.kind === "crate");
    if (!crate) return `hint job ${index + 1} pushes ${j.push}, which is not a crate in this room`;
    if (!isTile(j.to)) return `hint job ${index + 1} pushes a crate and needs "to": [x, y]`;
    target = { kind: "push", crate: crate.id, to: { x: j.to[0], y: j.to[1] } };
  } else if (j.goTo === "E") {
    if (!room.objects.some((o) => o.kind === "exit"))
      return `hint job ${index + 1} goes to E, but the room has no exit`;
    target = { kind: "exit" };
  } else if (typeof j.goTo === "string" && /^K\d+$/.test(j.goTo)) {
    const flag = room.objects.find((o) => o.id === j.goTo && o.kind === "checkpoint");
    const tile = flag?.tiles[0];
    if (!flag || !tile)
      return `hint job ${index + 1} goes to ${j.goTo}, which is not a checkpoint in this room`;
    target = { kind: "flag", id: flag.id, tile, n: Number(flag.id.slice(1)) };
  } else if (typeof j.goTo === "string" && /^clue:/.test(j.goTo)) {
    // "clue:c1": the plate whose number equals the clue's n, among the plates of the beat the
    // clue lies in, in reading order. The bot learns n by hearing the chime.
    const id = j.goTo.slice("clue:".length);
    const clue = room.objects.find((o) => o.id === id && o.kind === "clue");
    const at = clue?.tiles[0];
    if (!clue || !at) {
      return `hint job ${index + 1} goes to clue ${id}, which is not a clue in this room`;
    }
    const beat = room.beats.find((b) => at.x >= b.x[0] && at.x <= b.x[1]);
    const n = Number(clue.params?.n);
    const plates = room.objects
      .filter((o) => o.kind === "plate" && beat && (o.tiles[0]?.x ?? -1) >= beat.x[0])
      .filter((o) => (o.tiles[0]?.x ?? -1) <= (beat?.x[1] ?? -1))
      .sort(
        (a, b) =>
          (a.tiles[0]?.y ?? 0) - (b.tiles[0]?.y ?? 0) ||
          (a.tiles[0]?.x ?? 0) - (b.tiles[0]?.x ?? 0),
      );
    const plate = plates[n - 1];
    const tile = plate?.tiles[0];
    if (!beat || !plate || !tile) {
      return `hint job ${index + 1} goes to clue ${id}, but its beat has no plate number ${n}`;
    }
    target = {
      kind: "plate",
      id: plate.id,
      tile,
      clue: {
        id,
        plates: plates.map((p) => ({ id: p.id, tile: p.tiles[0] as Vec })),
      },
    };
  } else if (typeof j.goTo === "string") {
    const plate = room.objects.find((o) => o.id === j.goTo && o.kind === "plate");
    const tile = plate?.tiles[0];
    if (!plate || !tile)
      return `hint job ${index + 1} goes to ${j.goTo}, which is not a plate in this room`;
    target = { kind: "plate", id: plate.id, tile };
  } else if (isTile(j.goTo)) {
    const [x, y] = j.goTo;
    if (room.grid[y]?.[x] !== ".")
      return `hint job ${index + 1} goes to (${x},${y}), which is not floor`;
    target = { kind: "tile", tile: { x, y } };
  } else {
    return `hint job ${index + 1} needs "goTo" (a plate id, "E" or [x, y]), "push", "station", "listen", "watch", "take", "give", "sill" or "tow"`;
  }
  const job: Job = { index, beat: j.beat, target, all: j.all === true };
  if (cache !== undefined) job.cache = cache;
  if (j.prefer !== undefined) {
    if (typeof j.prefer !== "string" || !ROLES.has(j.prefer)) {
      return `hint job ${index + 1} prefers "${String(j.prefer)}", which is not a role`;
    }
    job.prefer = j.prefer as Role;
  }
  if (j.until !== undefined) {
    if (!room.objects.some((o) => o.id === j.until && o.kind === "door")) {
      return `hint job ${index + 1} waits for ${String(j.until)}, which is not a door in this room`;
    }
    job.until = j.until as string;
  }
  if (j.after !== undefined) {
    if (!room.objects.some((o) => o.id === j.after && o.kind === "plate")) {
      return `hint job ${index + 1} waits for ${String(j.after)}, which is not a plate in this room`;
    }
    job.after = j.after as string;
  }
  return job;
}

export function rawJobs(room: Room): unknown[] {
  const hints = room.meta.hints;
  return isRecord(hints) && Array.isArray(hints.jobs) ? hints.jobs : [];
}

export function hintsOf(room: Room): Job[] {
  return rawJobs(room).flatMap((j, i) => {
    const job = parseJob(room, j, i);
    return typeof job === "string" ? [] : [job];
  });
}

// The plate a clue job stands on, from the chime the bot has heard: null while it has heard none, or
// when the beat has no plate of that number. A job that is not a clue job is its own plate.
export function clueTarget(job: Job, known: Known): { id: string; tile: Vec } | null {
  if (job.target.kind !== "plate") return null;
  const { clue } = job.target;
  if (!clue) return { id: job.target.id, tile: job.target.tile };
  const n = known.clues[clue.id];
  return n === undefined ? null : (clue.plates[n - 1] ?? null);
}

// The tile a job sends a seat to.
export function jobTile(room: Room, job: Job, seat: Seat): Vec {
  switch (job.target.kind) {
    case "plate":
    case "flag":
    case "tile":
    case "listen":
    case "watch":
    case "read":
    case "keepsake":
      return job.target.tile;
    case "exit":
      return exitTile(room, seat);
    case "push":
    case "tow":
      return job.target.to;
    case "station": {
      if (job.target.at) return job.target.at;
      const id = job.target.id;
      return room.objects.find((o) => o.id === id)?.tiles[0] ?? { x: 0, y: 0 };
    }
    case "take":
    case "give":
    case "sill": {
      const id = job.target.kind === "sill" ? job.target.hatch : job.target.gear;
      return room.objects.find((o) => o.id === id)?.tiles[0] ?? { x: 0, y: 0 };
    }
  }
}

// Exit tiles in reading order; seat n takes the n-th, wrapping if there are fewer.
export function exitTile(room: Room, seat: Seat): Vec {
  const tiles = room.objects
    .filter((o) => o.kind === "exit")
    .flatMap((o) => o.tiles)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return tiles[seat % Math.max(1, tiles.length)] ?? { x: 0, y: 0 };
}

// Blind never pushes, watches or works the stations, gear and hands (it steers by callouts alone),
// and Can't hear never gets a clue job, a listen job, a keypad or a music box's tune: it could not
// learn the number.
const SIGHTED_ONLY = new Set<JobTarget["kind"]>([
  "push",
  "station",
  "watch",
  "take",
  "give",
  "sill",
  "tow",
]);
const eligible = (role: Role, job: Job) =>
  job.target.kind !== "keepsake" &&
  !(role !== "blind" && job.target.kind === "read") &&
  !(role === "blind" && SIGHTED_ONLY.has(job.target.kind)) &&
  !(role === "deaf" && job.target.kind === "plate" && job.target.clue !== undefined) &&
  !(role === "deaf" && job.target.kind === "listen") &&
  !(
    role === "deaf" &&
    (job.target.kind === "station" || job.target.kind === "watch") &&
    job.target.hearing === true
  );
// What a seat doing a job must be able to *receive* from a teammate (BJ1, ADR 0031): a person given
// a job whose signal their role cannot receive has no way to learn the answer.
export type Signal = "callout" | "text" | "mark" | "none";
const SIGNAL_METHOD: Record<Exclude<Signal, "none">, Method> = {
  callout: "callout",
  text: "text",
  mark: "mark",
};

export function needs(job: Job, room: Room): Signal[] {
  const t = job.target;
  const stationType = (id: string) => room.objects.find((o) => o.id === id)?.params?.type;
  if (t.kind === "listen") return stationType(t.station) === "dial" ? ["callout"] : ["none"];
  if (t.kind === "watch") return ["mark"];
  if (t.kind !== "station") return ["none"];
  const o = room.objects.find((x) => x.id === t.id);
  const type = o?.params?.type;
  if (type === "dial") return ["callout"];
  if (type === "sync") return ["text"];
  if (type === "radio" || type === "wires" || type === "keypad") {
    const plated = platePart(room, t.id) !== undefined;
    const earpiece = type === "keypad" && String(o?.params?.clue ?? "").startsWith("g");
    return plated || earpiece ? ["text"] : ["none"];
  }
  return ["none"];
}

const canReceiveAll = (role: Role, signals: Signal[]) =>
  signals.every((sig) => sig === "none" || canReceive(role, SIGNAL_METHOD[sig]));
// A sync key's holder who can text is the one who counts (brain.ts: syncCount): it sends the count
// rather than receiving it, so the text it cannot receive is no bar.
const fits = (role: Role, job: Job, room: Room) =>
  canReceiveAll(role, needs(job, room)) ||
  (job.target.kind === "station" &&
    room.objects.find((o) => o.id === (job.target as { id: string }).id)?.params?.type === "sync" &&
    canSend(role, "text"));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

// May a seat of this role do the job at all: eligible, and it can receive what the job needs (BJ1).
// A takeover (BJ2) re-claims a person's job for the lowest bot seat this holds for.
export function canDo(role: Role, job: Job, room: Room): boolean {
  return eligible(role, job) && fits(role, job, room);
}

const sameWork = (a: Job, b: Job) =>
  a.target.kind === "station" && b.target.kind === "station" && a.target.id === b.target.id;

// Splits the room's jobs between the three seats, one job per seat per beat, as
// each seat's queue in beat order. In each beat humans choose first, the job
// nearest where they stand; each job left goes to the bot whose role prefers it,
// else the bot with the fewest jobs so far. A beat with few jobs therefore goes
// to those who have done least. Nothing here depends on the tick, so every bot
// agrees on it without talking.
export function claimJobs(room: Room, jobs: Job[], seats: SeatInfo[]): Record<Seat, Job[]> {
  const queues: Record<Seat, Job[]> = { 0: [], 1: [], 2: [] };
  const count = (seat: Seat) =>
    queues[seat].filter((j) => !j.all && j.target.kind !== "keepsake").length;
  const beats = [...new Set(jobs.map((j) => j.beat))].sort((a, b) => a - b);
  // a keepsake goes only to its cache's owner seat, and only when that seat is a bot
  const keepsakes = jobs.filter((j) => j.target.kind === "keepsake");
  for (const job of keepsakes) {
    const spec = room.objects.find((o) => o.id === job.cache);
    const owner = spec ? cacheOf(spec)?.owner : undefined;
    const seat = seats.find((s) => s.seat === (owner ?? 0) - 1);
    if (seat && !seat.human) queues[seat.seat].push(job);
  }
  // A cache job is claimed in a pool of its own: it is only active once the cache is uncovered, when
  // its seat has left its beat job, so it does not compete with the beat's jobs for a seat.
  const pools = beats.flatMap((beat) => [
    { beat, cache: false },
    { beat, cache: true },
  ]);
  for (const { beat, cache } of pools) {
    const left = jobs.filter(
      (j) =>
        j.beat === beat &&
        !j.all &&
        j.target.kind !== "keepsake" &&
        (j.cache !== undefined) === cache,
    );
    const free = new Set(seats.map((s) => s.seat));
    const give = (seat: Seat, job: Job) => {
      queues[seat].push(job);
      left.splice(left.indexOf(job), 1);
      free.delete(seat);
    };
    const humans = seats
      .filter((s) => s.human)
      .sort((a, b) => count(a.seat) - count(b.seat) || a.seat - b.seat);
    for (const who of humans) {
      const options = left.filter((j) => eligible(who.role, j) && fits(who.role, j, room));
      if (options.length === 0) continue;
      const rank = (j: Job) =>
        (who.pos ? distance(who.pos, jobTile(room, j, who.seat)) * 10 : 0) +
        (j.prefer === who.role ? 0 : 1) +
        j.index / 1000;
      give(
        who.seat,
        options.reduce((a, b) => (rank(b) < rank(a) ? b : a)),
      );
    }
    for (const job of [...left]) {
      const bots = seats.filter((s) => !s.human && free.has(s.seat) && eligible(s.role, job));
      if (bots.length === 0) continue;
      const rank = (s: SeatInfo) =>
        (job.prefer === s.role ? 0 : 1) * 100 + count(s.seat) * 10 + s.seat;
      give(bots.reduce((a, b) => (rank(b) < rank(a) ? b : a)).seat, job);
    }
    // A job no free seat could take (a person who cannot receive its signal left a bot two jobs in
    // one beat) goes to a bot that has one already, rather than to nobody: the bot does both in turn.
    for (const job of [...left]) {
      const bots = seats.filter(
        (s) =>
          !s.human &&
          eligible(s.role, job) &&
          // two seats' share of one station (a sync lock's two keys) needs two seats
          !queues[s.seat].some((j) => j.beat === job.beat && sameWork(j, job)),
      );
      if (bots.length === 0) continue;
      const rank = (s: SeatInfo) =>
        (job.prefer === s.role ? 0 : 1) * 100 + count(s.seat) * 10 + s.seat;
      give(bots.reduce((a, b) => (rank(b) < rank(a) ? b : a)).seat, job);
    }
  }
  // A give is the job of whoever holds the gear. A person who chose it cannot give what a bot took,
  // so a bot that took a piece of gear also carries the give for it that a person claimed: it hands
  // the gear on, and the person's own copy is still theirs to do.
  for (const take of jobs.filter((j) => j.target.kind === "take")) {
    const gear = (take.target as { gear: string }).gear;
    const taker = seats.find((s) => !s.human && queues[s.seat].includes(take));
    if (!taker) continue;
    for (const give of jobs.filter((j) => j.target.kind === "give" && j.target.gear === gear)) {
      const owner = seats.find((s) => queues[s.seat].includes(give));
      if (owner?.human && give.beat >= take.beat) queues[taker.seat].push(give);
    }
  }
  for (const j of jobs.filter((x) => x.all)) for (const s of seats) queues[s.seat].push(j);
  for (const s of seats) queues[s.seat].sort((a, b) => a.beat - b.beat || a.index - b.index);
  return queues;
}

const doorsFor = (room: Room, plate: string): string[] =>
  room.objects.filter((o) => o.kind === "door" && o.opensWhen?.includes(plate)).map((o) => o.id);

// Has the job been done? `at` is the seat's own position, when it is known; `seat` is the seat
// doing it (a take job is done when that seat holds the gear, not when anyone does).
export function isDone(
  room: Room,
  job: Job,
  known: Known,
  at: Vec | undefined,
  seat?: Seat,
): boolean {
  switch (job.target.kind) {
    case "plate": {
      const doors = job.until ? [job.until] : doorsFor(room, job.target.id);
      return doors.length > 0 && doors.every((d) => known.doorOpen[d] === true);
    }
    case "push": {
      const crate = known.crates[job.target.crate];
      return crate !== undefined && crate.x === job.target.to.x && crate.y === job.target.to.y;
    }
    case "flag":
      return known.checkpoint >= job.target.n;
    case "tile":
      return (
        at !== undefined &&
        Math.abs(at.x - (job.target.tile.x + 0.5)) < 0.5 &&
        Math.abs(at.y - (job.target.tile.y + 0.5)) < 0.5
      );
    case "exit":
      return false;
    case "station": {
      // a radio that feeds another station is done once its digit is known too, to be passed on
      const id = job.target.id;
      const b = known.stations[id];
      const p = room.objects.find((o) => o.id === id)?.params;
      const digit = p?.type !== "radio" || typeof p.yields !== "string" || b?.answer[0] != null;
      // a plated radio never solves (it is a hint): done once its real band's digit is known
      if (p?.type === "radio" && platePart(room, id) !== undefined) return b?.answer[0] != null;
      return b?.solved === true && digit;
    }
    case "listen":
      return known.stations[job.target.station]?.solved === true;
    case "read": {
      // seen read (a hand on the plate, for the sighted), or its number already known
      const plate = room.objects.find((o) => o.id === (job.target as { plate: string }).plate);
      const b = known.stations[String(plate?.params?.for)];
      const part = Number(plate?.params?.part ?? 0);
      return (
        known.read?.[job.target.plate] === true || b?.solved === true || b?.answer[part] != null
      );
    }
    case "watch":
      return known.stations[job.target.station]?.solved === true;
    case "keepsake":
      return known.cachesTaken?.[job.target.cache] === true;
    case "take": {
      const by = known.gear?.[job.target.gear]?.heldBy;
      return seat === undefined ? by != null : by === seat;
    }
    case "give":
      return known.gear?.[job.target.gear]?.heldBy === known.roles?.indexOf(job.target.to);
    case "sill":
      return known.gear?.[job.target.gear]?.sill === job.target.hatch;
    case "tow":
      return (
        at !== undefined &&
        Math.abs(at.x - (job.target.to.x + 0.5)) < 0.5 &&
        Math.abs(at.y - (job.target.to.y + 0.5)) < 0.5 &&
        Object.keys(known.holding ?? {}).length === 0
      );
  }
}

// May the seat step onto the plate yet? A job with `after` waits for that plate.
export function isOpen(job: Job, known: Known): boolean {
  return job.after === undefined || known.pressed[job.after] === true;
}
