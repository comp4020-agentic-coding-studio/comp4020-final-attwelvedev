import { describe, expect, inject, it } from "vitest";
import { connect, type Socket } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface LobbyMsg {
  t: "lobby";
  lobby: {
    code: string;
    teamName: string;
    host: string;
    private: boolean;
    people: { who: string; nickname: string }[];
    spectators: { nickname: string }[];
  };
  rooms: string[];
  you: { seat: number | null; host: boolean; person: number | null };
}
interface ListMsg {
  t: "lobbies";
  list: { code: string; filled: number }[];
}
interface ErrorMsg {
  t: "error";
  code: string;
  message: string;
}

const filled = (m: LobbyMsg) => m.lobby.people.length;

// Waits for the next `lobby` message that satisfies `ok`, dropping the ones
// that don't, so a test is not sensitive to how many updates arrive.
async function lobbyWhere(s: Socket, ok: (m: LobbyMsg) => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const m = await s.next<LobbyMsg>("lobby", Math.max(1, deadline - Date.now()));
    if (ok(m)) return m;
  }
}

async function listWhere(s: Socket, ok: (m: ListMsg) => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const m = await s.next<ListMsg>("lobbies", Math.max(1, deadline - Date.now()));
    if (ok(m)) return m;
  }
}

async function open(...names: string[]): Promise<Socket[]> {
  return Promise.all(names.map(() => connect(baseUrl)));
}

