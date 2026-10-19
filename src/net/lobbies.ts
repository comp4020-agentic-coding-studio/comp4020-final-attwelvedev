import { type CrewPick, pickCrew } from "../game/crew.ts";
import { DEFAULT_SETUP, type Setup } from "../game/setup.ts";
import type { Role } from "../game/types.ts";
import { isAllowedName } from "../lib/names.ts";
import { newLobbyCode } from "./codes.ts";

export type LobbyPhase = "open" | "playing" | "done";
export interface SeatState {
  who: string | null; // device hash (8 hex) or null when empty
  nickname: string | null;
  connected: boolean;
  bot: boolean;
  person: number | null; // index into LobbyState.people, null for a bot or an empty seat
}
export { DEFAULT_SETUP, type Setup };
export interface Person {
  who: string; // device hash
  nickname: string;
  connected: boolean;
  setup: Setup;
  played: Role[]; // roles played this heist, in order
}
export const MAX_PEOPLE = 6;
export interface LobbyState {
  code: string;
  teamName: string;
  host: string; // device hash
  phase: LobbyPhase;
  private: boolean; // kept off the open list; its code still joins
  people: Person[]; // in the host's starting order
  seats: [SeatState, SeatState, SeatState]; // this room's crew; empty seats until start
  sittingOut: string[]; // device hashes of people not in this room's crew
  spectators: { who: string; nickname: string }[]; // watch-only joiners
  createdAt: number; // ms since epoch; with the code, the basis of the lobby's log key
}
export interface LobbySummary {
  code: string;
  teamName: string;
  filled: number; // people in the lobby, 0–6
  phase: LobbyPhase;
}
export type ErrorCode =
  | "lobby-not-found"
  | "lobby-full"
  | "server-full"
  | "bad-nickname"
  | "bad-team-name"
  | "not-host"
  | "need-three"
  | "bad-order"
  | "throttled"
  | "cooldown"
  | "cant-send"
  | "not-in-sight"; // a mark on a tile the sender can't see
export class LobbyError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
export interface Registry {
  lobbies: Map<string, LobbyState>;
  byDevice: Map<string, string>; // device hash → lobby code
}

export const MAX_LOBBIES = 40;
const MAX_NICKNAME = 16;
const MAX_TEAM_NAME = 24;

// Everything here is plain data in and out so it runs without sockets: each
// function says which lobby changed and the caller (attach.ts) broadcasts it.

export function createRegistry(): Registry {
  return { lobbies: new Map(), byDevice: new Map() };
}

const emptySeat = (): SeatState => ({
  who: null,
  nickname: null,
  connected: false,
  bot: false,
  person: null,
});
const personOf = (lobby: LobbyState, who: string): number =>
  lobby.people.findIndex((p) => p.who === who);
const squash = (raw: string): string => raw.trim().replace(/\s+/g, " ");

export function cleanNickname(raw: string): string {
  const name = squash(raw).slice(0, MAX_NICKNAME).trim();
  if (!name) throw new LobbyError("bad-nickname", "Pick a nickname.");
  if (!isAllowedName(name)) throw new LobbyError("bad-nickname", "Pick a different nickname.");
  return name;
}

