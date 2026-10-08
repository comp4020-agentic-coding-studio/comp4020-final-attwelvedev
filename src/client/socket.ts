import type { ClientMsg, ServerMsg } from "../net/protocol.ts";

export type ConnectionState = "connecting" | "live" | "weak" | "offline";

export interface GameSocket {
  send(msg: ClientMsg): void;
  on<T extends ServerMsg["t"]>(t: T, fn: (msg: Extract<ServerMsg, { t: T }>) => void): () => void;
  onState(fn: (state: ConnectionState, rttMs: number | null) => void): () => void;
  close(): void;
}

// What openSocket needs from a WebSocket, so a test can stand one in.
interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
}

const OPEN = 1;
const BACKOFF_FIRST_MS = 500;
const BACKOFF_MAX_MS = 5000;
const PING_MS = 2000;
const WEAK_ABOVE_MS = 250;

const defaultUrl = (): string =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

// A socket to /ws that reconnects by itself (0.5 s, doubling to 5 s) and pings
// every 2 s, so the UI can say "Live", "Weak 300 ms" or "Offline" truthfully.
// Messages sent while it is not open are dropped: the page re-sends what it
// needs when the state goes back to live, so there is no stale queue to replay.
export function openSocket(
  url: string = defaultUrl(),
  options: { WebSocketImpl?: new (url: string) => SocketLike } = {},
): GameSocket {
  const Impl = options.WebSocketImpl ?? (WebSocket as unknown as new (url: string) => SocketLike);
  const handlers = new Map<string, Set<(msg: never) => void>>();
  const stateFns = new Set<(state: ConnectionState, rttMs: number | null) => void>();
  let ws: SocketLike | null = null;
  let state: ConnectionState = "connecting";
  let rtt: number | null = null;
  let backoff = BACKOFF_FIRST_MS;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let pinger: ReturnType<typeof setInterval> | undefined;

  const setState = (next: ConnectionState, nextRtt: number | null): void => {
    if (next === state && nextRtt === rtt) return;
    state = next;
    rtt = nextRtt;
    for (const fn of stateFns) fn(state, rtt);
  };

  function connect(): void {
    setState("connecting", null);
    const socket = new Impl(url);
    ws = socket;
    socket.onopen = () => {
      backoff = BACKOFF_FIRST_MS;
      setState("live", null);
      pinger = setInterval(() => {
        if (socket.readyState === OPEN) socket.send(JSON.stringify({ t: "ping", at: Date.now() }));
      }, PING_MS);
    };
    socket.onmessage = (event) => {
      let msg: { t?: unknown; at?: unknown };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (typeof msg !== "object" || msg === null || typeof msg.t !== "string") return;
      if (msg.t === "pong" && typeof msg.at === "number") {
        const ms = Date.now() - msg.at;
        setState(ms > WEAK_ABOVE_MS ? "weak" : "live", ms);
      }
      for (const fn of handlers.get(msg.t) ?? []) fn(msg as never);
    };
    socket.onclose = () => {
      clearInterval(pinger);
      if (ws !== socket || stopped) return;
      setState("offline", null);
      retry = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
    };
  }
  connect();

  return {
    send(msg) {
      if (ws?.readyState === OPEN) ws.send(JSON.stringify(msg));
    },
    on(t, fn) {
      const set = handlers.get(t) ?? new Set();
      set.add(fn as (msg: never) => void);
      handlers.set(t, set);
      return () => set.delete(fn as (msg: never) => void);
    },
    onState(fn) {
      stateFns.add(fn);
      fn(state, rtt);
      return () => stateFns.delete(fn);
    },
    close() {
      stopped = true;
      clearTimeout(retry);
      clearInterval(pinger);
      ws?.close();
    },
  };
}
