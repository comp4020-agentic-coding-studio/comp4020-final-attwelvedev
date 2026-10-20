import { createBotMemory } from "../game/bots/brain.ts";
import { type BotSeat, type BotSent, botsAct } from "../game/bots/crew.ts";
import {
  type ChannelMessage,
  type CooldownState,
  cleanText,
  type Outgoing,
  route,
} from "../game/channels.ts";
import { type CrewPick, pickCrew, rolesFor, swapCrew } from "../game/crew.ts";
import { type RoleView, viewFor } from "../game/perception.ts";
import type { Room } from "../game/rooms/format.ts";
import { lineOfSight } from "../game/sim/sight.ts";
import { step } from "../game/sim/step.ts";
import { addStamp, createWorld, TICK_MS, type World } from "../game/sim/world.ts";
import {
  canSend,
  type Method,
  type PlayerInput,
  type Role,
  type Seat,
  type Vec,
} from "../game/types.ts";
import { type LobbyState, MAX_PEOPLE, newPerson, SEAT_SHAPE, seatCrew } from "./lobbies.ts";

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
  forReady?: boolean; // someone was pulled in and must press Ready: no countdown, and Ready ends it
  gone?: boolean; // the person left on purpose, so there is no connection to wait for
}

// The team was caught: by a guard, camera or laser, who it saw, and the checkpoint (0 = the
// start) the team is back at.
export interface Caught {
  hazard: "guard" | "camera" | "laser";
  seat: Seat;
  checkpoint: number;
}

export type VoteKind = "room" | "heist";

// A restart waiting on the people in the room: proposing is a yes, and it ends the moment everyone has
// said yes (it passes) or anyone says no (it is declined). `until` is when it times out.
export interface Vote {
  kind: VoteKind;
  by: Seat;
  until: number;
  yes: Set<Seat>;
  no: Set<Seat>;
}
export const VOTE_MS = 15_000;

