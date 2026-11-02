import { parseJob, rawJobs } from "../bots/jobs.ts";
import { type RoleView, viewFor } from "../perception.ts";
import { TUNE_MAX_TICKS } from "../sim/chimes.ts";
import { cameraParams, laserBeam, laserParams } from "../sim/hazards.ts";
import { PIP_TICKS, tilesOf } from "../sim/stations.ts";
import { step } from "../sim/step.ts";
import { type GearItem, patrolOf, TICK_MS } from "../sim/world.ts";
import type { Role, Vec } from "../types.ts";
import { flipsOf, GEAR_ITEMS, isMotif, type Room, type RoomObject } from "./format.ts";
import { worldAt } from "./mockup.ts";

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
      const isStation = room.objects.some((o) => o.id === id && o.kind === "station");
      if (!plateIds.has(id) && !isStation) {
        issue(`door ${door.id} opensWhen names unknown plate ${id}`);
      }
    }
  }

  // FR10: some beat has a door that needs three plates held at once. A station room carries "every
  // role is needed" by the presence rule instead (lintPresence), so it needs no three-plate door.
  const stationRoom = room.objects.some((o) => o.kind === "station");
  const threePlate =
    stationRoom ||
    doors.some(
      (d) =>
        new Set(d.opensWhen ?? []).size >= 3 &&
        room.beats.some((b) => d.tiles.some((t) => t.x >= b.x[0] && t.x <= b.x[1])),
    );
  if (!threePlate) issue("no beat has a door that needs three plates (three-plate beat, FR10)");

  lintHazards(room, issue);
  lintSight(room, issue);
  lintHints(room, issue);
  lintPresence(room, issue);
  lintClues(room, issue);
  lintSideJobs(room, issue);

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
          if (
            ch === undefined ||
            ch === "#" ||
            ch === "=" ||
            ch === "%" ||
            ch === "H" ||
            seen.has(key)
          )
            continue;
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

const ROLES: readonly Role[] = ["blind", "deaf", "mute"];
const HOLD_APART = 3; // tiles between a sequence door's plates, Chebyshev: one body holds one

