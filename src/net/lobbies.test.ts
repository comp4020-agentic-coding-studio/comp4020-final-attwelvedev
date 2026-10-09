import { describe, expect, it } from "vitest";
import {
  cleanNickname,
  createLobby,
  createRegistry,
  expireIdle,
  joinLobby,
  LobbyError,
  leaveLobby,
  MAX_LOBBIES,
  openLobbies,
  reopenLobby,
  setConnected,
  setTeamName,
  startLobby,
} from "./lobbies.ts";

const dev = (n: number) => `d${String(n).padStart(7, "0")}`;
const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof LobbyError) return e.code;
    throw e;
  }
  return null;
};

describe("createLobby", () => {
  it("seats the creator in seat 0 as host, team name defaults to Team <code>", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    expect(lobby.code).toMatch(/^[A-Z]{4}$/);
    expect(lobby.host).toBe(dev(1));
    expect(lobby.teamName).toBe(`Team ${lobby.code}`);
    expect(lobby.phase).toBe("open");
    expect(lobby.seats[0]).toMatchObject({
      who: dev(1),
      nickname: "Ana",
      connected: true,
      bot: false,
    });
    expect(lobby.seats[1].who).toBeNull();
    expect(reg.byDevice.get(dev(1))).toBe(lobby.code);
  });

  it("throws server-full for the 41st lobby", () => {
    const reg = createRegistry();
    for (let i = 0; i < MAX_LOBBIES; i++) createLobby(reg, dev(i), "P");
    expect(errorCode(() => createLobby(reg, dev(MAX_LOBBIES), "P"))).toBe("server-full");
  });

  it("lets a device that is alone in its lobby make another when the server is full", () => {
    const reg = createRegistry();
    for (let i = 0; i < MAX_LOBBIES; i++) createLobby(reg, dev(i), "P");
    expect(() => createLobby(reg, dev(0), "P")).not.toThrow();
    expect(reg.lobbies.size).toBe(MAX_LOBBIES);
  });

  it("rejects an empty nickname", () => {
    expect(errorCode(() => createLobby(createRegistry(), dev(1), "   "))).toBe("bad-nickname");
  });
});

describe("joinLobby", () => {
  it("fills seats 1 and 2 in order, a 4th player throws lobby-full, a spectator always succeeds", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "player");
    const full = joinLobby(reg, code, dev(3), "Cy", "player");
    expect(full.seats.map((s) => s.nickname)).toEqual(["Ana", "Bo", "Cy"]);
    expect(errorCode(() => joinLobby(reg, code, dev(4), "Di", "player"))).toBe("lobby-full");
    const watched = joinLobby(reg, code, dev(4), "Di", "spectator");
    expect(watched.spectators).toEqual([{ who: dev(4), nickname: "Di" }]);
    joinLobby(reg, code, dev(5), "Ed", "spectator");
    expect(reg.lobbies.get(code)?.spectators).toHaveLength(2);
  });

  it("throws lobby-not-found for an unknown code", () => {
    expect(errorCode(() => joinLobby(createRegistry(), "ABCD", dev(1), "Ana", "player"))).toBe(
      "lobby-not-found",
    );
  });

  it("returns the same seat when the same device joins again (rejoin)", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "player");
    const again = joinLobby(reg, code, dev(2), "Bo", "player");
    expect(again.seats[1].who).toBe(dev(2));
    expect(again.seats.filter((s) => s.who !== null)).toHaveLength(2);
  });

  it("moves a device that creates or joins another lobby out of the first", () => {
    const reg = createRegistry();
    const a = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, a.code, dev(2), "Bo", "player");
    const b = createLobby(reg, dev(2), "Bo");
    expect(reg.lobbies.get(a.code)?.seats[1].who).toBeNull();
    expect(reg.byDevice.get(dev(2))).toBe(b.code);
    const c = createLobby(reg, dev(3), "Cy");
    joinLobby(reg, a.code, dev(3), "Cy", "player");
    expect(reg.lobbies.has(c.code)).toBe(false); // Cy was alone there
    expect(reg.byDevice.get(dev(3))).toBe(a.code);
  });
});

