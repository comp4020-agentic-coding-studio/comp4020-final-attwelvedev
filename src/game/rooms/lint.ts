import { parseJob, rawJobs } from "../bots/jobs.ts";
import { cameraParams, laserBeam, laserParams } from "../sim/hazards.ts";
import { patrolOf } from "../sim/world.ts";
import { flipsOf, type Room } from "./format.ts";

const SAFE_S = 2; // FR14: a cue-dependent safe window is at least this long

export interface LintIssue {
  room: string;
  message: string;
}

export function lintRoom(room: Room): LintIssue[] {
  const issues: LintIssue[] = [];
  const issue = (message: string) => issues.push({ room: room.id, message });

  for (let y = 0; y < room.grid.length; y++) {
    if (room.grid[y]?.length !== room.width) {
      issue(
        `grid is not rectangular: row ${y + 1} is ${room.grid[y]?.length} wide, expected ${room.width}`,
      );
    }
  }

  const spawns = room.objects.filter((o) => o.kind === "spawn");
  for (const n of ["1", "2", "3"]) {
    const count = spawns.filter((o) => o.id === `s${n}`).length;
    if (count === 0) issue(`spawn ${n} is missing`);
    if (count > 1) issue(`spawn ${n} appears more than once`);
  }

  const exits = room.objects.filter((o) => o.kind === "exit");
  if (exits.length === 0) issue("room has no exit (E)");

  const plateIds = new Set(room.objects.filter((o) => o.kind === "plate").map((o) => o.id));
  const doors = room.objects.filter((o) => o.kind === "door");
  for (const door of doors) {
    if (!door.opensWhen || door.opensWhen.length === 0) {
      issue(`door ${door.id} has no opensWhen`);
      continue;
    }
    for (const id of door.opensWhen) {
      if (!plateIds.has(id)) issue(`door ${door.id} opensWhen names unknown plate ${id}`);
    }
  }

  // FR10: some beat has a door that needs three plates held at once
  const threePlate = doors.some(
    (d) =>
      new Set(d.opensWhen ?? []).size >= 3 &&
      room.beats.some((b) => d.tiles.some((t) => t.x >= b.x[0] && t.x <= b.x[1])),
  );
  if (!threePlate) issue("no beat has a door that needs three plates (three-plate beat, FR10)");

  lintHazards(room, issue);
  lintHints(room, issue);

  // every exit tile must be reachable from every spawn, treating doors as open
  if (exits.length > 0 && spawns.length > 0) {
    for (const spawn of spawns) {
      const start = spawn.tiles[0];
      if (!start) continue;
      const seen = new Set<string>([`${start.x},${start.y}`]);
      const queue = [start];
      while (queue.length > 0) {
        const t = queue.shift() as { x: number; y: number };
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = { x: t.x + dx, y: t.y + dy };
          const key = `${n.x},${n.y}`;
          const ch = room.grid[n.y]?.[n.x];
          if (ch === undefined || ch === "#" || seen.has(key)) continue;
          seen.add(key);
          queue.push(n);
        }
      }
      for (const exit of exits) {
        if (exit.tiles.some((t) => !seen.has(`${t.x},${t.y}`))) {
          issue(
            `exit ${exit.id} is not reachable from spawn ${spawn.id.slice(1)} even with every door open`,
          );
          break;
        }
      }
    }
  }
  return issues;
}

// Cue windows (FR14), patrol points, sequence-door signs, flip zones, and a
// checkpoint ahead of the first hazard. Hazard position is by x, left to right,
// the way the beats run.
function lintHazards(room: Room, issue: (message: string) => void): void {
  const isFloor = (x: number, y: number) => room.grid[y]?.[x] === ".";
  const hazardXs: number[] = [];

  for (const o of room.objects) {
    if (o.kind === "camera") {
      const { periodS, watchingS } = cameraParams(o);
      if (periodS - watchingS < SAFE_S) {
        issue(
          `camera ${o.id} is safe for only ${periodS - watchingS} s between watching spells (needs ${SAFE_S} s)`,
        );
      }
      hazardXs.push(o.tiles[0]?.x ?? 0);
    } else if (o.kind === "laser") {
      const { offS } = laserParams(o);
      if (offS < SAFE_S) issue(`laser ${o.id} is off for only ${offS} s (needs ${SAFE_S} s)`);
      hazardXs.push(Math.min(...[o.tiles[0]?.x ?? 0, ...laserBeam(room, o).map((t) => t.x)]));
    } else if (o.kind === "guard") {
      const patrol = patrolOf(o.params);
      for (const p of patrol) {
        if (!isFloor(p.x, p.y))
          issue(`guard ${o.id} has a patrol point (${p.x},${p.y}) that is not floor`);
      }
      hazardXs.push(Math.min(...[o.tiles[0]?.x ?? 0, ...patrol.map((p) => p.x)]));
    }
  }

  const signs = room.objects.filter((o) => o.kind === "sign");
  for (const door of room.objects.filter((o) => o.kind === "door" && o.mode === "sequence")) {
    const order = door.opensWhen ?? [];
    const shown = signs.some((s) => {
      const shows = s.params?.shows;
      return (
        Array.isArray(shows) &&
        shows.length === order.length &&
        shows.every((v, i) => v === order[i])
      );
    });
    if (!shown)
      issue(`door ${door.id} is a sequence door but no sign shows exactly its plates in order`);
  }

  const plateIds = new Set(room.objects.filter((o) => o.kind === "plate").map((o) => o.id));
  for (const flip of flipsOf(room)) {
    if (flip.kind === "alarm" && !plateIds.has(flip.trigger)) {
      issue(`alarm trigger "${flip.trigger}" is not a plate in this room`);
    }
  }

  const flips = Array.isArray(room.meta.flips) ? room.meta.flips : [];
  flips.forEach((flip: unknown, i: number) => {
    const zone = (flip as { zone?: unknown } | null)?.zone;
    if (zone === undefined) return;
    const ok =
      Array.isArray(zone) &&
      zone.length === 4 &&
      zone.every((n) => typeof n === "number") &&
      (zone[0] as number) >= 0 &&
      (zone[1] as number) >= 0 &&
      (zone[2] as number) < room.width &&
      (zone[3] as number) < room.height &&
      (zone[0] as number) <= (zone[2] as number) &&
      (zone[1] as number) <= (zone[3] as number);
    if (!ok) issue(`flip ${i + 1} zone is not inside the ${room.width}x${room.height} grid`);
  });

  if (hazardXs.length > 0) {
    const first = Math.min(...hazardXs);
    const checkpoints = room.objects.filter((o) => o.kind === "checkpoint");
    if (!checkpoints.some((k) => (k.tiles[0]?.x ?? Number.POSITIVE_INFINITY) <= first)) {
      issue(`no checkpoint before the first hazard (at x=${first}): add a K to the left of it`);
    }
  }
}

// The hints the bots follow (metadata key `hints`): every job names something in
// the room, and every beat has at least one, so the bots know what each stage asks.
function lintHints(room: Room, issue: (message: string) => void): void {
  if (room.beats.length === 0) return;
  const raw = rawJobs(room);
  if (raw.length === 0) {
    issue('room has no "hints": the bots need jobs for each beat (see phase 06 §4.1)');
    return;
  }
  const beats = new Set<number>();
  raw.forEach((j, i) => {
    const job = parseJob(room, j, i);
    if (typeof job === "string") issue(job);
    else beats.add(job.beat);
  });
  room.beats.forEach((b, i) => {
    if (!beats.has(i + 1)) issue(`beat ${i + 1} ("${b.name}") has no job in the hints`);
  });
}
