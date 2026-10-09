import { createBotMemory } from "../game/bots/brain.ts";
import { type BotSeat, type BotSent, botsAct } from "../game/bots/crew.ts";
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
import { type LobbyState, SEAT_SHAPE } from "./lobbies.ts";

export interface CrewMember {
  seat: Seat;
  nickname: string;
  role: Role;
  bot: boolean;
}

// A dropped seat holds the game for this long before the host chooses what to do.
export const PAUSE_MS = 45_000;

// The game is paused for `seat`, who has until `deadline` (ms since epoch) to come back.
// `choosing` is true once the time is up and the host decides: a bot, or back to the lobby.
export interface Paused {
  seat: Seat;
  deadline: number;
  choosing: boolean;
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
  bots: Partial<Record<Seat, BotSeat>>; // a memory and an inbox for each seat a bot plays
  paused: Paused | null;
}

// Seat i gets ROLES[(i + roomIndex) % 3], so everyone plays every role across three rooms.
export function rolesFor(roomIndex: number): [Role, Role, Role] {
  const role = (seat: number): Role => ROLES[(seat + roomIndex) % 3] as Role;
  return [role(0), role(1), role(2)];
}

// Bots start afresh with each room: their memory is of that room and these roles.
// A bot is always ready.
function seatBots(game: Game, botSeats: readonly Seat[]): void {
  const humans = new Set<Seat>(([0, 1, 2] as const).filter((s) => !botSeats.includes(s)));
  game.bots = {};
  for (const seat of botSeats) {
    game.bots[seat] = { memory: createBotMemory(seat, humans, game.roles), inbox: [] };
    game.ready.add(seat);
  }
}
const botSeatsOf = (game: Game): Seat[] => ([0, 1, 2] as const).filter((s) => game.bots[s]);

// The caller has already checked that the starter is the host, and startLobby has
// filled the empty seats with bots.
export function startGame(lobby: LobbyState, rooms: Room[]): Game {
  const room = rooms[0];
  if (!room) throw new Error("no rooms loaded");
  const game: Game = {
    lobby: lobby.code,
    roomIndex: 0,
    roles: rolesFor(0),
    world: createWorld(room),
    ready: new Set(),
    inputs: {},
    startedAt: Date.now(),
    cooldowns: { until: {} },
    bots: {},
    paused: null,
  };
  seatBots(
    game,
    ([0, 1, 2] as const).filter((s) => lobby.seats[s]?.bot),
  );
  return game;
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
  const botSeats = botSeatsOf(game);
  game.roomIndex++;
  game.roles = rolesFor(game.roomIndex);
  game.world = createWorld(room);
  game.ready.clear();
  game.inputs = {};
  game.cooldowns = { until: {} };
  game.startedAt = Date.now();
  seatBots(game, botSeats);
  return "next";
}

// A fresh world for the same room: everyone back at spawn, crates and doors
// reset, held inputs dropped. Roles and who is ready stay as they are.
export function restartGame(game: Game): void {
  game.world = createWorld(game.world.room);
  game.inputs = {};
  game.startedAt = Date.now();
  seatBots(game, botSeatsOf(game));
}

export function crewOf(lobby: LobbyState, game: Game): CrewMember[] {
  return lobby.seats.map((s, i) => ({
    seat: i as Seat,
    nickname: s.nickname ?? "Bot",
    role: game.roles[i] as Role,
    bot: s.bot,
  }));
}

// A seat's last connection dropped: the game stops for everyone and the seat is
// held. A second drop while paused changes nothing: the first seat is waited for.
export function pauseFor(game: Game, seat: Seat, now: number, ms: number = PAUSE_MS): void {
  if (game.paused) return;
  game.paused = { seat, deadline: now + ms, choosing: false };
}

// The seat is back, in time or not: the game goes on, if it was waiting for them.
export function resumeIfBack(game: Game, seat: Seat): boolean {
  if (game.paused?.seat !== seat) return false;
  game.paused = null;
  return true;
}

// Who may choose once the time is up: the host, or if the host is the one missing
// (or has dropped too) the next connected person, who becomes host. Null when no
// person is left connected, and the game is over.
export function chooserFor(lobby: LobbyState, missing: Seat): string | null {
  const present = (i: number) => {
    const seat = lobby.seats[i];
    return i !== missing && seat !== undefined && seat.who !== null && !seat.bot && seat.connected;
  };
  const hostSeat = lobby.seats.findIndex((s) => s.who === lobby.host);
  if (hostSeat >= 0 && present(hostSeat)) return lobby.host;
  const next = [0, 1, 2].find(present);
  const who = next === undefined ? null : (lobby.seats[next]?.who ?? null);
  if (who) lobby.host = who;
  return who;
}

// A bot plays the seat from here on: the world is kept as it is, and every bot
// starts its memory afresh, since who is a person has changed.
export function takeOverWithBot(game: Game, lobby: LobbyState, seat: Seat): void {
  lobby.seats[seat] = {
    who: null,
    nickname: `Bot ${SEAT_SHAPE[seat]}`,
    connected: true,
    bot: true,
  };
  delete game.inputs[seat]; // the person's held key does not walk on
  seatBots(
    game,
    ([0, 1, 2] as const).filter((s) => lobby.seats[s]?.bot),
  );
  game.paused = null;
}

// One 50 ms step, then a view per seat. `full` names the seats owed a full
// view (the first after the reveal or a reconnect), the only ones sent tiles.
// Before the step each bot thinks and sets its seat's input; `sent` is what the
// bots said (through `route`, like anyone), for the caller to pass on to the
// people it was sent to. `nickname` is how a bot's messages are signed.
export function tickGame(
  game: Game,
  full: ReadonlySet<Seat> = new Set(),
  now: number = Date.now(),
  nickname: (seat: Seat) => string = () => "Bot",
): { views: Map<Seat, RoleView>; cleared: boolean; sent: BotSent[] } {
  if (game.paused) return { views: new Map(), cleared: false, sent: [] };
  const acted = botsAct(
    game.world.room,
    game.world,
    game.roles,
    game.bots,
    game.cooldowns,
    now,
    nickname,
  );
  for (const seat of botSeatsOf(game)) {
    const input = acted.inputs[seat];
    if (input) applyInput(game, seat, input);
  }
  step(game.world, game.inputs, TICK_MS);
  const views = new Map<Seat, RoleView>();
  for (const seat of [0, 1, 2] as const) {
    views.set(seat, viewFor(game.world, seat, game.roles[seat], full.has(seat)));
  }
  return { views, cleared: game.world.status === "cleared", sent: acted.sent };
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
  const message = {
    ...out,
    from: { seat: from, role: game.roles[from], nickname: lobby.seats[from]?.nickname ?? "Bot" },
    sentAt: now,
  } as ChannelMessage;
  // a bot hears what a person sends it, the same as a person would
  for (const receiver of result.receivers) game.bots[receiver]?.inbox.push(message);
  return {
    ok: true,
    message,
    receivers: result.receivers,
    cooldown: result.cooldownKey
      ? { family: out.family, until: result.until, ...(stamp ? { stamp: true as const } : {}) }
      : null,
  };
}
