import { describe, expect, inject, it } from "vitest";
import type { Role } from "../src/game/types.ts";
import { ROLES } from "../src/game/types.ts";
import { clearRoomOne } from "./heistPlay.ts";
import { closeAll, ready, startedGame } from "./play.ts";

const baseUrl = inject("baseUrl");

interface Reveal {
  t: "reveal";
  room: string;
  index: number;
  role: Role;
}
interface ErrorMsg {
  t: "error";
  code: string;
}

describe("the comms map comes with `cleared`", () => {
  it("counts each message the crew sent, once per seat it reached, by method, and nothing else", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const deaf = players.find((p) => p.role === "deaf") as (typeof players)[number];
    const blind = players.find((p) => p.role === "blind") as (typeof players)[number];
    const mute = players.find((p) => p.role === "mute") as (typeof players)[number];
    // Can't hear's callouts reach Can't see and Can't speak; Can't see's text reaches Can't speak only
    deaf.socket.send({ t: "send", msg: { method: "callout", callout: "wait" } });
    deaf.socket.send({ t: "send", msg: { method: "callout", callout: "go" } });
    blind.socket.send({ t: "send", msg: { method: "text", text: "on my way" } });
    await mute.socket.next("msg", 2000);
    await mute.socket.next("msg", 2000);
    await mute.socket.next("msg", 2000);
    const cleared = await clearRoomOne(players);
    expect(cleared.comms).toEqual(
      [
        { from: blind.seat, to: mute.seat, count: 1, by: { text: 1 } },
        ...[blind.seat, mute.seat]
          .sort()
          .map((to) => ({ from: deaf.seat, to, count: 2, by: { callout: 2 } })),
      ].sort((a, b) => a.from - b.from || a.to - b.to),
    );
    expect(JSON.stringify(cleared.comms)).not.toMatch(/wait|on my way|"go"/);
    await closeAll(players);
  }, 120_000);
});

describe("the heist moves on from a cleared room", () => {
  it("ignores `next` until the room is cleared", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    players[0]?.socket.send({ t: "next" });
    await expect(players[0]?.socket.next("reveal", 1200)).rejects.toThrow(/no "reveal"/);
    await closeAll(players);
  });

  it("a non-host `next` is refused with not-host", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    players[1]?.socket.send({ t: "next" });
    expect((await players[1]?.socket.next<ErrorMsg>("error"))?.code).toBe("not-host");
    await closeAll(players);
  });

  it("clearing room 01 sends `cleared` to all three; the host's `next` reveals room 02 with every role rotated", async () => {
    const { players } = await startedGame(baseUrl);
    const before = players.map((p) => p.role);
    ready(players);
    const first = await clearRoomOne(players);
    expect(first).toMatchObject({ room: "01-first-steps", loot: 0 });
    expect(first.ms).toBeGreaterThan(0);
    expect(first.lootTotal).toBeGreaterThanOrEqual(1);
    // room 1 has no side job: no cache result, and no side-job line in anyone's credits
    expect(first).not.toHaveProperty("cache");
    for (const c of first.credits) expect(c.lines.join(" ")).not.toMatch(/side job/);
    // one credit per seat, in fixed words: a teammate is a {seat} token, never a name
    expect(first.credits.map((c) => c.seat)).toEqual([0, 1, 2]);
    for (const c of first.credits) expect(c.lines.length).toBeGreaterThan(0);
    // the room's top 5 comes with it, this run among them or ranked on its own line
    expect(first.board.top.length).toBeGreaterThanOrEqual(1);
    expect(first.board.top.length).toBeLessThanOrEqual(5);
    const mine = first.board.top.filter((r) => r.mine);
    if (first.board.mine === null) {
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ ms: first.ms, loot: first.loot, lootTotal: first.lootTotal });
    } else {
      expect(mine).toHaveLength(0);
      expect(first.board.mine).toMatchObject({ ms: first.ms });
      expect(first.board.mine.rank).toBeGreaterThan(5);
    }
    for (const p of players.slice(1)) {
      expect(await p.socket.next<{ room: string }>("cleared")).toMatchObject({
        room: "01-first-steps",
      });
    }

    // comms stay open on the cleared screen: Can't hear still reaches Can't see
    const deaf = players.find((p) => p.role === "deaf");
    const blind = players.find((p) => p.role === "blind");
    deaf?.socket.send({ t: "send", msg: { method: "callout", callout: "wait" } });
    expect(await blind?.socket.next<{ method: string }>("msg", 2000)).toMatchObject({
      method: "callout",
    });

    players[0]?.socket.send({ t: "next" });
    const reveals = await Promise.all(players.map((p) => p.socket.next<Reveal>("reveal", 3000)));
    for (const [i, reveal] of reveals.entries()) {
      expect(reveal.index).toBe(1);
      expect(reveal.room).toBe("02-three-hands");
      expect(reveal.role).not.toBe(before[i]);
    }
    expect(new Set(reveals.map((r) => r.role))).toEqual(new Set(ROLES));
    await closeAll(players);
  }, 120_000);
});
