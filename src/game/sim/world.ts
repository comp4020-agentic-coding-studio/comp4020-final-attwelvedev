import { STAMP_LIFE_MS, type Stamp } from "../channels.ts";
import type { Room } from "../rooms/format.ts";
import type { PlayerInput, Seat, Vec } from "../types.ts";

export const TICK_MS = 50;
export const SPEED_TPS = 4;
export const RADIUS = 0.4;
export const ALARM_GUARD_SPEEDUP = 1.5; // guards walk this much faster while the alarm is on
export const CHECKPOINT_RADIUS = 1.5; // tiles from a flag's centre; all three players must be this close at once
export const SEQUENCE_GAP_MS = 5000; // a sequence door wants each plate within this of the last
export { STAMP_LIFE_MS };

export type RoomStatus = "playing" | "cleared";

export interface PlayerState {
  seat: Seat;
  pos: Vec;
  facing: Vec;
  lastSeq: number;
  pushMs: number;
  moving: boolean; // holding a direction
  blocked: boolean; // holding a direction but getting almost nowhere: a wall, a door, a crate
  hidden: boolean; // standing on a hide spot: guards and cameras cannot see you
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

// A guard on patrol: `target` indexes the patrol point it is walking to.
export interface GuardState {
  id: string;
  pos: Vec;
  facing: Vec;
  target: number;
  moving: boolean; // walked this tick: false while it stands turning round
}

// What a caught team goes back to: where players stood, where the crates were,
// which loot was already taken. Taken when a checkpoint is reached.
export interface Snapshot {
  players: Vec[];
  crates: CrateState[];
  lootTaken: string[];
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
  guards: GuardState[];
  lootTaken: string[];
  loot: number; // value collected
  lootTotal: number; // value in the room
  checkpoint: number; // 0 = the spawns, n = K<n>
  snapshot: Snapshot;
  seqProgress: Record<string, { next: number; at: number }>; // sequence doors: plates matched so far
  alarmUntil: number; // the tick the alarm ends; 0 = off
  flagPresent: Record<string, number>; // checkpoint id -> how many players were within reach last tick
  exitCount: number; // players on the exit last tick
  seqFlash: Record<string, { result: "ok" | "wrong"; tick: number }>; // a sequence door's latest result, shown briefly
}

export type WorldEvent =
  | { kind: "door"; id: string; open: boolean; at: Vec }
  | { kind: "plate"; id: string; pressed: boolean; at: Vec }
  | { kind: "crate"; id: string; at: Vec }
  | { kind: "hide"; seat: Seat; hidden: boolean; at: Vec }
  | { kind: "flag"; id: string; present: number; at: Vec } // players within reach of an unset flag changed
  | { kind: "exit"; present: number; at: Vec } // players on the exit changed
  | { kind: "seq"; door: string; result: "ok" | "wrong" | "open"; n: number; at: Vec }
  | { kind: "caught"; by: string; hazard: "guard" | "camera" | "laser"; seat: Seat } // `by` is the hazard's id, `seat` the player it got
  | { kind: "checkpoint"; index: number }
  | { kind: "loot"; id: string; at: Vec }
  | { kind: "cleared" };

export type Inputs = Partial<Record<Seat, PlayerInput>>;

export const lootValue = (params: Record<string, unknown> | undefined): number =>
  typeof params?.value === "number" ? params.value : 1;

// A guard's patrol points as tile coordinates; none means it stands still.
export function patrolOf(params: Record<string, unknown> | undefined): Vec[] {
  const raw = params?.patrol;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p) =>
    Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number"
      ? [{ x: p[0], y: p[1] }]
      : [],
  );
}

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
      blocked: false,
      hidden: false,
    };
  };
  const doorOpen: Record<string, boolean> = {};
  const pressed: Record<string, boolean> = {};
  for (const o of room.objects) {
    if (o.kind === "door") doorOpen[o.id] = false;
    if (o.kind === "plate") pressed[o.id] = false;
  }
  const players: World["players"] = [spawn(1), spawn(2), spawn(3)];
  const crates = room.objects
    .filter((o) => o.kind === "crate")
    .map((o) => ({ id: o.id, tile: { ...(o.tiles[0] as Vec) } }));
  const loot = room.objects.filter((o) => o.kind === "loot");
  return {
    room,
    tick: 0,
    players,
    crates,
    guards: room.objects
      .filter((o) => o.kind === "guard")
      .map((o) => {
        const patrol = patrolOf(o.params);
        const start = patrol[0] ?? (o.tiles[0] as Vec);
        // it starts out facing the way it is about to walk
        const next = patrol[1];
        const len = next ? Math.hypot(next.x - start.x, next.y - start.y) : 0;
        return {
          id: o.id,
          pos: { x: start.x + 0.5, y: start.y + 0.5 },
          facing:
            next && len > 0
              ? { x: (next.x - start.x) / len, y: (next.y - start.y) / len }
              : { x: 1, y: 0 },
          target: patrol.length > 1 ? 1 : 0,
          moving: false,
        };
      }),
    lootTaken: [],
    loot: 0,
    lootTotal: loot.reduce((sum, o) => sum + lootValue(o.params), 0),
    checkpoint: 0,
    snapshot: {
      players: players.map((p) => ({ ...p.pos })),
      crates: crates.map((c) => ({ id: c.id, tile: { ...c.tile } })),
      lootTaken: [],
    },
    seqProgress: {},
    alarmUntil: 0,
    flagPresent: {},
    exitCount: 0,
    seqFlash: {},
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
