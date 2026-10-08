import {
  type ChannelMessage,
  type CooldownState,
  cleanText,
  type Outgoing,
  route,
} from "../game/channels.ts";
import { type RoleView, viewFor } from "../game/perception.ts";
import type { Room } from "../game/rooms/format.ts";
import { step } from "../game/sim/step.ts";
import { addStamp, createWorld, TICK_MS, type World } from "../game/sim/world.ts";
import { type Family, type PlayerInput, ROLES, type Role, type Seat } from "../game/types.ts";
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
  cooldowns: CooldownState;
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
    cooldowns: { until: {} },
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

// After a cleared room: the next room, with roles rotated so each seat plays
// each role once over three rooms, a fresh world, and everyone to re-ready.
// "done" once the last room is cleared (the heist is over).
export function advanceRoom(game: Game, rooms: Room[]): "next" | "done" {
  const room = rooms[game.roomIndex + 1];
  if (!room) return "done";
  game.roomIndex++;
  game.roles = rolesFor(game.roomIndex);
  game.world = createWorld(room);
  game.ready.clear();
  game.inputs = {};
  game.cooldowns = { until: {} };
  game.startedAt = Date.now();
  return "next";
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

// What a client may ask to send. A stamp has no position here: the server puts it
// at the sender's tile. Text that is empty once cleaned is not a message (null).
export type ChannelRequest =
  | { t: "say"; kind: "callout"; callout: Extract<Outgoing, { kind: "callout" }>["callout"] }
  | { t: "say"; kind: "text"; text: string }
  | { t: "sound"; clip: string }
  | { t: "show"; kind: "face"; id: string }
  | { t: "show"; kind: "stamp"; id: Extract<Outgoing, { kind: "stamp" }>["id"] };

export type Relayed =
  | {
      ok: true;
      message: ChannelMessage;
      receivers: Seat[];
      cooldown: { family: Family; until: number; stamp?: true } | null;
    }
  | { ok: false; code: "cant-send" | "cooldown"; until?: number }
  | null; // nothing to send

// The only way a channel message leaves the server: through `route`, which
// decides who may send it, who receives it and whether it is too soon. A
// stamp also lands in the world, where Can't hear and Can't speak see it fade.
export function relay(
  game: Game,
  lobby: LobbyState,
  from: Seat,
  req: ChannelRequest,
  now: number,
): Relayed {
  const pos = game.world.players[from].pos;
  let out: Outgoing;
  if (req.t === "say") {
    if (req.kind === "callout") {
      out = { family: "say", kind: "callout", callout: req.callout };
    } else {
      const text = cleanText(req.text);
      if (text === null) return null;
      out = { family: "say", kind: "text", text };
    }
  } else if (req.t === "sound") {
    out = { family: "sound", clip: req.clip };
  } else if (req.kind === "face") {
    out = { family: "show", kind: "face", id: req.id };
  } else {
    const at = { x: Math.floor(pos.x) + 0.5, y: Math.floor(pos.y) + 0.5 };
    out = { family: "show", kind: "stamp", id: req.id, at };
  }
  const result = route(game.roles, from, out, game.cooldowns, now);
  if (!result.ok) return result;
  if (result.cooldownKey) game.cooldowns.until[result.cooldownKey] = result.until;
  if (out.family === "show" && out.kind === "stamp") addStamp(game.world, out.id, out.at);
  const stamp = out.family === "show" && out.kind === "stamp";
  return {
    ok: true,
    message: {
      ...out,
      from: { seat: from, role: game.roles[from], nickname: lobby.seats[from]?.nickname ?? "Bot" },
      sentAt: now,
    },
    receivers: result.receivers,
    cooldown: result.cooldownKey
      ? { family: out.family, until: result.until, ...(stamp ? { stamp: true as const } : {}) }
      : null,
  };
}
