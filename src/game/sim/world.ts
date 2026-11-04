import { STAMP_LIFE_MS, type Stamp } from "../channels.ts";
import { cacheOf, type GEAR_ITEMS, type Room, type STATION_TYPES } from "../rooms/format.ts";
import type { PlayerInput, Seat, Vec } from "../types.ts";
import { drawStations } from "./stations.ts";

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
  actHeld: boolean; // Act was held last tick: Act works on the press, not while held
  gearHeld: boolean; // G was held last tick: likewise
}

export type StationType = (typeof STATION_TYPES)[number];
export type GearItem = (typeof GEAR_ITEMS)[number];

// A puzzle (spec FR5-FR14). `answer` is the secret, re-drawn per attempt and never sent to a
// client as-is; `input` is what the team has entered so far (a dial's setting is its last entry).
export interface StationState {
  id: string; // "Q1"
  type: StationType;
  answer: number[];
  input: number[];
  solved: boolean;
  reveal?: number; // a wing station's symbol (0 to SYMBOLS - 1), drawn when it is solved
}

export interface GearState {
  id: string; // "g1"
  item: GearItem;
  at: Vec | null; // tile it lies on; null while carried or on a hatch sill
  heldBy: Seat | null;
  sill: string | null; // hatch id while it sits on one
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
  gear: GearState[];
  cacheUncovered: string[]; // a send-back restores both, and un-solves a cache solved after it
  cacheBy: Record<string, Seat>;
  cacheTaken: Record<string, Seat>; // and the keepsakes taken
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
  levers: Record<string, boolean>; // a practice lever: on while its stations only play (Task 38)
  pulling: Record<number, boolean>; // by towed seat: the pair is in a tug of war (ADR 0019)
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
  stations: Record<string, StationState>;
  gear: GearState[];
  holding: Partial<Record<Seat, Seat>>; // towed seat -> leader
  seed: number;
  attempt: number; // 0 at room start, +1 on every send-back; answers come from rng(seed * 1000 + attempt)
  dyedUntil: number; // the tick the dye-pack splatter ends; 0 = none
  solvedBy: Record<string, Seat>; // a station solved -> the seat whose Act solved it (credits)
  cacheUncovered: string[]; // cache station ids whose motif tile was pressed
  cacheBy: Record<string, Seat>; // cache station id -> the seat whose Act solved it (the vault door is open)
  cacheTaken: Record<string, Seat>; // cache station id -> the seat that took the keepsake (its owner); +1 loot
  syncAt: Record<string, number[]>; // sync locks: the tick each key was last turned (-1 = not yet)
  jammedUntil: Record<string, number>; // a teaching station or cache: ignores input until this tick (FR13)
}

export type WorldEvent =
  | { kind: "door"; id: string; open: boolean; at: Vec }
  | { kind: "plate"; id: string; pressed: boolean; at: Vec }
  | { kind: "crate"; id: string; at: Vec }
  | { kind: "hide"; seat: Seat; hidden: boolean; at: Vec }
  | { kind: "flag"; id: string; present: number; at: Vec } // players within reach of an unset flag changed
  | { kind: "exit"; present: number; at: Vec } // players on the exit changed
  | { kind: "seq"; door: string; result: "ok" | "wrong" | "open"; n: number; at: Vec }
  | { kind: "caught"; by: string; hazard: "guard" | "camera" | "laser" | "station"; seat: Seat } // `by` is the hazard's (or station's) id, `seat` the player it got (or who answered)
  | { kind: "checkpoint"; index: number }
  | { kind: "loot"; id: string; at: Vec }
  | { kind: "clue"; id: string; n: number; at: Vec } // a chime with no picture: it carries a count
  | { kind: "cleared" }
  | {
      kind: "station";
      id: string;
      result: "turn" | "press" | "cut" | "solved" | "wrong" | "jam";
      n?: number;
      practice?: true; // a press while its practice lever is on: it plays and counts for nothing
      at: Vec;
    }
  | { kind: "lever"; id: string; on: boolean; at: Vec } // a practice lever flipped
  | { kind: "gear"; id: string; action: "take" | "drop" | "give" | "sill"; seat: Seat; at: Vec }
  | { kind: "hold"; seat: Seat; leader: Seat | null }
  | { kind: "pull"; leader: Seat; towed: Seat; at: Vec } // a tug of war began between two hand-holders
  | { kind: "bell"; id: string; at: Vec }
  | { kind: "lamp"; id: string; seat: Seat }
  | { kind: "dye"; station: string }
  | { kind: "cache"; id: string; result: "uncover" | "solved" | "taken"; seat: Seat; at: Vec };

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

export function createWorld(room: Room, seed = 1): World {
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
      actHeld: false,
      gearHeld: false,
    };
  };
  const doorOpen: Record<string, boolean> = {};
  const pressed: Record<string, boolean> = {};
  const levers: Record<string, boolean> = {};
  for (const o of room.objects) {
    if (o.kind === "lever") levers[o.id] = false;
    if (o.kind === "door") doorOpen[o.id] = false;
    if (o.kind === "plate") pressed[o.id] = false;
  }
  const players: World["players"] = [spawn(1), spawn(2), spawn(3)];
  const crates = room.objects
    .filter((o) => o.kind === "crate")
    .map((o) => ({ id: o.id, tile: { ...(o.tiles[0] as Vec) } }));
  const loot = room.objects.filter((o) => o.kind === "loot");
  const gear: GearState[] = room.objects
    .filter((o) => o.kind === "gear")
    .map((o) => ({
      id: o.id,
      item: o.params?.item as GearItem,
      at: { ...(o.tiles[0] as Vec) },
      heldBy: null,
      sill: null,
    }));
  const world: World = {
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
    // a cache's stash is worth 1 loot, whatever its item
    lootTotal:
      loot.reduce((sum, o) => sum + lootValue(o.params), 0) +
      room.objects.filter((o) => cacheOf(o) !== null).length,
    checkpoint: 0,
    snapshot: {
      players: players.map((p) => ({ ...p.pos })),
      crates: crates.map((c) => ({ id: c.id, tile: { ...c.tile } })),
      lootTaken: [],
      gear: copyGear(gear),
      cacheUncovered: [],
      cacheBy: {},
      cacheTaken: {},
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
    levers,
    pulling: {},
    status: "playing",
    events: [],
    stations: {},
    gear,
    holding: {},
    seed,
    attempt: 0,
    dyedUntil: 0,
    solvedBy: {},
    cacheUncovered: [],
    cacheBy: {},
    cacheTaken: {},
    syncAt: {},
    jammedUntil: {},
  };
  drawStations(world);
  return world;
}

export const copyGear = (gear: GearState[]): GearState[] =>
  gear.map((g) => ({ ...g, at: g.at && { ...g.at } }));

export function addStamp(world: World, id: Stamp, pos: Vec): void {
  world.stamps.push({ key: `S${world.nextStamp++}`, id, pos: { ...pos }, ageMs: 0 });
}
