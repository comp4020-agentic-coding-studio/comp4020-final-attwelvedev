import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ConnectionState, openSocket } from "./socket.ts";

// A stand-in for the browser's WebSocket that the test drives by hand.
class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  send(data: string | Uint8Array) {
    this.sent.push(data as string);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  deliver(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const open = () => openSocket("ws://test/ws", { WebSocketImpl: FakeSocket });
const last = () => FakeSocket.instances[FakeSocket.instances.length - 1] as FakeSocket;

// consecutive repeats collapsed: "live" with a new RTT is still one step
function trackStates(sock: ReturnType<typeof open>) {
  const seen: { state: ConnectionState; rtt: number | null }[] = [];
  sock.onState((state, rtt) => seen.push({ state, rtt }));
  return {
    seen,
    names: () => seen.map((s) => s.state).filter((s, i, all) => s !== all[i - 1]),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
});
afterEach(() => vi.useRealTimers());

describe("openSocket", () => {
  it("goes connecting → live → offline → connecting", () => {
    const sock = open();
    const track = trackStates(sock);
    last().open();
    last().drop();
    vi.advanceTimersByTime(500);
    expect(track.names()).toEqual(["connecting", "live", "offline", "connecting"]);
    sock.close();
  });

  it("reconnects with backoff 0.5 s → 1 → 2 → 4 → 5 s, and 5 s from then on", () => {
    const sock = open();
    for (const wait of [500, 1000, 2000, 4000, 5000, 5000]) {
      const before = FakeSocket.instances.length;
      last().drop();
      vi.advanceTimersByTime(wait - 1);
      expect(FakeSocket.instances.length, `before ${wait} ms`).toBe(before);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.instances.length, `at ${wait} ms`).toBe(before + 1);
    }
    sock.close();
  });

  it("starts the backoff over once a connection opens", () => {
    const sock = open();
    last().drop();
    vi.advanceTimersByTime(500);
    last().drop();
    vi.advanceTimersByTime(1000);
    last().open();
    last().drop();
    const before = FakeSocket.instances.length;
    vi.advanceTimersByTime(500);
    expect(FakeSocket.instances.length).toBe(before + 1);
    sock.close();
  });

  it("pings every 2 s and reports the round trip, weak above 250 ms", () => {
    const sock = open();
    const track = trackStates(sock);
    last().open();
    vi.advanceTimersByTime(2000);
    const ping = JSON.parse(last().sent[0] ?? "{}") as { t: string; at: number };
    expect(ping.t).toBe("ping");
    vi.advanceTimersByTime(300);
    last().deliver({ t: "pong", at: ping.at });
    expect(track.seen.at(-1)).toEqual({ state: "weak", rtt: 300 });

    vi.advanceTimersByTime(1700);
    const next = JSON.parse(last().sent[1] ?? "{}") as { at: number };
    vi.advanceTimersByTime(100);
    last().deliver({ t: "pong", at: next.at });
    expect(track.seen.at(-1)).toEqual({ state: "live", rtt: 100 });
    sock.close();
  });

  it("delivers server messages to the handlers for their type only", () => {
    const sock = open();
    const welcomes: string[] = [];
    const errors: string[] = [];
    sock.on("welcome", (m) => welcomes.push(m.who));
    const off = sock.on("error", (m) => errors.push(m.code));
    last().open();
    last().deliver({ t: "welcome", who: "abcd1234" });
    last().deliver({ t: "error", code: "lobby-full", message: "x" });
    off();
    last().deliver({ t: "error", code: "lobby-full", message: "x" });
    last().deliver("not an object");
    expect(welcomes).toEqual(["abcd1234"]);
    expect(errors).toEqual(["lobby-full"]);
    sock.close();
  });

  it("sends JSON while open and drops sends while it is not", () => {
    const sock = open();
    sock.send({ t: "lobbies.watch" });
    expect(last().sent).toEqual([]);
    last().open();
    sock.send({ t: "lobbies.watch" });
    expect(last().sent).toEqual(['{"t":"lobbies.watch"}']);
    sock.close();
  });

  it("stops for good when closed", () => {
    const sock = open();
    last().open();
    sock.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

// A page that is navigated away from may be kept alive by the browser (the back/forward cache)
// with its socket still open, so the server would think the person is still in the game. The
// socket therefore closes itself when the page is hidden, and comes back when it is restored.
describe("openSocket when the page is hidden", () => {
  const page = () => new EventTarget();
  const hide = (p: EventTarget) => p.dispatchEvent(new Event("pagehide"));
  const show = (p: EventTarget, persisted: boolean) =>
    p.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));
  const withPage = (p: EventTarget) =>
    openSocket("ws://test/ws", { WebSocketImpl: FakeSocket, page: p });

  it("says goodbye before it closes, so the server need not wait for the socket to close", () => {
    const p = page();
    withPage(p);
    last().open();
    const before = last().sent.length;
    hide(p);
    expect(
      last()
        .sent.slice(before)
        .map((m) => JSON.parse(m).t),
    ).toEqual(["bye"]);
  });

  it("closes the connection, and does not try to reconnect while hidden", () => {
    const p = page();
    withPage(p);
    last().open();
    const before = FakeSocket.instances.length;
    hide(p);
    expect(last().readyState).toBe(3);
    vi.advanceTimersByTime(30_000);
    expect(FakeSocket.instances.length).toBe(before);
  });

  it("reconnects at once when the page comes back from the cache", () => {
    const p = page();
    const sock = withPage(p);
    last().open();
    const names = trackStates(sock);
    hide(p);
    const before = FakeSocket.instances.length;
    show(p, true);
    expect(FakeSocket.instances.length).toBe(before + 1);
    last().open();
    expect(names.names().at(-1)).toBe("live");
  });

  it("does nothing for a pageshow that is a fresh load, not a restore", () => {
    const p = page();
    withPage(p);
    last().open();
    const before = FakeSocket.instances.length;
    show(p, false);
    expect(FakeSocket.instances.length).toBe(before);
  });

  it("lets go of the page when closed", () => {
    const p = page();
    const sock = withPage(p);
    last().open();
    sock.close();
    const before = FakeSocket.instances.length;
    show(p, true);
    expect(FakeSocket.instances.length).toBe(before);
  });
});

describe("openSocket: voice", () => {
  it("hands binary frames to onBinary, and never to the JSON handlers", () => {
    const socket = open();
    last().open();
    const got: Uint8Array[] = [];
    const json = vi.fn();
    socket.onBinary((b) => got.push(b));
    socket.on("pong", json);
    last().onmessage?.({ data: Uint8Array.from([1, 2, 3]).buffer });
    expect(got).toEqual([Uint8Array.from([1, 2, 3])]);
    expect(json).not.toHaveBeenCalled();
    socket.close();
  });

  it("sends binary only while open", () => {
    const socket = open();
    socket.sendBinary(Uint8Array.from([9]));
    expect(last().sent).toHaveLength(0);
    last().open();
    socket.sendBinary(Uint8Array.from([9]));
    expect(last().sent).toHaveLength(1);
    socket.close();
  });

  it("learns the server's clock offset from pongs that carry serverAt", () => {
    const socket = open();
    last().open();
    expect(socket.clockOffset()).toBeNull();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 40);
    last().deliver({ t: "pong", at: now, serverAt: now + 20 + 500 });
    expect(socket.clockOffset()).toBe(500);
    socket.close();
  });
});
