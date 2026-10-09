import WebSocket from "ws";

export interface Socket {
  send(msg: unknown): void;
  next<T = { t: string }>(t: string, timeoutMs?: number): Promise<T>; // resolves on the next message of type t (default 2000 ms)
  close(): Promise<void>;
  drop(): Promise<void>; // closes the connection without leaving the lobby, like a lost signal or a reload
  unload(): Promise<void>; // what a page does as it goes away: says bye, then closes (the close itself can take seconds over a real network)
}

// A device cookie the way a browser would get one: from the first page view.
async function freshCookie(baseUrl: string): Promise<string> {
  const res = await fetch(new URL("/", baseUrl));
  const pair = res.headers.getSetCookie()[0]?.split(";")[0];
  if (!pair) throw new Error("GET / did not set a device cookie");
  return pair;
}

const CLOSE_WAIT_MS = 1500;

export const wsUrl = (baseUrl: string): string => {
  const url = new URL("/ws", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
};

// Messages are queued from the moment the socket opens, so one that arrives
// before `next` is called is not lost.
export async function connect(baseUrl: string, cookie?: string): Promise<Socket> {
  const socket = new WebSocket(wsUrl(baseUrl), {
    headers: { cookie: cookie ?? (await freshCookie(baseUrl)) },
  });
  const queue: { t: string }[] = [];
  const waiting: (() => void)[] = [];
  socket.on("message", (data, isBinary) => {
    if (isBinary) return;
    queue.push(JSON.parse(data.toString()));
    for (const wake of waiting.splice(0)) wake();
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
    socket.once("unexpected-response", (_req, res) =>
      reject(new Error(`upgrade refused: HTTP ${res.statusCode}`)),
    );
  });

  // Closes the connection: whatever is said first, then a polite close, then, if the other end has
  // not answered in CLOSE_WAIT_MS, the connection is dropped. Over a real network a close can take
  // 5-30 s to be answered (the deployed app's proxy), and no spec should wait on that.
  const goAway = (first: () => void) =>
    new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) return resolve();
      const timer = setTimeout(() => {
        socket.terminate();
        resolve();
      }, CLOSE_WAIT_MS);
      socket.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      first();
      socket.close();
    });

  return {
    send: (msg) => socket.send(JSON.stringify(msg)),
    async next<T>(t: string, timeoutMs = 2000): Promise<T> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const at = queue.findIndex((m) => m.t === t);
        if (at >= 0) return queue.splice(at, 1)[0] as T;
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`no "${t}" message within ${timeoutMs} ms`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, left);
          waiting.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
    unload: () => goAway(() => socket.send(JSON.stringify({ t: "bye" }))),
    drop: () => goAway(() => {}),
    // leaves any lobby first, so a spec's lobbies don't linger and fill the server
    close: () => goAway(() => socket.send(JSON.stringify({ t: "lobby.leave" }))),
  };
}