// Rules that come with line of sight (plan 04): clues, dark beats with an alarm, and held
// sequences.
function lintSight(room: Room, issue: (message: string) => void): void {
  // A clue is a sound with no picture, so a room may use one only as a keypad's code, where the
  // presence rule (lintPresence) checks that whoever hears it is not the one at the keys.
  for (const clue of room.objects.filter((o) => o.kind === "clue")) {
    const named = room.objects.some((o) => o.kind === "station" && o.params?.clue === clue.id);
    if (!named) issue(`clue ${clue.id} is not a keypad's clue, so nothing checks who hears it`);
  }

  // No role may be left with nothing to perceive: a beat that is dark everywhere while an
  // alarm can sound leaves the sighted seeing nothing and the hearing hearing only the alarm.
  const zones = flipsOf(room).flatMap((f) => (f.kind === "dark" ? [f.zone] : []));
  const alarms = flipsOf(room).flatMap((f) => (f.kind === "alarm" ? [f.trigger] : []));
  const dark = (x: number, y: number) =>
    zones.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  for (const beat of room.beats) {
    const alarmed = room.objects.some(
      (o) =>
        o.kind === "plate" &&
        alarms.includes(o.id) &&
        o.tiles.some((t) => t.x >= beat.x[0] && t.x <= beat.x[1]),
    );
    if (!alarmed) continue;
    let floor = 0;
    let lit = 0;
    for (let y = 0; y < room.height; y++) {
      for (let x = beat.x[0]; x <= beat.x[1]; x++) {
        if (room.grid[y]?.[x] !== ".") continue;
        floor++;
        if (!dark(x, y)) lit++;
      }
    }
    if (floor > 0 && lit === 0) {
      issue(`beat "${beat.name}" is dark everywhere while an alarm can sound in it`);
    }
  }

  // A held sequence needs three bodies: its plates must be far enough apart that one cannot hold two.
  const plates = new Map(room.objects.filter((o) => o.kind === "plate").map((o) => [o.id, o]));
  for (const door of room.objects.filter((o) => o.kind === "door" && o.mode === "sequence")) {
    const ids = door.opensWhen ?? [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = plates.get(ids[i] as string)?.tiles[0];
        const b = plates.get(ids[j] as string)?.tiles[0];
        if (!a || !b) continue;
        if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < HOLD_APART) {
          issue(
            `door ${door.id}: plates ${ids[i]} and ${ids[j]} are under ${HOLD_APART} tiles apart, so one body could hold both`,
          );
        }
      }
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

// --- Presence (spec FR1, FR2): every station needs more than one place, sense or person ------

// What one loadout (a role, standing on one tile, holding one piece of gear or none) perceives of
// a station over a short cycle, from the game's own `viewFor`: whether it has the clue, the
// control and the feedback. The control is standing on one of the station's parts: that is where
// it is worked, so the linter probes only those tiles (and stays fast on large rooms).
interface Senses {
  clue: boolean;
  feedback: boolean;
}

const LOADOUTS: (GearItem | undefined)[] = [undefined, ...GEAR_ITEMS];
const STATION_SOUNDS: Record<string, string[]> = {
  dial: ["tick"],
  radio: ["static", "tone", "pip"],
  wires: ["snap"],
  keypad: ["key"],
  bells: ["bellnote"],
  switches: ["clunk"],
  vault: ["clunk"],
  sync: ["clunk", "solved"],
};
const CYCLE_TICKS = Math.max(TUNE_MAX_TICKS, PIP_TICKS) + 20; // long enough for any tune (the first group may start late) or a pip

const at = (o: RoomObject): Vec => o.tiles[0] as Vec;

// Each station's control tiles: its pads, wires, keys, bells, buttons or sockets, and its anchor
// when Act on the anchor does something (a dial's confirm, a vault's handle).
function controls(o: RoomObject): Vec[] {
  const p = o.params ?? {};
  const parts = ["pads", "wires", "keys", "bells", "buttons", "sockets"].flatMap((k) =>
    tilesOf(p[k]),
  );
  return p.type === "dial" || p.type === "vault" ? [at(o), ...parts] : parts;
}

// The station's state in sight: the entity, and not just its furniture (Task 8 of the escape-room
// client phase sends a station's parts from anywhere they are in sight, with nothing of its state).
const readout = (view: RoleView, id: string) =>
  view.entities.some((e) => e.id === id && !e.station?.furniture);

// What the station's clue is, and whether the view (and the sounds heard over the cycle) has it.
function hasClue(room: Room, o: RoomObject, view: RoleView, heard: Set<string>): boolean {
  const p = o.params ?? {};
  switch (p.type) {
    case "dial":
      return heard.has("tumbler");
    case "wires":
      return (
        view.entities.some((e) => e.id === p.plaque && e.text) ||
        view.entities.some((e) => e.kind === "ink" && e.id === p.plaque)
      );
    case "keypad": {
      const clue = room.objects.find((c) => c.id === p.clue);
      return clue?.kind === "gear" ? heard.has("earpiece") : heard.has("clue");
    }
    case "switches":
      return readout(view, o.id); // the lamps: the pattern to match
    case "bells":
      return heard.has("bellnote") && readout(view, o.id);
    case "vault": {
      const from = Array.isArray(p.from) ? p.from : [];
      return from.length > 0 && from.every((id) => readout(view, id));
    }
    default:
      return false; // radio and sync carry no clue: their rule is below
  }
}

// What tells the team a station took the input: its readout in sight, or its sound.
function hasFeedback(o: RoomObject, view: RoleView, heard: Set<string>): boolean {
  const kinds = STATION_SOUNDS[String(o.params?.type)] ?? [];
  return readout(view, o.id) || kinds.some((k) => heard.has(k));
}

// One loadout on one tile, over a cycle: steps the world and turns the station once (a sighted
// readout is seen at once; a click, a tumbler or a tune needs a turn or a tick to sound).
function probe(room: Room, o: RoomObject, tile: Vec, role: Role, gear?: GearItem): Senses {
  const world = worldAt(room, tile.x, tile.y, gear);
  const s = world.stations[o.id];
  if (s && s.type === "dial") s.input[0] = ((s.answer[0] as number) + 9) % 10; // one notch short
  const first = viewFor(world, 1, role, false);
  const heard = new Set<string>();
  let clue = hasClue(room, o, first, heard);
  let feedback = hasFeedback(o, first, heard);
  // a body on a dial's or radio's ▶ pad turns it a notch (never a wrong answer), so the tumbler
  // and the tick sound; every other station's feedback is its readout, seen from the start
  const pad = tilesOf(o.params?.pads)[1];
  for (let t = 0; t < CYCLE_TICKS && !(clue && feedback); t++) {
    const turn = t === 1 && pad !== undefined;
    if (turn) world.players[2].pos = { x: pad.x + 0.5, y: pad.y + 0.5 };
    step(world, turn ? { 2: { seq: t, move: { x: 0, y: 0 }, act: true } } : {}, TICK_MS);
    world.players[1].pos = { x: tile.x + 0.5, y: tile.y + 0.5 };
    if (turn) world.players[2].pos = { x: 1.5, y: 1.5 };
    const view = viewFor(world, 1, role, false);
    for (const sound of view.sounds) heard.add(sound.kind);
    clue ||= hasClue(room, o, view, heard);
    feedback ||= hasFeedback(o, view, heard);
  }
  return { clue, feedback };
}

const gearName = (g?: GearItem) =>
  g ? `holding the ${g === "uv" ? "UV torch" : g}` : "with no gear";

export function lintPresence(room: Room, issue: (message: string) => void): void {
  const stations = room.objects.filter((o) => o.kind === "station");
  if (stations.length === 0) return;
  for (const o of stations) {
    const type = String(o.params?.type);
    if (type === "radio" || type === "sync") {
      lintSearch(room, o, issue);
      continue;
    }
    hit: for (const tile of controls(o)) {
      if (room.grid[tile.y]?.[tile.x] !== ".") continue;
      for (const role of ROLES) {
        for (const gear of LOADOUTS) {
          const sense = probe(room, o, tile, role, gear);
          if (sense.clue && sense.feedback) {
            issue(
              `station ${o.id} (${type}): ${role} ${gearName(gear)} at (${tile.x},${tile.y}) perceives its clue, control and feedback alone`,
            );
            break hit;
          }
        }
      }
    }
  }
  lintOpenAtOnce(room, stations, issue);
}

// Radio and sync carry no secret clue. A radio's digit must not be heard where the station it
// yields to is worked; a sync lock's keys must be at least SYNC_APART tiles apart, so one body
// cannot turn two.
const SYNC_APART = 3;
function lintSearch(room: Room, o: RoomObject, issue: (message: string) => void): void {
  const p = o.params ?? {};
  if (p.type === "sync") {
    const keys = tilesOf(p.keys);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i] as Vec;
        const b = keys[j] as Vec;
        if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < SYNC_APART) {
          issue(
            `station ${o.id} (sync): keys ${i + 1} and ${j + 1} are under ${SYNC_APART} tiles apart, so one body could turn both`,
          );
        }
      }
    }
    return;
  }
  const target = room.objects.find((t) => t.id === p.yields && t.kind === "station");
  if (!target) return;
  for (const tile of controls(target)) {
    for (const role of ROLES) {
      if (role === "deaf") continue;
      const world = worldAt(room, tile.x, tile.y);
      const s = world.stations[o.id];
      if (s) s.solved = true;
      world.tick = PIP_TICKS - 1;
      step(world, {}, TICK_MS);
      world.players[1].pos = { x: tile.x + 0.5, y: tile.y + 0.5 };
      if (viewFor(world, 1, role, false).sounds.some((x) => x.kind === "pip")) {
        issue(
          `station ${o.id} (radio): ${role} at ${target.id}'s control (${tile.x},${tile.y}) hears the digit it yields alone`,
        );
        return;
      }
    }
  }
}

