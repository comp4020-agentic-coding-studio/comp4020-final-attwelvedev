import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { cleanText } from "../game/channels.ts";
import { spectatorView } from "../game/perception.ts";
import type { Room } from "../game/rooms/format.ts";
import { loadRooms } from "../game/rooms/load.ts";
import { DEFAULT_SETUP } from "../game/setup.ts";
import { TICK_MS } from "../game/sim/world.ts";
import type { Role, Seat } from "../game/types.ts";
import { db } from "../lib/db.ts";
import { type GameEvent, lobbyKey, logGame } from "../lib/gameLog.ts";
import { sharedPresence } from "../lib/presence.ts";
import { anon } from "../lib/requestLog.ts";
import { saveRun } from "../lib/runs.ts";
import { DEVICE_COOKIE } from "../lib/session.ts";
import { sharedStats } from "../lib/stats.ts";
import { joinThrottle } from "../lib/throttle.ts";
import { createHub } from "./broadcast.ts";
import { normaliseLobbyCode } from "./codes.ts";
import {
  advanceRoom,
  applyInput,
  castVote,
  chooserFor,
  crewOf,
  finishVote,
  forgetPerson,
  type Game,
  giveSeatBack,
  markPlayed,
  PAUSE_MS,
  pauseFor,
  proposeVote,
  readyAgain,
  relay,
  resumeIfBack,
  settleVote,
  startGame,
  swapPeople,
  takeOverWithBot,
  takeOverWithPerson,
  tickGame,
  VOTE_MS,
  voters,
} from "./game.ts";
import {
  cleanNickname,
  createLobby,
  createRegistry,
  expireIdle,
  joinLobby,
  LobbyError,
  type LobbyState,
  leaveLobby,
  openLobbies,
  reopenLobby,
  setConnected,
  setNickname,
  setOrder,
  setPrivate,
  setSetup,
  setTeamName,
  startLobby,
} from "./lobbies.ts";
import { type ClientMsg, parseClientMsg, type ServerMsg } from "./protocol.ts";
import { type RealLife, realLifeFor } from "./realLife.ts";
import {
  createRateLimiter,
  encodeVoiceOut,
  encodeWatcherVoice,
  parseVoiceFrame,
  voiceReceivers,
} from "./voice.ts";

const HEARTBEAT_MS = 15_000;
const MAX_MISSED = 2;
const IDLE_LOBBY_MS = 10 * 60_000;
const SWEEP_MS = 60_000;
// How long a dropped seat is held. Read once, so a spec can run against a short pause.
const RETURN_MS = 400; // how long a new socket has to show it is a page of the game, not the landing page
const PAUSE_FOR = Number(process.env.PAUSE_MS) > 0 ? Number(process.env.PAUSE_MS) : PAUSE_MS;

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const missed = new WeakMap<WebSocket, number>();
const byes = new WeakMap<WebSocket, () => void>(); // a socket's "this page has gone", run on its bye or its close

const registry = createRegistry();
const hub = createHub(registry, () => roomList().map((r) => r.name));
const idleSince = new Map<string, number>(); // lobby code → first seen with no connected human

// One running game per playing lobby. It ticks once all three seats are ready.
interface Running {
  game: Game;
  full: Set<Seat>; // seats owed a full view (tiles) on the next tick
  timer: ReturnType<typeof setInterval> | null;
  pauseTimer: ReturnType<typeof setTimeout> | null; // the end of a dropped seat's time
  voteTimer: ReturnType<typeof setTimeout> | null; // the end of an open restart vote's time
  // Totalled across rooms as each is cleared, so the heist run saved after
  // room 3 is the whole heist's time and loot, not just the last room's.
  heist: { ms: number; loot: number; lootTotal: number; versions: string[] };
}
const games = new Map<string, Running>(); // lobby code → game
// A watcher's device hash → the seat they follow. Nothing here means the whole room, with no sound.
const spectating = new Map<string, Seat | null>();

let rooms: Room[] | null = null;
const roomList = (): Room[] => {
  rooms ??= loadRooms(process.env.ROOMS_DIR ?? "./rooms"); // ROOMS_DIR: a test seam for fixture rooms
  return rooms;
};

// One game line, keyed to the lobby (never its code). `detail` is redacted by
// logGame, so only allowlisted fields can reach the log.
const record = (
  event: GameEvent,
  who: string | null,
  lobby: LobbyState | undefined,
  detail?: Record<string, unknown>,
): void =>
  logGame({
    event,
    who,
    lobbyKey: lobby ? lobbyKey(lobby.code, lobby.createdAt) : null,
    detail,
  });
const lobbyOf = (who: string): LobbyState | undefined =>
  registry.lobbies.get(registry.byDevice.get(who) ?? "");

sharedStats().setLiveProvider(() => ({
  lobbiesOpen: openLobbies(registry).length,
  gamesPlaying: games.size,
  playersConnected: hub.socketsOf.size,
}));

const seatOfDevice = (code: string, who: string): Seat | null => {
  const at = registry.lobbies.get(code)?.seats.findIndex((s) => s.who === who) ?? -1;
  return at >= 0 ? (at as Seat) : null;
};

// Spectators and the people sitting this room out: everyone who watches instead of plays.
const watchersOf = (lobby: LobbyState): string[] => [
  ...lobby.spectators.map((s) => s.who),
  ...lobby.sittingOut,
];

