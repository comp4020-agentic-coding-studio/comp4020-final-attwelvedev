import type { PlayerInput, Seat, Vec } from "../types.ts";
import { blockedAt, circleHitsTile, crateAt, crateTouching, indexOf, tileKey } from "./collide.ts";
import { type PlayerState, SPEED_TPS, TICK_MS, type World } from "./world.ts";

const PUSH_MS = 200;
const BISECT = 8;

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
    return;
  }
  p.facing = dir;
  const dist = (SPEED_TPS * dtMs) / 1000;
  moveAxis(world, p, "x", dir.x * dist);
  moveAxis(world, p, "y", dir.y * dist);
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
    const pressed =
      world.players.some((p) => Math.floor(p.pos.x) === tile.x && Math.floor(p.pos.y) === tile.y) ||
      crateAt(world, tile.x, tile.y);
    if (pressed !== world.pressed[plate.id]) {
      world.pressed[plate.id] = pressed;
      world.events.push({ kind: "plate", id: plate.id, pressed, at: tileCentre(tile) });
    }
  }
}

function updateDoors(world: World) {
  for (const door of world.room.objects.filter((o) => o.kind === "door")) {
    const needs = door.opensWhen ?? [];
    const held = needs.length > 0 && needs.every((id) => world.pressed[id]);
    const occupied = door.tiles.some((t) =>
      world.players.some((p) => circleHitsTile(p.pos, t.x, t.y)),
    );
    const open = held || (world.doorOpen[door.id] === true && occupied);
    if (open !== world.doorOpen[door.id]) {
      world.doorOpen[door.id] = open;
      const first = door.tiles[0];
      if (first) world.events.push({ kind: "door", id: door.id, open, at: tileCentre(first) });
    }
  }
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
export function step(
  world: World,
  inputs: Partial<Record<Seat, PlayerInput>>,
  dtMs: number = TICK_MS,
): World {
  world.events = [];
  world.tick++;
  for (const p of world.players) {
    const input = inputs[p.seat];
    movePlayer(world, p, input, dtMs);
    pushCrate(world, p, input, dtMs);
  }
  updatePlates(world);
  updateDoors(world);
  updateExit(world);
  return world;
}
