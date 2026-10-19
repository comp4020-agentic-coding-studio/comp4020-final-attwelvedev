import { describe, expect, inject, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import { byRole, closeAll, nextView, type Player, ready, startedGame } from "./play.ts";
import { connect } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface VoteMsg {
  t: "vote";
  kind: "room" | "heist";
  by: string;
  left: number;
  yes: number[];
  no: number[];
  voters: number[];
}
interface EndMsg {
  t: "vote.end";
  kind: "room" | "heist";
  result: "passed" | "declined" | "timeout";
  by?: string;
}
interface RevealMsg {
  t: "reveal";
  index: number;
  role: string;
}

const atSpawn = (view: RoleView, x: number) =>
  view.full && Math.abs((view.you.pos?.x ?? 0) - x) < 0.01 && view.tick < 10;

describe("restart votes", () => {
  it("a restart-room vote passes when all three accept and everyone is back at spawn", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    const deaf = byRole(players, "deaf");
    const start = (await nextView(deaf)).you.pos?.x ?? Number.NaN;
    deaf.socket.send({ t: "input", seq: 1, move: { x: 1, y: 0 }, act: false });
    let moved = false;
    for (let i = 0; i < 20 && !moved; i++)
      moved = ((await nextView(deaf)).you.pos?.x ?? 0) > start + 0.5;
    expect(moved).toBe(true);
    deaf.socket.send({ t: "input", seq: 2, move: { x: 0, y: 0 }, act: false });

    // anyone may propose, not only the host
    guest.socket.send({ t: "vote.propose", kind: "room" });
    const open = await host.socket.next<VoteMsg>("vote");
    expect(open).toMatchObject({ kind: "room", by: "Bo", yes: [1], no: [], voters: [0, 1, 2] });
    expect(open.left).toBeGreaterThan(0);
    host.socket.send({ t: "vote.cast", yes: true });
    third.socket.send({ t: "vote.cast", yes: true });
    const end = await third.socket.next<EndMsg>("vote.end");
    expect(end).toMatchObject({ kind: "room", result: "passed" });

    let reset = false;
    for (let i = 0; i < 20 && !reset; i++) reset = atSpawn(await nextView(deaf), start);
    expect(reset).toBe(true);
    await closeAll(players);
  });

  it("one decline ends it, saying who", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    host.socket.send({ t: "vote.propose", kind: "room" });
    await guest.socket.next<VoteMsg>("vote");
    guest.socket.send({ t: "vote.cast", yes: false });
    for (const p of [host, third]) {
      expect(await p.socket.next<EndMsg>("vote.end")).toMatchObject({
        kind: "room",
        result: "declined",
        by: "Bo",
      });
    }
    await closeAll(players);
  });

  it("no answer in 15 s ends it as timeout", async (ctx) => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest] = players as [Player, Player, Player];
    host.socket.send({ t: "vote.propose", kind: "room" });
    const open = await guest.socket.next<VoteMsg>("vote");
    if (open.left > 5000) {
      await closeAll(players);
      return ctx.skip(
        `the vote is ${Math.round(open.left / 1000)} s: start the server with VOTE_MS=2000`,
      );
    }
    expect(await guest.socket.next<EndMsg>("vote.end", 6000)).toMatchObject({
      kind: "room",
      result: "timeout",
    });
    await closeAll(players);
  });

  it("a spectator can't propose or vote", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    const spectator = await connect(baseUrl);
    spectator.send({ t: "lobby.join", code, nickname: "Ed", as: "spectator" });
    await spectator.next("lobby");
    spectator.send({ t: "vote.propose", kind: "room" });
    await expect(host.socket.next("vote", 700)).rejects.toThrow(/no "vote"/);

    host.socket.send({ t: "vote.propose", kind: "room" });
    await guest.socket.next<VoteMsg>("vote");
    await expect(spectator.next("vote", 500)).rejects.toThrow(/no "vote"/); // watchers aren't told
    spectator.send({ t: "vote.cast", yes: false });
    guest.socket.send({ t: "vote.cast", yes: true });
    third.socket.send({ t: "vote.cast", yes: true });
    expect((await host.socket.next<EndMsg>("vote.end")).result).toBe("passed"); // the watcher's no counted for nothing
    await spectator.close();
    await closeAll(players);
  });

  it("players keep moving during a vote", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest] = players as [Player, Player, Player];
    const deaf = byRole(players, "deaf");
    host.socket.send({ t: "vote.propose", kind: "room" });
    await guest.socket.next<VoteMsg>("vote");
    const start = (await nextView(deaf)).you.pos?.x ?? Number.NaN;
    deaf.socket.send({ t: "input", seq: 1, move: { x: 1, y: 0 }, act: false });
    let moved = false;
    for (let i = 0; i < 20 && !moved; i++)
      moved = ((await nextView(deaf)).you.pos?.x ?? 0) > start + 0.3;
    expect(moved).toBe(true); // the vote is still open: nobody has answered
    await closeAll(players);
  });

  it("a second proposal while one is open is ignored", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest] = players as [Player, Player, Player];
    host.socket.send({ t: "vote.propose", kind: "room" });
    await host.socket.next<VoteMsg>("vote"); // the one that opened
    await guest.socket.next<VoteMsg>("vote");
    guest.socket.send({ t: "vote.propose", kind: "heist" });
    await expect(host.socket.next("vote", 700)).rejects.toThrow(/no "vote"/); // nothing new was announced
    await closeAll(players);
  });

  it("restart heist goes back to room 1's reveal", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest, third] = players as [Player, Player, Player];
    host.socket.send({ t: "vote.propose", kind: "heist" });
    await guest.socket.next<VoteMsg>("vote");
    guest.socket.send({ t: "vote.cast", yes: true });
    third.socket.send({ t: "vote.cast", yes: true });
    expect(await host.socket.next<EndMsg>("vote.end")).toMatchObject({
      kind: "heist",
      result: "passed",
    });
    const reveals = await Promise.all(players.map((p) => p.socket.next<RevealMsg>("reveal", 3000)));
    expect(reveals.map((r) => r.index)).toEqual([0, 0, 0]);
    expect(reveals.map((r) => r.role)).toEqual(["blind", "deaf", "mute"]);
    // the room waits for Ready again: nobody is told a view until they press it
    await expect(host.socket.next("view", 800)).rejects.toThrow(/no "view"/);
    await closeAll(players);
  });

  it("room.restart is gone: sending it does nothing", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host] = players as [Player, Player, Player];
    host.socket.send({ t: "room.restart" });
    await expect(host.socket.next("error", 600)).rejects.toThrow(/no "error"/);
    await closeAll(players);
  });
});