// What a person's own setup means for them in this room: their role, and the setups of the
// three who play it (a person sitting out has none of their own to apply, so they follow the
// seat they watch).
function realFor(lobby: LobbyState, running: Running, who: string, role: Role): RealLife {
  const setups = running.game.crew.people.flatMap((at) =>
    at === null ? [] : (lobby.people[at]?.setup ?? []),
  );
  const mine = lobby.people.find((p) => p.who === who)?.setup ?? DEFAULT_SETUP;
  return realLifeFor(role, mine, setups);
}

// The in-app voice rule for one seat: off when the whole crew is in one room. A bot has no setup, so
// a crew with a bot in it is not all in one room.
function voiceOn(lobby: LobbyState, running: Running): boolean {
  const { people } = running.game.crew;
  const setups = people.map((at) => (at === null ? undefined : lobby.people[at]?.setup));
  return !setups.every((s) => s?.inRoom === true);
}

function revealFor(lobby: LobbyState, running: Running, role: Role, who: string): ServerMsg {
  const { game } = running;
  return {
    t: "reveal",
    room: game.world.room.id,
    name: game.world.room.name,
    index: game.roomIndex,
    role,
    crew: crewOf(lobby, game),
    rooms: roomList().length,
    sittingOut: lobby.sittingOut.flatMap(
      (w) => lobby.people.find((p) => p.who === w)?.nickname ?? [],
    ),
    played: Object.fromEntries(lobby.people.map((p) => [p.nickname, p.played])),
    real: realFor(lobby, running, who, role),
  };
}

function sendReveal(code: string, seat: Seat): void {
  const lobby = registry.lobbies.get(code);
  const running = games.get(code);
  const who = lobby?.seats[seat]?.who;
  if (!lobby || !running || !who) return;
  hub.sendTo(who, revealFor(lobby, running, running.game.roles[seat] as Role, who));
}

// A watcher never occupies a seat, so it gets the same `reveal` (room, crew and every
// seat's role) for whichever seat it is currently following, instead of its own seat's.
function sendSpectatorReveal(code: string, who: string): void {
  const lobby = registry.lobbies.get(code);
  const running = games.get(code);
  if (!lobby || !running) return;
  const followSeat = spectating.get(who) ?? null;
  // watching the whole room: the reveal still needs a role to show, so it is seat 0's
  const role = running.game.roles[followSeat ?? 0] as Role;
  hub.sendTo(who, revealFor(lobby, running, role, who));
}

// The lobby first, so a page knows whether it has a seat before the reveal says which room.
function announceRoom(code: string): void {
  const lobby = registry.lobbies.get(code);
  if (!lobby) return;
  hub.broadcast(lobby);
  for (const seat of [0, 1, 2] as const) sendReveal(code, seat);
  for (const who of watchersOf(lobby)) sendSpectatorReveal(code, who);
}

// Ticks once all three are ready, and again after a restart of a cleared room.
function runIfReady(code: string, running: Running): void {
  if (running.game.ready.size < 3 || running.timer) return;
  if (running.game.world.status !== "playing") return;
  const lobby = registry.lobbies.get(code);
  if (lobby) markPlayed(running.game, lobby); // from here the crew has played this room
  running.timer = setInterval(() => tick(code), TICK_MS);
}

function tick(code: string): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  if (!running || !lobby) return;
  const { views, cleared, sent, caught } = tickGame(
    running.game,
    running.full,
    Date.now(),
    (seat) => lobby.seats[seat]?.nickname ?? "Bot",
  );
  // a seat owed a full view (the map) is still owed it while the game is paused and sends none
  if (views.size > 0) running.full.clear();
  for (const hit of caught) {
    for (const who of humansOf(lobby)) hub.sendTo(who, { t: "caught", ...hit });
  }
  // what the bots said goes to the people it was sent to; bots are not players, so it is not logged
  for (const said of sent) {
    for (const receiver of said.receivers) {
      const to = lobby.seats[receiver]?.who;
      if (to) hub.sendTo(to, { t: "msg", ...said.message });
    }
  }
  for (const event of running.game.world.events) {
    if (event.kind === "caught") {
      record("caught", null, lobby, { room: running.game.world.room.id, reason: event.by });
    }
  }
  for (const [seat, view] of views) {
    const who = lobby.seats[seat]?.who;
    if (who) hub.sendTo(who, { t: "view", view });
  }
  for (const watcher of watchersOf(lobby)) {
    const followSeat = spectating.get(watcher) ?? null;
    const view = spectatorView(running.game.world, followSeat, running.game.roles, true);
    hub.sendTo(watcher, { t: "view", view });
  }
  if (cleared && running.timer) {
    clearInterval(running.timer);
    running.timer = null;
    const { world } = running.game;
    const roomMs = world.tick * TICK_MS;
    record("room.clear", null, lobby, {
      room: world.room.id,
      ms: Date.now() - running.game.startedAt,
    });
    for (const seat of [0, 1, 2] as const) {
      const who = lobby.seats[seat]?.who;
      if (who) {
        hub.sendTo(who, {
          t: "cleared",
          room: world.room.id,
          ms: roomMs,
          loot: world.loot,
          lootTotal: world.lootTotal,
        });
      }
    }
    const names = lobby.seats.map((s) => ({ nickname: s.nickname ?? "Bot", bot: s.bot }));
    const heistNames = [...running.game.heistPeople.values()];
    saveRun(db, {
      kind: "room",
      roomId: world.room.id,
      version: String(world.room.version),
      teamName: lobby.teamName,
      names,
      ms: roomMs,
      loot: world.loot,
      lootTotal: world.lootTotal,
    });
    record("run.saved", null, lobby, { kind: "room", room: world.room.id });
    running.heist.ms += roomMs;
    running.heist.loot += world.loot;
    running.heist.lootTotal += world.lootTotal;
    running.heist.versions.push(String(world.room.version));
    const lastRoom = !roomList()[running.game.roomIndex + 1];
    if (lastRoom) {
      const heistRun = saveRun(db, {
        kind: "heist",
        roomId: null,
        version: running.heist.versions.join("."),
        teamName: lobby.teamName,
        names: heistNames,
        ms: running.heist.ms,
        loot: running.heist.loot,
        lootTotal: running.heist.lootTotal,
      });
      record("run.saved", null, lobby, { kind: "heist" });
      for (const who of humansOf(lobby)) {
        hub.sendTo(who, {
          t: "heist",
          ms: heistRun.ms,
          loot: heistRun.loot,
          lootTotal: heistRun.lootTotal,
          rank: heistRun.rank,
        });
      }
    }
  }
}

