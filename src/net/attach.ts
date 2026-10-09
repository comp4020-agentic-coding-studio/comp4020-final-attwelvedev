import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import type { Room } from "../game/rooms/format.ts";
import { loadRooms } from "../game/rooms/load.ts";
import { TICK_MS } from "../game/sim/world.ts";
import type { Seat } from "../game/types.ts";
import { type GameEvent, lobbyKey, logGame } from "../lib/gameLog.ts";
import { sharedPresence } from "../lib/presence.ts";
import { anon } from "../lib/requestLog.ts";
import { DEVICE_COOKIE } from "../lib/session.ts";
import { sharedStats } from "../lib/stats.ts";
import { joinThrottle } from "../lib/throttle.ts";
import { createHub } from "./broadcast.ts";
import { normaliseLobbyCode } from "./codes.ts";
import {
  advanceRoom,
  applyInput,
  chooserFor,
  crewOf,
  type Game,
  giveSeatBack,
  PAUSE_MS,
  pauseFor,
  relay,
  restartGame,
  resumeIfBack,
  startGame,
  takeOverWithBot,
  tickGame,
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
  setTeamName,
  startLobby,
} from "./lobbies.ts";
import { type ClientMsg, parseClientMsg, type ServerMsg } from "./protocol.ts";

const HEARTBEAT_MS = 15_000;
const MAX_MISSED = 2;
const IDLE_LOBBY_MS = 10 * 60_000;
const SWEEP_MS = 60_000;
// How long a dropped seat is held. Read once, so a spec can run against a short pause.
const RETURN_MS = 400; // how long a new socket has to show it is a page of the game, not the landing page
const PAUSE_FOR = Number(process.env.PAUSE_MS) > 0 ? Number(process.env.PAUSE_MS) : PAUSE_MS;

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const missed = new WeakMap<WebSocket, number>();

const registry = createRegistry();
const hub = createHub(registry);
const idleSince = new Map<string, number>(); // lobby code → first seen with no connected human

// One running game per playing lobby. It ticks once all three seats are ready.
interface Running {
  game: Game;
  full: Set<Seat>; // seats owed a full view (tiles) on the next tick
  timer: ReturnType<typeof setInterval> | null;
  pauseTimer: ReturnType<typeof setTimeout> | null; // the end of a dropped seat's time
}
const games = new Map<string, Running>(); // lobby code → game

let rooms: Room[] | null = null;
const roomList = (): Room[] => {
  rooms ??= loadRooms();
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

function sendReveal(code: string, seat: Seat): void {
  const lobby = registry.lobbies.get(code);
  const running = games.get(code);
  const who = lobby?.seats[seat]?.who;
  if (!lobby || !running || !who) return;
  hub.sendTo(who, {
    t: "reveal",
    room: running.game.world.room.id,
    name: running.game.world.room.name,
    index: running.game.roomIndex,
    role: running.game.roles[seat] as (typeof running.game.roles)[number],
    crew: crewOf(lobby, running.game),
  });
}

// Ticks once all three are ready, and again after a restart of a cleared room.
function runIfReady(code: string, running: Running): void {
  if (running.game.ready.size < 3 || running.timer) return;
  if (running.game.world.status !== "playing") return;
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
  if (cleared && running.timer) {
    clearInterval(running.timer);
    running.timer = null;
    const { world } = running.game;
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
          ms: world.tick * TICK_MS,
          loot: world.loot,
          lootTotal: world.lootTotal,
        });
      }
    }
  }
}

function stopGame(running: Running): void {
  if (running.timer) clearInterval(running.timer);
  if (running.pauseTimer) clearTimeout(running.pauseTimer);
  running.timer = null;
  running.pauseTimer = null;
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
  };
}

function announcePause(code: string): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  const msg = running && lobby ? pauseMsg(running.game, lobby) : null;
  if (!msg || !lobby) return;
  for (const who of humansOf(lobby)) hub.sendTo(who, msg);
}