describe("lobbies over the socket", () => {
  it("shows a seat filled in one session in the others within 1 s", async () => {
    const [a, b, c] = await open("a", "b", "c");
    a.send({ t: "lobby.create", nickname: "Ana" });
    const created = await a.next<LobbyMsg>("lobby");
    expect(created.you).toEqual({ seat: null, host: true, person: 0 });
    const { code } = created.lobby;

    b.send({ t: "lobby.join", code, nickname: "Bo", as: "player" });
    const bJoined = await b.next<LobbyMsg>("lobby");
    expect(bJoined.you).toEqual({ seat: null, host: false, person: 1 });

    const started = Date.now();
    c.send({ t: "lobby.join", code, nickname: "Cy", as: "player" });
    const seen = await lobbyWhere(a, (m) => filled(m) === 3, 1000);
    expect(Date.now() - started).toBeLessThanOrEqual(1000);
    expect(seen.lobby.people.map((p) => p.nickname)).toEqual(["Ana", "Bo", "Cy"]);
    await Promise.all([a.close(), b.close(), c.close()]);
  });

  it("shows a watcher of the open list a new lobby within 1 s, and keeps it listed at three people", async () => {
    const [watcher, a, b, c] = await open("w", "a", "b", "c");
    watcher.send({ t: "lobbies.watch" });
    await watcher.next<ListMsg>("lobbies");

    a.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await a.next<LobbyMsg>("lobby");
    const started = Date.now();
    await listWhere(watcher, (m) => m.list.some((l) => l.code === lobby.code), 1000);
    expect(Date.now() - started).toBeLessThanOrEqual(1000);

    b.send({ t: "lobby.join", code: lobby.code, nickname: "Bo", as: "player" });
    c.send({ t: "lobby.join", code: lobby.code, nickname: "Cy", as: "player" });
    // three people are not a full lobby any more: it is still listed, with all three counted
    await listWhere(
      watcher,
      (m) => m.list.some((l) => l.code === lobby.code && l.filled === 3),
      1000,
    );
    await Promise.all([watcher.close(), a.close(), b.close(), c.close()]);
  });

  it("drops a lobby from the open list once it has six people", async () => {
    const [watcher, ...six] = await open("w", "a", "b", "c", "d", "e", "f");
    watcher.send({ t: "lobbies.watch" });
    await watcher.next<ListMsg>("lobbies");
    const [a, ...rest] = six as [Socket, ...Socket[]];
    a.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await a.next<LobbyMsg>("lobby");
    for (const [i, s] of rest.entries()) {
      s.send({ t: "lobby.join", code: lobby.code, nickname: `P${i}`, as: "player" });
    }
    await listWhere(watcher, (m) => !m.list.some((l) => l.code === lobby.code), 1000);
    await Promise.all([watcher.close(), ...six.map((s) => s.close())]);
  });

  it("answers a wrong code with error lobby-not-found", async () => {
    const [a] = await open("a");
    a.send({ t: "lobby.join", code: "ZZZZ", nickname: "Ana", as: "player" });
    const err = await a.next<ErrorMsg>("error");
    expect(err.code).toBe("lobby-not-found");
    expect(err.message).toContain("ZZZZ");
    await a.close();
  });

  it("shows a sixth person in the others' lobby within 1 s, and the seventh is told it is full", async () => {
    const sockets = await open("a", "b", "c", "d", "e", "f", "g", "h");
    const [a, ...others] = sockets as [Socket, ...Socket[]];
    a.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await a.next<LobbyMsg>("lobby");
    const joiners = others.slice(0, 4);
    for (const [i, s] of joiners.entries()) {
      s.send({ t: "lobby.join", code: lobby.code, nickname: `P${i}`, as: "player" });
      await s.next("lobby");
    }
    const sixth = others[4] as Socket;
    const started = Date.now();
    sixth.send({ t: "lobby.join", code: lobby.code, nickname: "Flo", as: "player" });
    const seen = await lobbyWhere(a, (m) => filled(m) === 6, 1000);
    expect(Date.now() - started).toBeLessThanOrEqual(1000);
    expect(seen.lobby.people[5]?.nickname).toBe("Flo");

    const seventh = others[5] as Socket;
    seventh.send({ t: "lobby.join", code: lobby.code, nickname: "Gus", as: "player" });
    expect((await seventh.next<ErrorMsg>("error")).code).toBe("lobby-full");

    // and the one who was told it is full may watch
    const watcher = others[6] as Socket;
    watcher.send({ t: "lobby.join", code: lobby.code, nickname: "Ed", as: "spectator" });
    const watched = await lobbyWhere(a, (m) => m.lobby.spectators.length === 1);
    expect(watched.lobby.spectators[0]?.nickname).toBe("Ed");
    await Promise.all(sockets.map((s) => s.close()));
  });

  it("a private lobby never appears in the open list but its code still joins", async () => {
    const [watcher, a, b] = await open("w", "a", "b");
    watcher.send({ t: "lobbies.watch" });
    await watcher.next<ListMsg>("lobbies");
    a.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await a.next<LobbyMsg>("lobby");
    await listWhere(watcher, (m) => m.list.some((l) => l.code === lobby.code), 1000);

    a.send({ t: "lobby.private", on: true });
    await listWhere(watcher, (m) => !m.list.some((l) => l.code === lobby.code), 1000);
    expect((await lobbyWhere(a, (m) => m.lobby.private)).lobby.private).toBe(true);

    b.send({ t: "lobby.join", code: lobby.code, nickname: "Bo", as: "player" });
    expect((await b.next<LobbyMsg>("lobby")).you.person).toBe(1);

    a.send({ t: "lobby.private", on: false });
    await listWhere(watcher, (m) => m.list.some((l) => l.code === lobby.code), 1000);
    await Promise.all([watcher.close(), a.close(), b.close()]);
  });

  it("only the host sets private or the order", async () => {
    const [a, b] = await open("a", "b");
    a.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await a.next<LobbyMsg>("lobby");
    b.send({ t: "lobby.join", code: lobby.code, nickname: "Bo", as: "player" });
    await b.next("lobby");
    b.send({ t: "lobby.private", on: true });
    expect((await b.next<ErrorMsg>("error")).code).toBe("not-host");
    b.send({ t: "lobby.order", order: [1, 0] });
    expect((await b.next<ErrorMsg>("error")).code).toBe("not-host");
    a.send({ t: "lobby.order", order: [1, 0] });
    const seen = await lobbyWhere(b, (m) => m.lobby.people[0]?.nickname === "Bo");
    expect(seen.you.person).toBe(0);
    await Promise.all([a.close(), b.close()]);
  });

  it("a nickname change reaches everyone within 1 s, and a duplicate is numbered", async () => {
    const [a, b] = await open("a", "b");
    a.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await a.next<LobbyMsg>("lobby");
    b.send({ t: "lobby.join", code: lobby.code, nickname: "Ana", as: "player" });
    const joined = await b.next<LobbyMsg>("lobby");
    expect(joined.lobby.people.map((p) => p.nickname)).toEqual(["Ana", "Ana 2"]);

    const started = Date.now();
    b.send({ t: "lobby.nickname", nickname: "Robin" });
    const seen = await lobbyWhere(a, (m) => m.lobby.people[1]?.nickname === "Robin", 1000);
    expect(Date.now() - started).toBeLessThanOrEqual(1000);
    expect(seen.lobby.people.map((p) => p.nickname)).toEqual(["Ana", "Robin"]);
    await Promise.all([a.close(), b.close()]);
  });

  it("tells every member the names of the rooms, for the rotation table", async () => {
    const [a] = await open("a");
    a.send({ t: "lobby.create", nickname: "Ana" });
    const { rooms } = await a.next<LobbyMsg>("lobby");
    // the room set changes between phases, so check the shape and the first room, not the list
    expect(rooms.length).toBeGreaterThanOrEqual(3);
    expect(rooms[0]).toBe("Loading Dock");
    expect(rooms.every((name) => name.length > 0)).toBe(true);
    await a.close();
  });

  it("lets the host rename the team and refuses anyone else", async () => {
    const [a, b] = await open("a", "b");
    a.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await a.next<LobbyMsg>("lobby");
    b.send({ t: "lobby.join", code: lobby.code, nickname: "Bo", as: "player" });
    await b.next("lobby");
    b.send({ t: "lobby.team", name: "Mine" });
    expect((await b.next<ErrorMsg>("error")).code).toBe("not-host");
    a.send({ t: "lobby.team", name: "Night Owls" });
    const seen = await lobbyWhere(b, (m) => m.lobby.teamName === "Night Owls");
    expect(seen.lobby.teamName).toBe("Night Owls");
    await Promise.all([a.close(), b.close()]);
  });

  it("throttles ten wrong codes from one device", async () => {
    const [a] = await open("a");
    for (let i = 0; i < 10; i++) {
      a.send({ t: "lobby.join", code: "ZZZZ", nickname: "Ana", as: "player" });
      expect((await a.next<ErrorMsg>("error")).code).toBe("lobby-not-found");
    }
    a.send({ t: "lobby.join", code: "ZZZZ", nickname: "Ana", as: "player" });
    expect((await a.next<ErrorMsg>("error")).code).toBe("throttled");
    await a.close();
  });
});