function stopGame(running: Running): void {
  if (running.timer) clearInterval(running.timer);
  if (running.pauseTimer) clearTimeout(running.pauseTimer);
  if (running.voteTimer) clearTimeout(running.voteTimer);
  running.timer = null;
  running.pauseTimer = null;
  running.voteTimer = null;
}

// --- a dropped seat ---------------------------------------------------------

// The people in the lobby who are connected: the ones a pause is shown to.
const humansOf = (lobby: LobbyState): string[] =>
  lobby.seats.flatMap((s) => (s.who && !s.bot ? [s.who] : []));

function pauseMsg(game: Game, lobby: LobbyState): ServerMsg | null {
  const paused = game.paused;
  if (!paused) return null;
  return {
    t: "pause",
    waitingFor: lobby.seats[paused.seat]?.nickname ?? "A player",
    deadline: paused.deadline,
    left: Math.max(0, paused.deadline - Date.now()),
    choosing: paused.choosing,
    ...(paused.forReady ? { forReady: true } : {}),
    ...(paused.gone ? { gone: true } : {}),
  };
}

function announcePause(code: string): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  const msg = running && lobby ? pauseMsg(running.game, lobby) : null;
  if (!msg || !lobby) return;
  for (const who of humansOf(lobby)) hub.sendTo(who, msg);
}

// --- a restart vote ---------------------------------------------------------

// Read once, so a spec can run against a short vote.
const VOTE_FOR = Number(process.env.VOTE_MS) > 0 ? Number(process.env.VOTE_MS) : VOTE_MS;

function voteMsg(game: Game, lobby: LobbyState): ServerMsg | null {
  const vote = game.vote;
  if (!vote) return null;
  return {
    t: "vote",
    kind: vote.kind,
    by: lobby.seats[vote.by]?.nickname ?? "A player",
    left: Math.max(0, vote.until - Date.now()),
    yes: [...vote.yes],
    no: [...vote.no],
    voters: voters(lobby),
  };
}

// Only the people playing hear about a vote: the others watch, and have no say.
function announceVote(code: string): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  const msg = running && lobby ? voteMsg(running.game, lobby) : null;
  if (!msg || !lobby) return;
  for (const who of humansOf(lobby)) hub.sendTo(who, msg);
}

// The vote is over, one way or another. A passed one acts: the room starts again, or the heist
// goes back to its first room's reveal.
function endVote(code: string, result: "passed" | "declined" | "timeout", by?: string): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  const kind = running?.game.vote?.kind;
  if (!running || !lobby || !kind) return;
  if (running.voteTimer) clearTimeout(running.voteTimer);
  running.voteTimer = null;
  const acted = finishVote(running.game, lobby, roomList(), result);
  record("vote.end", null, lobby, { kind, result });
  for (const who of humansOf(lobby)) {
    hub.sendTo(who, { t: "vote.end", kind, result, ...(by ? { by } : {}) });
  }
  if (acted === "room") {
    record("room.start", null, lobby, { room: running.game.world.room.id });
    running.full = new Set([0, 1, 2]);
    runIfReady(code, running); // a cleared room that was restarted has everyone ready already
  } else if (acted === "heist") {
    if (running.timer) clearInterval(running.timer);
    running.timer = null;
    running.heist = { ms: 0, loot: 0, lootTotal: 0, versions: [] };
    running.full = new Set([0, 1, 2]);
    record("room.start", null, lobby, { room: running.game.world.room.id });
    announceRoom(code);
  }
}

// People came or went: an open vote may now be decided by those who are left.
function recheckVote(code: string): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  if (!running || !lobby || !running.game.vote) return;
  const result = settleVote(running.game, lobby);
  if (result === "open") announceVote(code);
  else endVote(code, result);
}

// The game stops for everyone and the seat is held. A second drop while paused
// changes nothing; once the first seat is back, whoever is still away is waited for.
function beginPause(code: string, seat: Seat): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  if (!running || !lobby || running.game.paused) return;
  if (running.game.world.status !== "playing" || lobby.seats[seat]?.bot) return;
  if (running.game.vote) endVote(code, "timeout"); // nobody votes on a game that is waiting for someone
  pauseFor(running.game, seat, Date.now(), PAUSE_FOR);
  record("pause", lobby.seats[seat]?.who ?? null, lobby);
  running.pauseTimer = setTimeout(() => pauseEnds(code), PAUSE_FOR);
  announcePause(code);
}