// FR2: from the start, and from each checkpoint, at least two stations can be worked without
// solving anything first: their controls are reachable with every plate-held door open and every
// station-locked door shut.
function lintOpenAtOnce(
  room: Room,
  stations: RoomObject[],
  issue: (message: string) => void,
): void {
  const ids = new Set(stations.map((s) => s.id));
  const locked = new Set(
    room.objects
      .filter((d) => d.kind === "door" && (d.opensWhen ?? []).some((id) => ids.has(id)))
      .flatMap((d) => d.tiles.map((t) => `${t.x},${t.y}`)),
  );
  // the team starts together, so spawn 1 stands for the start; then each checkpoint
  const spawn = room.objects.find((o) => o.id === "s1");
  const starts = [
    ...(spawn ? [at(spawn)] : []),
    ...room.objects.filter((o) => o.kind === "checkpoint").map(at),
  ];
  for (const start of starts) {
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    while (queue.length > 0) {
      const t = queue.shift() as Vec;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n = { x: t.x + dx, y: t.y + dy };
        const key = `${n.x},${n.y}`;
        const ch = room.grid[n.y]?.[n.x];
        if (ch === undefined || ch === "#" || ch === "=" || ch === "%" || ch === "H") continue;
        if (seen.has(key) || locked.has(key)) continue;
        seen.add(key);
        queue.push(n);
      }
    }
    const open = stations.filter((s) => controls(s).some((t) => seen.has(`${t.x},${t.y}`)));
    if (stations.length >= 2 && open.length < 2) {
      issue(
        `from (${start.x},${start.y}) only ${open.length} station${open.length === 1 ? "" : "s"} can be worked: two stations should be open at once (FR2)`,
      );
    }
  }
}