describe("leaveLobby", () => {
  it("passes host to the next seated human when the host leaves", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "player");
    joinLobby(reg, code, dev(3), "Cy", "player");
    const changed = leaveLobby(reg, dev(1));
    expect(changed?.host).toBe(dev(2));
    expect(reg.lobbies.get(code)?.seats[0].who).toBeNull();
    expect(reg.byDevice.has(dev(1))).toBe(false);
  });

  it("removes the lobby when the last human leaves, and frees its spectators", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "spectator");
    leaveLobby(reg, dev(1));
    expect(reg.lobbies.has(code)).toBe(false);
    expect(reg.byDevice.has(dev(2))).toBe(false);
  });

  it("returns null for a device that is in no lobby", () => {
    expect(leaveLobby(createRegistry(), dev(9))).toBeNull();
  });
});

describe("setTeamName", () => {
  it("is host only", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "player");
    expect(errorCode(() => setTeamName(reg, dev(2), "Mine"))).toBe("not-host");
  });

  it("trims to 24 characters and rejects empty", () => {
    const reg = createRegistry();
    createLobby(reg, dev(1), "Ana");
    expect(setTeamName(reg, dev(1), `  ${"N".repeat(40)}  `).teamName).toBe("N".repeat(24));
    expect(errorCode(() => setTeamName(reg, dev(1), "   "))).toBe("bad-team-name");
  });

  it("rejects a name on the blocklist", () => {
    const reg = createRegistry();
    createLobby(reg, dev(1), "Ana");
    expect(errorCode(() => setTeamName(reg, dev(1), "fuck"))).toBe("bad-team-name");
  });
});

describe("setConnected", () => {
  it("marks a seat and returns the lobby, or null when nothing changed", () => {
    const reg = createRegistry();
    createLobby(reg, dev(1), "Ana");
    expect(setConnected(reg, dev(1), false)?.seats[0].connected).toBe(false);
    expect(setConnected(reg, dev(1), false)).toBeNull();
    expect(setConnected(reg, dev(9), true)).toBeNull();
  });
});

describe("openLobbies", () => {
  it("lists open lobbies that have a free seat, newest first, and drops full ones", () => {
    const reg = createRegistry();
    const a = createLobby(reg, dev(1), "Ana");
    const b = createLobby(reg, dev(2), "Bo");
    expect(openLobbies(reg).map((l) => l.code)).toEqual([b.code, a.code]);
    expect(openLobbies(reg)[0]).toEqual({
      code: b.code,
      teamName: `Team ${b.code}`,
      filled: 1,
      phase: "open",
    });
    joinLobby(reg, a.code, dev(3), "Cy", "player");
    joinLobby(reg, a.code, dev(4), "Di", "player");
    expect(openLobbies(reg).map((l) => l.code)).toEqual([b.code]);
  });

  it("excludes lobbies that are playing", () => {
    const reg = createRegistry();
    const a = createLobby(reg, dev(1), "Ana");
    a.phase = "playing";
    expect(openLobbies(reg)).toEqual([]);
  });
});

describe("expireIdle", () => {
  it("removes a lobby with no connected human after the timeout, and not before", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    const since = new Map<string, number>();
    setConnected(reg, dev(1), false);
    expect(expireIdle(reg, since, 0, 600_000)).toEqual([]);
    expect(expireIdle(reg, since, 599_999, 600_000)).toEqual([]);
    expect(expireIdle(reg, since, 600_000, 600_000).map((l) => l.code)).toEqual([code]);
    expect(reg.lobbies.has(code)).toBe(false);
    expect(reg.byDevice.has(dev(1))).toBe(false);
  });

  it("forgets the clock when someone reconnects", () => {
    const reg = createRegistry();
    createLobby(reg, dev(1), "Ana");
    const since = new Map<string, number>();
    setConnected(reg, dev(1), false);
    expireIdle(reg, since, 0, 600_000);
    setConnected(reg, dev(1), true);
    expireIdle(reg, since, 300_000, 600_000);
    setConnected(reg, dev(1), false);
    expect(expireIdle(reg, since, 700_000, 600_000)).toEqual([]);
  });
});

