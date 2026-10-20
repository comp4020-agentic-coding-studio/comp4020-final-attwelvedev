import { describe, expect, it } from "vitest";
import {
  cleanNickname,
  createLobby,
  createRegistry,
  DEFAULT_SETUP,
  expireIdle,
  joinLobby,
  LobbyError,
  leaveLobby,
  MAX_LOBBIES,
  MAX_PEOPLE,
  openLobbies,
  reopenLobby,
  setConnected,
  setNickname,
  setOrder,
  setPrivate,
  setSetup,
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
  it("makes the creator the first person and host, team name defaults to Team <code>", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    expect(lobby.code).toMatch(/^[A-Z]{4}$/);
    expect(lobby.host).toBe(dev(1));
    expect(lobby.teamName).toBe(`Team ${lobby.code}`);
    expect(lobby.phase).toBe("open");
    expect(lobby.private).toBe(false);
    expect(lobby.people).toHaveLength(1);
    expect(lobby.people[0]).toMatchObject({
      who: dev(1),
      nickname: "Ana",
      connected: true,
      played: [],
    });
    // seats are only filled when the lobby starts
    expect(lobby.seats.every((s) => s.who === null && s.person === null)).toBe(true);
    expect(lobby.sittingOut).toEqual([]);
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
  it("takes six people in order, the seventh is lobby-full, a spectator always succeeds", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    const names = ["Bo", "Cy", "Di", "Ed", "Flo"];
    for (const [i, n] of names.entries()) joinLobby(reg, code, dev(i + 2), n, "player");
    const full = reg.lobbies.get(code);
    expect(MAX_PEOPLE).toBe(6);
    expect(full?.people.map((p) => p.nickname)).toEqual(["Ana", ...names]);
    expect(errorCode(() => joinLobby(reg, code, dev(7), "Gus", "player"))).toBe("lobby-full");
    const watched = joinLobby(reg, code, dev(7), "Gus", "spectator");
    expect(watched.spectators).toEqual([{ who: dev(7), nickname: "Gus" }]);
    joinLobby(reg, code, dev(8), "Hal", "spectator");
    expect(reg.lobbies.get(code)?.spectators).toHaveLength(2);
  });

  it("numbers a duplicate nickname: Ana, Ana 2, Ana 3, cut to 16 characters", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Ana", "player");
    joinLobby(reg, code, dev(3), "ana", "player");
    expect(reg.lobbies.get(code)?.people.map((p) => p.nickname)).toEqual(["Ana", "Ana 2", "ana 3"]);
    const long = "x".repeat(16);
    joinLobby(reg, code, dev(4), long, "player");
    joinLobby(reg, code, dev(5), long, "player");
    const second = reg.lobbies.get(code)?.people[4]?.nickname ?? "";
    expect(second).toBe(`${"x".repeat(14)} 2`);
    expect(second.length).toBeLessThanOrEqual(16);
  });

  it("does not let anyone join a lobby that has started, but they may watch", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    startLobby(reg, dev(1));
    expect(errorCode(() => joinLobby(reg, lobby.code, dev(2), "Bo", "player"))).toBe("lobby-full");
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
    expect(again.people.map((p) => p.who)).toEqual([dev(1), dev(2)]);
  });

  it("moves a device that creates or joins another lobby out of the first", () => {
    const reg = createRegistry();
    const a = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, a.code, dev(2), "Bo", "player");
    const b = createLobby(reg, dev(2), "Bo");
    expect(reg.lobbies.get(a.code)?.people.map((p) => p.who)).toEqual([dev(1)]);
    expect(reg.byDevice.get(dev(2))).toBe(b.code);
    const c = createLobby(reg, dev(3), "Cy");
    joinLobby(reg, a.code, dev(3), "Cy", "player");
    expect(reg.lobbies.has(c.code)).toBe(false); // Cy was alone there
    expect(reg.byDevice.get(dev(3))).toBe(a.code);
  });
});

describe("leaveLobby", () => {
  it("passes host to the first remaining person when the host leaves", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "player");
    joinLobby(reg, code, dev(3), "Cy", "player");
    const changed = leaveLobby(reg, dev(1));
    expect(changed?.host).toBe(dev(2));
    expect(reg.lobbies.get(code)?.people.map((p) => p.who)).toEqual([dev(2), dev(3)]);
    expect(reg.byDevice.has(dev(1))).toBe(false);
  });

  it("frees a place for a seventh when someone leaves", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    for (let i = 2; i <= 6; i++) joinLobby(reg, code, dev(i), `P${i}`, "player");
    leaveLobby(reg, dev(3));
    expect(errorCode(() => joinLobby(reg, code, dev(7), "Gus", "player"))).toBeNull();
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

describe("setSetup", () => {
  it("stores a person's own setup, which is marked answered", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "player");
    const mine = { ...DEFAULT_SETUP, inRoom: true, mask: true, done: false };
    const lobby = setSetup(reg, dev(2), mine);
    expect(lobby.people[1]?.setup).toEqual({ ...mine, done: true });
    expect(lobby.people[0]?.setup).toEqual(DEFAULT_SETUP); // not anyone else's
  });

  it("starts as the defaults, not answered", () => {
    const reg = createRegistry();
    expect(createLobby(reg, dev(1), "Ana").people[0]?.setup).toEqual(DEFAULT_SETUP);
    expect(DEFAULT_SETUP.done).toBe(false);
  });

  it("is for someone in the lobby", () => {
    expect(errorCode(() => setSetup(createRegistry(), dev(9), DEFAULT_SETUP))).toBe(
      "lobby-not-found",
    );
  });
});

