import { describe, expect, inject, it } from "vitest";
import { MAX_TEXT } from "../src/game/channels.ts";
import type { RoleView } from "../src/game/perception.ts";
import { closeAll, FIVE, ready, startedFive, startedGame } from "./play.ts";
import { connect, type Socket } from "./ws.ts";

const baseUrl = inject("baseUrl");

async function joinAsSpectator(code: string, nickname = "Spec"): Promise<Socket> {
  const res = await fetch(new URL("/", baseUrl));
  const cookie = res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
  const spectator = await connect(baseUrl, cookie);
  spectator.send({ t: "lobby.join", code, nickname, as: "spectator" });
  await spectator.next("lobby");
  return spectator;
}

const voiceFrame = (seq: number, opusBytes = 40): Uint8Array => {
  const buf = new Uint8Array(13 + opusBytes).fill(0xcd);
  const view = new DataView(buf.buffer);
  buf[0] = 1;
  view.setUint32(1, seq);
  view.setFloat64(5, Date.now());
  return buf;
};
const silent = (s: Socket, ms = 700) => expect(s.nextBinary(ms)).rejects.toThrow(/no binary frame/);
interface SpecMsg {
  t: "spec.msg";
  nickname: string;
  text: string;
  at: number;
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
    deaf.socket.send({ t: "send", msg: { method: "callout", callout: "wait" } });
    const msg = await spectator.next<{ method: string }>("msg", 2000);
    expect(msg.method).toBe("callout");

    for (const attempt of [
      { t: "send", msg: { method: "callout", callout: "wait" } },
      { t: "send", msg: { method: "clip", clip: "airhorn" } },
      { t: "send", msg: { method: "face", id: "f01" } },
    ] as const) {
      spectator.send(attempt);
      const err = await spectator.next<{ code: string }>("error");
      expect(err.code).toBe("cant-send");
    }

    await spectator.close();
    await closeAll(players);
  });
});

describe("a new spectator sees the whole room", () => {
  it("with no sounds until they follow someone", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    await players[0]?.socket.next("view");
    const spectator = await joinAsSpectator(code);
    const first = await spectator.next<{ view: RoleView }>("view");
    expect(first.view.sounds).toEqual([]);
    expect(first.view.tiles?.length).toBeGreaterThan(0); // the whole map, from the first view
    expect(first.view.you.pos).toBeUndefined(); // no camera follows anyone
    expect(first.view.entities.filter((e) => e.kind === "player")).toHaveLength(3);

    spectator.send({ t: "spectate", seat: 1 }); // following the Can't-hear seat: still no sounds, by role
    spectator.send({ t: "spectate", seat: 0 }); // following Can't see: now they hear what that seat hears
    await expect
      .poll(
        async () =>
          (await spectator.next<{ view: RoleView }>("view", 500)).view.you.pos !== undefined,
        {
          timeout: 2000,
        },
      )
      .toBe(true);

    spectator.send({ t: "spectate", seat: null }); // and back to the whole room
    await expect
      .poll(
        async () =>
          (await spectator.next<{ view: RoleView }>("view", 500)).view.you.pos === undefined,
        {
          timeout: 2000,
        },
      )
      .toBe(true);
    await spectator.close();
    await closeAll(players);
  });
});

describe("the watchers' room", () => {
  it("a spectator's chat reaches the other watchers and a sitting-out person, never a player", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, cy, di, ed] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    for (const s of [host, bo, cy]) s.send({ t: "ready" });
    await host.next("view", 3000);
    const spectator = await joinAsSpectator(five.code, "Gus");
    const other = await joinAsSpectator(five.code, "Hal");

    spectator.send({ t: "spec.say", text: "nice one" });
    for (const watcher of [di, ed, other]) {
      expect(await watcher.next<SpecMsg>("spec.msg", 2000)).toMatchObject({
        nickname: "Gus",
        text: "nice one",
      });
    }
    expect(await spectator.next<SpecMsg>("spec.msg", 2000)).toMatchObject({ text: "nice one" }); // the sender sees it too
    // a sitting-out person can speak to the watchers as well
    di.send({ t: "spec.say", text: "hello from Di" });
    expect(await ed.next<SpecMsg>("spec.msg", 2000)).toMatchObject({ nickname: "Di" });

    for (const player of [host, bo, cy]) {
      await expect(player.next("spec.msg", 600)).rejects.toThrow(/no "spec.msg"/);
    }
    await spectator.close();
    await other.close();
    await closeAll(five.sockets.map((socket) => ({ socket })) as never);
    void FIVE;
  });

  it("a player can't say anything to the watchers, and a long or empty line is dropped", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, cy, di] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    for (const s of [host, bo, cy]) s.send({ t: "ready" });
    await host.next("view", 3000);
    bo.send({ t: "spec.say", text: "psst" });
    await expect(di.next("spec.msg", 600)).rejects.toThrow(/no "spec.msg"/);
    di.send({ t: "spec.say", text: "   " });
    await expect(five.sockets[4]?.next("spec.msg", 600)).rejects.toThrow(/no "spec.msg"/);
    di.send({ t: "spec.say", text: "x".repeat(500) });
    const long = await (five.sockets[4] as Socket).next<SpecMsg>("spec.msg", 2000);
    expect(long.text.length).toBe(MAX_TEXT);
    await closeAll(five.sockets.map((socket) => ({ socket })) as never);
  });

  it("a watcher's voice frame reaches the other watchers only", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, cy, di, ed] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    for (const s of [host, bo, cy]) s.send({ t: "ready" });
    await host.next("view", 3000);
    const spectator = await joinAsSpectator(five.code, "Gus");
    await spectator.next("view", 3000);

    spectator.sendBinary(voiceFrame(5));
    for (const watcher of [di, ed]) {
      const out = await watcher.nextBinary(1500);
      expect(out[0]).toBe(2); // a watcher's voice, never mistaken for a seat's
      expect(new DataView(out.buffer, out.byteOffset).getUint32(2)).toBe(5);
      expect(out.length).toBe(14 + 40);
    }
    // Di and Ed are watchers 1 and 2 (spectators first, then people sitting out); Gus is watcher 0
    di.sendBinary(voiceFrame(6));
    const heard = await ed.nextBinary(1500);
    expect(heard[1]).toBe(1);
    await silent(host);
    await silent(bo);
    await silent(cy);
    await spectator.close();
    await closeAll(five.sockets.map((socket) => ({ socket })) as never);
  });

  it("a player's voice never reaches a watcher as a watcher's, and a watcher's never reaches a player", async () => {
    const five = await startedFive(baseUrl);
    const [host, bo, cy, di] = five.sockets as [Socket, Socket, Socket, Socket, Socket];
    for (const s of [host, bo, cy]) s.send({ t: "ready" });
    await host.next("view", 3000);
    di.sendBinary(voiceFrame(1));
    await silent(host);
    await silent(bo);
    await silent(cy);
    await closeAll(five.sockets.map((socket) => ({ socket })) as never);
  });
});
