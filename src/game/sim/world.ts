import type { Stamp } from "../channels.ts";
import type { Room } from "../rooms/format.ts";
import type { PlayerInput, Seat, Vec } from "../types.ts";

export const TICK_MS = 50;
export const SPEED_TPS = 4;
export const RADIUS = 0.4;
export const STAMP_LIFE_MS = 8000;

export type RoomStatus = "playing" | "cleared";

export interface PlayerState {
  seat: Seat;
  pos: Vec;
  facing: Vec;
  lastSeq: number;
  pushMs: number;
  moving: boolean;
}

export interface CrateState {
  id: string;
  tile: Vec;
}

// A stamp a player dropped: it fades (and is removed) STAMP_LIFE_MS after it lands.
export interface StampState {
  key: string; // unique within the world, so views can tell two of the same stamp apart
  id: Stamp;
  pos: Vec;
  ageMs: number;
}

export interface World {
  room: Room;
  tick: number;
  players: [PlayerState, PlayerState, PlayerState];
  crates: CrateState[];
  stamps: StampState[];
  nextStamp: number;
  doorOpen: Record<string, boolean>;
  pressed: Record<string, boolean>;
  status: RoomStatus;
  events: WorldEvent[]; // emitted this tick only, cleared at the start of step
}

export type WorldEvent =
  | { kind: "door"; id: string; open: boolean; at: Vec }
  | { kind: "plate"; id: string; pressed: boolean; at: Vec }
  | { kind: "crate"; id: string; at: Vec }
  | { kind: "cleared" };

export type Inputs = Partial<Record<Seat, PlayerInput>>;

export function createWorld(room: Room): World {
  const spawn = (n: 1 | 2 | 3): PlayerState => {
    const tile = room.objects.find((o) => o.id === `s${n}`)?.tiles[0];
    if (!tile) throw new Error(`room ${room.id} has no spawn ${n}`);
    return {
      seat: (n - 1) as Seat,
      pos: { x: tile.x + 0.5, y: tile.y + 0.5 },
      facing: { x: 1, y: 0 },
      lastSeq: 0,
      pushMs: 0,
      moving: false,
    };
  };
  const doorOpen: Record<string, boolean> = {};
  const pressed: Record<string, boolean> = {};
  for (const o of room.objects) {
    if (o.kind === "door") doorOpen[o.id] = false;
    if (o.kind === "plate") pressed[o.id] = false;
  }
  return {
    room,
    tick: 0,
    players: [spawn(1), spawn(2), spawn(3)],
    crates: room.objects
      .filter((o) => o.kind === "crate")
      .map((o) => ({ id: o.id, tile: { ...(o.tiles[0] as Vec) } })),
    stamps: [],
    nextStamp: 1,
    doorOpen,
    pressed,
    status: "playing",
    events: [],
  };
}

export function addStamp(world: World, id: Stamp, pos: Vec): void {
  world.stamps.push({ key: `S${world.nextStamp++}`, id, pos: { ...pos }, ageMs: 0 });
}