describe("cleanNickname", () => {
  it("trims, collapses spaces and keeps at most 16 characters", () => {
    expect(cleanNickname("  Ana   Maria  ")).toBe("Ana Maria");
    expect(cleanNickname("x".repeat(30))).toBe("x".repeat(16));
  });
  it("throws bad-nickname when empty", () => {
    expect(errorCode(() => cleanNickname(" \t "))).toBe("bad-nickname");
  });
  it("throws bad-nickname for a name on the blocklist", () => {
    expect(errorCode(() => cleanNickname("fuck"))).toBe("bad-nickname");
  });
});

describe("startLobby", () => {
  it("fills every empty seat with a connected bot named for its shape, and starts", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    startLobby(reg, dev(1));
    expect(lobby.phase).toBe("playing");
    expect(lobby.seats[0]).toMatchObject({ who: dev(1), bot: false });
    expect(lobby.seats[1]).toEqual({
      who: null,
      nickname: "Bot square",
      connected: true,
      bot: true,
    });
    expect(lobby.seats[2]).toEqual({
      who: null,
      nickname: "Bot triangle",
      connected: true,
      bot: true,
    });
  });

  it("leaves the humans alone and fills only what is empty", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, lobby.code, dev(2), "Bo", "player");
    startLobby(reg, dev(1));
    expect(lobby.seats.map((s) => s.bot)).toEqual([false, false, true]);
    expect(lobby.seats[2]?.nickname).toBe("Bot triangle");
  });

  it("starts with no bots when three people are seated", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, lobby.code, dev(2), "Bo", "player");
    joinLobby(reg, lobby.code, dev(3), "Cy", "player");
    startLobby(reg, dev(1));
    expect(lobby.seats.some((s) => s.bot)).toBe(false);
  });

  it("is the host's alone", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, lobby.code, dev(2), "Bo", "player");
    expect(errorCode(() => startLobby(reg, dev(2)))).toBe("not-host");
    expect(lobby.phase).toBe("open");
  });

  it("never says need-three any more", () => {
    const reg = createRegistry();
    createLobby(reg, dev(1), "Ana");
    expect(errorCode(() => startLobby(reg, dev(1)))).toBeNull();
  });

  it("removes the lobby when its last human leaves, bots or not", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    startLobby(reg, dev(1));
    leaveLobby(reg, dev(1));
    expect(reg.lobbies.has(lobby.code)).toBe(false);
  });
});

describe("reopenLobby", () => {
  it("empties the bots' seats, keeps the people's, and opens the lobby", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    startLobby(reg, dev(1));
    reopenLobby(lobby);
    expect(lobby.phase).toBe("open");
    expect(lobby.seats[0]).toMatchObject({ who: dev(1), nickname: "Ana", bot: false });
    expect(lobby.seats[1]).toEqual({ who: null, nickname: null, connected: false, bot: false });
    expect(lobby.seats[2]?.bot).toBe(false);
    expect(openLobbies(reg).map((l) => l.code)).toEqual([lobby.code]);
  });
});

describe("joining a game in progress", () => {
  it("does not give a stranger a seat a bot is playing", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    startLobby(reg, dev(1)); // two bots fill the other seats
    expect(errorCode(() => joinLobby(reg, lobby.code, dev(9), "Stranger", "player"))).toBe(
      "lobby-full",
    );
    expect(lobby.seats.filter((s) => s.bot)).toHaveLength(2);
    // they can still watch
    joinLobby(reg, lobby.code, dev(9), "Stranger", "spectator");
    expect(lobby.spectators.map((s) => s.nickname)).toEqual(["Stranger"]);
  });
});