// A side job is somewhere its owner cannot get to alone (spec FR28): flood from the owner's spawn
// with every door shut (glass, vents and hatches stop bodies too). Reaching the item means a person
// could take it before anyone else had to open anything.
function lintSideJobs(room: Room, issue: (message: string) => void): void {
  for (const job of room.objects.filter((o) => o.kind === "sidejob")) {
    const spawn = room.objects.find((o) => o.id === `s${String(job.params?.owner)}`);
    const target = at(job);
    if (!spawn) continue;
    const start = at(spawn);
    const flood = (blocks: string) => {
      const seen = new Set([`${start.x},${start.y}`]);
      const queue = [start];
      while (queue.length > 0) {
        const t = queue.shift() as Vec;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = { x: t.x + dx, y: t.y + dy };
          const ch = room.grid[n.y]?.[n.x];
          if (ch === undefined || blocks.includes(ch) || seen.has(`${n.x},${n.y}`)) continue;
          seen.add(`${n.x},${n.y}`);
          queue.push(n);
        }
      }
      return seen;
    };
    if (!flood("#=%H").has(`${target.x},${target.y}`)) {
      issue(`side job ${job.id} is walled in: no one can reach it even with every door open`);
      continue;
    }
    if (flood("#D=%H").has(`${target.x},${target.y}`)) {
      issue(
        `side job ${job.id} is within reach of its owner (seat ${String(job.params?.owner)}) with every door shut: put it behind a door another role opens`,
      );
    }
  }
}

