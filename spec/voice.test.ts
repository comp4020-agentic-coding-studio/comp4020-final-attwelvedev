import { describe, expect, inject, it } from "vitest";
import { byRole, closeAll, ready, startedGame } from "./play.ts";

const baseUrl = inject("baseUrl");

function frame(seq: number, opusBytes = 40): Uint8Array {
  const buf = new Uint8Array(13 + opusBytes).fill(0xab);
  const view = new DataView(buf.buffer);
  buf[0] = 1;
  view.setUint32(1, seq);
  view.setFloat64(5, Date.now());
  return buf;
}

const silent = (p: { socket: { nextBinary(ms?: number): Promise<Uint8Array> } }, ms = 1000) =>
  expect(p.socket.nextBinary(ms)).rejects.toThrow(/no binary frame/);

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

describe("voice relay", () => {
  it("Can't hear's frame reaches Can't see and Can't speak with the sender's seat, never the sender", async () => {
    const { players, blind, deaf, mute } = await crew();
    deaf.socket.sendBinary(frame(5));
    const [toBlind, toMute] = await Promise.all([
      blind.socket.nextBinary(500),
      mute.socket.nextBinary(500),
      silent(deaf),
    ]);
    for (const out of [toBlind, toMute]) {
      expect(out[0]).toBe(1);
      expect(out[1]).toBe(deaf.seat);
      expect(new DataView(out.buffer, out.byteOffset).getUint32(2)).toBe(5);
      expect(out.length).toBe(14 + 40);
    }
    await closeAll(players);
  });

  it("Can't speak's frame is dropped and answered with cant-send; nobody hears it", async () => {
    const { players, blind, deaf, mute } = await crew();
    mute.socket.sendBinary(frame(1));
    expect((await mute.socket.next<{ code: string }>("error")).code).toBe("cant-send");
    await Promise.all([silent(blind), silent(deaf)]);
    await closeAll(players);
  });

  it("drops an oversize frame without closing the socket", async () => {
    const { players, blind, deaf } = await crew();
    deaf.socket.sendBinary(frame(1, 500));
    await silent(blind);
    deaf.socket.sendBinary(frame(2));
    expect((await blind.socket.nextBinary(500))[1]).toBe(deaf.seat);
    await closeAll(players);
  });

  it("a voice.stats message becomes a voice.latency event on /stats.json", async () => {
    const read = async () =>
      (
        (await (await fetch(new URL("/stats.json", baseUrl))).json()) as {
          game: { events: Record<string, number> };
        }
      ).game.events["voice.latency"] ?? 0;
    const before = await read();
    const { players, blind } = await crew();
    blind.socket.send({ t: "voice.stats", p50: 80, p95: 140, dropped: 1 });
    const deadline = Date.now() + 2500;
    while ((await read()) <= before && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(await read()).toBeGreaterThan(before);
    await closeAll(players);
  });
});
