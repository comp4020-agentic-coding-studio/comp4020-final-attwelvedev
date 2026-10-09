import type { Room } from "../rooms/format.ts";
import type { Role, Seat, Vec } from "../types.ts";

// A room's hints (metadata key `hints`) say what the team has to do, beat by
// beat. Bots claim jobs, humans first, then follow their own queue.
export type JobTarget =
  | { kind: "plate"; id: string; tile: Vec } // stand on it until its door opens (`until`)
  | { kind: "tile"; tile: Vec } // a waypoint
  | { kind: "exit" } // this seat's exit tile
  | { kind: "push"; crate: string; to: Vec }; // push a crate onto a tile

export interface Job {
  index: number; // position in the room's hint list, the job's identity
  beat: number; // 1-based, into room.beats
  target: JobTarget;
  prefer?: Role;
  until?: string; // a plate job is done when this door is open
  after?: string; // wait for this plate to be pressed before stepping on
  all: boolean; // every seat does it, rather than one
}

// What a bot has seen of the room: kept between ticks, since a dark zone hides things.
export interface Known {
  doorOpen: Record<string, boolean>;
  pressed: Record<string, boolean>;
  crates: Record<string, Vec>; // tile of each crate
  seq: Record<string, number>; // sequence signs: plates matched so far, by the plates it shows ("p7,p1,p4")
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
  if (typeof j.push === "string") {
    const crate = room.objects.find((o) => o.id === j.push && o.kind === "crate");
    if (!crate) return `hint job ${index + 1} pushes ${j.push}, which is not a crate in this room`;
    if (!isTile(j.to)) return `hint job ${index + 1} pushes a crate and needs "to": [x, y]`;
    target = { kind: "push", crate: crate.id, to: { x: j.to[0], y: j.to[1] } };
  } else if (j.goTo === "E") {
    if (!room.objects.some((o) => o.kind === "exit"))
      return `hint job ${index + 1} goes to E, but the room has no exit`;
    target = { kind: "exit" };
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
    return `hint job ${index + 1} needs "goTo" (a plate id, "E" or [x, y]) or "push"`;
  }
  const job: Job = { index, beat: j.beat, target, all: j.all === true };
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

// The tile a job sends a seat to.
export function jobTile(room: Room, job: Job, seat: Seat): Vec {
  switch (job.target.kind) {
    case "plate":
    case "tile":
      return job.target.tile;
    case "exit":
      return exitTile(room, seat);
    case "push":
      return job.target.to;
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

const eligible = (role: Role, job: Job) => !(role === "blind" && job.target.kind === "push");
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

// Splits the room's jobs between the three seats, one job per seat per beat, as
// each seat's queue in beat order. In each beat humans choose first, the job
// nearest where they stand; each job left goes to the bot whose role prefers it,
// else the bot with the fewest jobs so far. A beat with few jobs therefore goes
// to those who have done least. Nothing here depends on the tick, so every bot
// agrees on it without talking.
export function claimJobs(room: Room, jobs: Job[], seats: SeatInfo[]): Record<Seat, Job[]> {
  const queues: Record<Seat, Job[]> = { 0: [], 1: [], 2: [] };
  const count = (seat: Seat) => queues[seat].filter((j) => !j.all).length;
  const beats = [...new Set(jobs.map((j) => j.beat))].sort((a, b) => a - b);
  for (const beat of beats) {
    const left = jobs.filter((j) => j.beat === beat && !j.all);
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
      const options = left.filter((j) => eligible(who.role, j));
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
  }
  for (const j of jobs.filter((x) => x.all)) for (const s of seats) queues[s.seat].push(j);
  for (const s of seats) queues[s.seat].sort((a, b) => a.beat - b.beat || a.index - b.index);
  return queues;
}

const doorsFor = (room: Room, plate: string): string[] =>
  room.objects.filter((o) => o.kind === "door" && o.opensWhen?.includes(plate)).map((o) => o.id);

// Has the job been done? `at` is the seat's own position, when it is known.
export function isDone(room: Room, job: Job, known: Known, at: Vec | undefined): boolean {
  switch (job.target.kind) {
    case "plate": {
      const doors = job.until ? [job.until] : doorsFor(room, job.target.id);
      return doors.length > 0 && doors.every((d) => known.doorOpen[d] === true);
    }
    case "push": {
      const crate = known.crates[job.target.crate];
      return crate !== undefined && crate.x === job.target.to.x && crate.y === job.target.to.y;
    }
    case "tile":
      return (
        at !== undefined &&
        Math.abs(at.x - (job.target.tile.x + 0.5)) < 0.5 &&
        Math.abs(at.y - (job.target.tile.y + 0.5)) < 0.5
      );
    case "exit":
      return false;
  }
}

// May the seat step onto the plate yet? A job with `after` waits for that plate.
export function isOpen(job: Job, known: Known): boolean {
  return job.after === undefined || known.pressed[job.after] === true;
}
