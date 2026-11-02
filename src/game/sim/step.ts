import { cacheOf, flipsOf, type RoomObject } from "../rooms/format.ts";
import type { PlayerInput, Seat, Vec } from "../types.ts";
import { inChamber, syncCacheDoors } from "./cache.ts";
import { blockedAt, circleHitsTile, crateAt, crateTouching, indexOf, tileKey } from "./collide.ts";
import { actOn, gearPress, releaseAll, tow } from "./gear.ts";
import { alarmOn, type Catch, findCatch, guardParams, tileOf } from "./hazards.ts";
import {
  DYE_MS,
  drawStations,
  solved,
  stationNaming,
  tuneNote,
  updateStations,
} from "./stations.ts";
import {
  ALARM_GUARD_SPEEDUP,
  CHECKPOINT_RADIUS,
  copyGear,
  lootValue,
  type PlayerState,
  patrolOf,
  SEQUENCE_GAP_MS,
  SPEED_TPS,
  STAMP_LIFE_MS,
  TICK_MS,
  type World,
} from "./world.ts";

const PUSH_MS = 200;
const BISECT = 8;
const BLOCKED_FRACTION = 0.3; // of the distance the input asked for

const tileCentre = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });

function normalised(move: Vec): Vec {
  const x = Math.max(-1, Math.min(1, move.x));
  const y = Math.max(-1, Math.min(1, move.y));
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

// Moves one axis by `d`; if that is blocked, closes in on the contact point so
// players end flush against walls instead of a step short of them.
function moveAxis(world: World, p: PlayerState, axis: "x" | "y", d: number): void {
  if (d === 0) return;
  const from = p.pos[axis];
  const to = { ...p.pos, [axis]: from + d };
  if (!blockedAt(world, to)) {
    p.pos[axis] = from + d;
    return;
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < BISECT; i++) {
    const mid = (lo + hi) / 2;
    if (blockedAt(world, { ...p.pos, [axis]: from + d * mid })) hi = mid;
    else lo = mid;
  }
  p.pos[axis] = from + d * lo;
}

function movePlayer(world: World, p: PlayerState, input: PlayerInput | undefined, dtMs: number) {
  if (input) p.lastSeq = input.seq;
  const dir = input ? normalised(input.move) : { x: 0, y: 0 };
  p.moving = dir.x !== 0 || dir.y !== 0;
  if (!p.moving) {
    p.pushMs = 0;
    p.blocked = false;
    return;
  }
  p.facing = dir;
  const dist = (SPEED_TPS * dtMs) / 1000;
  const from = { ...p.pos };
  moveAxis(world, p, "x", dir.x * dist);
  moveAxis(world, p, "y", dir.y * dist);
  // Sliding along a wall still gets somewhere; only a push that goes (almost) nowhere is blocked.
  p.blocked =
    Math.hypot(p.pos.x - from.x, p.pos.y - from.y) <
    BLOCKED_FRACTION * Math.hypot(dir.x, dir.y) * dist;
}

// A player holding into a crate for PUSH_MS moves it one tile, if the tile
// beyond is floor and empty. Pushes run per player, in seat order.
function pushCrate(world: World, p: PlayerState, input: PlayerInput | undefined, dtMs: number) {
  const dir = input ? normalised(input.move) : { x: 0, y: 0 };
  const candidates: Vec[] = [];
  if (dir.x !== 0) candidates.push({ x: Math.sign(dir.x), y: 0 });
  if (dir.y !== 0) candidates.push({ x: 0, y: Math.sign(dir.y) });
  for (const push of candidates) {
    const tile = crateTouching(world, p.pos, push);
    if (!tile) continue;
    p.pushMs = Math.min(PUSH_MS, p.pushMs + dtMs);
    if (p.pushMs < PUSH_MS) return;
    const target = { x: tile.x + push.x, y: tile.y + push.y };
    if (world.room.grid[target.y]?.[target.x] !== ".") return;
    if (crateAt(world, target.x, target.y)) return;
    if (world.players.some((o) => circleHitsTile(o.pos, target.x, target.y))) return;
    const crate = world.crates.find((c) => c.tile.x === tile.x && c.tile.y === tile.y);
    if (!crate) return;
    crate.tile = target;
    p.pushMs = 0;
    world.events.push({ kind: "crate", id: crate.id, at: tileCentre(target) });
    return;
  }
  p.pushMs = 0;
}

function updatePlates(world: World) {
  const { room } = world;
  for (const plate of room.objects.filter((o) => o.kind === "plate")) {
    const tile = plate.tiles[0];
    if (!tile) continue;
    // a crate-only plate (room file `crateOnly`) is held by a crate's weight and never by a person
    const byPerson =
      plate.params?.crateOnly !== true &&
      world.players.some((p) => Math.floor(p.pos.x) === tile.x && Math.floor(p.pos.y) === tile.y);
    const pressed = byPerson || crateAt(world, tile.x, tile.y);
    if (pressed !== world.pressed[plate.id]) {
      world.pressed[plate.id] = pressed;
      world.events.push({ kind: "plate", id: plate.id, pressed, at: tileCentre(tile) });
    }
  }
}

// An alarm flip starts when its trigger plate is pressed and runs for durationS
// (starting afresh if it is set off again).
function triggerAlarm(world: World, trigger: (t: string) => boolean) {
  for (const flip of flipsOf(world.room)) {
    if (flip.kind === "alarm" && trigger(flip.trigger)) {
      world.alarmUntil = world.tick + Math.round((flip.durationS * 1000) / TICK_MS);
    }
  }
}

// A sequence door tracks how many of its plates have been pressed in order. A
// wrong plate, or a gap over SEQUENCE_GAP_MS, starts it again.
function updateSequences(world: World) {
  const pressedNow = world.events.flatMap((e) => (e.kind === "plate" && e.pressed ? [e.id] : []));
  for (const door of world.room.objects.filter((o) => o.kind === "door" && o.mode === "sequence")) {
    const order = door.opensWhen ?? [];
    const progress = world.seqProgress[door.id] ?? { next: 0, at: world.tick };
    world.seqProgress[door.id] = progress;
    if (progress.next >= order.length) continue; // done; the door latches
    const at = tileCentre(door.tiles[0] as Vec);
    const say = (result: "ok" | "wrong" | "open") => {
      world.events.push({ kind: "seq", door: door.id, result, n: progress.next, at });
      if (result !== "open") world.seqFlash[door.id] = { result, tick: world.tick };
    };
    if (progress.next > 0 && (world.tick - progress.at) * TICK_MS > SEQUENCE_GAP_MS) {
      progress.next = 0;
      say("wrong"); // the time ran out: start again
    }
    // held: a plate already matched has to stay down until the door opens
    if (progress.next > 0 && order.slice(0, progress.next).some((id) => !world.pressed[id])) {
      progress.next = 0;
      say("wrong");
    }
    for (const id of pressedNow) {
      if (!order.includes(id)) continue;
      if (id === order[progress.next]) {
        progress.next++;
        say(progress.next >= order.length ? "open" : "ok");
      } else {
        progress.next = id === order[0] ? 1 : 0;
        say("wrong");
      }
      progress.at = world.tick;
    }
  }
}

function updateDoors(world: World) {
  for (const door of world.room.objects.filter((o) => o.kind === "door")) {
    const needs = door.opensWhen ?? [];
    // a door may name a station as well as plates: it opens once that station is solved (FR6)
    const held =
      door.mode === "sequence"
        ? needs.length > 0 && (world.seqProgress[door.id]?.next ?? 0) >= needs.length
        : needs.length > 0 && needs.every((id) => world.pressed[id] || solved(world, id));
    // latched: once opened a door stays open, so nobody can be stranded behind it
    const open = held || world.doorOpen[door.id] === true;
    if (open !== world.doorOpen[door.id]) {
      world.doorOpen[door.id] = open;
      const first = door.tiles[0];
      if (first) world.events.push({ kind: "door", id: door.id, open, at: tileCentre(first) });
    }
  }
}

// Standing on a hide spot: reported once each way, so everyone can hear and see it.
function updateHide(world: World) {
  const spots = world.room.objects.filter((o) => o.kind === "hide").flatMap((o) => o.tiles);
  for (const p of world.players) {
    const t = tileOf(p.pos);
    const hidden = spots.some((s) => s.x === t.x && s.y === t.y);
    if (hidden === p.hidden) continue;
    p.hidden = hidden;
    world.events.push({ kind: "hide", seat: p.seat, hidden, at: { ...p.pos } });
  }
}

const reach = (p: PlayerState, at: Vec): boolean =>
  Math.hypot(p.pos.x - at.x, p.pos.y - at.y) <= CHECKPOINT_RADIUS;

// How many of the three are within reach of each flag not yet set, reported each
// time that changes: the sound and the pips behind "all three, together".
function updateFlags(world: World) {
  for (const o of world.room.objects.filter((o) => o.kind === "checkpoint")) {
    const at = o.tiles[0];
    if (!at || Number(o.id.slice(1)) <= world.checkpoint) continue;
    const flag = tileCentre(at);
    const present = world.players.filter((p) => reach(p, flag)).length;
    if (present === (world.flagPresent[o.id] ?? 0)) continue;
    world.flagPresent[o.id] = present;
    world.events.push({ kind: "flag", id: o.id, present, at: flag });
  }
}

// A clue chimes `n` (1 to 3) every `everyS` seconds (default 2): a sound with no picture. A clue a
// keypad names (its `clue`) plays that keypad's code instead, one key (n = key + 1) a note (FR9).
function updateClues(world: World) {
  for (const o of world.room.objects) {
    if (o.kind !== "clue") continue;
    const note = tuneNote(world, o.id);
    if (note !== undefined) {
      world.events.push({ kind: "clue", id: o.id, n: note + 1, at: tileCentre(o.tiles[0] as Vec) });
      continue;
    }
    if (stationNaming(world, o.id)) continue;
    const every = Math.max(1, Math.round(((Number(o.params?.everyS) || 2) * 1000) / TICK_MS));
    if (world.tick % every !== 0) continue;
    const n = Math.max(1, Math.min(3, Math.round(Number(o.params?.n) || 1)));
    world.events.push({ kind: "clue", id: o.id, n, at: tileCentre(o.tiles[0] as Vec) });
  }
}

function updateExitCount(world: World) {
  const { exitAt } = indexOf(world.room);
  const present = world.players.filter((p) =>
    exitAt.has(tileKey(tileOf(p.pos).x, tileOf(p.pos).y)),
  ).length;
  if (present === world.exitCount) return;
  world.exitCount = present;
  const first = world.room.objects.find((o) => o.kind === "exit")?.tiles[0];
  world.events.push({ kind: "exit", present, at: first ? tileCentre(first) : { x: 0, y: 0 } });
}

// A guard walks toward its next patrol point, but never snaps round: it swings to
// face the way it is going at turnDegPerS, and stands still until it is facing
// (nearly) the right way. So at the end of a lane it pauses and its cone sweeps
// round, instead of flipping instantly.
const FACING_OK = 0.35; // radians (about 20 degrees): close enough to start walking

function moveGuards(world: World, dtMs: number) {
  const hurry = alarmOn(world) ? ALARM_GUARD_SPEEDUP : 1;
  for (const guard of world.guards) {
    guard.moving = false;
    const object = world.room.objects.find((o) => o.id === guard.id);
    const patrol = patrolOf(object?.params);
    const goal = patrol[guard.target];
    if (!object || !goal || patrol.length < 2) continue;
    const params = guardParams(object);
    const to = tileCentre(goal);
    const dx = to.x - guard.pos.x;
    const dy = to.y - guard.pos.y;
    const dist = Math.hypot(dx, dy);

    // turn toward the goal (a half turn always goes the same way round)
    const want = Math.atan2(dy, dx);
    const now = Math.atan2(guard.facing.y, guard.facing.x);
    let off = want - now;
    while (off > Math.PI) off -= 2 * Math.PI;
    while (off <= -Math.PI) off += 2 * Math.PI;
    if (dist > 1e-9) {
      const most = (params.turnDegPerS * hurry * (Math.PI / 180) * dtMs) / 1000;
      const turn = Math.max(-most, Math.min(most, off));
      guard.facing = { x: Math.cos(now + turn), y: Math.sin(now + turn) };
      off -= turn;
    }
    if (Math.abs(off) > FACING_OK) continue; // still swinging round: stand and look

    const reach = (params.speedTps * hurry * dtMs) / 1000;
    guard.moving = true;
    if (dist <= reach) {
      guard.pos = to;
      guard.target = (guard.target + 1) % patrol.length;
    } else {
      guard.pos = { x: guard.pos.x + (dx / dist) * reach, y: guard.pos.y + (dy / dist) * reach };
    }
  }
}

// The nearest floor tiles to `from` (nearest first, ties in reading order) that
// hold neither a wall, a closed door nor a crate.
function floorNear(world: World, from: Vec, count: number): Vec[] {
  const out: { t: Vec; d: number }[] = [];
  for (let y = 0; y < world.room.height; y++) {
    for (let x = 0; x < world.room.width; x++) {
      const ch = world.room.grid[y]?.[x];
      if (ch !== "." || crateAt(world, x, y) || inChamber(world, { x, y })) continue;
      out.push({ t: { x, y }, d: Math.hypot(x - from.x, y - from.y) });
    }
  }
  out.sort((a, b) => a.d - b.d || a.t.y - b.t.y || a.t.x - b.t.x);
  return out.slice(0, count).map((o) => o.t);
}

function updateCheckpoints(world: World) {
  for (const o of world.room.objects.filter((o) => o.kind === "checkpoint")) {
    const index = Number(o.id.slice(1));
    const at = o.tiles[0];
    if (!at || index <= world.checkpoint) continue;
    // the whole team, together: one runner cannot bank a hard section for everyone
    const flag = tileCentre(at);
    const together = world.players.every(
      (p) => Math.hypot(p.pos.x - flag.x, p.pos.y - flag.y) <= CHECKPOINT_RADIUS,
    );
    if (!together) continue;
    world.checkpoint = index;
    const spots = [at, ...floorNear(world, at, 3).filter((t) => t.x !== at.x || t.y !== at.y)];
    world.snapshot = {
      players: spots.slice(0, 3).map((t) => tileCentre(t)),
      crates: world.crates.map((c) => ({ id: c.id, tile: { ...c.tile } })),
      lootTaken: [...world.lootTaken],
      gear: copyGear(world.gear),
      cacheUncovered: [...world.cacheUncovered],
      cacheBy: { ...world.cacheBy },
      cacheTaken: { ...world.cacheTaken },
    };
    world.events.push({ kind: "checkpoint", index });
  }
}

function updateLoot(world: World) {
  for (const o of world.room.objects.filter((o) => o.kind === "loot")) {
    const at = o.tiles[0];
    if (!at || world.lootTaken.includes(o.id)) continue;
    if (!world.players.some((p) => tileOf(p.pos).x === at.x && tileOf(p.pos).y === at.y)) continue;
    world.lootTaken.push(o.id);
    world.loot += lootValue(o.params);
    world.events.push({ kind: "loot", id: o.id, at: tileCentre(at) });
  }
}

// The whole team goes back to the last checkpoint: players, crates, loot and gear as
// they were when it was reached, hands let go. Unsolved stations get new answers (FR5).
function sendBack(world: World, caught: Catch) {
  const { snapshot } = world;
  world.players.forEach((p, i) => {
    const to = snapshot.players[i];
    if (to) p.pos = { ...to };
    p.moving = false;
    p.blocked = false;
    p.pushMs = 0;
  });
  world.crates = snapshot.crates.map((c) => ({ id: c.id, tile: { ...c.tile } }));
  world.lootTaken = [...snapshot.lootTaken];
  world.gear = copyGear(snapshot.gear);
  releaseAll(world);
  world.cacheUncovered = [...snapshot.cacheUncovered];
  world.cacheBy = { ...snapshot.cacheBy };
  world.cacheTaken = { ...snapshot.cacheTaken };
  // a cache solved after the checkpoint is closed again: its station is unsolved and drawn afresh
  for (const id of Object.keys(world.solvedBy)) {
    if (
      cacheOf(world.room.objects.find((o) => o.id === id) as RoomObject) &&
      !(id in world.cacheBy)
    ) {
      delete world.solvedBy[id];
      const s = world.stations[id];
      if (s) s.solved = false;
    }
  }
  world.loot =
    world.room.objects
      .filter((o) => o.kind === "loot" && world.lootTaken.includes(o.id))
      .reduce((sum, o) => sum + lootValue(o.params), 0) + Object.keys(world.cacheTaken).length;
  syncCacheDoors(world);
  world.seqProgress = {};
  world.seqFlash = {};
  world.events.push({ kind: "caught", ...caught });
  world.alarmUntil = 0; // a retry starts clean: the alarm belongs to the attempt that set it off
  world.attempt++;
  drawStations(world);
}

// Act and G are edges: the seats that pressed them this tick, in seat order.
function actEdges(world: World, inputs: Partial<Record<Seat, PlayerInput>>): Seat[] {
  const out: Seat[] = [];
  for (const p of world.players) {
    const held = inputs[p.seat]?.act === true;
    if (held && !p.actHeld) out.push(p.seat);
    p.actHeld = held;
  }
  return out;
}

function gearEdges(world: World, inputs: Partial<Record<Seat, PlayerInput>>): Seat[] {
  const out: Seat[] = [];
  for (const p of world.players) {
    const held = inputs[p.seat]?.gear === true;
    if (held && !p.gearHeld) out.push(p.seat);
    p.gearHeld = held;
  }
  return out;
}

// Both hand-holders steer (ADR 0019, which changes spec FR22): the leader walks for both, and the
// step is the sum of their two moves, clamped to length 1. Pushing the same way is one step, not
// two; opposite ways cancel and the pair stalls; one idle means the other leads at full speed. The
// towed seat's own body is never moved by its input (`tow` places it behind the leader), so there
// is no second walk to keep in step. A seat with no input (a bot, a dropped connection) adds nothing.
// Returns the move each seat walks this tick; a seat's own input (and its `seq`, which is what is
// acknowledged to its client) is never swapped for another's.
function pairMoves(
  world: World,
  inputs: Partial<Record<Seat, PlayerInput>>,
): Partial<Record<Seat, Vec>> {
  const out: Partial<Record<Seat, Vec>> = {};
  for (const [key, lead] of Object.entries(world.holding)) {
    const towed = Number(key) as Seat;
    const a = inputs[lead as Seat]?.move;
    const b = inputs[towed]?.move;
    const sum = { x: (a?.x ?? 0) + (b?.x ?? 0), y: (a?.y ?? 0) + (b?.y ?? 0) };
    const len = Math.hypot(sum.x, sum.y);
    out[lead as Seat] = len > 1 ? { x: sum.x / len, y: sum.y / len } : sum;
    out[towed] = { x: 0, y: 0 }; // the leader's step carries it
    // A tug of war: both push and the pushes cancel. One idle, or both going the same way, is not.
    const pushing = (m?: Vec) => m !== undefined && (m.x !== 0 || m.y !== 0);
    const tug = pushing(a) && pushing(b) && len < 1e-9;
    if (tug && !world.pulling[towed]) {
      const at = world.players[lead as Seat].pos;
      world.events.push({ kind: "pull", leader: lead as Seat, towed, at: { ...at } });
    }
    if (tug) world.pulling[towed] = true;
    else delete world.pulling[towed];
  }
  // a pair that no longer exists (they let go, or a reset) is no longer pulling
  for (const key of Object.keys(world.pulling)) {
    if (world.holding[Number(key) as Seat] === undefined) delete world.pulling[Number(key)];
  }
  return out;
}

function updateExit(world: World) {
  if (world.status === "cleared") return;
  const { exitAt } = indexOf(world.room);
  if (world.players.every((p) => exitAt.has(tileKey(Math.floor(p.pos.x), Math.floor(p.pos.y))))) {
    world.status = "cleared";
    world.events.push({ kind: "cleared" });
  }
}

// Mutates and returns `world`. No clock, no randomness: the same worlds and
// inputs give the same result. A seat with no input does not move.
function ageStamps(world: World, dtMs: number): void {
  for (const s of world.stamps) s.ageMs += dtMs;
  world.stamps = world.stamps.filter((s) => s.ageMs < STAMP_LIFE_MS);
}

export function step(
  world: World,
  inputs: Partial<Record<Seat, PlayerInput>>,
  dtMs: number = TICK_MS,
): World {
  world.events = [];
  world.tick++;
  const moves = pairMoves(world, inputs);
  for (const p of world.players) {
    const own = inputs[p.seat];
    const pair = moves[p.seat];
    // a seat in a pair walks the pair's step; its own input still carries its seq
    const input = pair ? { ...(own ?? { seq: p.lastSeq, act: false }), move: pair } : own;
    movePlayer(world, p, input, dtMs);
    pushCrate(world, p, input, dtMs);
  }
  tow(world);
  updatePlates(world);
  updateSequences(world);
  for (const e of world.events) {
    if (e.kind === "plate" && e.pressed) triggerAlarm(world, (t) => t === e.id);
  }
  // Act: a towed player's lets go; otherwise a station part under you comes first (gear.ts: actOn)
  const acts = actEdges(world, inputs);
  const used = new Set<Seat>(acts.filter((s) => world.holding[s] !== undefined));
  const wrong = updateStations(
    world,
    acts.filter((s) => !used.has(s)),
    used,
  );
  for (const seat of acts) {
    if (world.holding[seat] !== undefined || !used.has(seat)) actOn(world, seat);
  }
  for (const seat of gearEdges(world, inputs)) gearPress(world, seat);
  updateDoors(world);
  moveGuards(world, dtMs);
  updateHide(world);
  updateFlags(world);
  updateCheckpoints(world);
  updateLoot(world);
  updateClues(world);
  updateExitCount(world);
  // a wrong answer splatters the team with dye, then counts as caught (FR15, FR29)
  if (wrong) {
    world.events.push({ kind: "dye", station: wrong.id });
    world.dyedUntil = world.tick + Math.round(DYE_MS / TICK_MS);
  }
  const caught: Catch | null = wrong
    ? { by: wrong.id, hazard: "station", seat: wrong.seat }
    : findCatch(world);
  if (caught !== null) sendBack(world, caught);
  else updateExit(world);
  ageStamps(world, dtMs);
  return world;
}
