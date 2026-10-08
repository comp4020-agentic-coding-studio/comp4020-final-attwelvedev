import { describe, expect, it } from "vitest";
import type { GameLine } from "./gameLog.ts";
import type { RequestLine } from "./requestLog.ts";
import { createStats, sharedStats } from "./stats.ts";

const T0 = Date.parse("2026-10-07T03:00:00Z");
const MIN = 60_000;

function line(over: Partial<RequestLine> & { at?: number } = {}): RequestLine {
  const { at = T0, ...rest } = over;
  return {
    ts: new Date(at).toISOString(),
    kind: "request",
    method: "POST",
    route: "/lobby/[code]",
    action: "item.add",
    status: 200,
    ms: 3,
    who: "aaaaaaaa",
    ...rest,
  };
}

describe("stats", () => {
  it("counts requests by action and errors as status >= 500", () => {
    const stats = createStats(T0 - MIN);
    stats.record(line());
    stats.record(line());
    stats.record(line({ action: "item.outcome", status: 500 }));
    stats.record(line({ action: "item.outcome", status: 404 }));
    const s = stats.snapshot(T0);
    expect(s.actions).toEqual({ "item.add": 2, "item.outcome": 2 });
    expect(s.requests).toBe(4);
    expect(s.errors).toBe(1);
    expect(s.since).toBe(T0 - MIN);
    expect(s.now).toBe(T0);
  });

  it("counts distinct devices seen in the last 5 minutes and ignores null", () => {
    const stats = createStats(T0 - 20 * MIN);
    stats.record(line({ who: "aaaaaaaa", at: T0 - 6 * MIN }));
    stats.record(line({ who: "bbbbbbbb", at: T0 - 4 * MIN }));
    stats.record(line({ who: "bbbbbbbb", at: T0 - 1 * MIN }));
    stats.record(line({ who: "cccccccc", at: T0 }));
    stats.record(line({ who: null, at: T0 }));
    expect(stats.snapshot(T0).activeDevices).toBe(2);
  });

  it("has 10 per-minute buckets, oldest first, ending with the current minute", () => {
    const stats = createStats(T0 - 30 * MIN);
    stats.record(line({ at: T0 }));
    stats.record(line({ at: T0 + 5 }));
    stats.record(line({ at: T0 - 2 * MIN }));
    stats.record(line({ at: T0 - 11 * MIN }));
    const { perMinute } = stats.snapshot(T0 + 10);
    expect(perMinute).toHaveLength(10);
    const minute = Math.floor(T0 / MIN);
    expect(perMinute.map((b) => b.minute)).toEqual(
      Array.from({ length: 10 }, (_, i) => minute - 9 + i),
    );
    expect(perMinute[9].n).toBe(2);
    expect(perMinute[7].n).toBe(1);
    expect(perMinute.reduce((sum, b) => sum + b.n, 0)).toBe(3);
  });

  it("keeps the last 200 lines and returns the newest 30, newest first", () => {
    const stats = createStats(T0 - MIN);
    for (let i = 0; i < 250; i += 1) stats.record(line({ at: T0 + i, action: `a${i}` }));
    const s = stats.snapshot(T0 + 300);
    expect(s.requests).toBe(250);
    expect(s.recent).toHaveLength(30);
    expect(s.recent[0].action).toBe("a249");
    expect(s.recent[29].action).toBe("a220");
    expect(Object.keys(s.recent[0]).sort()).toEqual(["action", "status", "ts", "who"]);
  });

  it("never records /stats, /stats.json or /_astro lines", () => {
    const stats = createStats(T0);
    for (const route of ["/stats", "/stats.json", "/_astro/x.js"]) {
      stats.record(line({ route, method: "GET", action: "GET " }));
    }
    const s = stats.snapshot(T0);
    expect(s.requests).toBe(0);
    expect(s.recent).toEqual([]);
  });
});

describe("sharedStats", () => {
  it("returns the same object twice, so every module instance counts into one", () => {
    expect(sharedStats()).toBe(sharedStats());
  });
});

describe("game stats", () => {
  const game = (event: GameLine["event"], detail?: GameLine["detail"]): GameLine => ({
    ts: new Date(T0).toISOString(),
    kind: "game",
    event,
    who: "aaaaaaaa",
    lobby: "bbbbbbbb",
    ...(detail ? { detail } : {}),
  });

  it("counts events by name and channel use by role and family", () => {
    const stats = createStats(T0);
    stats.recordGame(game("lobby.create"));
    stats.recordGame(game("channel.send", { family: "say", role: "deaf", kind: "callout" }));
    stats.recordGame(game("channel.send", { family: "say", role: "deaf", kind: "text" }));
    stats.recordGame(game("channel.send", { family: "show", role: "mute", kind: "face" }));
    stats.recordGame(game("channel.refused", { family: "sound", reason: "cooldown" }));
    const { game: g } = stats.snapshot(T0);
    expect(g.events).toEqual({ "lobby.create": 1, "channel.send": 3, "channel.refused": 1 });
    expect(g.channelsByRole).toEqual({ deaf: { say: 2 }, mute: { show: 1 } });
  });

  it("merges the live provider's counts, and is all zero without one", () => {
    const stats = createStats(T0);
    expect(stats.snapshot(T0).game).toMatchObject({
      lobbiesOpen: 0,
      gamesPlaying: 0,
      playersConnected: 0,
      events: {},
      channelsByRole: {},
    });
    stats.setLiveProvider(() => ({ lobbiesOpen: 2, gamesPlaying: 1, playersConnected: 5 }));
    expect(stats.snapshot(T0).game).toMatchObject({
      lobbiesOpen: 2,
      gamesPlaying: 1,
      playersConnected: 5,
    });
  });

  it("reports the server's memory as a positive number of MB", () => {
    expect(createStats(T0).snapshot(T0).game.rssMb).toBeGreaterThan(0);
  });

  it("does not count game lines as requests", () => {
    const stats = createStats(T0);
    stats.recordGame(game("socket.open"));
    expect(stats.snapshot(T0).requests).toBe(0);
  });
});