// The game stops for everyone and the seat is held. A second drop while paused
// changes nothing; once the first seat is back, whoever is still away is waited for.
function beginPause(code: string, seat: Seat): void {
  const running = games.get(code);
  const lobby = registry.lobbies.get(code);
  if (!running || !lobby || running.game.paused) return;
  if (running.game.world.status !== "playing" || lobby.seats[seat]?.bot) return;
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

// A person leaves their lobby, on purpose: pressing Leave, going to the landing page, or
// starting or joining another lobby. In a running game a bot takes their seat at once.
function departs(who: string): void {
  const was = lobbyOf(who);
  const seat = was ? seatOfDevice(was.code, who) : null;
  hub.change(who, () => leaveLobby(registry, who));
  if (was) record("lobby.leave", who, was);
  if (was && seat !== null && games.has(was.code) && registry.lobbies.has(was.code)) {
    botTakesSeat(was.code, seat, null, who);
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
        send(socket, { t: "pong", at: msg.at });
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
      case "lobby.start": {
        const open = registry.lobbies.get(registry.byDevice.get(who) ?? "");
        if (open && games.has(open.code)) return; // already playing
        const lobby = startLobby(registry, who);
        const game = startGame(lobby, roomList());
        games.set(lobby.code, { game, full: new Set([0, 1, 2]), timer: null, pauseTimer: null });
        for (const seat of [0, 1, 2] as const) sendReveal(lobby.code, seat);
        hub.broadcast(lobby);
        record("game.start", who, lobby, { bots: lobby.seats.filter((s) => s.bot).length });
        record("room.start", null, lobby, { room: game.world.room.id });
        return;
      }
      case "ready": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const seat = code ? seatOfDevice(code, who) : null;
        if (!code || !running || seat === null || running.game.paused) return;
        running.game.ready.add(seat);
        runIfReady(code, running);
        return;
      }
      case "room.restart": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        if (!code || !running || running.game.paused) return;
        if (registry.lobbies.get(code)?.host !== who) {
          throw new LobbyError("not-host", "Only the host can do that.");
        }
        restartGame(running.game);
        record("room.start", who, registry.lobbies.get(code), { room: running.game.world.room.id });
        running.full = new Set([0, 1, 2]);
        runIfReady(code, running);
        return;
      }
      case "next": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const lobby = code ? registry.lobbies.get(code) : undefined;
        if (!code || !running || !lobby || running.game.paused) return;
        if (lobby.host !== who) throw new LobbyError("not-host", "Only the host can do that.");
        if (running.game.world.status !== "cleared") return;
        if (advanceRoom(running.game, roomList()) === "done") return;
        running.full = new Set([0, 1, 2]);
        for (const seat of [0, 1, 2] as const) sendReveal(code, seat);
        record("room.start", who, lobby, { room: running.game.world.room.id });
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
        botTakesSeat(code, paused.seat, who, null);
        return;
      }
      case "say":
      case "sound":
      case "show": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const lobby = code ? registry.lobbies.get(code) : undefined;
        const seat = code ? seatOfDevice(code, who) : null;
        if (!running || !lobby || seat === null) return;
        const sent = relay(running.game, lobby, seat, msg, Date.now());
        if (sent === null) return;
        const family = msg.t;
        if (!sent.ok) {
          record("channel.refused", who, lobby, { family, reason: sent.code });
          refused = true;
          const wait = sent.until ? Math.ceil((sent.until - Date.now()) / 1000) : 0;
          throw new LobbyError(
            sent.code,
            sent.code === "cooldown"
              ? `Wait ${wait} s before sending that again.`
              : "Your role can't send that.",
          );
        }
        record("channel.send", who, lobby, {
          family,
          role: sent.message.from.role,
          // the kind of thing sent, never what it said
          kind: "kind" in sent.message ? sent.message.kind : "clip",
        });
        for (const receiver of sent.receivers) {
          const to = lobby.seats[receiver]?.who;
          if (to) hub.sendTo(to, { t: "msg", ...sent.message });
        }
        if (sent.cooldown) send(socket, { t: "cooldown", ...sent.cooldown });
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
  if (code && seat !== null && resumed) {
    // The new page counts its inputs from 1, so the old input (and its seq) must
    // go, or every new input looks stale. It also stops a held key walking on.
    delete resumed.game.inputs[seat];
    resumed.full.add(seat);
    sendReveal(code, seat);
    // Back, or only the landing page opening a socket? A page says which within moments (the
    // landing page asks to watch the lobby list), so the game is only resumed after that.
    setTimeout(() => {
      if (socket.readyState === socket.OPEN && !hub.watchers.has(socket)) welcomeBack(code, who);
    }, RETURN_MS);
  }

  socket.on("pong", () => missed.set(socket, 0));
  socket.on("message", (data: RawData, isBinary: boolean) => {
    missed.set(socket, 0);
    if (isBinary) return;
    const msg = parseClientMsg(data.toString());
    if (msg) handle(socket, who, msg);
  });
  socket.on("close", () => {
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
    const gone = setConnected(registry, who, false);
    if (gone) hub.broadcast(gone);
    // a seated person's last connection dropped mid-room: the game waits for them
    const code = gone?.code;
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
      if (paused?.choosing && gone?.host === who) pauseEnds(code);
    }
  });
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
