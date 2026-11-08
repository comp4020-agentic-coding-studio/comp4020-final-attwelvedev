import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import { byRole, closeAll, nextTick, type Player, ready, startedGame } from "./play.ts";

// The playtest's freeze (playtest fixes, Task 6): after a passed room vote the timer stopped and nobody
// could move. Repeated: twenty passed restarts on one lobby, and after each, every seat gets `intro`,
// then ticks, the clock runs from zero, and an input moves its seat. Its own app with a short real hold
// (INTRO_MS=300), so the intro's timer is part of every restart, as it is in the game.
const HOLD = 300;
const RUNS = 20;
const port = 28000 + Math.floor(Math.random() * 400);
const dir = mkdtempSync(join(tmpdir(), "restart-resume-spec-"));
const baseUrl = `http://127.0.0.1:${port}`;
let app: ChildProcess;

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
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

// The first view of the restarted room's ticks: views from before the vote may still be queued, and
// the restarted room's clock starts again, so the first whose elapsedMs falls is the new room's.
async function restartedTick(p: Player, before: number): Promise<RoleView> {
  let view = await nextTick(p.socket, HOLD + 4000);
  while (view.elapsedMs >= before) view = await nextTick(p.socket, HOLD + 4000);
  return view;
}

describe("a restart after a vote always resumes", () => {
  it(`${RUNS} passed room restarts in a row: each plays the intro, ticks, runs the clock and lets every seat move`, async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    for (const p of players) await p.socket.next("intro", 3000);
    let last = await Promise.all(players.map((p) => nextTick(p.socket, HOLD + 4000)));
    const [a, b, c] = players as [Player, Player, Player];
    for (let run = 1; run <= RUNS; run++) {
      // let the room run a little, so the clock has something to go back from
      for (let i = 0; i < 3; i++) last = await Promise.all(players.map((p) => nextTick(p.socket)));
      const was = Math.min(...last.map((v) => v.elapsedMs));
      const proposer = players[run % 3] as Player;
      proposer.socket.send({ t: "vote.propose", kind: "room" });
      for (const p of players) if (p !== proposer) await p.socket.next("vote", 2000);
      for (const p of [a, b, c]) if (p !== proposer) p.socket.send({ t: "vote.cast", yes: true });
      for (const p of players)
        expect(
          await p.socket.next<{ result: string }>("vote.end", 2000),
          `run ${run}`,
        ).toMatchObject({ result: "passed" });
      for (const p of players) await p.socket.next("intro", 3000);
      const first = await Promise.all(players.map((p) => restartedTick(p, was)));
      for (const v of first)
        expect(v.elapsedMs, `run ${run}: the clock starts again`).toBeLessThan(was);
      // the clock runs
      const later = await Promise.all(players.map((p) => nextTick(p.socket)));
      for (const [i, v] of later.entries())
        expect(v.elapsedMs, `run ${run}, seat ${i}: the clock runs`).toBeGreaterThan(
          first[i]?.elapsedMs ?? Number.POSITIVE_INFINITY,
        );
      // every seat can move: each walks east (or west) and its own position changes
      for (const p of players) {
        const from = (await nextTick(p.socket)).you.pos;
        if (!from) continue; // Can't see has no position in its view; it is checked by a sighted seat
        const dir = from.x > 4 ? -1 : 1; // into the open floor, never into the spawn's wall
        p.socket.send({ t: "input", seq: run * 10, move: { x: dir, y: 0 }, act: false });
        let moved = false;
        for (let i = 0; i < 20 && !moved; i++) {
          const pos = (await nextTick(p.socket)).you.pos;
          moved = pos !== undefined && Math.abs(pos.x - from.x) > 0.2;
        }
        p.socket.send({ t: "input", seq: run * 10 + 1, move: { x: 0, y: 0 }, act: false });
        expect(moved, `run ${run}: ${p.role} moves`).toBe(true);
      }
      // Can't see has no position of its own: a sighted teammate sees it move
      const blind = byRole(players, "blind");
      const deaf = byRole(players, "deaf");
      const seen = (v: RoleView) =>
        v.entities.find((e) => e.kind === "player" && e.id === `P${blind.seat}`)?.pos;
      const from = seen(await nextTick(deaf.socket));
      if (from) {
        const dir = from.x > 2 ? -1 : 1;
        blind.socket.send({ t: "input", seq: run * 10 + 2, move: { x: dir, y: 0 }, act: false });
        let moved = false;
        for (let i = 0; i < 20 && !moved; i++) {
          const pos = seen(await nextTick(deaf.socket));
          moved = pos !== undefined && Math.abs(pos.x - from.x) > 0.2;
        }
        blind.socket.send({ t: "input", seq: run * 10 + 3, move: { x: 0, y: 0 }, act: false });
        expect(moved, `run ${run}: Can't see moves`).toBe(true);
      }
      last = later;
    }
    await closeAll(players);
  }, 240_000);
});