// The time is up: the host decides (the next person, if the host is the one away).
// If no one is left connected the game is over.
function pauseEnds(code: string): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  const paused = running?.game.paused;
  if (!running || !lobby || !paused) return;
  running.pauseTimer = null;
  if (chooserFor(lobby, paused.seat) === null) {
    giveUp(code);
    return;
  }
  paused.choosing = true;
  hub.broadcast(lobby); // the host may have changed
  announcePause(code);
}

// The game is discarded and the lobby opens again, bots gone and people seated.
function giveUp(code: string): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  if (running) stopGame(running);
  games.delete(code);
  if (lobby) {
    reopenLobby(lobby);
    hub.broadcast(lobby);
  }
}

// A bot plays the seat from now on, and everyone is told: the crew again (a bot where a
// person was), the lobby, and that play goes on if the game was waiting for this seat.
// Used when the host chooses a bot for a seat that stayed away, and when a person leaves.
function botTakesSeat(code: string, seat: Seat, by: string | null, former: string | null): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  if (!running || !lobby) return;
  const away = lobby.seats[seat]?.who ?? null;
  const wasWaitedFor = running.game.paused?.seat === seat;
  takeOverWithBot(running.game, lobby, seat, former ?? away);
  if (away) registry.byDevice.delete(away);
  if (wasWaitedFor) {
    if (running.pauseTimer) clearTimeout(running.pauseTimer);
    running.pauseTimer = null;
  }
  record("bot.takeover", by, lobby);
  for (const s of [0, 1, 2] as const) sendReveal(code, s);
  if (wasWaitedFor)
    for (const person of humansOf(lobby)) hub.sendTo(person, { t: "resume", back: null });
  hub.broadcast(lobby);
  recheckVote(code); // the person who left may have been the one a vote was waiting for
  pauseIfAnyAbsent(code); // someone else may be away too
}

// A person's page is back in the game: if it was paused for them, it goes on; if it is paused
// for someone else, they are told.
function welcomeBack(code: string, who: string): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  const seat = lobby ? seatOfDevice(code, who) : null;
  if (!running || !lobby || seat === null || !running.game.paused) return;
  if (resumeIfBack(running.game, seat)) {
    if (running.pauseTimer) clearTimeout(running.pauseTimer);
    running.pauseTimer = null;
    for (const person of humansOf(lobby)) {
      hub.sendTo(person, { t: "resume", back: lobby.seats[seat]?.nickname ?? "A player" });
    }
    pauseIfAnyAbsent(code); // if someone else is still away, wait for them
  } else {
    const msg = pauseMsg(running.game, lobby);
    if (msg) hub.sendTo(who, msg); // a page that opened mid-pause is told
  }
}

function pauseIfAnyAbsent(code: string): void {
  const lobby = registry.lobbies.get(code);
  const away = lobby?.seats.findIndex((s) => s.who !== null && !s.bot && !s.connected) ?? -1;
  if (away >= 0) beginPause(code, away as Seat);
}

// A game whose lobby is gone stops ticking.
function reapGames(): void {
  for (const [code, running] of games) {
    if (registry.lobbies.has(code)) continue;
    stopGame(running);
    games.delete(code);
  }
}

function deviceToken(req: IncomingMessage): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const at = part.indexOf("=");
    if (part.slice(0, at).trim() !== DEVICE_COOKIE) continue;
    const value = part.slice(at + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }
  return null;
}

// The seat is empty and nobody has a claim on it: the game holds, and the host chooses at once what
// takes it (a bot, someone sitting out, or the lobby), with no countdown. The same question is asked
// when a dropped connection's time is up.
function askHost(code: string, seat: Seat): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  if (!running || !lobby) return;
  if (running.game.vote) endVote(code, "timeout"); // nobody votes on a game that is waiting
  if (running.game.paused) return; // already waiting on someone: that one is asked first
  running.game.paused = { seat, deadline: Date.now(), choosing: true, gone: true };
  record("pause", null, lobby);
  announcePause(code);
}

// A person leaves their lobby, on purpose: pressing Leave, going to the landing page, or
// starting or joining another lobby. In a running game a bot takes their seat at once when nobody
// sits out; otherwise the game holds and the host chooses (A1).
function departs(who: string): void {
  const was = lobbyOf(who);
  const seat = was ? seatOfDevice(was.code, who) : null;
  const at = was?.people.findIndex((p) => p.who === who) ?? -1;
  const name = was?.people.find((p) => p.who === who)?.nickname ?? null;
  hub.change(who, () => leaveLobby(registry, who));
  spectating.delete(who);
  if (was) record("lobby.leave", who, was);
  const running = was ? games.get(was.code) : undefined;
  if (running && at >= 0) forgetPerson(running.game, at); // later people moved up a place
  if (running && was && seat !== null && registry.lobbies.has(was.code)) {
    if (was.sittingOut.length === 0) botTakesSeat(was.code, seat, null, who);
    else {
      // the seat stays empty while the host chooses: the game is held, so nobody needs to stand in it
      running.game.vacated[seat] = who; // so they can be given the seat back if the host picks a bot
      delete running.game.inputs[seat];
      const empty = was.seats[seat];
      if (empty) empty.nickname = name; // the seat keeps their name, so the crew and the pause can say who left
      askHost(was.code, seat);
      for (const s of [0, 1, 2] as const) sendReveal(was.code, s);
    }
  }
}

