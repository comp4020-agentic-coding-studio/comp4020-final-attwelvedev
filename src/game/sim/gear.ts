// Gear and the team mechanics (spec FR16-FR25): taking, giving and dropping gear, the hatch sill,
// holding hands, the bell and the lamp. Pure: `step` hands it the seats that pressed Act or G.
import type { RoomObject } from "../rooms/format.ts";
import type { Seat, Vec } from "../types.ts";
import { blockedAt } from "./collide.ts";
import { tileOf } from "./hazards.ts";
import type { GearState, World } from "./world.ts";

const REACH = 1.5; // tiles between centres: a teammate this close is beside you
const BEHIND = 0.9; // a towed player keeps this far behind the leader

const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
const centre = (t: Vec): Vec => ({ x: t.x + 0.5, y: t.y + 0.5 });

export const carried = (world: World, seat: Seat): GearState | undefined =>
  world.gear.find((g) => g.heldBy === seat);

export const gearOn = (world: World, tile: Vec): GearState | undefined =>
  world.gear.find((g) => g.at !== null && same(g.at, tile));

export const objectOn = (world: World, kind: RoomObject["kind"], tile: Vec) =>
  world.room.objects.find((o) => o.kind === kind && o.tiles.some((t) => same(t, tile)));

// A hatch in one of the four tiles next to yours: its sill is in reach from either side.
export const hatchBeside = (world: World, tile: Vec): RoomObject | undefined =>
  world.room.objects.find(
    (o) =>
      o.kind === "hatch" &&
      o.tiles.some((t) => Math.abs(t.x - tile.x) + Math.abs(t.y - tile.y) === 1),
  );

export const onSill = (world: World, hatch: string): GearState | undefined =>
  world.gear.find((g) => g.sill === hatch);

// The teammates beside `seat`, nearest first.
export function beside(world: World, seat: Seat): Seat[] {
  const me = world.players[seat].pos;
  return world.players
    .filter((p) => p.seat !== seat)
    .map((p) => ({ seat: p.seat, d: Math.hypot(p.pos.x - me.x, p.pos.y - me.y) }))
    .filter((o) => o.d <= REACH)
    .sort((a, b) => a.d - b.d)
    .map((o) => o.seat);
}

// Who `seat` is holding hands with, as either end, if anyone.
export function partner(world: World, seat: Seat): Seat | undefined {
  const leader = world.holding[seat];
  if (leader !== undefined) return leader;
  for (const [towed, lead] of Object.entries(world.holding)) {
    if (lead === seat) return Number(towed) as Seat;
  }
  return undefined;
}

const inPair = (world: World, seat: Seat) => partner(world, seat) !== undefined;

function release(world: World, towed: Seat): void {
  delete world.holding[towed];
  world.events.push({ kind: "hold", seat: towed, leader: null });
}

export function releaseAll(world: World): void {
  for (const towed of Object.keys(world.holding)) release(world, Number(towed) as Seat);
}

// Pick up the gear under you; with a full slot the one you hold lands there instead (a swap).
function takeUnder(world: World, seat: Seat, tile: Vec): boolean {
  const lying = gearOn(world, tile);
  if (!lying) return false;
  const mine = carried(world, seat);
  if (mine) {
    Object.assign(mine, { heldBy: null, at: tile });
    world.events.push({ kind: "gear", id: mine.id, action: "drop", seat, at: centre(tile) });
  }
  Object.assign(lying, { at: null, heldBy: seat });
  world.events.push({ kind: "gear", id: lying.id, action: "take", seat, at: centre(tile) });
  return true;
}

// What Act does when no station took it, in order: let go (when towed), take the gear you stand
// on into an empty slot, put on or take from a hatch sill beside you, hold or let go of a teammate
// beside you, ring the bell or flash the lamp you stand on, and last swap your gear for the gear
// you stand on (so Space never swaps when a hand, a sill or a rope was meant).
export function actOn(world: World, seat: Seat): void {
  const p = world.players[seat];
  const tile = tileOf(p.pos);
  const towedBy = world.holding[seat];
  if (towedBy !== undefined) {
    release(world, seat);
    return;
  }
  const mine = carried(world, seat);
  if (!mine && takeUnder(world, seat, tile)) return;
  const hatch = hatchBeside(world, tile);
  if (hatch) {
    const sill = onSill(world, hatch.id);
    const at = centre(hatch.tiles[0] as Vec);
    if (mine && !sill) {
      Object.assign(mine, { heldBy: null, sill: hatch.id });
      world.events.push({ kind: "gear", id: mine.id, action: "sill", seat, at });
      return;
    }
    if (!mine && sill) {
      Object.assign(sill, { heldBy: seat, sill: null });
      world.events.push({ kind: "gear", id: sill.id, action: "take", seat, at });
      return;
    }
  }
  const near = beside(world, seat);
  const mate = partner(world, seat);
  if (mate !== undefined && near.includes(mate)) {
    release(world, mate);
    return;
  }
  const free = near.find((s) => !inPair(world, s));
  if (mate === undefined && free !== undefined) {
    world.holding[free] = seat;
    world.events.push({ kind: "hold", seat: free, leader: seat });
    return;
  }
  const bell = objectOn(world, "bell", tile);
  if (bell) {
    world.events.push({ kind: "bell", id: bell.id, at: centre(tile) });
    return;
  }
  const lamp = objectOn(world, "lamp", tile);
  if (lamp) {
    world.events.push({ kind: "lamp", id: lamp.id, seat });
    return;
  }
  takeUnder(world, seat, tile);
}

// G: take the gear under you into an empty slot; else hand yours to the nearest teammate beside
// you with an empty slot; else swap it for the gear under you; else drop it here.
export function gearPress(world: World, seat: Seat): void {
  const mine = carried(world, seat);
  const tile = tileOf(world.players[seat].pos);
  if (!mine) {
    takeUnder(world, seat, tile);
    return;
  }
  const to = beside(world, seat).find((s) => !carried(world, s));
  if (to !== undefined) {
    mine.heldBy = to;
    world.events.push({ kind: "gear", id: mine.id, action: "give", seat, at: centre(tile) });
    return;
  }
  if (takeUnder(world, seat, tile)) return;
  Object.assign(mine, { heldBy: null, at: tile });
  world.events.push({ kind: "gear", id: mine.id, action: "drop", seat, at: centre(tile) });
}

// Each towed player stands just behind their leader, or as near behind as the walls allow: the
// first free spot turning round from straight behind, else where they are, else on the leader.
export function tow(world: World): void {
  for (const [key, lead] of Object.entries(world.holding)) {
    const towed = world.players[Number(key) as Seat];
    const leader = world.players[lead as Seat];
    const len = Math.hypot(leader.facing.x, leader.facing.y) || 1;
    const back = Math.atan2(-leader.facing.y / len, -leader.facing.x / len);
    const spots = [0, 1, -1, 2, -2, 3, -3].map((k) => {
      const a = back + (k * Math.PI) / 4;
      return { x: leader.pos.x + Math.cos(a) * BEHIND, y: leader.pos.y + Math.sin(a) * BEHIND };
    });
    const near =
      Math.hypot(towed.pos.x - leader.pos.x, towed.pos.y - leader.pos.y) <= REACH
        ? [towed.pos]
        : [];
    const to = [...spots, ...near].find((s) => !blockedAt(world, s)) ?? leader.pos;
    towed.pos = { ...to };
    towed.facing = { ...leader.facing };
    towed.moving = leader.moving;
    towed.blocked = false;
  }
}
