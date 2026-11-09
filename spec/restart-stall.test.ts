import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import { closeAll, nextTick, type Player, ready, startedGame } from "./play.ts";

// The restart watchdog (playtest fixes, Task 6): a restarted room whose tick loop never started is
// logged once as `room.stall` and its ticks are started, so nobody is left frozen. Its own app with
// STALL_RESTART=1, a test seam that leaves a restarted room stalled on purpose, so only the watchdog
// can get it ticking. STALL_MARGIN mirrors STALL_MARGIN_MS in src/net/attach.ts: specs never import
// src/net/ (a separate module instance), so the number is copied here.
const HOLD = 300;
const STALL_MARGIN = 2000;
const port = 28400 + Math.floor(Math.random() * 400);
const dir = mkdtempSync(join(tmpdir(), "restart-stall-spec-"));
const baseUrl = `http://127.0.0.1:${port}`;
const lines: string[] = [];
let app: ChildProcess;

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      INTRO_MS: String(HOLD),
      STALL_RESTART: "1",
    },
    stdio: ["ignore", "pipe", "ignore"],
  });
  let rest = "";
  app.stdout?.on("data", (chunk: Buffer) => {
    const parts = (rest + chunk.toString()).split("\n");
    rest = parts.pop() ?? "";
    lines.push(...parts);
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
// the restarted room's clock starts again, so the first whose elapsedMs falls is the new room's. The
// long wait is deliberate: it covers the hold, the watchdog's margin and slack.
const WAIT = HOLD + STALL_MARGIN + 4000;
async function restartedTick(p: Player, before: number): Promise<RoleView> {
  const deadline = Date.now() + WAIT;
  let view = await nextTick(p.socket, WAIT);
  while (view.elapsedMs >= before)
    view = await nextTick(p.socket, Math.max(1, deadline - Date.now()));
  return view;
}

describe("a stalled restart resumes through the watchdog alone", () => {
  it("a restarted room whose tick loop never started ticks again after the margin and logs one room.stall", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    for (const p of players) await p.socket.next("intro", 3000);
    // the first start is not touched by the seam
    let last = await Promise.all(players.map((p) => nextTick(p.socket, HOLD + 4000)));
    for (let i = 0; i < 3; i++) last = await Promise.all(players.map((p) => nextTick(p.socket)));
    const was = Math.min(...last.map((v) => v.elapsedMs));

    const [proposer, ...others] = players as [Player, Player, Player];
    proposer.socket.send({ t: "vote.propose", kind: "room" });
    for (const p of others) await p.socket.next("vote", 2000);
    for (const p of others) p.socket.send({ t: "vote.cast", yes: true });
    for (const p of players)
      expect(await p.socket.next<{ result: string }>("vote.end", 2000)).toMatchObject({
        result: "passed",
      });
    const ended = Date.now();

    const first = await restartedTick(proposer, was);
    const after = Date.now() - ended;
    expect(
      after,
      "the normal start was suppressed: only the watchdog ticks",
    ).toBeGreaterThanOrEqual(HOLD + STALL_MARGIN - 250);
    expect(first.elapsedMs).toBeLessThan(was);
    // the clock runs
    const later = await nextTick(proposer.socket);
    expect(later.elapsedMs).toBeGreaterThan(first.elapsedMs);

    const stalls = lines.filter((l) => l.includes('"event":"room.stall"'));
    expect(stalls).toHaveLength(1);
    for (const secret of [code, "Ana", "Bo", "Cy"]) expect(stalls[0]).not.toContain(secret);
    await closeAll(players);
  }, 60_000);
});