// In a game, and every page this device has open is the landing page: that is leaving, not a
// dropped connection (a person with the game open in another tab has not left).
function leftForLanding(who: string): boolean {
  const lobby = lobbyOf(who);
  if (!lobby || !games.has(lobby.code) || seatOfDevice(lobby.code, who) === null) return false;
  const open = hub.socketsOf.get(who);
  return open !== undefined && open.size > 0 && [...open].every((s) => hub.watchers.has(s));
}

// Someone asked for a page of the site. The About, Credits and landing pages open no socket (or
// only a watcher), and a lobby's page may be another lobby's, so this is how the server learns a
// person has gone elsewhere. A person's own lobby page, reloaded, is not that: it is a reload.
// A socket closing this soon after such a request is the old page going. Generous on purpose: a slow
// connection (a phone, or the deployed app behind its proxy) can take several seconds to close.
const PAGE_WINDOW_MS = 15_000;
const PAGE_GRACE_MS = 2000; // otherwise the old page needs this long to unload and close its socket
const lastPage = new Map<string, number>(); // device -> when it last asked for a page elsewhere
sharedPresence().onPageView((who, lobbyCode) => {
  const own = lobbyOf(who);
  if (!own) return; // not in a lobby: the pages that lead to joining one are not going elsewhere
  if (lobbyCode !== undefined && normaliseLobbyCode(lobbyCode) === own.code) return;
  lastPage.set(who, Date.now());
  setTimeout(() => {
    const lobby = lobbyOf(who);
    if (!lobby || !games.has(lobby.code) || seatOfDevice(lobby.code, who) === null) return;
    const gamePages = [...(hub.socketsOf.get(who) ?? [])].filter((s) => !hub.watchers.has(s));
    if (gamePages.length === 0) departs(who);
  }, PAGE_GRACE_MS).unref();
});

