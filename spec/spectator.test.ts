import { describe, expect, inject, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import { closeAll, ready, startedGame } from "./play.ts";
import { connect, type Socket } from "./ws.ts";

const baseUrl = inject("baseUrl");

async function joinAsSpectator(code: string): Promise<Socket> {
  const res = await fetch(new URL("/", baseUrl));
  const cookie = res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
  const spectator = await connect(baseUrl, cookie);
  spectator.send({ t: "lobby.join", code, nickname: "Spec", as: "spectator" });
  await spectator.next("lobby");
  return spectator;
}

describe("a spectator follows a running game", () => {
  it("receives views at 10 Hz or more, defaulting to seat 0", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    await players[0]?.socket.next("view"); // the game is actually ticking

    const spectator = await joinAsSpectator(code);
    const first = await spectator.next<{ view: RoleView }>("view");
    expect(first.view.you.seat).toBe(0);

    const start = Date.now();
    for (let i = 0; i < 15; i++) {
      await spectator.next<{ view: RoleView }>("view", 1000);
    }
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(1500); // 15 views in under 1.5 s is at least 10/s

    await spectator.close();
    await closeAll(players);
  });

  it("switches which seat it follows on request", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    await players[0]?.socket.next("view");

    const spectator = await joinAsSpectator(code);
    await spectator.next<{ view: RoleView }>("view");

    spectator.send({ t: "spectate", seat: 2 });
    await expect
      .poll(async () => (await spectator.next<{ view: RoleView }>("view", 500)).view.you.seat, {
        timeout: 2000,
      })
      .toBe(2);

    await spectator.close();
    await closeAll(players);
  });

  it("receives the msgs the followed seat receives, but can't send", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    await players[0]?.socket.next("view");

    const blind = players.find((p) => p.role === "blind");
    const deaf = players.find((p) => p.role === "deaf");
    if (!blind || !deaf) throw new Error("expected a blind and a deaf seat");

    const spectator = await joinAsSpectator(code);
    spectator.send({ t: "spectate", seat: blind.seat });
    await spectator.next<{ view: RoleView }>("view");

    // say: deaf sends, blind and mute receive — the spectator is following blind
    deaf.socket.send({ t: "say", kind: "callout", callout: "wait" });
    const msg = await spectator.next<{ family: string }>("msg", 2000);
    expect(msg.family).toBe("say");

    for (const attempt of [
      { t: "say", kind: "callout", callout: "wait" },
      { t: "sound", clip: "airhorn" },
      { t: "show", kind: "face", id: "f01" },
    ] as const) {
      spectator.send(attempt);
      const err = await spectator.next<{ code: string }>("error");
      expect(err.code).toBe("cant-send");
    }

    await spectator.close();
    await closeAll(players);
  });
});
