import { describe, expect, it } from "vitest";
import { describeGame, gameLinesFor, lobbyKey } from "./gameLog.ts";

const NOW = Date.parse("2026-10-08T03:00:00Z");

describe("describeGame", () => {
  it("writes ts, kind, event, who and lobby", () => {
    const line = describeGame({
      event: "lobby.create",
      who: "aaaaaaaa",
      lobbyKey: "bbbbbbbb",
      now: NOW,
    });
    expect(line).toEqual({
      ts: "2026-10-08T03:00:00.000Z",
      kind: "game",
      event: "lobby.create",
      who: "aaaaaaaa",
      lobby: "bbbbbbbb",
    });
  });

  it("drops every field that is not allowlisted", () => {
    const line = describeGame({
      event: "channel.send",
      who: "aaaaaaaa",
      lobbyKey: "bbbbbbbb",
      detail: {
        text: "the code is 1234",
        nickname: "NOSY-1",
        code: "ABCD",
        callout: "left",
        clip: "airhorn",
        teamName: "Team Secret",
        method: "callout",
        role: "deaf",
      },
    });
    expect(line.detail).toEqual({ method: "callout", role: "deaf" });
    expect(JSON.stringify(line)).not.toMatch(/1234|NOSY|ABCD|left|airhorn|Secret/);
  });

  it("keeps the new allowlisted keys: room, seat, ms, bots", () => {
    const line = describeGame({
      event: "room.clear",
      detail: { room: "loading-dock", seat: 2, ms: 41_000, bots: 0 },
    });
    expect(line.detail).toEqual({ room: "loading-dock", seat: 2, ms: 41_000, bots: 0 });
  });

  it("uses null for a missing device or lobby and omits empty detail", () => {
    const line = describeGame({ event: "socket.open", detail: { text: "nope" } });
    expect(line.who).toBeNull();
    expect(line.lobby).toBeNull();
    expect("detail" in line).toBe(false);
  });
});

describe("lobbyKey", () => {
  it("is 8 hex, stable for a lobby, and never contains its code", () => {
    const key = lobbyKey("ABCD", 1000);
    expect(key).toMatch(/^[0-9a-f]{8}$/);
    expect(lobbyKey("ABCD", 1000)).toBe(key);
    expect(lobbyKey("ABCD", 2000)).not.toBe(key);
    expect(key.toLowerCase()).not.toContain("abcd");
  });
});

describe("gameLinesFor: a tug of war (Task 40)", () => {
  it("logs one line a pull with the kind of thing only, never which seats", () => {
    const lines = gameLinesFor([
      { kind: "pull", leader: 0, towed: 2, at: { x: 3.5, y: 1.5 } },
      { kind: "pull", leader: 1, towed: 0, at: { x: 9.5, y: 4.5 } },
    ]);
    expect(lines).toEqual([
      { event: "pull", detail: { kind: "tug" } },
      { event: "pull", detail: { kind: "tug" } },
    ]);
    const details = JSON.stringify(
      lines.map((l) => describeGame({ event: l.event, detail: l.detail }).detail),
    );
    expect(details).not.toMatch(/leader|towed|seat|3\.5|9\.5|[0-9]/);
  });
});

describe("gameLinesFor: the sim's station, gear, hold and signal events", () => {
  it("logs the kind of thing only, never an answer, a key or an id", () => {
    const lines = gameLinesFor([
      { kind: "station", id: "Q1", result: "press", n: 7, at: { x: 1, y: 1 } },
      { kind: "station", id: "Q1", result: "solved", at: { x: 1, y: 1 } },
      { kind: "station", id: "Q2", result: "wrong", at: { x: 1, y: 1 } },
      { kind: "gear", id: "g1", action: "give", seat: 0, at: { x: 1, y: 1 } },
      { kind: "hold", seat: 1, leader: 0 },
      { kind: "hold", seat: 1, leader: null },
      { kind: "bell", id: "b1", at: { x: 1, y: 1 } },
      { kind: "lamp", id: "l1", seat: 2 },
      { kind: "lever", id: "v1", on: true, at: { x: 1, y: 1 } },
      { kind: "lever", id: "v1", on: false, at: { x: 1, y: 1 } },
    ]);
    expect(lines).toEqual([
      { event: "station", detail: { kind: "solved" } },
      { event: "station", detail: { kind: "wrong" } },
      { event: "gear", detail: { kind: "give" } },
      { event: "hold", detail: { kind: "on" } },
      { event: "hold", detail: { kind: "off" } },
      { event: "signal", detail: { kind: "bell" } },
      { event: "signal", detail: { kind: "lamp" } },
      { event: "practice", detail: { kind: "on" } },
      { event: "practice", detail: { kind: "off" } },
    ]);
    const redacted = lines.map((l) => describeGame({ event: l.event, detail: l.detail }));
    // what reaches the log beyond the event name: never a station, gear or signal id, or a key
    const details = JSON.stringify(redacted.map((l) => l.detail));
    expect(details).not.toMatch(/Q1|Q2|g1|b1|l1|v1|"n"|7/);
  });
});

describe("gameLinesFor: a cache (Task 54)", () => {
  it("logs an uncover and a solve by kind only: never the item, motif, riddle or seat", () => {
    const lines = gameLinesFor([
      { kind: "cache", id: "Q9", result: "uncover", seat: 1, at: { x: 3.5, y: 2.5 } },
      { kind: "cache", id: "Q9", result: "solved", seat: 2, at: { x: 3.5, y: 2.5 } },
    ]);
    expect(lines).toEqual([
      { event: "cache", detail: { kind: "uncover" } },
      { event: "cache", detail: { kind: "solved" } },
    ]);
    const out = JSON.stringify(
      lines.map((l) => describeGame({ event: l.event, detail: l.detail }).detail),
    );
    expect(out).not.toMatch(/watch|moon|Q9|seat|[0-9]/);
  });
});