function handle(socket: WebSocket, who: string, msg: ClientMsg): void {
  const { change, send } = hub;
  let refused = false; // a refused channel message is logged as channel.refused, not lobby.error
  try {
    switch (msg.t) {
      case "ping":
        send(socket, { t: "pong", at: msg.at, serverAt: Date.now() });
        return;
      case "bye":
        byes.get(socket)?.();
        return;
      case "lobbies.watch":
        hub.watchers.add(socket);
        if (leftForLanding(who)) departs(who);
        send(socket, { t: "lobbies", list: openLobbies(registry) });
        return;
      case "lobby.create": {
        const current = lobbyOf(who);
        if (current && games.has(current.code)) departs(who); // a seat in a game is left properly
        change(who, () => createLobby(registry, who, msg.nickname));
        record("lobby.create", who, lobbyOf(who));
        return;
      }
      case "lobby.join": {
        // Joining another lobby, whether or not it exists, is leaving this one.
        const wanted = normaliseLobbyCode(msg.code);
        const here = lobbyOf(who);
        if (here && here.code !== wanted) departs(who);
        if (joinThrottle.blocked(who)) {
          throw new LobbyError("throttled", "Too many wrong codes. Try again in a minute.");
        }
        const code = normaliseLobbyCode(msg.code);
        if (!code || !registry.lobbies.has(code)) {
          joinThrottle.fail(who);
          const shown = (code ?? msg.code.trim().toUpperCase()).slice(0, 8);
          throw new LobbyError(
            "lobby-not-found",
            `No lobby with code ${shown}. Check the letters.`,
          );
        }
        // someone a bot took a seat from, coming back to the lobby's code, has the seat back
        const running = games.get(code);
        const target = registry.lobbies.get(code);
        if (msg.as === "player" && running && target) {
          const nick = cleanNickname(msg.nickname);
          let seat: Seat | null = null;
          change(who, () => {
            if (registry.byDevice.get(who) !== code) leaveLobby(registry, who);
            else target.spectators = target.spectators.filter((s) => s.who !== who);
            seat = giveSeatBack(running.game, target, who, nick);
            if (seat !== null) registry.byDevice.set(who, code);
            return seat !== null ? target : joinLobby(registry, code, who, msg.nickname, msg.as);
          });
          if (seat !== null) {
            running.full.add(seat); // their first view carries the map
            for (const s of [0, 1, 2] as const) sendReveal(code, s); // the crew is a person again
            record("lobby.join", who, target, { kind: "rejoin" });
            return;
          }
        } else {
          change(who, () => joinLobby(registry, code, who, msg.nickname, msg.as));
        }
        record("lobby.join", who, lobbyOf(who), { kind: msg.as });
        // a spectator joining a game already running needs the crew's roles,
        // same as a reconnecting player does: their next view arrives from
        // the next tick regardless, since tick() reads lobby.spectators fresh
        if (games.has(code) && (msg.as === "spectator" || lobbyOf(who)?.sittingOut.includes(who))) {
          sendSpectatorReveal(code, who);
        }
        return;
      }
      case "lobby.leave": {
        departs(who);
        send(socket, { t: "left" });
        return;
      }
      case "lobby.team":
        change(who, () => setTeamName(registry, who, msg.name));
        return;
      case "lobby.nickname":
        change(who, () => setNickname(registry, who, msg.nickname));
        record("lobby.nickname", who, lobbyOf(who));
        return;
      case "lobby.private":
        change(who, () => setPrivate(registry, who, msg.on));
        record("lobby.private", who, lobbyOf(who), { kind: msg.on ? "on" : "off" });
        return;
      case "lobby.order":
        change(who, () => setOrder(registry, who, msg.order));
        record("lobby.order", who, lobbyOf(who));
        return;
      case "lobby.setup":
        change(who, () => setSetup(registry, who, msg.setup));
        record("lobby.setup", who, lobbyOf(who));
        return;
      case "lobby.start": {
        const open = registry.lobbies.get(registry.byDevice.get(who) ?? "");
        if (open && games.has(open.code)) return; // already playing
        const lobby = startLobby(registry, who);
        const game = startGame(lobby, roomList());
        games.set(lobby.code, {
          game,
          full: new Set([0, 1, 2]),
          timer: null,
          pauseTimer: null,
          voteTimer: null,
          heist: { ms: 0, loot: 0, lootTotal: 0, versions: [] },
        });
        announceRoom(lobby.code);
        record("game.start", who, lobby, { bots: lobby.seats.filter((s) => s.bot).length });
        record("room.start", null, lobby, { room: game.world.room.id });
        return;
      }
      case "ready": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const seat = code ? seatOfDevice(code, who) : null;
        if (!code || !running || seat === null) return;
        if (running.game.paused) {
          // the one pulled in pressing Ready is what the game was held for; anyone else's is not asked for
          const lobby = registry.lobbies.get(code);
          if (lobby && readyAgain(running.game, seat)) {
            for (const person of humansOf(lobby)) {
              hub.sendTo(person, { t: "resume", back: lobby.seats[seat]?.nickname ?? "A player" });
            }
          }
          return;
        }
        running.game.ready.add(seat);
        runIfReady(code, running);
        return;
      }
      case "vote.propose": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const lobby = code ? registry.lobbies.get(code) : undefined;
        const seat = code ? seatOfDevice(code, who) : null;
        if (!code || !running || !lobby || seat === null || running.game.vote) return; // one at a time
        const result = proposeVote(running.game, lobby, seat, msg.kind, Date.now(), VOTE_FOR);
        if (result === "refused") return;
        record("vote.propose", who, lobby, { kind: msg.kind });
        if (result === "open") {
          running.voteTimer = setTimeout(() => endVote(code, "timeout"), VOTE_FOR);
          announceVote(code);
        } else endVote(code, "passed"); // the only person in the room: nobody else to ask
        return;
      }
      case "vote.cast": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const lobby = code ? registry.lobbies.get(code) : undefined;
        const seat = code ? seatOfDevice(code, who) : null;
        if (!code || !running || !lobby || seat === null || !running.game.vote) return;
        const result = castVote(running.game, lobby, seat, msg.yes, Date.now());
        if (result === "open") announceVote(code);
        else
          endVote(
            code,
            result,
            result === "declined" ? (lobby.seats[seat]?.nickname ?? undefined) : undefined,
          );
        return;
      }
      case "next": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const lobby = code ? registry.lobbies.get(code) : undefined;
        if (!code || !running || !lobby || running.game.paused) return;
        if (lobby.host !== who) throw new LobbyError("not-host", "Only the host can do that.");
        if (running.game.world.status !== "cleared") return;
        if (running.game.vote) endVote(code, "timeout"); // a vote about the room just left
        if (advanceRoom(running.game, lobby, roomList()) === "done") return;
        running.full = new Set([0, 1, 2]);
        announceRoom(code);
        record("room.start", who, lobby, { room: running.game.world.room.id });
        return;
      }
      case "crew.swap": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const lobby = code ? registry.lobbies.get(code) : undefined;
        if (!code || !running || !lobby || running.game.paused) return;
        if (lobby.host !== who) throw new LobbyError("not-host", "Only the host can do that.");
        // only while a reveal is up: the room has not started ticking, and is not a cleared one
        const { game } = running;
        const known = (i: number) => i < lobby.people.length;
        if (game.counted >= game.roomIndex || game.world.status !== "playing") return;
        if (!known(msg.a) || !known(msg.b)) return;
        swapPeople(game, lobby, msg.a, msg.b);
        running.full = new Set([0, 1, 2]);
        announceRoom(code);
        record("crew.swap", who, lobby);
        return;
      }
      case "host.choice": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const lobby = code ? registry.lobbies.get(code) : undefined;
        const paused = running?.game.paused;
        if (!code || !running || !lobby || !paused?.choosing) return; // not asked yet
        if (lobby.host !== who) throw new LobbyError("not-host", "Only the host can do that.");
        if (msg.choice === "lobby") {
          giveUp(code);
          return;
        }
        if (msg.choice === "pull") {
          const person = msg.person ?? -1;
          if (!takeOverWithPerson(running.game, lobby, paused.seat, person)) return; // not someone sitting out
          if (running.pauseTimer) clearTimeout(running.pauseTimer);
          running.pauseTimer = null;
          record("host.pull", who, lobby);
          running.full.add(paused.seat); // their first view carries the map
          hub.broadcast(lobby);
          announceRoom(code);
          announcePause(code); // everyone is told the game is waiting for them to be ready
          return;
        }
        botTakesSeat(code, paused.seat, who, null);
        return;
      }
      case "spectate": {
        const code = registry.byDevice.get(who);
        const lobby = code ? registry.lobbies.get(code) : undefined;
        if (!code || !lobby || !watchersOf(lobby).includes(who)) return;
        spectating.set(who, msg.seat); // null: the whole room, with no sound
        sendSpectatorReveal(code, who); // the newly followed seat's role
        return;
      }
      case "spec.say": {
        // only watchers speak here, and only to each other: a player's text goes by the wheel
        const code = registry.byDevice.get(who);
        const lobby = code ? registry.lobbies.get(code) : undefined;
        if (!code || !lobby || !watchersOf(lobby).includes(who)) return;
        const text = cleanText(msg.text);
        const nickname =
          lobby.spectators.find((s) => s.who === who)?.nickname ??
          lobby.people.find((p) => p.who === who)?.nickname;
        if (!text || !nickname) return;
        if (!specLimit.allow(who, Date.now())) return; // one line a second per person
        const out: ServerMsg = { t: "spec.msg", nickname, text, at: Date.now() };
        for (const watcher of watchersOf(lobby)) hub.sendTo(watcher, out);
        record("spec.say", who, lobby); // that they spoke, never what
        return;
      }
      case "send": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const lobby = code ? registry.lobbies.get(code) : undefined;
        const seat = code ? seatOfDevice(code, who) : null;
        if (!running || !lobby) return;
        if (seat === null) {
          if (lobby.spectators.some((s) => s.who === who)) {
            throw new LobbyError("cant-send", "Spectators can't send.");
          }
          return;
        }
        const sent = relay(running.game, lobby, seat, msg.msg, Date.now());
        if (sent === null) return;
        const method = msg.msg.method;
        if (!sent.ok) {
          record("channel.refused", who, lobby, { method, reason: sent.code });
          refused = true;
          const wait = sent.until ? Math.ceil((sent.until - Date.now()) / 1000) : 0;
          throw new LobbyError(
            sent.code,
            sent.code === "cooldown"
              ? `Wait ${wait} s before sending that again.`
              : sent.code === "not-in-sight"
                ? "Not in sight."
                : "Your role can't send that.",
          );
        }
        // the method and role, never what was said or picked
        record("channel.send", who, lobby, { method, role: sent.message.from.role });
        for (const receiver of sent.receivers) {
          const to = lobby.seats[receiver]?.who;
          if (to) hub.sendTo(to, { t: "msg", ...sent.message });
        }
        for (const watcher of watchersOf(lobby)) {
          const followSeat = spectating.get(watcher) ?? null;
          if (followSeat !== null && sent.receivers.includes(followSeat)) {
            hub.sendTo(watcher, { t: "msg", ...sent.message });
          }
        }
        if (sent.cooldown) send(socket, { t: "cooldown", ...sent.cooldown });
        return;
      }
      case "voice.stats": {
        const code = registry.byDevice.get(who);
        const seat = code ? seatOfDevice(code, who) : null;
        if (seat === null) return;
        record("voice.latency", who, lobbyOf(who), {
          p50: msg.p50,
          p95: msg.p95,
          dropped: msg.dropped,
        });
        return;
      }
      case "input": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const seat = code ? seatOfDevice(code, who) : null;
        if (!running || seat === null) return;
        applyInput(running.game, seat, { seq: msg.seq, move: msg.move, act: msg.act });
        return;
      }
    }
  } catch (error) {
    if (!(error instanceof LobbyError)) throw error;
    if (!refused) record("lobby.error", who, lobbyOf(who), { reason: error.code });
    send(socket, { t: "error", code: error.code, message: error.message });
  } finally {
    reapGames();
  }
}

