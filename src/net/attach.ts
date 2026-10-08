import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import type { Room } from "../game/rooms/format.ts";
import { loadRooms } from "../game/rooms/load.ts";
import { TICK_MS } from "../game/sim/world.ts";
import type { Seat } from "../game/types.ts";
import { anon } from "../lib/requestLog.ts";
import { DEVICE_COOKIE } from "../lib/session.ts";
import { joinThrottle } from "../lib/throttle.ts";
import { createHub } from "./broadcast.ts";
import { normaliseLobbyCode } from "./codes.ts";
import { applyInput, crewOf, type Game, relay, restartGame, startGame, tickGame } from "./game.ts";
import {
  createLobby,
  createRegistry,
  expireIdle,
  joinLobby,
  LobbyError,
  leaveLobby,
  openLobbies,
  setConnected,
  setTeamName,
  startLobby,
} from "./lobbies.ts";
import { type ClientMsg, parseClientMsg } from "./protocol.ts";

const HEARTBEAT_MS = 15_000;
const MAX_MISSED = 2;
const IDLE_LOBBY_MS = 10 * 60_000;
const SWEEP_MS = 60_000;

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
}
const games = new Map<string, Running>(); // lobby code → game

let rooms: Room[] | null = null;
const roomList = (): Room[] => {
  rooms ??= loadRooms();
  return rooms;
};

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
  const { views, cleared } = tickGame(running.game, running.full);
  running.full.clear();
  for (const [seat, view] of views) {
    const who = lobby.seats[seat]?.who;
    if (who) hub.sendTo(who, { t: "view", view });
  }
  if (cleared && running.timer) {
    clearInterval(running.timer);
    running.timer = null;
  }
}

// A game whose lobby is gone stops ticking.
function reapGames(): void {
  for (const [code, running] of games) {
    if (registry.lobbies.has(code)) continue;
    if (running.timer) clearInterval(running.timer);
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

function handle(socket: WebSocket, who: string, msg: ClientMsg): void {
  const { change, send } = hub;
  try {
    switch (msg.t) {
      case "ping":
        send(socket, { t: "pong", at: msg.at });
        return;
      case "lobbies.watch":
        hub.watchers.add(socket);
        send(socket, { t: "lobbies", list: openLobbies(registry) });
        return;
      case "lobby.create":
        change(who, () => createLobby(registry, who, msg.nickname));
        return;
      case "lobby.join": {
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
        change(who, () => joinLobby(registry, code, who, msg.nickname, msg.as));
        return;
      }
      case "lobby.leave":
        change(who, () => leaveLobby(registry, who));
        send(socket, { t: "left" });
        return;
      case "lobby.team":
        change(who, () => setTeamName(registry, who, msg.name));
        return;
      case "lobby.start": {
        const open = registry.lobbies.get(registry.byDevice.get(who) ?? "");
        if (open && games.has(open.code)) return; // already playing
        const lobby = startLobby(registry, who);
        const game = startGame(lobby, roomList());
        games.set(lobby.code, { game, full: new Set([0, 1, 2]), timer: null });
        for (const seat of [0, 1, 2] as const) sendReveal(lobby.code, seat);
        hub.broadcast(lobby);
        return;
      }
      case "ready": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        const seat = code ? seatOfDevice(code, who) : null;
        if (!code || !running || seat === null) return;
        running.game.ready.add(seat);
        runIfReady(code, running);
        return;
      }
      case "room.restart": {
        const code = registry.byDevice.get(who);
        const running = code ? games.get(code) : undefined;
        if (!code || !running) return;
        if (registry.lobbies.get(code)?.host !== who) {
          throw new LobbyError("not-host", "Only the host can do that.");
        }
        restartGame(running.game);
        running.full = new Set([0, 1, 2]);
        runIfReady(code, running);
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
        if (!sent.ok) {
          const wait = sent.until ? Math.ceil((sent.until - Date.now()) / 1000) : 0;
          throw new LobbyError(
            sent.code,
            sent.code === "cooldown"
              ? `Wait ${wait} s before sending that again.`
              : "Your role can't send that.",
          );
        }
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
    if (sockets.size > 0) return;
    hub.socketsOf.delete(who);
    const gone = setConnected(registry, who, false);
    if (gone) hub.broadcast(gone);
  });
  hub.send(socket, { t: "welcome", who });
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
