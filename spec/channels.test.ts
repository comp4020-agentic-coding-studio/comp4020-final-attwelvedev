import { describe, expect, inject, it } from "vitest";
import type { ChannelMessage } from "../src/net/protocol.ts";
import { byRole, closeAll, nextView, type Player, ready, startedGame } from "./play.ts";

const baseUrl = inject("baseUrl");

type Msg = { t: "msg" } & ChannelMessage;
interface ErrorMsg {
  t: "error";
  code: string;
}

const got = (p: Player, ms = 1000) => p.socket.next<Msg>("msg", ms);
const silent = (p: Player, ms = 1500) =>
  expect(p.socket.next("msg", ms)).rejects.toThrow(/no "msg" message/);

async function crew() {
  const { players } = await startedGame(baseUrl);
  ready(players);
  return {
    players,
    blind: byRole(players, "blind"),
    deaf: byRole(players, "deaf"),
    mute: byRole(players, "mute"),
  };
}

// A tile the sender stands on is always in its own sight.
const tileUnder = async (p: Player) => {
  const pos = (await nextView(p)).you.pos ?? { x: 0, y: 0 };
  return { x: Math.floor(pos.x) + 0.5, y: Math.floor(pos.y) + 0.5 };
};

describe("channels: who hears what", () => {
  it("a callout from Can't hear reaches Can't see and Can't speak, not the sender", async () => {
    const { players, blind, deaf, mute } = await crew();
    deaf.socket.send({ t: "send", msg: { method: "callout", callout: "left" } });
    const [toBlind, toMute] = await Promise.all([got(blind), got(mute), silent(deaf)]);
    for (const m of [toBlind, toMute]) {
      expect(m).toMatchObject({
        method: "callout",
        callout: "left",
        from: { seat: deaf.seat, role: "deaf", nickname: expect.any(String) },
      });
    }
    await closeAll(players);
  });

  it("Can't speak sending a callout is cant-send, and nobody hears anything", async () => {
    const { players, blind, deaf, mute } = await crew();
    mute.socket.send({ t: "send", msg: { method: "callout", callout: "go" } });
    expect((await mute.socket.next<ErrorMsg>("error")).code).toBe("cant-send");
    await Promise.all([silent(blind), silent(deaf)]);
    await closeAll(players);
  });

  it("Can't see sending a clip is cant-send", async () => {
    const { players, blind, deaf, mute } = await crew();
    blind.socket.send({ t: "send", msg: { method: "clip", clip: "airhorn" } });
    expect((await blind.socket.next<ErrorMsg>("error")).code).toBe("cant-send");
    await Promise.all([silent(deaf), silent(mute)]);
    await closeAll(players);
  });

  it("a clip from Can't speak reaches Can't see only; a second at once is a cooldown", async () => {
    const { players, blind, deaf, mute } = await crew();
    mute.socket.send({ t: "send", msg: { method: "clip", clip: "airhorn" } });
    const heard = await got(blind);
    expect(heard).toMatchObject({ method: "clip", clip: "airhorn", from: { role: "mute" } });
    mute.socket.send({ t: "send", msg: { method: "clip", clip: "airhorn" } });
    expect((await mute.socket.next<ErrorMsg>("error")).code).toBe("cooldown");
    await silent(deaf);
    await closeAll(players);
  });

  it("the sender is told when a clip's cooldown ends", async () => {
    const { players, mute } = await crew();
    mute.socket.send({ t: "send", msg: { method: "clip", clip: "airhorn" } });
    const cd = await mute.socket.next<{ method: string; until: number }>("cooldown");
    expect(cd.method).toBe("clip");
    expect(cd.until).toBeGreaterThan(Date.now() + 2000);
    await closeAll(players);
  });

  it("a mark from Can't hear lands where it was placed and reaches Can't speak only", async () => {
    const { players, blind, deaf, mute } = await crew();
    const at = await tileUnder(deaf);
    deaf.socket.send({ t: "send", msg: { method: "mark", id: "key", at } });
    const [seen] = await Promise.all([got(mute), silent(blind)]);
    expect(seen).toMatchObject({ method: "mark", id: "key", at });
    // it is also in the world, so a view for Can't speak carries it (views queued
    // before the mark landed don't, so look at the next few)
    let stamped = false;
    for (let i = 0; i < 40 && !stamped; i++) {
      stamped = (await nextView(mute)).entities.some((e) => e.kind === "stamp" && e.pos.x === at.x);
    }
    expect(stamped).toBe(true);
    // ...and never in Can't see's views
    expect(JSON.stringify(await nextView(blind))).not.toContain("stamp");
    await closeAll(players);
  });

  it("a mark on a wall is not-in-sight, not 'your role can't send that', and reaches nobody", async () => {
    const { players, blind, deaf, mute } = await crew();
    deaf.socket.send({ t: "send", msg: { method: "mark", id: "key", at: { x: 0.5, y: 0.5 } } });
    expect((await deaf.socket.next<ErrorMsg>("error")).code).toBe("not-in-sight");
    await Promise.all([silent(blind), silent(mute)]);
    await closeAll(players);
  });

  it("a face from Can't see reaches Can't hear and Can't speak, with the sender's position", async () => {
    const { players, blind, deaf, mute } = await crew();
    blind.socket.send({ t: "send", msg: { method: "face", id: "f01" } });
    const [toDeaf, toMute] = await Promise.all([got(deaf), got(mute), silent(blind)]);
    for (const seen of [toDeaf, toMute]) {
      expect(seen).toMatchObject({ method: "face", id: "f01" });
      expect(seen.from.pos).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    }
    await closeAll(players);
  });

  it("free text is cleaned: control characters go, 120 characters at most", async () => {
    const { players, blind, deaf } = await crew();
    deaf.socket.send({ t: "send", msg: { method: "text", text: `  hi\u0007 ${"x".repeat(200)}` } });
    const m = await got(blind);
    const text = "text" in m ? m.text : null;
    expect(text).toMatch(/^hi x+$/);
    expect(text?.length).toBe(120);
    await closeAll(players);
  });
});