const voiceLimit = createRateLimiter();
// Watchers' chat: one line a second per person, so a watcher can't flood the others.
const specLimit = {
  last: new Map<string, number>(),
  allow(who: string, now: number): boolean {
    const before = this.last.get(who);
    if (before !== undefined && now - before < 1000) return false;
    this.last.set(who, now);
    return true;
  },
};

// A voice frame, parsed, checked and then handed on. From a seat, it goes to the seats that may hear
// voice and to watchers following them (0x01, with the seat). From a watcher, it goes to the other
// watchers only (0x02, with the watcher's place in the list), never to a player. Rate limited per
// device, so one lobby's talker can't use up another's budget. Never logged, never kept.
function relayVoice(socket: WebSocket, who: string, data: Uint8Array): void {
  const code = registry.byDevice.get(who);
  const running = code ? games.get(code) : undefined;
  const lobby = code ? registry.lobbies.get(code) : undefined;
  if (!running || !lobby) return;
  const seat = code ? seatOfDevice(code, who) : null;
  const watchers = watchersOf(lobby);
  if (seat === null && !watchers.includes(who)) return;
  if (running.game.paused && seat !== null) return;
  const frame = parseVoiceFrame(data);
  if (!frame) return;
  const to = new Set<string>();
  let out: Uint8Array;
  if (seat === null) {
    if (!voiceLimit.allow(who, Date.now())) return;
    out = encodeWatcherVoice(watchers.indexOf(who), frame);
    for (const watcher of watchers) if (watcher !== who) to.add(watcher);
  } else {
    const receivers = voiceReceivers(running.game.roles, seat, voiceOn(lobby, running));
    if (receivers === null) {
      record("channel.refused", who, lobby, { method: "voice", reason: "cant-send" });
      hub.send(socket, { t: "error", code: "cant-send", message: "Your role can't send voice." });
      return;
    }
    if (!voiceLimit.allow(who, Date.now())) return;
    out = encodeVoiceOut(seat, frame);
    for (const receiver of receivers) {
      const device = lobby.seats[receiver]?.who;
      if (device) to.add(device);
    }
    for (const watcher of watchers) {
      const following = spectating.get(watcher) ?? null;
      if (following !== null && receivers.includes(following)) to.add(watcher);
    }
  }
  for (const device of to) {
    for (const s of hub.socketsOf.get(device) ?? []) {
      if (s.readyState === s.OPEN && !hub.watchers.has(s)) s.send(out, { binary: true });
    }
  }
}

wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
  const token = deviceToken(req);
  if (!token) return socket.close(); // handleUpgrade already refused this; belt and braces
  const who = anon(token);
  missed.set(socket, 0);
  const sockets = hub.socketsOf.get(who) ?? new Set<WebSocket>();
  sockets.add(socket);
  hub.socketsOf.set(who, sockets);
  const back = setConnected(registry, who, true);
  if (back) hub.broadcast(back);
  // A device coming back to a game in progress is told its role again and gets
  // a full view next tick, so a reload or a dropped connection resumes in place.
  const code = registry.byDevice.get(who);
  const seat = code ? seatOfDevice(code, who) : null;
  const resumed = code ? games.get(code) : undefined;
  if (code && seat === null && resumed && registry.lobbies.get(code)?.sittingOut.includes(who)) {
    sendSpectatorReveal(code, who); // a page reloaded while sitting this room out
  }
  if (code && seat !== null && resumed) {
    // The new page counts its inputs from 1, so the old input (and its seq) must
    // go, or every new input looks stale. It also stops a held key walking on.
    delete resumed.game.inputs[seat];
    resumed.full.add(seat);
    sendReveal(code, seat);
    const lobbyNow = registry.lobbies.get(code);
    const open = lobbyNow ? voteMsg(resumed.game, lobbyNow) : null;
    if (open) hub.sendTo(who, open); // a page that opened mid-vote is told
    // Back, or only the landing page opening a socket? A page says which within moments (the
    // landing page asks to watch the lobby list), so the game is only resumed after that.
    setTimeout(() => {
      if (socket.readyState === socket.OPEN && !hub.watchers.has(socket)) welcomeBack(code, who);
    }, RETURN_MS);
  }

  socket.on("pong", () => missed.set(socket, 0));
  socket.on("message", (data: RawData, isBinary: boolean) => {
    missed.set(socket, 0);
    if (isBinary) {
      relayVoice(socket, who, new Uint8Array(data as Buffer));
      return;
    }
    const msg = parseClientMsg(data.toString());
    if (msg) handle(socket, who, msg);
  });
  // This page has gone: it said bye, or its socket closed (whichever comes first; a close can take
  // seconds to arrive over a real network, a bye is just a message). Only the first counts.
  let gone = false;
  const pageGone = () => {
    if (gone) return;
    gone = true;
    hub.watchers.delete(socket);
    sockets.delete(socket);
    record("socket.close", who, lobbyOf(who));
    if (sockets.size > 0) {
      // another page of this device is still open: if all that is left is the landing page (which
      // opened, and asked to watch, before this game page had finished closing), this is leaving
      if (leftForLanding(who)) departs(who);
      return;
    }
    hub.socketsOf.delete(who);
    const away = setConnected(registry, who, false);
    if (away) hub.broadcast(away);
    // a seated person's last connection dropped mid-room: the game waits for them
    const code = away?.code;
    const seat = code ? seatOfDevice(code, who) : null;
    if (code && seat !== null) {
      // The page asked for was another page: this is the old page going, not a dropped connection
      const wentElsewhere = Date.now() - (lastPage.get(who) ?? 0) < PAGE_WINDOW_MS;
      if (wentElsewhere && games.has(code)) {
        lastPage.delete(who);
        departs(who);
        return;
      }
      beginPause(code, seat);
      // a host who drops while the choice is theirs passes it on
      const paused = games.get(code)?.game.paused;
      if (paused?.choosing && away?.host === who) pauseEnds(code);
    }
  };
  byes.set(socket, pageGone);
  socket.on("close", pageGone);
  hub.send(socket, { t: "welcome", who });
  record("socket.open", who, lobbyOf(who));
});

// Server pings every 15 s and drops a socket that misses two in a row, so a
// phone that walked out of Wi-Fi doesn't hold a seat forever.
setInterval(() => {
  for (const socket of wss.clients) {
    const count = missed.get(socket) ?? 0;
    if (count >= MAX_MISSED) {
      socket.terminate();
      continue;
    }
    missed.set(socket, count + 1);
    socket.ping();
  }
}, HEARTBEAT_MS).unref();

// A lobby nobody is connected to for 10 minutes is removed.
setInterval(() => {
  for (const lobby of expireIdle(registry, idleSince, Date.now(), IDLE_LOBBY_MS))
    hub.broadcast(lobby);
  reapGames();
  voiceLimit.sweep(Date.now()); // forget devices that have gone quiet, so these maps stay small
  for (const [who, at] of specLimit.last) if (Date.now() - at >= 1000) specLimit.last.delete(who);
}, SWEEP_MS).unref();

// Only /ws is ours; any other upgrade (Vite's HMR socket in dev) is left alone.
export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  if (new URL(req.url ?? "/", "http://localhost").pathname !== "/ws") return;
  if (!deviceToken(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
}

export function attachSockets(server: Server): void {
  server.on("upgrade", handleUpgrade);
}