describe("setConnected", () => {
  it("marks a seat and returns the lobby, or null when nothing changed", () => {
    const reg = createRegistry();
    createLobby(reg, dev(1), "Ana");
    expect(setConnected(reg, dev(1), false)?.people[0]?.connected).toBe(false);
    expect(setConnected(reg, dev(1), false)).toBeNull();
    expect(setConnected(reg, dev(9), true)).toBeNull();
  });
});

describe("openLobbies", () => {
  it("lists open lobbies with room for a person, newest first, and drops full ones", () => {
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
    for (let i = 3; i <= 6; i++) joinLobby(reg, a.code, dev(i), `P${i}`, "player");
    expect(openLobbies(reg).find((l) => l.code === a.code)?.filled).toBe(5);
    joinLobby(reg, a.code, dev(7), "P7", "player"); // the sixth person
    expect(openLobbies(reg).map((l) => l.code)).toEqual([b.code]);
  });

  it("never lists a private lobby, but its code still joins", () => {
    const reg = createRegistry();
    const a = createLobby(reg, dev(1), "Ana");
    setPrivate(reg, dev(1), true);
    expect(openLobbies(reg)).toEqual([]);
    expect(errorCode(() => joinLobby(reg, a.code, dev(2), "Bo", "player"))).toBeNull();
    setPrivate(reg, dev(1), false);
    expect(openLobbies(reg).map((l) => l.code)).toEqual([a.code]);
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
  it("seats the first people, fills every other seat with a connected bot named for its shape, and starts", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    startLobby(reg, dev(1));
    expect(lobby.phase).toBe("playing");
    expect(lobby.seats[0]).toMatchObject({ who: dev(1), nickname: "Ana", bot: false, person: 0 });
    expect(lobby.seats[1]).toEqual({
      who: null,
      nickname: "Bot square",
      connected: true,
      bot: true,
      person: null,
    });
    expect(lobby.seats[2]).toEqual({
      who: null,
      nickname: "Bot triangle",
      connected: true,
      bot: true,
      person: null,
    });
  });

  it("leaves the humans alone and fills only what is empty", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, lobby.code, dev(2), "Bo", "player");
    startLobby(reg, dev(1));
    expect(lobby.seats.map((s) => s.bot)).toEqual([false, false, true]);
    expect(lobby.seats.map((s) => s.person)).toEqual([0, 1, null]);
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
  it("empties every seat, keeps the people, and opens the lobby", () => {
    const reg = createRegistry();
    const lobby = createLobby(reg, dev(1), "Ana");
    startLobby(reg, dev(1));
    reopenLobby(lobby);
    expect(lobby.phase).toBe("open");
    expect(lobby.people.map((p) => p.who)).toEqual([dev(1)]);
    expect(lobby.seats.every((s) => s.who === null && !s.bot && s.person === null)).toBe(true);
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

describe("setNickname", () => {
  it("changes a person's name, keeps it unique, and is limited to 16 characters", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "player");
    expect(setNickname(reg, dev(2), "  Robin   Hood  ").people[1]?.nickname).toBe("Robin Hood");
    expect(setNickname(reg, dev(2), "Ana").people[1]?.nickname).toBe("Ana 2");
    expect(setNickname(reg, dev(1), "Ana").people[0]?.nickname).toBe("Ana"); // not a duplicate of itself
    expect(setNickname(reg, dev(2), "y".repeat(30)).people[1]?.nickname).toBe("y".repeat(16));
    expect(errorCode(() => setNickname(reg, dev(2), "  "))).toBe("bad-nickname");
  });

  it("renames a watcher too", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "spectator");
    expect(setNickname(reg, dev(2), "Bobby").spectators[0]?.nickname).toBe("Bobby");
  });
});

describe("setPrivate", () => {
  it("is host only", () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "player");
    expect(errorCode(() => setPrivate(reg, dev(2), true))).toBe("not-host");
    expect(setPrivate(reg, dev(1), true).private).toBe(true);
  });
});

describe("setOrder", () => {
  const three = () => {
    const reg = createRegistry();
    const { code } = createLobby(reg, dev(1), "Ana");
    joinLobby(reg, code, dev(2), "Bo", "player");
    joinLobby(reg, code, dev(3), "Cy", "player");
    return reg;
  };

  it("is host only", () => {
    expect(errorCode(() => setOrder(three(), dev(2), [2, 1, 0]))).toBe("not-host");
  });

  it("puts the people in the order the host chose", () => {
    const lobby = setOrder(three(), dev(1), [2, 0, 1]);
    expect(lobby.people.map((p) => p.nickname)).toEqual(["Cy", "Ana", "Bo"]);
  });

  it("refuses anything that is not a permutation of the people", () => {
    const reg = three();
    for (const order of [
      [0, 1],
      [0, 1, 1],
      [0, 1, 3],
      [0, 1, 2, 3],
      [-1, 0, 1],
      [0, 1, 1.5],
    ]) {
      expect(errorCode(() => setOrder(reg, dev(1), order))).toBe("bad-order");
    }
    expect(
      reg.lobbies
        .values()
        .next()
        .value?.people.map((p: { nickname: string }) => p.nickname),
    ).toEqual(["Ana", "Bo", "Cy"]);
  });

  it("is only for an open lobby", () => {
    const reg = three();
    startLobby(reg, dev(1));
    expect(errorCode(() => setOrder(reg, dev(1), [2, 1, 0]))).toBe("bad-order");
  });
});
