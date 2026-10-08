import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { type RawData, WebSocket, WebSocketServer } from "ws";
import { anon } from "../lib/requestLog.ts";
import { DEVICE_COOKIE } from "../lib/session.ts";
import { parseClientMsg, type ServerMsg } from "./protocol.ts";

const HEARTBEAT_MS = 15_000;
const MAX_MISSED = 2;

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const missed = new WeakMap<WebSocket, number>();

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

function send(socket: WebSocket, msg: ServerMsg): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
  const token = deviceToken(req);
  if (!token) return socket.close(); // handleUpgrade already refused this; belt and braces
  const who = anon(token);
  missed.set(socket, 0);
  socket.on("pong", () => missed.set(socket, 0));
  socket.on("message", (data: RawData, isBinary: boolean) => {
    missed.set(socket, 0);
    if (isBinary) return;
    const msg = parseClientMsg(data.toString());
    if (msg?.t === "ping") send(socket, { t: "pong", at: msg.at });
  });
  send(socket, { t: "welcome", who });
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
