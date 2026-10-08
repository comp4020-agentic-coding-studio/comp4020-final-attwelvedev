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
    expect(first).toMatchObject({ room: "01-loading-dock", loot: 0 });
    expect(first.ms).toBeGreaterThan(0);
    expect(first.lootTotal).toBeGreaterThanOrEqual(1);
    for (const p of players.slice(1)) {
      expect(await p.socket.next<{ room: string }>("cleared")).toMatchObject({
        room: "01-loading-dock",
      });
    }

    // comms stay open on the cleared screen: Can't hear still reaches Can't see
    const deaf = players.find((p) => p.role === "deaf");
    const blind = players.find((p) => p.role === "blind");
    deaf?.socket.send({ t: "say", kind: "callout", callout: "wait" });
    expect(await blind?.socket.next<{ family: string }>("msg", 2000)).toMatchObject({
      family: "say",
    });

    players[0]?.socket.send({ t: "next" });
    const reveals = await Promise.all(players.map((p) => p.socket.next<Reveal>("reveal", 3000)));
    for (const [i, reveal] of reveals.entries()) {
      expect(reveal.index).toBe(1);
      expect(reveal.room).toBe("02-cameras-lasers");
      expect(reveal.role).not.toBe(before[i]);
    }
    expect(new Set(reveals.map((r) => r.role))).toEqual(new Set(ROLES));
    await closeAll(players);
  }, 120_000);
});