// Clues FR4: each station's clue reaches a person, and each link carries its motif at both ends.
// A plaque's text and a target card must be in some sighted view from some floor tile (a plaque in
// UV ink, with the torch); a radio's pips are heard from its pads; a vault's wings each reveal a
// symbol and carry the motif its order clue shows; a station that yields feeds one that takes a
// slot from it, with a motif they share.
export function lintClues(room: Room, issue: (message: string) => void): void {
  const byId = new Map(room.objects.map((o) => [o.id, o]));
  const stations = room.objects.filter((o) => o.kind === "station");
  const seenBy = (check: (view: RoleView) => boolean, gear?: GearItem) =>
    reachesSighted(room, check, gear);
  for (const o of stations) {
    const p = o.params ?? {};
    const name = `${o.id} (${String(p.type)})`;
    if (p.type === "wires") {
      const plaque = typeof p.plaque === "string" ? p.plaque : undefined;
      const read = (v: RoleView) =>
        v.entities.some((e) => e.id === plaque && (e.kind === "ink" || !!e.text));
      if (!plaque || !byId.has(plaque)) issue(`${name} has no plaque`);
      else if (!seenBy(read) && !seenBy(read, "uv"))
        issue(`${name}: its plaque ${plaque} has no text any role can read`);
    } else if (p.type === "switches") {
      const cards = room.objects.filter((c) => c.kind === "card" && c.params?.of === o.id);
      if (cards.length === 0) issue(`${name} has no target card`);
      else if (
        !seenBy((v) =>
          v.entities.some((e) => e.kind === "card" && cards.some((c) => c.id === e.id)),
        )
      )
        issue(`${name}: its target card is in no sighted role's view`);
    } else if (p.type === "radio") {
      if (!pipReaches(room, o)) issue(`${name}: its pips reach no role as light or sound`);
    } else if (p.type === "vault") {
      const from = Array.isArray(p.from) ? p.from : [];
      if (from.length === 0) issue(`${name} is fed by no wing ("from")`);
      for (const id of from) {
        const wing = byId.get(String(id));
        if (wing?.kind !== "station") issue(`${name}: ${String(id)} is not a station`);
        else if (wing.params?.reveal !== true) issue(`${name}: ${String(id)} reveals no symbol`);
        else if (!isMotif(wing.params?.motif))
          issue(`${name}: ${String(id)} has no motif for the order clue`);
      }
      if (byId.get(String(p.symbols))?.kind !== "order") issue(`${name} has no order clue`);
    }
    if (typeof p.yields === "string") {
      const fed = byId.get(p.yields);
      const slot = fed?.params?.slot as { from?: unknown } | undefined;
      if (fed?.kind !== "station") issue(`${o.id} yields to ${p.yields}, which is not a station`);
      else if (slot?.from !== o.id)
        issue(`${o.id} yields to ${p.yields}, which takes no slot from it`);
      else if (!isMotif(p.motif) || p.motif !== fed.params?.motif)
        issue(`${o.id} yields to ${p.yields} but they share no motif`);
    }
    const slot = p.slot as { from?: unknown } | undefined;
    if (slot && byId.get(String(slot.from))?.params?.yields !== o.id)
      issue(`${o.id} takes a slot from ${String(slot.from)}, which does not yield to it`);
  }
  for (const c of room.objects.filter((x) => x.kind === "card")) {
    if (byId.get(String(c.params?.of))?.params?.type !== "switches")
      issue(`card ${c.id} is for ${String(c.params?.of)}, which is not a switches station`);
  }
}

// Whether a tuned radio's pip reaches some role on some floor tile: seen on its face (the sighted)
// or heard (Can't see, Can't speak), on the tick it pips.
function pipReaches(room: Room, o: RoomObject): boolean {
  const world = worldAt(room, 1, 1);
  const s = world.stations[o.id];
  if (!s) return false;
  s.solved = true;
  s.input[0] = s.answer[0] as number;
  world.tick = PIP_TICKS * 10;
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      if (room.grid[y]?.[x] !== ".") continue;
      world.players[1].pos = { x: x + 0.5, y: y + 0.5 };
      for (const role of ROLES) {
        const v = viewFor(world, 1, role, false);
        const seen = v.entities.some((e) => e.id === o.id && (e.station?.shows.length ?? 0) > 1);
        if (seen || v.sounds.some((c) => c.kind === "pip")) return true;
      }
    }
  }
  return false;
}

// Whether a sighted role (Can't hear or Can't speak), standing on some floor tile, has a view
// that passes `check`. One world (mockup.ts: worldAt), the probe moved tile by tile.
function reachesSighted(room: Room, check: (view: RoleView) => boolean, gear?: GearItem): boolean {
  const world = worldAt(room, 1, 1, gear);
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      if (room.grid[y]?.[x] !== ".") continue;
      world.players[1].pos = { x: x + 0.5, y: y + 0.5 };
      for (const role of ["deaf", "mute"] as const)
        if (check(viewFor(world, 1, role, false))) return true;
    }
  }
  return false;
}