export interface Game {
  lobby: string; // code
  roomIndex: number;
  crew: CrewPick; // who plays this room, by person index (null: a bot), and as what
  roles: [Role, Role, Role]; // crew.roles, kept beside it because everything reads it
  world: World;
  ready: Set<Seat>;
  inputs: Partial<Record<Seat, PlayerInput>>;
  startedAt: number;
  cooldowns: CooldownState;
  bots: Partial<Record<Seat, BotSeat>>; // a memory and an inbox for each seat a bot plays
  paused: Paused | null;
  vote: Vote | null;
  vacated: Partial<Record<Seat, string>>; // the device that left a seat a bot now plays, who may take it back
  heistPeople: Map<string, { nickname: string; bot: boolean }>; // everyone who played any room, for the heist record
  counted: number; // the last room whose crew was written to people's `played` (a restart is not a second play)
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
const botSeatsIn = (lobby: LobbyState): Seat[] =>
  ([0, 1, 2] as const).filter((s) => lobby.seats[s]?.bot);

// The caller has already checked that the starter is the host, and startLobby has
// filled the empty seats with bots.
export function startGame(lobby: LobbyState, rooms: Room[]): Game {
  const room = rooms[0];
  if (!room) throw new Error("no rooms loaded");
  const game: Game = {
    lobby: lobby.code,
    roomIndex: 0,
    crew: crewFor(lobby, 0),
    roles: crewFor(lobby, 0).roles,
    world: createWorld(room),
    ready: new Set(),
    inputs: {},
    startedAt: Date.now(),
    cooldowns: { until: {} },
    bots: {},
    paused: null,
    vote: null,
    vacated: {},
    heistPeople: new Map(),
    counted: -1,
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

// Who plays room `roomIndex`. With nobody sitting out, everyone stays where they are (a seat a
// bot took over, or a person coming back to it, keeps its place) and the roles rotate by seat as
// they always have. Otherwise the fair rotation picks (ADR 0013).
function crewFor(lobby: LobbyState, roomIndex: number): CrewPick {
  if (lobby.people.length <= 3 && lobby.sittingOut.length === 0) {
    return { people: lobby.seats.map((s) => s.person), roles: rolesFor(roomIndex) };
  }
  return pickCrew(lobby.people, roomIndex);
}

function setCrew(game: Game, lobby: LobbyState, pick: CrewPick): void {
  game.crew = pick;
  game.roles = pick.roles;
  seatCrew(lobby, pick);
}

// After a cleared room: the next room, with its crew picked and roles rotated, a fresh world,
// and everyone to re-ready. "done" once the last room is cleared (the heist is over).
export function advanceRoom(game: Game, lobby: LobbyState, rooms: Room[]): "next" | "done" {
  const room = rooms[game.roomIndex + 1];
  if (!room) return "done";
  game.roomIndex++;
  setCrew(game, lobby, crewFor(lobby, game.roomIndex));
  game.world = createWorld(room);
  game.ready.clear();
  game.inputs = {};
  game.cooldowns = { until: {} };
  game.startedAt = Date.now();
  seatBots(game, botSeatsIn(lobby));
  return "next";
}

// A person left the lobby, so everyone after them in `people` moves up one place: the crew's
// indexes must follow, and their own seat (a bot has it by now) is nobody's.
export function forgetPerson(game: Game, at: number): void {
  game.crew = {
    ...game.crew,
    people: game.crew.people.map((p) => (p === null || p === at ? null : p > at ? p - 1 : p)),
  };
}

// The host swapped two people at a reveal (by person index): the roles or the seats change, so
// nobody is ready any more and the bots start afresh with who they now play beside.
export function swapPeople(game: Game, lobby: LobbyState, a: number, b: number): void {
  setCrew(game, lobby, swapCrew(game.crew, a, b));
  game.ready.clear();
  seatBots(game, botSeatsIn(lobby));
}

// The room is about to tick for the first time: its crew has played it. Each person's `played`
// grows by their role, and the heist record learns their names. A restart doesn't count again.
export function markPlayed(game: Game, lobby: LobbyState): boolean {
  if (game.counted === game.roomIndex) return false;
  game.counted = game.roomIndex;
  for (const [seat, at] of game.crew.people.entries()) {
    const person = at === null ? undefined : lobby.people[at];
    const role = game.roles[seat] as Role;
    if (person) {
      person.played.push(role);
      game.heistPeople.set(person.who, { nickname: person.nickname, bot: false });
    } else {
      const nickname = `Bot ${SEAT_SHAPE[seat]}`;
      game.heistPeople.set(`bot:${seat}`, { nickname, bot: true });
    }
  }
  return true;
}

// The seats whose vote counts: a connected person. A bot says yes to anything, and a person whose
// connection dropped is waited for by the pause, not by a vote.
export function voters(lobby: LobbyState): Seat[] {
  return ([0, 1, 2] as const).filter((s) => {
    const seat = lobby.seats[s];
    return seat !== undefined && seat.who !== null && !seat.bot && seat.connected;
  });
}

// Where an open vote stands, now that people may have changed: everyone who can vote has said yes,
// or someone said no.
export function settleVote(game: Game, lobby: LobbyState): "passed" | "declined" | "open" {
  const vote = game.vote;
  if (!vote) return "open";
  if (vote.no.size > 0) return "declined";
  return voters(lobby).every((s) => vote.yes.has(s)) ? "passed" : "open";
}

// Opens a vote, the proposer's yes counted. Only one at a time, and not while the game waits for
// someone or a room is being left. "refused" says nothing was opened and nothing was open.
export function proposeVote(
  game: Game,
  lobby: LobbyState,
  seat: Seat,
  kind: VoteKind,
  now: number,
  ms: number = VOTE_MS,
): "passed" | "declined" | "open" | "refused" {
  if (game.vote) return "open"; // one at a time: the proposal is ignored
  if (game.paused) return "refused";
  if (!voters(lobby).includes(seat)) return "refused";
  game.vote = { kind, by: seat, until: now + ms, yes: new Set([seat]), no: new Set() };
  return settleVote(game, lobby);
}

// A person's answer. Someone who has answered already keeps their answer; anyone who isn't a voter
// is ignored.
export function castVote(
  game: Game,
  lobby: LobbyState,
  seat: Seat,
  yes: boolean,
  _now: number,
): "passed" | "declined" | "open" {
  const vote = game.vote;
  if (!vote || !voters(lobby).includes(seat)) return "open";
  if (vote.yes.has(seat) || vote.no.has(seat)) return settleVote(game, lobby);
  (yes ? vote.yes : vote.no).add(seat);
  return settleVote(game, lobby);
}

// The vote is over. A passed one acts: the room restarts, or the heist goes back to room 1 with
// nobody having played yet. Returns what was restarted, or null if nothing was.
export function finishVote(
  game: Game,
  lobby: LobbyState,
  rooms: Room[],
  result: "passed" | "declined" | "timeout",
): VoteKind | null {
  const vote = game.vote;
  game.vote = null;
  if (!vote || result !== "passed") return null;
  if (vote.kind === "room") {
    restartGame(game);
    return "room";
  }
  const first = rooms[0];
  if (!first) return null;
  for (const person of lobby.people) person.played = [];
  game.roomIndex = 0;
  game.heistPeople = new Map();
  game.counted = -1;
  setCrew(game, lobby, crewFor(lobby, 0));
  game.world = createWorld(first);
  game.ready.clear();
  game.inputs = {};
  game.cooldowns = { until: {} };
  game.startedAt = Date.now();
  seatBots(game, botSeatsIn(lobby));
  return "heist";
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

// A person who was sitting out takes a seat that is free now (its person left): the leaver's role,
// the world as it is. The game is held until they press Ready, and the others keep their Ready.
// False if that person isn't sitting out or the seat isn't free.
export function takeOverWithPerson(
  game: Game,
  lobby: LobbyState,
  seat: Seat,
  person: number,
): boolean {
  const who = lobby.people[person]?.who;
  const taken = lobby.seats[seat];
  if (!who || !taken || !lobby.sittingOut.includes(who)) return false;
  const role = game.roles[seat] as Role;
  lobby.seats[seat] = {
    who,
    nickname: lobby.people[person]?.nickname ?? "",
    connected: lobby.people[person]?.connected ?? true,
    bot: false,
    person,
  };
  lobby.sittingOut = lobby.sittingOut.filter((w) => w !== who);
  game.crew.people[seat] = person;
  delete game.vacated[seat];
  delete game.inputs[seat];
  game.ready.delete(seat);
  lobby.people[person]?.played.push(role);
  game.heistPeople.set(who, { nickname: lobby.people[person]?.nickname ?? "", bot: false });
  seatBots(game, botSeatsIn(lobby)); // who is a person has changed
  game.paused = { seat, deadline: Date.now(), choosing: false, forReady: true };
  return true;
}

// The pulled-in person pressed Ready: the game goes on. Any other Ready, or a pause for a dropped
// connection, changes nothing here.
export function readyAgain(game: Game, seat: Seat): boolean {
  if (!game.paused?.forReady || game.paused.seat !== seat) return false;
  game.paused = null;
  game.ready.add(seat);
  return true;
}

// A bot plays the seat from here on: the world is kept as it is, and every bot
// starts its memory afresh, since who is a person has changed.
export function takeOverWithBot(
  game: Game,
  lobby: LobbyState,
  seat: Seat,
  former: string | null = null,
): void {
  if (former) game.vacated[seat] = former;
  game.heistPeople.set(`bot:${seat}`, { nickname: `Bot ${SEAT_SHAPE[seat]}`, bot: true });
  lobby.seats[seat] = {
    who: null,
    nickname: `Bot ${SEAT_SHAPE[seat]}`,
    connected: true,
    bot: true,
    person: null,
  };
  delete game.inputs[seat]; // the person's held key does not walk on
  seatBots(
    game,
    ([0, 1, 2] as const).filter((s) => lobby.seats[s]?.bot),
  );
  if (game.paused?.seat === seat) game.paused = null; // another seat's pause is still on
}

// The person a bot took a seat from is back: the seat is theirs again, the bot steps
// aside and the world is as it was. Null if the seat was never theirs.
export function giveSeatBack(
  game: Game,
  lobby: LobbyState,
  who: string,
  nickname: string,
): Seat | null {
  const seat = ([0, 1, 2] as const).find((s) => game.vacated[s] === who && lobby.seats[s]?.bot);
  if (seat === undefined) return null;
  // they left the lobby when a bot took the seat: they are a person of it again
  let at = lobby.people.findIndex((p) => p.who === who);
  if (at < 0) {
    if (lobby.people.length >= MAX_PEOPLE) return null;
    at = lobby.people.push(newPerson(who, nickname)) - 1;
  }
  lobby.seats[seat] = { who, nickname, connected: true, bot: false, person: at };
  game.crew.people[seat] = at;
  delete game.vacated[seat];
  delete game.inputs[seat];
  seatBots(
    game,
    ([0, 1, 2] as const).filter((s) => lobby.seats[s]?.bot),
  ); // who is a person has changed
  return seat;
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
): { views: Map<Seat, RoleView>; cleared: boolean; sent: BotSent[]; caught: Caught[] } {
  if (game.paused) return { views: new Map(), cleared: false, sent: [], caught: [] };
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
  // who was caught, by what, and where the team went back to: told to everyone
  const caught = game.world.events.flatMap((e) =>
    e.kind === "caught"
      ? [{ hazard: e.hazard, seat: e.seat, checkpoint: game.world.checkpoint }]
      : [],
  );
  return { views, cleared: game.world.status === "cleared", sent: acted.sent, caught };
}

// What a client may ask to send. Text that is empty once cleaned is not a
// message (null). A mark names the tile it goes on; relay checks the sender can
// see it.
export type SendRequest =
  | { method: "callout"; callout: Extract<Outgoing, { method: "callout" }>["callout"] }
  | { method: "text"; text: string }
  | { method: "clip"; clip: string }
  | { method: "face"; id: string }
  | { method: "mark"; id: Extract<Outgoing, { method: "mark" }>["id"]; at: Vec };

export type Relayed =
  | {
      ok: true;
      message: ChannelMessage;
      receivers: Seat[];
      cooldown: { method: Method; until: number } | null;
    }
  | { ok: false; code: "cant-send" | "cooldown" | "not-in-sight"; until?: number }
  | null; // nothing to send

const tenth = (n: number): number => Math.round(n * 10) / 10;

// The only way a channel message leaves the server: through `route`, which
// decides who may send it, who receives it and whether it is too soon. A mark
// also lands in the world, where Can't hear and Can't speak see it fade.
export function relay(
  game: Game,
  lobby: LobbyState,
  from: Seat,
  req: SendRequest,
  now: number,
): Relayed {
  const pos = game.world.players[from].pos;
  let out: Outgoing;
  if (req.method === "text") {
    const text = cleanText(req.text);
    if (text === null) return null;
    out = { method: "text", text };
  } else if (req.method === "mark") {
    // the centre of the floor tile picked, which the sender must be able to see
    // (a role that can't send marks at all is refused first, whatever tile it picked)
    if (!canSend(game.roles[from], "mark")) return { ok: false, code: "cant-send" };
    const at = { x: Math.floor(req.at.x) + 0.5, y: Math.floor(req.at.y) + 0.5 };
    const ch = game.world.room.grid[Math.floor(at.y)]?.[Math.floor(at.x)];
    if (ch === undefined || ch === "#" || ch === "%" || !lineOfSight(game.world, pos, at, false)) {
      return { ok: false, code: "not-in-sight" };
    }
    out = { method: "mark", id: req.id, at };
  } else {
    out = req;
  }
  const result = route(game.roles, from, out, game.cooldowns, now);
  if (!result.ok) return result;
  if (result.cooldownKey) game.cooldowns.until[result.cooldownKey] = result.until;
  if (out.method === "mark") addStamp(game.world, out.id, out.at);
  const message: ChannelMessage = {
    ...out,
    from: {
      seat: from,
      role: game.roles[from],
      nickname: lobby.seats[from]?.nickname ?? "Bot",
      ...(out.method === "face" ? { pos: { x: tenth(pos.x), y: tenth(pos.y) } } : {}),
    },
    sentAt: now,
  };
  // a bot hears what a person sends it, the same as a person would
  for (const receiver of result.receivers) game.bots[receiver]?.inbox.push(message);
  return {
    ok: true,
    message,
    receivers: result.receivers,
    cooldown: result.cooldownKey ? { method: out.method, until: result.until } : null,
  };
}
