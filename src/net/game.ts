import { type RoleView, viewFor } from "../game/perception.ts";
import type { Room } from "../game/rooms/format.ts";
import { step } from "../game/sim/step.ts";
import { createWorld, TICK_MS, type World } from "../game/sim/world.ts";
import { type PlayerInput, ROLES, type Role, type Seat } from "../game/types.ts";
import { LobbyError, type LobbyState } from "./lobbies.ts";

export interface CrewMember {
  seat: Seat;
  nickname: string;
  role: Role;
  bot: boolean;
}

export interface Game {
  lobby: string; // code
  roomIndex: number;
  roles: [Role, Role, Role];
  world: World;
  ready: Set<Seat>;
  inputs: Partial<Record<Seat, PlayerInput>>;
  startedAt: number;
}

// Seat i gets ROLES[(i + roomIndex) % 3], so everyone plays every role across three rooms.
export function rolesFor(roomIndex: number): [Role, Role, Role] {
  const role = (seat: number): Role => ROLES[(seat + roomIndex) % 3] as Role;
  return [role(0), role(1), role(2)];
}

// The caller has already checked that the starter is the host.
export function startGame(lobby: LobbyState, rooms: Room[]): Game {
  if (lobby.seats.some((s) => s.who === null)) {
    throw new LobbyError("need-three", "Three players are needed to start. Share the code.");
  }
  const room = rooms[0];
  if (!room) throw new Error("no rooms loaded");
  return {
    lobby: lobby.code,
    roomIndex: 0,
    roles: rolesFor(0),
    world: createWorld(room),
    ready: new Set(),
    inputs: {},
    startedAt: Date.now(),
  };
}

// An input is held until the next one arrives. A lower seq than the last is a
// reordered or replayed frame: dropped, so the avatar never jumps back.
export function applyInput(game: Game, seat: Seat, input: PlayerInput): boolean {
  const last = game.inputs[seat]?.seq ?? Number.NEGATIVE_INFINITY;
  if (input.seq < last) return false;
  game.inputs[seat] = input;
  return true;
}

// A fresh world for the same room: everyone back at spawn, crates and doors
// reset, held inputs dropped. Roles and who is ready stay as they are.
export function restartGame(game: Game): void {
  game.world = createWorld(game.world.room);
  game.inputs = {};
  game.startedAt = Date.now();
}

export function crewOf(lobby: LobbyState, game: Game): CrewMember[] {
  return lobby.seats.map((s, i) => ({
    seat: i as Seat,
    nickname: s.nickname ?? "Bot",
    role: game.roles[i] as Role,
    bot: s.bot,
  }));
}

// One 50 ms step, then a view per seat. `full` names the seats owed a full
// view (the first after the reveal or a reconnect), the only ones sent tiles.
export function tickGame(
  game: Game,
  full: ReadonlySet<Seat> = new Set(),
): { views: Map<Seat, RoleView>; cleared: boolean } {
  step(game.world, game.inputs, TICK_MS);
  const views = new Map<Seat, RoleView>();
  for (const seat of [0, 1, 2] as const) {
    views.set(seat, viewFor(game.world, seat, game.roles[seat], full.has(seat)));
  }
  return { views, cleared: game.world.status === "cleared" };
}
