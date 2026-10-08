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

describe("channels: who hears what", () => {
  it("a callout from Can't hear reaches Can't see and Can't speak, not the sender", async () => {
    const { players, blind, deaf, mute } = await crew();
    deaf.socket.send({ t: "say", kind: "callout", callout: "left" });
    const [toBlind, toMute] = await Promise.all([got(blind), got(mute), silent(deaf)]);
    for (const m of [toBlind, toMute]) {
      expect(m).toMatchObject({
        family: "say",
        kind: "callout",
        callout: "left",
        from: { seat: deaf.seat, role: "deaf", nickname: expect.any(String) },
      });
    }
    await closeAll(players);
  });

  it("Can't speak cannot Say: cant-send, and nobody hears anything", async () => {
    const { players, blind, deaf, mute } = await crew();
    mute.socket.send({ t: "say", kind: "text", text: "hello" });
    expect((await mute.socket.next<ErrorMsg>("error")).code).toBe("cant-send");
    await Promise.all([silent(blind), silent(deaf)]);
    await closeAll(players);
  });

  it("a soundboard clip from Can't speak reaches Can't see, not Can't hear; a second at once is a cooldown", async () => {
    const { players, blind, deaf, mute } = await crew();
    mute.socket.send({ t: "sound", clip: "airhorn" });
    const heard = await got(blind);
    expect(heard).toMatchObject({ family: "sound", clip: "airhorn", from: { role: "mute" } });
    mute.socket.send({ t: "sound", clip: "airhorn" });
    expect((await mute.socket.next<ErrorMsg>("error")).code).toBe("cooldown");
    await silent(deaf);
    await closeAll(players);
  });

  it("the sender is told when a sound's cooldown ends", async () => {
    const { players, mute } = await crew();
    mute.socket.send({ t: "sound", clip: "airhorn" });
    const cd = await mute.socket.next<{ family: string; until: number }>("cooldown");
    expect(cd.family).toBe("sound");
    expect(cd.until).toBeGreaterThan(Date.now() + 2000);
    await closeAll(players);
  });

  it("a stamp from Can't hear reaches Can't speak with a position, and Can't see gets nothing", async () => {
    const { players, blind, deaf, mute } = await crew();
    deaf.socket.send({ t: "show", kind: "stamp", id: "key" });
    const [seen] = await Promise.all([got(mute), silent(blind)]);
    expect(seen).toMatchObject({ family: "show", kind: "stamp", id: "key" });
    expect(seen).toHaveProperty("at.x");
    expect(seen).toHaveProperty("at.y");
    // it is also in the world, so the next view for Can't speak carries it
    const view = await nextView(mute);
    expect(view.entities.some((e) => e.kind === "stamp")).toBe(true);
    // ...and never in Can't see's views
    expect(JSON.stringify(await nextView(blind))).not.toContain("stamp");
    await closeAll(players);
  });

  it("Can't see may send a face: Can't hear and Can't speak get it", async () => {
    const { players, blind, deaf, mute } = await crew();
    blind.socket.send({ t: "show", kind: "face", id: "f01" });
    const [a, b] = await Promise.all([got(deaf), got(mute), silent(blind)]);
    expect([a.family, b.family]).toEqual(["show", "show"]);
    await closeAll(players);
  });

  it("free text is cleaned: control characters go, 120 characters at most", async () => {
    const { players, blind, deaf } = await crew();
    deaf.socket.send({ t: "say", kind: "text", text: `  hi\u0007 ${"x".repeat(200)}` });
    const m = await got(blind);
    const text = "text" in m ? m.text : null;
    expect(text).toMatch(/^hi x+$/);
    expect(text?.length).toBe(120);
    await closeAll(players);
  });
});
