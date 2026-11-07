import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  byRole,
  closeAll,
  nextTick,
  nextView,
  type Player,
  ready,
  startedFive,
  startedGame,
} from "./play.ts";
import type { Socket } from "./ws.ts";

// The server's hold at the start of a room (FR14): once all three are ready every seat (and every
// watcher) gets `intro`, and the first tick waits that long, so the clock, the guards and the bots
// start when the start of the room is over. Its own app with INTRO_MS=1500 on First Job, a room with
// a guard. The shared check app runs with INTRO_MS=0; CI runs the real 2400 ms.
const HOLD = 1500;
const port = 27580 + Math.floor(Math.random() * 400);
const dir = mkdtempSync(join(tmpdir(), "intro-hold-spec-"));
const baseUrl = `http://127.0.0.1:${port}`;
let app: ChildProcess;

interface IntroMsg {
  t: "intro";
  ms: number;
}

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      ROOMS_DIR: "spec/fixtures/first-job",
      INTRO_MS: String(HOLD),
    },
    stdio: "ignore",
  });
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(baseUrl);
      return;
    } catch {
      if (attempt >= 150) throw new Error(`the spec's own app never came up on ${baseUrl}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}, 40_000);

afterAll(() => {
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
});

// Resolves with how long after `from` the first view from a tick after 0 came.
const firstTickAfter = async (socket: Socket, from: number) => {
  const view = await nextTick(socket, HOLD + 3000);
  return { view, after: Date.now() - from };
};

describe("the start of a room holds the first tick (FR14)", () => {
  it("after all are ready, every seat gets intro { ms: 1500 }, then no tick before 1400 ms, then a tick", async () => {
    const { players } = await startedGame(baseUrl);
    const sent = Date.now();
    ready(players);
    const intros = await Promise.all(players.map((p) => p.socket.next<IntroMsg>("intro", 2000)));
    for (const m of intros) expect(m).toEqual({ t: "intro", ms: HOLD });
    const { after } = await firstTickAfter((players[0] as Player).socket, sent);
    expect(after).toBeGreaterThanOrEqual(1400);
    await closeAll(players);
  });

  it("the first tick's elapsedMs is under 200: the clock started after the hold", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const { view } = await firstTickAfter(byRole(players, "deaf").socket, Date.now());
    expect(view.elapsedMs).toBeLessThan(200);
    await closeAll(players);
  });

  it("a watcher gets intro too", async () => {
    const { sockets } = await startedFive(baseUrl);
    for (const s of sockets.slice(0, 3)) s.send({ t: "ready" });
    for (const s of sockets)
      expect(await s.next<IntroMsg>("intro", 2000)).toEqual({ t: "intro", ms: HOLD });
    await Promise.all(sockets.map((s) => s.close()));
  });

  it("a passed room restart sends intro again and holds again", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const deaf = byRole(players, "deaf").socket;
    await deaf.next<IntroMsg>("intro", 2000);
    await nextTick(deaf, HOLD + 3000); // running
    const [a, b, c] = players as [Player, Player, Player];
    a.socket.send({ t: "vote.propose", kind: "room" });
    await b.socket.next("vote", 2000);
    b.socket.send({ t: "vote.cast", yes: true });
    c.socket.send({ t: "vote.cast", yes: true });
    await deaf.next("vote.end", 2000);
    const again = Date.now();
    expect(await deaf.next<IntroMsg>("intro", 2000)).toEqual({ t: "intro", ms: HOLD });
    // ticks from before the restart may still be queued: the restarted room's first is from tick 1
    let view = await nextTick(deaf, HOLD + 3000);
    while (view.tick > 2) view = await nextTick(deaf, HOLD + 3000);
    expect(Date.now() - again).toBeGreaterThanOrEqual(1400);
    expect(view.elapsedMs).toBeLessThan(200);
    await closeAll(players);
  });

  it("a passed room restart sends every seat the restarted room's tick-0 view, at spawn, before its first tick", async () => {
    const { players } = await startedGame(baseUrl);
    // the reveal's tick-0 view holds each seat's spawn
    const spawns = await Promise.all(players.map((p) => nextView(p, 3000)));
    ready(players);
    const deaf = byRole(players, "deaf");
    await nextTick(deaf.socket); // running
    deaf.socket.send({ t: "input", seq: 1, move: { x: 1, y: 0 }, act: false });
    const x0 = spawns[players.indexOf(deaf)]?.you.pos?.x ?? Number.NaN;
    let moved = await nextTick(deaf.socket);
    while ((moved.you.pos?.x ?? x0) <= x0) moved = await nextTick(deaf.socket);
    const [a, b, c] = players as [Player, Player, Player];
    a.socket.send({ t: "vote.propose", kind: "room" });
    await b.socket.next("vote", 2000);
    b.socket.send({ t: "vote.cast", yes: true });
    c.socket.send({ t: "vote.cast", yes: true });
    await deaf.socket.next("vote.end", 2000);
    for (const [i, p] of players.entries()) {
      // views from before the restart may still be queued; the first view whose tick falls is the
      // restarted room's, and it must be its tick 0, not its first tick
      let last = p === deaf ? moved.tick : 0;
      let view = await nextView(p, HOLD + 3000);
      while (view.tick >= last) {
        last = view.tick;
        view = await nextView(p, HOLD + 3000);
      }
      expect(view.tick, `seat ${i}'s first view of the restarted room`).toBe(0);
      expect(view.you.pos).toEqual(spawns[i]?.you.pos);
    }
    await closeAll(players);
  });

  it("a guard does not move during the hold", async () => {
    // a watcher sees the whole room, the guard included, from the tick-0 reveal view on
    const { sockets } = await startedFive(baseUrl);
    const watcher = sockets[3] as Socket;
    type View = {
      tick: number;
      entities: { kind: string; id?: string; pos: { x: number; y: number } }[];
    };
    const reveal = await watcher.next<{ view: View }>("view", 3000);
    const guardAt = (v: View) => v.entities.find((e) => e.kind === "guard")?.pos;
    const spawn = guardAt(reveal.view);
    expect(spawn).toBeDefined();
    for (const s of sockets.slice(0, 3)) s.send({ t: "ready" });
    let first = (await watcher.next<{ view: View }>("view", HOLD + 3000)).view;
    while (first.tick === 0) first = (await watcher.next<{ view: View }>("view", HOLD + 3000)).view;
    expect(first.tick).toBe(1);
    // one tick of patrol is at most 1.2 tiles a second for 50 ms: the hold itself moved it nowhere
    const at = guardAt(first);
    expect(Math.hypot((at?.x ?? 0) - (spawn?.x ?? 0), (at?.y ?? 0) - (spawn?.y ?? 0))).toBeLessThan(
      0.1,
    );
    await Promise.all(sockets.map((s) => s.close()));
  });
});
