import { newLobbyCode } from "./codes.ts";

export type LobbyPhase = "open" | "playing" | "done";
export interface SeatState {
  who: string | null; // device hash (8 hex) or null when empty
  nickname: string | null;
  connected: boolean;
  bot: boolean;
}
export interface LobbyState {
  code: string;
  teamName: string;
  host: string; // device hash
  phase: LobbyPhase;
  seats: [SeatState, SeatState, SeatState];
  spectators: { who: string; nickname: string }[];
}
export interface LobbySummary {
  code: string;
  teamName: string;
  filled: number; // humans seated, 0–3
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
  | "throttled";
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

const emptySeat = (): SeatState => ({ who: null, nickname: null, connected: false, bot: false });
const seatOf = (lobby: LobbyState, who: string): number =>
  lobby.seats.findIndex((s) => s.who === who);
const seatedCount = (lobby: LobbyState): number => lobby.seats.filter((s) => s.who !== null).length;
const squash = (raw: string): string => raw.trim().replace(/\s+/g, " ");

export function cleanNickname(raw: string): string {
  const name = squash(raw).slice(0, MAX_NICKNAME).trim();
  if (!name) throw new LobbyError("bad-nickname", "Pick a nickname.");
  return name;
}

export function createLobby(reg: Registry, who: string, nickname: string): LobbyState {
  const nick = cleanNickname(nickname);
  const own = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  // leaving a lobby you are alone in frees its slot, so it can't make this fail
  const frees = own !== undefined && seatedCount(own) === 1 && seatOf(own, who) >= 0;
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
    seats: [{ who, nickname: nick, connected: true, bot: false }, emptySeat(), emptySeat()],
    spectators: [],
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
  if (seatOf(lobby, who) >= 0) return lobby;
  const watching = lobby.spectators.some((s) => s.who === who);
  if (watching && as === "spectator") return lobby;

  const free = lobby.seats.findIndex((s) => s.who === null);
  if (as === "player" && free < 0) {
    throw new LobbyError("lobby-full", "That lobby is full. You can watch instead.");
  }
  if (watching) lobby.spectators = lobby.spectators.filter((s) => s.who !== who);
  else leaveLobby(reg, who);

  if (as === "player") lobby.seats[free] = { who, nickname: nick, connected: true, bot: false };
  else lobby.spectators.push({ who, nickname: nick });
  reg.byDevice.set(who, code);
  return lobby;
}

function removeLobby(reg: Registry, lobby: LobbyState): void {
  reg.lobbies.delete(lobby.code);
  for (const seat of lobby.seats) if (seat.who) reg.byDevice.delete(seat.who);
  for (const spectator of lobby.spectators) reg.byDevice.delete(spectator.who);
}

// The lobby that changed. If that was the last human, the lobby is gone from
// the registry but is still returned, so the caller can tell its spectators.
export function leaveLobby(reg: Registry, who: string): LobbyState | null {
  const lobby = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  reg.byDevice.delete(who);
  if (!lobby) return null;
  const seat = seatOf(lobby, who);
  if (seat >= 0) lobby.seats[seat] = emptySeat();
  else lobby.spectators = lobby.spectators.filter((s) => s.who !== who);
  if (seatedCount(lobby) === 0) {
    removeLobby(reg, lobby);
    return lobby;
  }
  if (lobby.host === who) lobby.host = lobby.seats.find((s) => s.who !== null)?.who ?? lobby.host;
  return lobby;
}

export function setTeamName(reg: Registry, who: string, name: string): LobbyState {
  const lobby = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  if (!lobby || lobby.host !== who) throw new LobbyError("not-host", "Only the host can do that.");
  const clean = squash(name).slice(0, MAX_TEAM_NAME).trim();
  if (!clean) throw new LobbyError("bad-team-name", "Give the team a name.");
  lobby.teamName = clean;
  return lobby;
}

// Host-only. Marks the lobby as playing so it leaves the open list; the caller
// builds the game (which itself refuses unless three humans are seated).
export function startLobby(reg: Registry, who: string): LobbyState {
  const lobby = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  if (!lobby || lobby.host !== who) throw new LobbyError("not-host", "Only the host can do that.");
  if (seatedCount(lobby) < 3) {
    throw new LobbyError("need-three", "Three players are needed to start. Share the code.");
  }
  lobby.phase = "playing";
  return lobby;
}

export function setConnected(reg: Registry, who: string, connected: boolean): LobbyState | null {
  const lobby = reg.lobbies.get(reg.byDevice.get(who) ?? "");
  const seat = lobby?.seats.find((s) => s.who === who);
  if (!lobby || !seat || seat.connected === connected) return null;
  seat.connected = connected;
  return lobby;
}

// Open to join: waiting for players and with a free seat, newest first.
export function openLobbies(reg: Registry): LobbySummary[] {
  return [...reg.lobbies.values()]
    .filter((l) => l.phase === "open" && seatedCount(l) < 3)
    .reverse()
    .map((l) => ({ code: l.code, teamName: l.teamName, filled: seatedCount(l), phase: l.phase }));
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
    if (lobby.seats.some((s) => s.who !== null && s.connected)) {
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
