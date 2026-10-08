import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { anon } from "../lib/requestLog.ts";
import { DEVICE_COOKIE } from "../lib/session.ts";
import { joinThrottle } from "../lib/throttle.ts";
import { createHub } from "./broadcast.ts";
import { normaliseLobbyCode } from "./codes.ts";
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
        return;
      case "lobby.team":
        change(who, () => setTeamName(registry, who, msg.name));
        return;
    }
  } catch (error) {
    if (!(error instanceof LobbyError)) throw error;
    send(socket, { t: "error", code: error.code, message: error.message });
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
