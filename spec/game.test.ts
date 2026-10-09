import { describe, expect, inject, it } from "vitest";
import { byRole, closeAll, nextView, type Player, ready, startedGame } from "./play.ts";
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
    await nextView(deaf); // the first view marks the start
    const until = Date.now() + 1000;
    let views = 0;
    while (Date.now() < until) {
      await nextView(deaf, Math.max(1, until - Date.now())).then(
        () => views++,
        () => undefined,
      );
    }
    expect(views).toBeGreaterThanOrEqual(15);
    await closeAll(players);
  });

  it("does not tick until all three are ready", async () => {
    const { players } = await startedGame(baseUrl);
    players[0]?.socket.send({ t: "ready" });
    players[1]?.socket.send({ t: "ready" });
    await expect(nextView(players[1] as (typeof players)[number], 400)).rejects.toThrow();
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

  it("lets only the host restart the room, which resets everyone to spawn with a full view", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const deaf = byRole(players, "deaf");
    const start = (await nextView(deaf)).you.pos?.x ?? Number.NaN;
    deaf.socket.send({ t: "input", seq: 1, move: { x: 1, y: 0 }, act: false });
    let moved = false;
    for (let i = 0; i < 20 && !moved; i++)
      moved = ((await nextView(deaf)).you.pos?.x ?? 0) > start + 0.5;
    expect(moved).toBe(true);
    deaf.socket.send({ t: "input", seq: 2, move: { x: 0, y: 0 }, act: false });

    const guest = players[1] as (typeof players)[number];
    guest.socket.send({ t: "room.restart" });
    expect((await guest.socket.next<ErrorMsg>("error")).code).toBe("not-host");

    (players[0] as (typeof players)[number]).socket.send({ t: "room.restart" });
    let reset = false;
    for (let i = 0; i < 20 && !reset; i++) {
      const view = await nextView(deaf);
      reset = view.full && Math.abs((view.you.pos?.x ?? 0) - start) < 0.01 && view.tick < 10;
    }
    expect(reset).toBe(true);
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