// A nickname no one else in the lobby has: a duplicate gets " 2", " 3"…, the name cut so
// the whole still fits. `except` is the person being renamed, who is not their own duplicate.
export function uniqueNickname(people: readonly { nickname: string }[], nick: string, except = -1) {
  const taken = new Set(people.flatMap((p, i) => (i === except ? [] : [p.nickname.toLowerCase()])));
  if (!taken.has(nick.toLowerCase())) return nick;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = `${nick.slice(0, MAX_NICKNAME - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export const newPerson = (who: string, nickname: string): Person => ({
  who,
  nickname,
  connected: true,
  setup: { ...DEFAULT_SETUP },
  played: [],
});

export function createLobby(reg: Registry, who: string, nickname: string): LobbyState {
  const nick = cleanNickname(nickname);
  const own = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  // leaving a lobby you are alone in frees its slot, so it can't make this fail
  const frees = own !== undefined && own.people.length === 1 && personOf(own, who) >= 0;
  if (reg.lobbies.size >= MAX_LOBBIES && !frees) {
    throw new LobbyError("server-full", "Server is full. Try again in a minute.");
  }
  leaveLobby(reg, who);
  const code = newLobbyCode((c) => reg.lobbies.has(c));
  const lobby: LobbyState = {
    code,
    teamName: `Team ${code}`,
    host: who,
    phase: "open",
    private: false,
    people: [newPerson(who, nick)],
    seats: [emptySeat(), emptySeat(), emptySeat()],
    sittingOut: [],
    spectators: [],
    createdAt: Date.now(),
  };
  reg.lobbies.set(code, lobby);
  reg.byDevice.set(who, code);
  return lobby;
}

export function joinLobby(
  reg: Registry,
  code: string,
  who: string,
  nickname: string,
  as: "player" | "spectator",
): LobbyState {
  const nick = cleanNickname(nickname);
  const lobby = reg.lobbies.get(code);
  if (!lobby)
    throw new LobbyError("lobby-not-found", `No lobby with code ${code}. Check the letters.`);

  // the same device again is a rejoin: it keeps what it had
  if (personOf(lobby, who) >= 0) return lobby;
  const watching = lobby.spectators.some((s) => s.who === who);
  if (watching && as === "spectator") return lobby;

  // once started, a place is only the one a bot took from someone, which attach.ts hands back
  if (as === "player" && (lobby.phase !== "open" || lobby.people.length >= MAX_PEOPLE)) {
    throw new LobbyError("lobby-full", "That lobby is full. You can watch instead.");
  }
  if (watching) lobby.spectators = lobby.spectators.filter((s) => s.who !== who);
  else leaveLobby(reg, who);

  if (as === "player") lobby.people.push(newPerson(who, uniqueNickname(lobby.people, nick)));
  else lobby.spectators.push({ who, nickname: nick });
  reg.byDevice.set(who, code);
  return lobby;
}

function removeLobby(reg: Registry, lobby: LobbyState): void {
  reg.lobbies.delete(lobby.code);
  for (const person of lobby.people) reg.byDevice.delete(person.who);
  for (const spectator of lobby.spectators) reg.byDevice.delete(spectator.who);
}

// The lobby that changed. If that was the last human, the lobby is gone from
// the registry but is still returned, so the caller can tell its spectators.
export function leaveLobby(reg: Registry, who: string): LobbyState | null {
  const lobby = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  reg.byDevice.delete(who);
  if (!lobby) return null;
  const at = personOf(lobby, who);
  if (at >= 0) {
    lobby.people.splice(at, 1);
    // seats name people by index, so the ones after the leaver move up by one
    lobby.seats.forEach((seat, i) => {
      if (seat.who === who) lobby.seats[i] = emptySeat();
      else if (seat.person !== null && seat.person > at) seat.person -= 1;
    });
    lobby.sittingOut = lobby.sittingOut.filter((w) => w !== who);
  } else lobby.spectators = lobby.spectators.filter((s) => s.who !== who);
  if (lobby.people.length === 0) {
    removeLobby(reg, lobby);
    return lobby;
  }
  if (lobby.host === who) lobby.host = lobby.people[0]?.who ?? lobby.host;
  return lobby;
}

export function setTeamName(reg: Registry, who: string, name: string): LobbyState {
  const lobby = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  if (!lobby || lobby.host !== who) throw new LobbyError("not-host", "Only the host can do that.");
  const clean = squash(name).slice(0, MAX_TEAM_NAME).trim();
  if (!clean) throw new LobbyError("bad-team-name", "Give the team a name.");
  if (!isAllowedName(clean)) throw new LobbyError("bad-team-name", "Pick a different team name.");
  lobby.teamName = clean;
  return lobby;
}

const lobbyOfHost = (reg: Registry, who: string): LobbyState => {
  const lobby = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  if (!lobby || lobby.host !== who) throw new LobbyError("not-host", "Only the host can do that.");
  return lobby;
};

// Anyone in the lobby, person or watcher, may change their own name.
export function setNickname(reg: Registry, who: string, raw: string): LobbyState {
  const lobby = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  if (!lobby) throw new LobbyError("lobby-not-found", "You are not in a lobby.");
  const nick = cleanNickname(raw);
  const at = personOf(lobby, who);
  if (at >= 0) {
    const person = lobby.people[at] as Person;
    person.nickname = uniqueNickname(lobby.people, nick, at);
    const seat = lobby.seats.find((s) => s.who === who);
    if (seat) seat.nickname = person.nickname;
  } else {
    const watcher = lobby.spectators.find((s) => s.who === who);
    if (watcher) watcher.nickname = nick;
  }
  return lobby;
}

export function setPrivate(reg: Registry, who: string, on: boolean): LobbyState {
  const lobby = lobbyOfHost(reg, who);
  lobby.private = on;
  return lobby;
}

// `order[i]` is the index of the person who goes in place i: a permutation of the people.
export function setOrder(reg: Registry, who: string, order: readonly number[]): LobbyState {
  const lobby = lobbyOfHost(reg, who);
  const n = lobby.people.length;
  const valid =
    lobby.phase === "open" &&
    order.length === n &&
    new Set(order).size === n &&
    order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
  if (!valid) throw new LobbyError("bad-order", "That order doesn't list everyone once.");
  lobby.people = order.map((i) => lobby.people[i] as Person);
  return lobby;
}

// A person's own answers about how they are playing in real life. Answering at all marks them
// set up; it never gates Start.
export function setSetup(reg: Registry, who: string, setup: Setup): LobbyState {
  const lobby = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  const person = lobby?.people.find((p) => p.who === who);
  if (!lobby || !person) throw new LobbyError("lobby-not-found", "You are not in a lobby.");
  person.setup = { ...setup, done: true };
  return lobby;
}

// Seat shapes name the seat, not the role (roles rotate between rooms).
export const SEAT_SHAPE = ["circle", "square", "triangle"] as const;

// Writes a room's crew into the seats: the people it names sit, a bot fills any seat it leaves
// to nobody, and everyone else sits out and watches.
export function seatCrew(lobby: LobbyState, pick: CrewPick): void {
  lobby.seats = [0, 1, 2].map((i) => {
    const at = pick.people[i];
    const person = at === null || at === undefined ? undefined : lobby.people[at];
    return person
      ? {
          who: person.who,
          nickname: person.nickname,
          connected: person.connected,
          bot: false,
          person: at ?? null,
        }
      : { who: null, nickname: `Bot ${SEAT_SHAPE[i]}`, connected: true, bot: true, person: null };
  }) as LobbyState["seats"];
  const seated = new Set(lobby.seats.map((s) => s.who));
  lobby.sittingOut = lobby.people.filter((p) => !seated.has(p.who)).map((p) => p.who);
}

// Host-only. Marks the lobby as playing so it leaves the open list and seats the first room's
// crew, bots filling what is left (FR4); the caller builds the game.
export function startLobby(reg: Registry, who: string): LobbyState {
  const lobby = lobbyOfHost(reg, who);
  seatCrew(lobby, pickCrew(lobby.people, 0));
  lobby.phase = "playing";
  return lobby;
}

export function setConnected(reg: Registry, who: string, connected: boolean): LobbyState | null {
  const lobby = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  const person = lobby?.people.find((p) => p.who === who);
  if (!lobby || !person || person.connected === connected) return null;
  person.connected = connected;
  const seat = lobby.seats.find((s) => s.who === who);
  if (seat) seat.connected = connected;
  return lobby;
}

// Open to join: waiting for people, not private and with room for another, newest first.
export function openLobbies(reg: Registry): LobbySummary[] {
  return [...reg.lobbies.values()]
    .filter((l) => l.phase === "open" && !l.private && l.people.length < MAX_PEOPLE)
    .reverse()
    .map((l) => ({ code: l.code, teamName: l.teamName, filled: l.people.length, phase: l.phase }));
}

// A lobby with no connected human for `ttlMs` is removed. `since` is the
// caller's memory of when each lobby was first seen empty.
export function expireIdle(
  reg: Registry,
  since: Map<string, number>,
  now: number,
  ttlMs: number,
): LobbyState[] {
  const expired: LobbyState[] = [];
  for (const lobby of [...reg.lobbies.values()]) {
    if (lobby.people.some((p) => p.connected)) {
      since.delete(lobby.code);
      continue;
    }
    const first = since.get(lobby.code) ?? now;
    since.set(lobby.code, first);
    if (now - first >= ttlMs) {
      removeLobby(reg, lobby);
      since.delete(lobby.code);
      expired.push(lobby);
    }
  }
  return expired;
}

// The game was given up on (the host chose the lobby, or nobody was left): the seats are
// cleared, the people stay (their heist starts over) and the lobby is open for a fresh Start.
export function reopenLobby(lobby: LobbyState): LobbyState {
  lobby.seats = [emptySeat(), emptySeat(), emptySeat()];
  lobby.sittingOut = [];
  for (const person of lobby.people) person.played = [];
  lobby.phase = "open";
  return lobby;
}
