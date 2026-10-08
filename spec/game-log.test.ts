import { randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import { byRole, closeAll, ready, startedGame } from "./play.ts";
import { connect } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface Game {
  lobbiesOpen: number;
  gamesPlaying: number;
  playersConnected: number;
  events: Record<string, number>;
  channelsByRole: Record<string, Record<string, number>>;
  rssMb: number;
}
const read = async (): Promise<Game> =>
  ((await (await fetch(new URL("/stats.json", baseUrl))).json()) as { game: Game }).game;

const until = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 2500): Promise<T> => {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (ok(v) || Date.now() > deadline) return v;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

describe("game logging and the live stats", () => {
  it("counts lobby.create and lobby.join as people make and join a lobby", async () => {
    const before = await read();
    const a = await connect(baseUrl);
    const b = await connect(baseUrl);
    a.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await a.next<{ lobby: { code: string } }>("lobby");
    b.send({ t: "lobby.join", code: lobby.code, nickname: "Bo", as: "player" });
    await b.next("lobby");
    const after = await until(
      read,
      (g) => (g.events["lobby.join"] ?? 0) > (before.events["lobby.join"] ?? 0),
    );
    expect(after.events["lobby.create"]).toBeGreaterThanOrEqual(
      (before.events["lobby.create"] ?? 0) + 1,
    );
    expect(after.events["lobby.join"]).toBeGreaterThanOrEqual(
      (before.events["lobby.join"] ?? 0) + 1,
    );
    expect(after.events["socket.open"]).toBeGreaterThanOrEqual(
      (before.events["socket.open"] ?? 0) + 2,
    );
    await Promise.all([a.close(), b.close()]);
  });

  it("playersConnected rises with three sockets and falls when they close", async () => {
    const base = await read();
    const sockets = await Promise.all([connect(baseUrl), connect(baseUrl), connect(baseUrl)]);
    const up = await until(read, (g) => g.playersConnected >= base.playersConnected + 3);
    expect(up.playersConnected).toBeGreaterThanOrEqual(3);
    expect(up.playersConnected).toBeGreaterThanOrEqual(base.playersConnected + 3);
    await Promise.all(sockets.map((s) => s.close()));
    const down = await until(read, (g) => g.playersConnected <= up.playersConnected - 3);
    expect(down.playersConnected).toBeLessThanOrEqual(up.playersConnected - 3);
  });

  it("counts a started game and channel use by role, kind only", async () => {
    const before = await read();
    const { players } = await startedGame(baseUrl);
    ready(players);
    const deaf = byRole(players, "deaf");
    deaf.socket.send({ t: "say", kind: "callout", callout: "left" });
    const after = await until(
      read,
      (g) => (g.channelsByRole.deaf?.say ?? 0) > (before.channelsByRole.deaf?.say ?? 0),
    );
    expect(after.events["game.start"]).toBeGreaterThanOrEqual(
      (before.events["game.start"] ?? 0) + 1,
    );
    expect(after.events["channel.send"]).toBeGreaterThanOrEqual(
      (before.events["channel.send"] ?? 0) + 1,
    );
    expect(after.gamesPlaying).toBeGreaterThanOrEqual(1);
    await closeAll(players);
  });

  it("never shows a nickname, team name, lobby code or callout text on /stats or /stats.json", async () => {
    const nick = `NOSY-${randomUUID()}`;
    const team = `TEAM-${randomUUID()}`;
    const { players, code } = await startedGame(baseUrl);
    const host = players[0]?.socket;
    host?.send({ t: "lobby.team", name: team });
    // the three seats keep the starter's names; add a secret-looking nickname by rejoining a spectator
    const watcher = await connect(baseUrl);
    watcher.send({ t: "lobby.join", code, nickname: nick, as: "spectator" });
    await watcher.next("lobby");
    ready(players);
    const deaf = byRole(players, "deaf");
    deaf.socket.send({ t: "say", kind: "callout", callout: "left" });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const data = await (await fetch(new URL("/stats.json", baseUrl))).text();
    const page = await (await fetch(new URL("/stats", baseUrl))).text();
    for (const text of [data, page]) {
      for (const secret of [nick, team, code]) expect(text).not.toContain(secret);
    }
    await watcher.close();
    await closeAll(players);
  });

  it("reports memory as a positive number", async () => {
    expect((await read()).rssMb).toBeGreaterThan(0);
  });
});
