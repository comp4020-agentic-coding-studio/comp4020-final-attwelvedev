import { describe, expect, inject, it } from "vitest";
import {
  byRole,
  closeAll,
  nextTick,
  nextView,
  noTick,
  type Player,
  ready,
  startedGame,
} from "./play.ts";
import { connect } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface ErrorMsg {
  t: "error";
  code: string;
}

describe("starting and playing a game", () => {
  it("refuses a non-host start with not-host", async () => {
    const [host, guest] = await Promise.all([connect(baseUrl), connect(baseUrl)]);
    host.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await host.next<{ lobby: { code: string } }>("lobby");
    guest.send({ t: "lobby.join", code: lobby.code, nickname: "Bo", as: "player" });
    await guest.next("lobby");
    guest.send({ t: "lobby.start" });
    expect((await guest.next<ErrorMsg>("error")).code).toBe("not-host");
    await Promise.all([host.close(), guest.close()]);
  });

  it("lets the host start alone: the empty seats are bots (no more need-three)", async () => {
    const host = await connect(baseUrl);
    host.send({ t: "lobby.create", nickname: "Ana" });
    await host.next("lobby");
    host.send({ t: "lobby.start" });
    const reveal = await host.next<{ crew: { bot: boolean }[] }>("reveal");
    expect(reveal.crew.filter((c) => c.bot)).toHaveLength(2);
    await host.close();
  });

  it("reveals a distinct role to each of three seated players", async () => {
    const { players } = await startedGame(baseUrl);
    expect(new Set(players.map((p) => p.role))).toEqual(new Set(["blind", "deaf", "mute"]));
    await closeAll(players);
  });

  it("sends views at 15 per second or more once all three are ready", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const deaf = byRole(players, "deaf");
    // A rate is views over the time they took, not views that happened to land in a window:
    // the test runner's own latency decides where a window's edge falls, and one view lost off
    // the end of a 1 s window is 5% of the count. So time 30 views from the first to the last.
    const arrivals: number[] = [];
    await nextTick(deaf.socket, 3000); // the first tick marks the start
    arrivals.push(performance.now());
    while (arrivals.length < 30) {
      await nextTick(deaf.socket, 2000);
      arrivals.push(performance.now());
    }
    const seconds = ((arrivals.at(-1) ?? 0) - (arrivals[0] ?? 0)) / 1000;
    const rate = (arrivals.length - 1) / seconds;
    expect(rate, `${arrivals.length - 1} views in ${seconds.toFixed(2)} s`).toBeGreaterThanOrEqual(
      15,
    );
    await closeAll(players);
  });

  it("does not tick until all three are ready", async () => {
    const { players } = await startedGame(baseUrl);
    players[0]?.socket.send({ t: "ready" });
    players[1]?.socket.send({ t: "ready" });
    await noTick((players[1] as (typeof players)[number]).socket, 400);
    await closeAll(players);
  });

  it("moves the deaf player's own position when it sends a move input", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const deaf = byRole(players, "deaf");
    const first = await nextView(deaf);
    const x0 = first.you.pos?.x ?? Number.NaN;
    deaf.socket.send({ t: "input", seq: 1, move: { x: 1, y: 0 }, act: false });
    const deadline = Date.now() + 500;
    let moved = false;
    while (!moved && Date.now() < deadline) {
      const view = await nextView(deaf, Math.max(1, deadline - Date.now())).catch(() => null);
      moved = (view?.you.pos?.x ?? x0) > x0 && view?.ack === 1;
    }
    expect(moved).toBe(true);
    await closeAll(players);
  });

  it("lets a player who reconnects move again, though their new page counts inputs from 1", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const deaf = byRole(players, "deaf");
    await nextView(deaf);
    for (let seq = 1; seq <= 100; seq++) {
      deaf.socket.send({ t: "input", seq, move: { x: 0, y: 0 }, act: false });
    }
    await deaf.socket.drop();

    // the same device comes back (a reload, or a connection that dropped)
    const back = await connect(baseUrl, deaf.cookie);
    await back.next("reveal");
    const returned: Player = { ...deaf, socket: back };
    const x0 = (await nextView(returned)).you.pos?.x ?? Number.NaN;
    back.send({ t: "input", seq: 1, move: { x: 1, y: 0 }, act: false });
    let moved = false;
    const until = Date.now() + 1000;
    while (!moved && Date.now() < until) {
      const view = await nextView(returned, Math.max(1, until - Date.now())).catch(() => null);
      moved = (view?.you.pos?.x ?? x0) > x0 + 0.2;
    }
    expect(moved).toBe(true);
    await closeAll([...players.filter((p) => p !== deaf), returned]);
  });
});
