import { describe, expect, inject, it } from "vitest";
import { byRole, closeAll, nextView, ready, startedGame } from "./play.ts";
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

  it("says need-three when the host starts with fewer than three seated", async () => {
    const host = await connect(baseUrl);
    host.send({ t: "lobby.create", nickname: "Ana" });
    await host.next("lobby");
    host.send({ t: "lobby.start" });
    expect((await host.next<ErrorMsg>("error")).code).toBe("need-three");
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
});
