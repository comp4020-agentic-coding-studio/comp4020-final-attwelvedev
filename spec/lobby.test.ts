import { describe, expect, inject, it } from "vitest";
import { connect, type Socket } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface Seat {
  who: string | null;
  nickname: string | null;
}
interface LobbyMsg {
  t: "lobby";
  lobby: {
    code: string;
    teamName: string;
    host: string;
    seats: Seat[];
    spectators: { nickname: string }[];
  };
  you: { seat: number | null; host: boolean };
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

const filled = (m: LobbyMsg) => m.lobby.seats.filter((s) => s.who !== null).length;

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
    expect(created.you).toEqual({ seat: 0, host: true });
    const { code } = created.lobby;

    b.send({ t: "lobby.join", code, nickname: "Bo", as: "player" });
    const bJoined = await b.next<LobbyMsg>("lobby");
    expect(bJoined.you).toEqual({ seat: 1, host: false });

    const started = Date.now();
    c.send({ t: "lobby.join", code, nickname: "Cy", as: "player" });
    const seen = await lobbyWhere(a, (m) => filled(m) === 3, 1000);
    expect(Date.now() - started).toBeLessThanOrEqual(1000);
    expect(seen.lobby.seats.map((s) => s.nickname)).toEqual(["Ana", "Bo", "Cy"]);
    await Promise.all([a.close(), b.close(), c.close()]);
  });

  it("shows a watcher of the open list a new lobby within 1 s, and drops it when it fills", async () => {
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
    await listWhere(watcher, (m) => !m.list.some((l) => l.code === lobby.code), 1000);
    await Promise.all([watcher.close(), a.close(), b.close(), c.close()]);
  });

  it("answers a wrong code with error lobby-not-found", async () => {
    const [a] = await open("a");
    a.send({ t: "lobby.join", code: "ZZZZ", nickname: "Ana", as: "player" });
    const err = await a.next<ErrorMsg>("error");
    expect(err.code).toBe("lobby-not-found");
    expect(err.message).toContain("ZZZZ");
    await a.close();
  });

  it("answers a fourth player with lobby-full, and lists a fourth spectator", async () => {
    const [a, b, c, d, e] = await open("a", "b", "c", "d", "e");
    a.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await a.next<LobbyMsg>("lobby");
    for (const [s, nickname] of [
      [b, "Bo"],
      [c, "Cy"],
    ] as const) {
      s.send({ t: "lobby.join", code: lobby.code, nickname, as: "player" });
      await s.next("lobby");
    }
    d.send({ t: "lobby.join", code: lobby.code, nickname: "Di", as: "player" });
    expect((await d.next<ErrorMsg>("error")).code).toBe("lobby-full");

    e.send({ t: "lobby.join", code: lobby.code, nickname: "Ed", as: "spectator" });
    const seen = await lobbyWhere(a, (m) => m.lobby.spectators.length === 1);
    expect(seen.lobby.spectators[0]?.nickname).toBe("Ed");
    await Promise.all([a.close(), b.close(), c.close(), d.close(), e.close()]);
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
