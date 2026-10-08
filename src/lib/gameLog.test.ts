import { describe, expect, it } from "vitest";
import { describeGame, lobbyKey } from "./gameLog.ts";

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
        family: "say",
        role: "deaf",
        kind: "callout",
      },
    });
    expect(line.detail).toEqual({ family: "say", role: "deaf", kind: "callout" });
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
