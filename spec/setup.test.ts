import { describe, expect, inject, it } from "vitest";
import type { Setup } from "../src/game/setup.ts";
import type { Role, Seat } from "../src/game/types.ts";
import { clearRoomOne } from "./heistPlay.ts";
import { closeAll, type Player, ready } from "./play.ts";
import { connect, type Socket } from "./ws.ts";

const baseUrl = inject("baseUrl");

interface LobbyMsg {
  lobby: { code: string; people: { nickname: string; setup: Setup }[] };
}
interface RevealMsg {
  role: Role;
  index: number;
  real: {
    maskNoise: boolean;
    soundOff: boolean;
    captions: boolean;
    voice: boolean;
    lines: string[];
  };
}

const setup = (over: Partial<Setup>): Setup => ({
  headphones: true,
  inRoom: false,
  captions: false,
  earplugs: false,
  mask: false,
  done: false,
  ...over,
});

// Three people in a lobby, each having said how they are playing, then started. Seats follow the order
// they joined, so room 1 is seat 0 Can't see, seat 1 Can't hear, seat 2 Can't speak.
async function startedWith(setups: [Setup, Setup, Setup]) {
  const cookies = await Promise.all(
    [0, 1, 2].map(async () => {
      const res = await fetch(new URL("/", baseUrl));
      return res.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    }),
  );
  const sockets = (await Promise.all(cookies.map((c) => connect(baseUrl, c)))) as [
    Socket,
    Socket,
    Socket,
  ];
  sockets[0].send({ t: "lobby.create", nickname: "Ana" });
  const { lobby } = await sockets[0].next<LobbyMsg>("lobby");
  for (const [i, name] of [
    [1, "Bo"],
    [2, "Cy"],
  ] as const) {
    sockets[i].send({ t: "lobby.join", code: lobby.code, nickname: name, as: "player" });
    await sockets[i].next("lobby");
  }
  for (const [i, s] of sockets.entries()) s.send({ t: "lobby.setup", setup: setups[i] as Setup });
  // each setup has reached the host before it starts, so the first reveal already uses them
  const deadline = Date.now() + 2000;
  for (;;) {
    const m = await sockets[0].next<LobbyMsg>("lobby", Math.max(1, deadline - Date.now()));
    if (m.lobby.people.every((p) => p.setup.done)) break;
  }
  sockets[0].send({ t: "lobby.start" });
  const reveals = await Promise.all(sockets.map((s) => s.next<RevealMsg>("reveal", 3000)));
  const players: Player[] = sockets.map((socket, i) => ({
    socket,
    cookie: cookies[i] as string,
    seat: i as Seat,
    role: (reveals[i] as RevealMsg).role,
  }));
  return { players, reveals };
}

function frame(seq: number): Uint8Array {
  const buf = new Uint8Array(13 + 40).fill(0xab);
  const view = new DataView(buf.buffer);
  buf[0] = 1;
  view.setUint32(1, seq);
  view.setFloat64(5, Date.now());
  return buf;
}

describe("a person's real-life setup", () => {
  it("reaches everyone within 1 s and marks them set up", async () => {
    const sockets = await Promise.all([connect(baseUrl), connect(baseUrl)]);
    const [a, b] = sockets as [Socket, Socket];
    a.send({ t: "lobby.create", nickname: "Ana" });
    const { lobby } = await a.next<LobbyMsg>("lobby");
    b.send({ t: "lobby.join", code: lobby.code, nickname: "Bo", as: "player" });
    const joined = await b.next<LobbyMsg>("lobby");
    expect(joined.lobby.people.map((p) => p.setup.done)).toEqual([false, false]);

    const started = Date.now();
    b.send({ t: "lobby.setup", setup: setup({ inRoom: true, mask: true }) });
    for (;;) {
      const m = await a.next<LobbyMsg>("lobby", Math.max(1, 1000 - (Date.now() - started)));
      const bo = m.lobby.people[1];
      if (bo?.setup.done) {
        expect(bo.setup).toMatchObject({ inRoom: true, mask: true, done: true });
        expect(m.lobby.people[0]?.setup.done).toBe(false); // not anyone else's
        break;
      }
    }
    expect(Date.now() - started).toBeLessThanOrEqual(1000);
    await Promise.all(sockets.map((s) => s.close()));
  });

  it("each reveal carries real-life settings for that person's role this room, recomputed when roles rotate", async () => {
    const { players, reveals } = await startedWith([
      setup({ headphones: false, inRoom: true, mask: true }), // Ana
      setup({ headphones: true, inRoom: true, earplugs: true }), // Bo
      setup({ headphones: true, inRoom: false }), // Cy
    ]);
    // room 1: Ana can't see (no headphones: captions, mask), Bo can't hear, Cy can't speak (remote)
    expect(reveals.map((r) => r.role)).toEqual(["blind", "deaf", "mute"]);
    expect(reveals[0]?.real).toEqual({
      maskNoise: false,
      soundOff: true,
      captions: true,
      voice: true, // Cy is remote, so the crew is not all in one room
      lines: ["Mask on. Find WASD and Space first."],
    });
    expect(reveals[1]?.real).toMatchObject({ maskNoise: true, soundOff: false, captions: false });
    expect(reveals[1]?.real.lines).toEqual([
      "Earplugs in now.",
      "Sit where you can't see the others' mouths, so you can't lip-read.",
    ]);
    expect(reveals[2]?.real).toMatchObject({ soundOff: false, voice: true, lines: [] });

    ready(players);
    await clearRoomOne(players);
    players[0]?.socket.send({ t: "next" });
    const next = await Promise.all(players.map((p) => p.socket.next<RevealMsg>("reveal", 3000)));
    // room 2: Ana can't hear (and has no headphones), Bo can't speak, Cy can't see
    expect(next.map((r) => r.role)).toEqual(["deaf", "mute", "blind"]);
    expect(next[0]?.real).toMatchObject({ maskNoise: false, soundOff: false, captions: false });
    expect(next[0]?.real.lines).toEqual([
      "No earplugs or headphones: ask the others to keep the table quiet near you.",
      "Sit where you can't see the others' mouths, so you can't lip-read.",
    ]);
    expect(next[1]?.real.lines).toEqual([
      "Don't mouth words or point at screens. Waving and miming are fine.",
    ]);
    expect(next[2]?.real).toMatchObject({ soundOff: false, lines: [] });
    await closeAll(players);
  }, 120_000);

  it("voice between two people who are both in the room is not relayed when the whole crew is in the room", async () => {
    const together = setup({ inRoom: true });
    const { players } = await startedWith([together, together, together]);
    ready(players);
    const deaf = players.find((p) => p.role === "deaf") as Player;
    const blind = players.find((p) => p.role === "blind") as Player;
    deaf.socket.send({ t: "voice.stats", p50: 1, p95: 1, dropped: 0 }); // keeps the socket busy, not a frame
    deaf.socket.sendBinary(frame(1));
    await expect(blind.socket.nextBinary(800)).rejects.toThrow(/no binary frame/);
    await closeAll(players);
  });

  it("voice is relayed as usual when anyone in the crew is remote", async () => {
    const { players } = await startedWith([
      setup({ inRoom: true }),
      setup({ inRoom: true }),
      setup({ inRoom: false }),
    ]);
    ready(players);
    const deaf = players.find((p) => p.role === "deaf") as Player;
    const blind = players.find((p) => p.role === "blind") as Player;
    deaf.socket.sendBinary(frame(1));
    expect((await blind.socket.nextBinary(1000))[1]).toBe(deaf.seat);
    await closeAll(players);
  });
});
